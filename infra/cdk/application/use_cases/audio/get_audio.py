"""Get Audio Use Case"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

import structlog

from src.application.ports.repositories import IAudioRepository

logger = structlog.get_logger()


class AudioNotFoundError(Exception):
    """音声ファイルが見つからないエラー"""

    pass


@dataclass
class GetAudioInput:
    """取得入力DTO"""

    audio_id: UUID


@dataclass
class GetAudioOutput:
    """取得出力DTO"""

    audio_id: UUID
    user_id: UUID | None
    s3_key: str
    status: str
    metadata: dict[str, Any] | None = None
    transcription: dict[str, Any] | None = None
    sentiment: dict[str, Any] | None = None
    created_at: str = ""
    updated_at: str = ""


class GetAudioUseCase:
    """
    音声ファイル取得 ユースケース

    Event Store から AudioFile を再構築して返す。
    """

    def __init__(self, audio_repository: IAudioRepository):
        self._audio_repo = audio_repository

    async def execute(self, input_data: GetAudioInput) -> GetAudioOutput:
        """ユースケースを実行"""
        log = logger.bind(audio_id=str(input_data.audio_id))
        log.info("get_audio_started")

        audio = await self._audio_repo.find_by_id(input_data.audio_id)
        if not audio:
            log.warning("audio_not_found")
            raise AudioNotFoundError(f"Audio {input_data.audio_id} not found")

        log.info("get_audio_completed", status=audio.status.value)

        return GetAudioOutput(
            audio_id=audio.id,
            user_id=audio.user_id,
            s3_key=audio.s3_key,
            status=audio.status.value,
            metadata=audio.metadata.to_dict() if audio.metadata else None,
            transcription=audio.transcription.to_dict() if audio.transcription else None,
            sentiment=audio.sentiment.to_dict() if audio.sentiment else None,
            created_at=audio.created_at.isoformat(),
            updated_at=audio.updated_at.isoformat(),
        )

