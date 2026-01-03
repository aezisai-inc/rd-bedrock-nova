"""Upload Audio Use Case"""
from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

import structlog

from src.application.ports.event_publisher import IEventPublisher
from src.application.ports.gateways import IStorageGateway
from src.application.ports.repositories import IAudioRepository
from src.domain.audio.entities import AudioFile
from src.domain.audio.value_objects import AudioMetadata, AudioFormat

logger = structlog.get_logger()


class AudioUploadError(Exception):
    """音声アップロードエラー"""

    pass


@dataclass
class UploadAudioInput:
    """アップロード入力DTO"""

    user_id: UUID
    file_data: bytes
    filename: str
    content_type: str
    duration_seconds: float
    sample_rate: int = 16000
    channels: int = 1


@dataclass
class UploadAudioOutput:
    """アップロード出力DTO"""

    audio_id: UUID
    s3_key: str
    status: str


class UploadAudioUseCase:
    """
    音声ファイルアップロード ユースケース

    1. S3 にファイルをアップロード
    2. AudioFile 集約を作成
    3. Event Store に保存
    4. ドメインイベントを発行
    """

    def __init__(
        self,
        audio_repository: IAudioRepository,
        storage_gateway: IStorageGateway,
        event_publisher: IEventPublisher,
    ):
        self._audio_repo = audio_repository
        self._storage = storage_gateway
        self._event_publisher = event_publisher

    async def execute(self, input_data: UploadAudioInput) -> UploadAudioOutput:
        """ユースケースを実行"""
        log = logger.bind(
            user_id=str(input_data.user_id),
            filename=input_data.filename,
        )
        log.info("upload_audio_started")

        try:
            # 1. ファイル形式を決定
            audio_format = self._determine_format(input_data.content_type, input_data.filename)

            # 2. S3 キーを生成してアップロード
            s3_key = f"audio/{input_data.user_id}/{input_data.filename}"
            await self._storage.upload(
                key=s3_key,
                data=input_data.file_data,
                content_type=input_data.content_type,
            )
            log.info("file_uploaded_to_s3", s3_key=s3_key)

            # 3. メタデータを作成
            metadata = AudioMetadata(
                duration_seconds=input_data.duration_seconds,
                sample_rate=input_data.sample_rate,
                channels=input_data.channels,
                format=audio_format,
                file_size_bytes=len(input_data.file_data),
            )

            # 4. AudioFile 集約を作成
            audio = AudioFile.create(
                user_id=input_data.user_id,
                s3_key=s3_key,
                metadata=metadata,
            )

            # 5. Event Store に保存
            await self._audio_repo.save(audio)

            # 6. ドメインイベントを発行
            events = audio.get_uncommitted_events()
            await self._event_publisher.publish_batch(events)
            audio.mark_events_as_committed()

            log.info(
                "upload_audio_completed",
                audio_id=str(audio.id),
                duration=input_data.duration_seconds,
            )

            return UploadAudioOutput(
                audio_id=audio.id,
                s3_key=s3_key,
                status=audio.status.value,
            )

        except Exception as e:
            log.error("upload_audio_failed", error=str(e))
            raise AudioUploadError(f"Failed to upload audio: {e}") from e

    def _determine_format(self, content_type: str, filename: str) -> AudioFormat:
        """Content-Type とファイル名から形式を決定"""
        content_type_map = {
            "audio/wav": AudioFormat.WAV,
            "audio/x-wav": AudioFormat.WAV,
            "audio/mpeg": AudioFormat.MP3,
            "audio/mp3": AudioFormat.MP3,
            "audio/flac": AudioFormat.FLAC,
            "audio/x-flac": AudioFormat.FLAC,
            "audio/m4a": AudioFormat.M4A,
            "audio/x-m4a": AudioFormat.M4A,
            "audio/ogg": AudioFormat.OGG,
        }

        if content_type in content_type_map:
            return content_type_map[content_type]

        # ファイル拡張子から判定
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        ext_map = {
            "wav": AudioFormat.WAV,
            "mp3": AudioFormat.MP3,
            "flac": AudioFormat.FLAC,
            "m4a": AudioFormat.M4A,
            "ogg": AudioFormat.OGG,
        }

        if ext in ext_map:
            return ext_map[ext]

        # デフォルト
        return AudioFormat.WAV

