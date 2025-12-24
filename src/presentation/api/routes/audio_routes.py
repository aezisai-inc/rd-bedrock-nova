"""Audio API Routes"""
from __future__ import annotations

from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, UploadFile
from pydantic import BaseModel, Field

from src.application.ports.event_publisher import IEventPublisher
from src.application.ports.gateways import IStorageGateway, ITranscriptionGateway
from src.application.ports.repositories import IAudioRepository
from src.application.use_cases.audio import (
    GetAudioInput,
    GetAudioOutput,
    GetAudioUseCase,
    TranscribeAudioInput,
    TranscribeAudioOutput,
    TranscribeAudioUseCase,
    UploadAudioInput,
    UploadAudioOutput,
    UploadAudioUseCase,
)
from src.infrastructure.config import get_settings
from src.infrastructure.event_store import DynamoDBEventStore
from src.infrastructure.gateways import NovaSonicGateway, S3Gateway
from src.infrastructure.repositories import DynamoDBAudioRepository

router = APIRouter()


# === Dependency Injection ===


def get_event_store() -> DynamoDBEventStore:
    """Event Store の依存性注入"""
    settings = get_settings()
    return DynamoDBEventStore(
        table_name=settings.event_store_table,
        region=settings.aws_region,
    )


def get_audio_repository(
    event_store: Annotated[DynamoDBEventStore, Depends(get_event_store)]
) -> IAudioRepository:
    """Audio Repository の依存性注入"""
    return DynamoDBAudioRepository(event_store)


def get_storage_gateway() -> IStorageGateway:
    """Storage Gateway の依存性注入"""
    settings = get_settings()
    return S3Gateway(
        bucket_name=settings.content_bucket,
        region=settings.aws_region,
    )


def get_transcription_gateway() -> ITranscriptionGateway:
    """Transcription Gateway の依存性注入"""
    settings = get_settings()
    return NovaSonicGateway(
        region=settings.aws_region,
        model_id=settings.nova_sonic_model_id,
    )


def get_event_publisher() -> IEventPublisher:
    """Event Publisher の依存性注入"""
    # TODO: EventBridge Publisher を実装
    from src.presentation.api.dependencies import NoopEventPublisher

    return NoopEventPublisher()


# === Request/Response Models ===


class TranscribeRequest(BaseModel):
    """文字起こしリクエスト"""

    language: str = Field(default="ja-JP", description="言語コード")
    enable_speaker_diarization: bool = Field(
        default=False, description="話者分離を有効にするか"
    )


class TranscribeResponse(BaseModel):
    """文字起こしレスポンス"""

    audio_id: str
    text: str
    confidence: float
    segments: list[dict[str, Any]]
    speakers: list[str]


class AudioResponse(BaseModel):
    """音声情報レスポンス"""

    audio_id: str
    user_id: str | None
    s3_key: str
    status: str
    metadata: dict[str, Any] | None
    transcription: dict[str, Any] | None
    sentiment: dict[str, Any] | None
    created_at: str
    updated_at: str


class UploadResponse(BaseModel):
    """アップロードレスポンス"""

    audio_id: str
    s3_key: str
    status: str


# === Routes ===


@router.post("/", response_model=UploadResponse)
async def upload_audio(
    file: Annotated[UploadFile, File(description="音声ファイル")],
    user_id: Annotated[str, Form(description="ユーザーID")],
    duration_seconds: Annotated[float, Form(description="再生時間（秒）")],
    sample_rate: Annotated[int, Form(description="サンプルレート")] = 16000,
    channels: Annotated[int, Form(description="チャンネル数")] = 1,
    audio_repository: Annotated[IAudioRepository, Depends(get_audio_repository)] = None,
    storage_gateway: Annotated[IStorageGateway, Depends(get_storage_gateway)] = None,
    event_publisher: Annotated[IEventPublisher, Depends(get_event_publisher)] = None,
) -> UploadResponse:
    """音声ファイルをアップロード"""
    use_case = UploadAudioUseCase(
        audio_repository=audio_repository,
        storage_gateway=storage_gateway,
        event_publisher=event_publisher,
    )

    file_data = await file.read()

    input_data = UploadAudioInput(
        user_id=UUID(user_id),
        file_data=file_data,
        filename=file.filename or "audio.wav",
        content_type=file.content_type or "audio/wav",
        duration_seconds=duration_seconds,
        sample_rate=sample_rate,
        channels=channels,
    )

    output: UploadAudioOutput = await use_case.execute(input_data)

    return UploadResponse(
        audio_id=str(output.audio_id),
        s3_key=output.s3_key,
        status=output.status,
    )


@router.get("/{audio_id}", response_model=AudioResponse)
async def get_audio(
    audio_id: str,
    audio_repository: Annotated[IAudioRepository, Depends(get_audio_repository)] = None,
) -> AudioResponse:
    """音声情報を取得"""
    use_case = GetAudioUseCase(audio_repository=audio_repository)

    input_data = GetAudioInput(audio_id=UUID(audio_id))
    output: GetAudioOutput = await use_case.execute(input_data)

    return AudioResponse(
        audio_id=str(output.audio_id),
        user_id=str(output.user_id) if output.user_id else None,
        s3_key=output.s3_key,
        status=output.status,
        metadata=output.metadata,
        transcription=output.transcription,
        sentiment=output.sentiment,
        created_at=output.created_at,
        updated_at=output.updated_at,
    )


@router.post("/{audio_id}/transcribe", response_model=TranscribeResponse)
async def transcribe_audio(
    audio_id: str,
    request: TranscribeRequest,
    audio_repository: Annotated[IAudioRepository, Depends(get_audio_repository)] = None,
    transcription_gateway: Annotated[
        ITranscriptionGateway, Depends(get_transcription_gateway)
    ] = None,
    event_publisher: Annotated[IEventPublisher, Depends(get_event_publisher)] = None,
) -> TranscribeResponse:
    """音声を文字起こし"""
    use_case = TranscribeAudioUseCase(
        audio_repository=audio_repository,
        transcription_gateway=transcription_gateway,
        event_publisher=event_publisher,
    )

    input_data = TranscribeAudioInput(
        audio_id=UUID(audio_id),
        language=request.language,
        enable_speaker_diarization=request.enable_speaker_diarization,
    )

    output: TranscribeAudioOutput = await use_case.execute(input_data)

    return TranscribeResponse(
        audio_id=str(output.audio_id),
        text=output.text,
        confidence=output.confidence,
        segments=output.segments,
        speakers=output.speakers,
    )

