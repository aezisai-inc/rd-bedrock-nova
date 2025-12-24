"""Transcribe Audio Use Case"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

import structlog

from src.application.ports.event_publisher import IEventPublisher
from src.application.ports.gateways import ITranscriptionGateway
from src.application.ports.repositories import IAudioRepository
from src.domain.audio.entities import Transcription
from src.domain.audio.value_objects import TranscriptSegment

logger = structlog.get_logger()


class AudioNotFoundError(Exception):
    """音声ファイルが見つからないエラー"""

    pass


class TranscriptionError(Exception):
    """文字起こしエラー"""

    pass


@dataclass
class TranscribeAudioInput:
    """文字起こし入力DTO"""

    audio_id: UUID
    language: str = "ja-JP"
    enable_speaker_diarization: bool = False


@dataclass
class TranscribeAudioOutput:
    """文字起こし出力DTO"""

    audio_id: UUID
    text: str
    confidence: float
    segments: list[dict[str, Any]] = field(default_factory=list)
    speakers: list[str] = field(default_factory=list)


class TranscribeAudioUseCase:
    """
    音声文字起こし ユースケース

    1. Event Store から AudioFile 集約を再構築
    2. 処理開始（状態遷移）
    3. Nova Sonic で文字起こし
    4. 結果を集約に反映
    5. Event Store に保存
    6. ドメインイベントを発行
    """

    def __init__(
        self,
        audio_repository: IAudioRepository,
        transcription_gateway: ITranscriptionGateway,
        event_publisher: IEventPublisher,
    ):
        self._audio_repo = audio_repository
        self._transcription_gateway = transcription_gateway
        self._event_publisher = event_publisher

    async def execute(self, input_data: TranscribeAudioInput) -> TranscribeAudioOutput:
        """ユースケースを実行"""
        log = logger.bind(
            audio_id=str(input_data.audio_id),
            language=input_data.language,
        )
        log.info("transcribe_audio_started")

        try:
            # 1. AudioFile を取得
            audio = await self._audio_repo.find_by_id(input_data.audio_id)
            if not audio:
                raise AudioNotFoundError(f"Audio {input_data.audio_id} not found")

            # 2. 処理開始
            audio.start_processing()

            # 3. Nova Sonic で文字起こし
            log.info("invoking_transcription_service", s3_key=audio.s3_key)
            result = await self._transcription_gateway.transcribe(
                s3_key=audio.s3_key,
                language=input_data.language,
                enable_diarization=input_data.enable_speaker_diarization,
            )

            # 4. Transcription エンティティを作成
            segments = [
                TranscriptSegment(
                    start_time=s["start_time"],
                    end_time=s["end_time"],
                    text=s["text"],
                    confidence=s["confidence"],
                    speaker_id=s.get("speaker_id"),
                )
                for s in result.segments
            ]

            transcription = Transcription(
                text=result.text,
                segments=segments,
                language=result.language,
                confidence=result.confidence,
            )

            # 5. 集約に反映
            audio.complete_transcription(transcription)
            audio.complete_processing()

            # 6. Event Store に保存
            await self._audio_repo.save(audio)

            # 7. ドメインイベントを発行
            events = audio.get_uncommitted_events()
            await self._event_publisher.publish_batch(events)
            audio.mark_events_as_committed()

            log.info(
                "transcribe_audio_completed",
                confidence=result.confidence,
                word_count=len(result.text.split()),
            )

            return TranscribeAudioOutput(
                audio_id=audio.id,
                text=result.text,
                confidence=result.confidence,
                segments=[s.to_dict() for s in segments],
                speakers=result.speakers,
            )

        except AudioNotFoundError:
            raise
        except Exception as e:
            log.error("transcribe_audio_failed", error=str(e))

            # エラー時は失敗状態に更新
            if audio:
                audio.fail_processing(str(e), "TRANSCRIPTION_ERROR")
                await self._audio_repo.save(audio)
                await self._event_publisher.publish_batch(audio.get_uncommitted_events())

            raise TranscriptionError(f"Failed to transcribe audio: {e}") from e

