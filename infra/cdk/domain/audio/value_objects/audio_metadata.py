"""Audio Metadata Value Object"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any


class AudioFormat(str, Enum):
    """Supported audio formats"""

    WAV = "wav"
    MP3 = "mp3"
    FLAC = "flac"
    M4A = "m4a"
    OGG = "ogg"


VALID_SAMPLE_RATES = frozenset([8000, 16000, 22050, 44100, 48000])


@dataclass(frozen=True)
class AudioMetadata:
    """
    音声メタデータ（値オブジェクト）

    不変性を保証し、音声ファイルの技術的特性を表現する。
    """

    duration_seconds: float
    sample_rate: int
    channels: int
    format: AudioFormat
    file_size_bytes: int = 0
    bitrate: int = 0

    def __post_init__(self) -> None:
        """バリデーション"""
        self._validate()

    def _validate(self) -> None:
        """値の妥当性を検証"""
        if self.duration_seconds <= 0:
            raise ValueError("Duration must be positive")

        if self.sample_rate not in VALID_SAMPLE_RATES:
            raise ValueError(
                f"Invalid sample rate: {self.sample_rate}. "
                f"Must be one of: {sorted(VALID_SAMPLE_RATES)}"
            )

        if self.channels not in (1, 2):
            raise ValueError(f"Invalid channels: {self.channels}. Must be 1 (mono) or 2 (stereo)")

        if self.file_size_bytes < 0:
            raise ValueError("File size cannot be negative")

    @property
    def is_stereo(self) -> bool:
        """ステレオかどうか"""
        return self.channels == 2

    @property
    def duration_minutes(self) -> float:
        """分単位の再生時間"""
        return self.duration_seconds / 60

    @property
    def estimated_transcription_cost(self) -> float:
        """文字起こしの推定コスト（USD）

        Nova Sonic の料金: $0.0001/秒（概算）
        """
        return self.duration_seconds * 0.0001

    def to_dict(self) -> dict[str, Any]:
        """辞書に変換"""
        return {
            "duration_seconds": self.duration_seconds,
            "sample_rate": self.sample_rate,
            "channels": self.channels,
            "format": self.format.value,
            "file_size_bytes": self.file_size_bytes,
            "bitrate": self.bitrate,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> AudioMetadata:
        """辞書から生成"""
        return cls(
            duration_seconds=data["duration_seconds"],
            sample_rate=data["sample_rate"],
            channels=data["channels"],
            format=AudioFormat(data["format"]),
            file_size_bytes=data.get("file_size_bytes", 0),
            bitrate=data.get("bitrate", 0),
        )

