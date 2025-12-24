"""Transcription Entity"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from ..value_objects.transcript_segment import TranscriptSegment


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class Transcription:
    """
    文字起こし結果（エンティティ）

    音声の文字起こし結果を表現する。セグメントの集合として構成される。
    """

    id: UUID = field(default_factory=uuid4)
    text: str = ""
    segments: list[TranscriptSegment] = field(default_factory=list)
    language: str = "ja-JP"
    confidence: float = 0.0
    created_at: datetime = field(default_factory=_utc_now)

    def add_segment(self, segment: TranscriptSegment) -> None:
        """セグメントを追加"""
        self.segments.append(segment)
        self._recalculate_text()
        self._recalculate_confidence()

    def _recalculate_text(self) -> None:
        """テキストを再計算"""
        sorted_segments = sorted(self.segments, key=lambda x: x.start_time)
        self.text = " ".join(s.text for s in sorted_segments)

    def _recalculate_confidence(self) -> None:
        """平均信頼度を再計算"""
        if self.segments:
            self.confidence = sum(s.confidence for s in self.segments) / len(self.segments)
        else:
            self.confidence = 0.0

    @property
    def word_count(self) -> int:
        """総単語数"""
        return sum(s.word_count for s in self.segments)

    @property
    def duration(self) -> float:
        """総時間（秒）"""
        if not self.segments:
            return 0.0
        return max(s.end_time for s in self.segments)

    @property
    def speaker_ids(self) -> set[str]:
        """出現する話者ID一覧"""
        return {s.speaker_id for s in self.segments if s.speaker_id}

    @property
    def speaker_count(self) -> int:
        """話者数"""
        return len(self.speaker_ids)

    def get_segment_at_time(self, time: float) -> TranscriptSegment | None:
        """指定時刻のセグメントを取得"""
        for segment in self.segments:
            if segment.contains_time(time):
                return segment
        return None

    def get_segments_by_speaker(self, speaker_id: str) -> list[TranscriptSegment]:
        """話者でフィルタしたセグメントを取得"""
        return [s for s in self.segments if s.speaker_id == speaker_id]

    def get_text_by_speaker(self, speaker_id: str) -> str:
        """話者のテキストを取得"""
        segments = self.get_segments_by_speaker(speaker_id)
        sorted_segments = sorted(segments, key=lambda x: x.start_time)
        return " ".join(s.text for s in sorted_segments)

    def to_dict(self) -> dict[str, Any]:
        """辞書に変換"""
        return {
            "id": str(self.id),
            "text": self.text,
            "segments": [s.to_dict() for s in self.segments],
            "language": self.language,
            "confidence": self.confidence,
            "created_at": self.created_at.isoformat(),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Transcription:
        """辞書から生成"""
        return cls(
            id=UUID(data["id"]) if isinstance(data.get("id"), str) else data.get("id", uuid4()),
            text=data.get("text", ""),
            segments=[TranscriptSegment.from_dict(s) for s in data.get("segments", [])],
            language=data.get("language", "ja-JP"),
            confidence=data.get("confidence", 0.0),
            created_at=datetime.fromisoformat(data["created_at"])
            if "created_at" in data
            else _utc_now(),
        )

