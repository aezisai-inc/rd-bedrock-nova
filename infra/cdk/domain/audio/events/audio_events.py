"""Audio Domain Events"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass(frozen=True)
class DomainEvent:
    """ドメインイベント基底クラス"""

    event_id: UUID = field(default_factory=uuid4)
    occurred_at: datetime = field(default_factory=_utc_now)

    @property
    def event_type(self) -> str:
        return self.__class__.__name__


@dataclass(frozen=True)
class AudioCreated(DomainEvent):
    """音声ファイル作成イベント"""

    audio_id: UUID = field(default_factory=uuid4)
    user_id: UUID = field(default_factory=uuid4)
    s3_key: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class AudioProcessingStarted(DomainEvent):
    """音声処理開始イベント"""

    audio_id: UUID = field(default_factory=uuid4)


@dataclass(frozen=True)
class TranscriptionCompleted(DomainEvent):
    """文字起こし完了イベント"""

    audio_id: UUID = field(default_factory=uuid4)
    text: str = ""
    confidence: float = 0.0
    segments: list[dict[str, Any]] = field(default_factory=list)
    language: str = "ja-JP"


@dataclass(frozen=True)
class SentimentAnalyzed(DomainEvent):
    """感情分析完了イベント"""

    audio_id: UUID = field(default_factory=uuid4)
    sentiment: str = ""
    scores: dict[str, float] = field(default_factory=dict)


@dataclass(frozen=True)
class AudioProcessingCompleted(DomainEvent):
    """音声処理完了イベント"""

    audio_id: UUID = field(default_factory=uuid4)


@dataclass(frozen=True)
class AudioProcessingFailed(DomainEvent):
    """音声処理失敗イベント"""

    audio_id: UUID = field(default_factory=uuid4)
    reason: str = ""
    error_code: str = ""

