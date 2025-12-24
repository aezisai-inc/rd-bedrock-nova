"""AudioFile Aggregate Root"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any
from uuid import UUID, uuid4

from ..events.audio_events import (
    AudioCreated,
    AudioProcessingCompleted,
    AudioProcessingFailed,
    AudioProcessingStarted,
    DomainEvent,
    SentimentAnalyzed,
    TranscriptionCompleted,
)
from ..value_objects.audio_metadata import AudioMetadata
from ..value_objects.sentiment_score import SentimentScore
from .transcription import Transcription


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ProcessingStatus(str, Enum):
    """処理ステータス"""

    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class InvalidStateError(Exception):
    """不正な状態遷移エラー"""

    pass


@dataclass
class AudioFile:
    """
    音声ファイル（集約ルート）

    音声ファイルのライフサイクルを管理し、
    Event Sourcing パターンで状態変更を追跡する。
    """

    id: UUID = field(default_factory=uuid4)
    user_id: UUID | None = None
    s3_key: str = ""
    metadata: AudioMetadata | None = None
    status: ProcessingStatus = ProcessingStatus.PENDING
    transcription: Transcription | None = None
    sentiment: SentimentScore | None = None
    created_at: datetime = field(default_factory=_utc_now)
    updated_at: datetime = field(default_factory=_utc_now)

    # Event Sourcing
    _version: int = field(default=0, repr=False)
    _uncommitted_events: list[DomainEvent] = field(default_factory=list, repr=False)

    # === Factory Methods ===

    @classmethod
    def create(
        cls,
        user_id: UUID,
        s3_key: str,
        metadata: AudioMetadata,
    ) -> AudioFile:
        """新しい AudioFile を作成"""
        audio = cls()
        audio._apply(
            AudioCreated(
                audio_id=uuid4(),
                user_id=user_id,
                s3_key=s3_key,
                metadata=metadata.to_dict(),
            )
        )
        return audio

    # === Command Methods ===

    def start_processing(self) -> None:
        """処理を開始"""
        if self.status != ProcessingStatus.PENDING:
            raise InvalidStateError(
                f"Cannot start processing from {self.status.value} state. "
                f"Only PENDING state is allowed."
            )
        self._apply(AudioProcessingStarted(audio_id=self.id))

    def complete_transcription(self, transcription: Transcription) -> None:
        """文字起こしを完了"""
        if self.status != ProcessingStatus.PROCESSING:
            raise InvalidStateError(
                f"Cannot complete transcription in {self.status.value} state. "
                f"Only PROCESSING state is allowed."
            )
        self._apply(
            TranscriptionCompleted(
                audio_id=self.id,
                text=transcription.text,
                confidence=transcription.confidence,
                segments=[s.to_dict() for s in transcription.segments],
                language=transcription.language,
            )
        )

    def analyze_sentiment(self, sentiment: SentimentScore) -> None:
        """感情分析を完了"""
        if self.status != ProcessingStatus.PROCESSING:
            raise InvalidStateError(
                f"Cannot analyze sentiment in {self.status.value} state. "
                f"Only PROCESSING state is allowed."
            )
        self._apply(
            SentimentAnalyzed(
                audio_id=self.id,
                sentiment=sentiment.dominant.value,
                scores=sentiment.to_dict(),
            )
        )

    def complete_processing(self) -> None:
        """処理を完了"""
        if self.status != ProcessingStatus.PROCESSING:
            raise InvalidStateError(
                f"Cannot complete processing from {self.status.value} state. "
                f"Only PROCESSING state is allowed."
            )
        self._apply(AudioProcessingCompleted(audio_id=self.id))

    def fail_processing(self, reason: str, error_code: str = "UNKNOWN") -> None:
        """処理を失敗"""
        self._apply(
            AudioProcessingFailed(
                audio_id=self.id,
                reason=reason,
                error_code=error_code,
            )
        )

    # === Event Sourcing Methods ===

    def _apply(self, event: DomainEvent) -> None:
        """イベントを適用"""
        self._when(event)
        self._uncommitted_events.append(event)

    def _when(self, event: DomainEvent) -> None:
        """イベントハンドラ（状態遷移）"""
        handler_name = f"_on_{self._to_snake_case(type(event).__name__)}"
        handler = getattr(self, handler_name, None)
        if handler:
            handler(event)

    @staticmethod
    def _to_snake_case(name: str) -> str:
        """CamelCase → snake_case"""
        import re

        s1 = re.sub("(.)([A-Z][a-z]+)", r"\1_\2", name)
        return re.sub("([a-z0-9])([A-Z])", r"\1_\2", s1).lower()

    def _on_audio_created(self, event: AudioCreated) -> None:
        self.id = event.audio_id
        self.user_id = event.user_id
        self.s3_key = event.s3_key
        self.metadata = AudioMetadata.from_dict(event.metadata)
        self.status = ProcessingStatus.PENDING
        self.created_at = event.occurred_at

    def _on_audio_processing_started(self, event: AudioProcessingStarted) -> None:
        self.status = ProcessingStatus.PROCESSING
        self.updated_at = event.occurred_at

    def _on_transcription_completed(self, event: TranscriptionCompleted) -> None:
        from ..value_objects.transcript_segment import TranscriptSegment

        self.transcription = Transcription(
            text=event.text,
            confidence=event.confidence,
            segments=[TranscriptSegment.from_dict(s) for s in event.segments],
            language=event.language,
        )
        self.updated_at = event.occurred_at

    def _on_sentiment_analyzed(self, event: SentimentAnalyzed) -> None:
        self.sentiment = SentimentScore.from_dict(event.scores)
        self.updated_at = event.occurred_at

    def _on_audio_processing_completed(self, event: AudioProcessingCompleted) -> None:
        self.status = ProcessingStatus.COMPLETED
        self.updated_at = event.occurred_at

    def _on_audio_processing_failed(self, event: AudioProcessingFailed) -> None:
        self.status = ProcessingStatus.FAILED
        self.updated_at = event.occurred_at

    # === Event Sourcing Helpers ===

    @classmethod
    def reconstitute(cls, events: list[dict[str, Any]]) -> AudioFile:
        """イベント履歴から集約を再構築"""
        audio = cls()
        for stored_event in events:
            event = cls._deserialize_event(stored_event)
            audio._when(event)
            audio._version = stored_event.get("version", 0)
        return audio

    @classmethod
    def _deserialize_event(cls, stored: dict[str, Any]) -> DomainEvent:
        """イベントをデシリアライズ"""
        event_type = stored["event_type"]
        event_data = stored.get("event_data", {})

        event_classes = {
            "AudioCreated": AudioCreated,
            "AudioProcessingStarted": AudioProcessingStarted,
            "TranscriptionCompleted": TranscriptionCompleted,
            "SentimentAnalyzed": SentimentAnalyzed,
            "AudioProcessingCompleted": AudioProcessingCompleted,
            "AudioProcessingFailed": AudioProcessingFailed,
        }

        event_class = event_classes.get(event_type)
        if not event_class:
            raise ValueError(f"Unknown event type: {event_type}")

        return event_class(**event_data)

    def get_uncommitted_events(self) -> list[DomainEvent]:
        """未コミットのイベントを取得"""
        return self._uncommitted_events.copy()

    def mark_events_as_committed(self) -> None:
        """イベントをコミット済みとしてマーク"""
        self._version += len(self._uncommitted_events)
        self._uncommitted_events.clear()

    @property
    def version(self) -> int:
        """現在のバージョン"""
        return self._version

    # === Serialization ===

    def to_dict(self) -> dict[str, Any]:
        """辞書に変換"""
        return {
            "id": str(self.id),
            "user_id": str(self.user_id) if self.user_id else None,
            "s3_key": self.s3_key,
            "metadata": self.metadata.to_dict() if self.metadata else None,
            "status": self.status.value,
            "transcription": self.transcription.to_dict() if self.transcription else None,
            "sentiment": self.sentiment.to_dict() if self.sentiment else None,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "version": self._version,
        }

