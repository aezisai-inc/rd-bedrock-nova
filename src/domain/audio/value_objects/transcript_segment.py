"""Transcript Segment Value Object"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class TranscriptSegment:
    """
    文字起こしセグメント（値オブジェクト）

    音声の一部分に対応する文字起こし結果を表現する。
    """

    start_time: float
    end_time: float
    text: str
    confidence: float
    speaker_id: str | None = None

    def __post_init__(self) -> None:
        """バリデーション"""
        self._validate()

    def _validate(self) -> None:
        """値の妥当性を検証"""
        if self.start_time < 0:
            raise ValueError(f"start_time must be non-negative, got {self.start_time}")

        if self.end_time <= self.start_time:
            raise ValueError(
                f"end_time ({self.end_time}) must be greater than start_time ({self.start_time})"
            )

        if not 0.0 <= self.confidence <= 1.0:
            raise ValueError(f"confidence must be between 0.0 and 1.0, got {self.confidence}")

    @property
    def duration(self) -> float:
        """セグメントの長さ（秒）"""
        return self.end_time - self.start_time

    @property
    def word_count(self) -> int:
        """単語数"""
        return len(self.text.split())

    @property
    def has_speaker(self) -> bool:
        """話者情報があるか"""
        return self.speaker_id is not None

    @property
    def is_high_confidence(self) -> bool:
        """高信頼度か（85%以上）"""
        return self.confidence >= 0.85

    def contains_time(self, time: float) -> bool:
        """指定時刻がセグメント内に含まれるか"""
        return self.start_time <= time < self.end_time

    def to_dict(self) -> dict[str, Any]:
        """辞書に変換"""
        return {
            "start_time": self.start_time,
            "end_time": self.end_time,
            "text": self.text,
            "confidence": self.confidence,
            "speaker_id": self.speaker_id,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> TranscriptSegment:
        """辞書から生成"""
        return cls(
            start_time=data["start_time"],
            end_time=data["end_time"],
            text=data["text"],
            confidence=data["confidence"],
            speaker_id=data.get("speaker_id"),
        )

