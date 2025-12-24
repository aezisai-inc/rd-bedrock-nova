"""Sentiment Score Value Object"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any


class Sentiment(str, Enum):
    """感情タイプ"""

    POSITIVE = "positive"
    NEGATIVE = "negative"
    NEUTRAL = "neutral"


@dataclass(frozen=True)
class SentimentScore:
    """
    感情スコア（値オブジェクト）

    音声の感情分析結果を表現する。
    各感情のスコアは0.0〜1.0の範囲で、合計が1.0になる。
    """

    positive: float
    negative: float
    neutral: float

    def __post_init__(self) -> None:
        """バリデーション"""
        self._validate()

    def _validate(self) -> None:
        """値の妥当性を検証"""
        for name, value in [
            ("positive", self.positive),
            ("negative", self.negative),
            ("neutral", self.neutral),
        ]:
            if not 0.0 <= value <= 1.0:
                raise ValueError(f"{name} score must be between 0.0 and 1.0, got {value}")

        total = self.positive + self.negative + self.neutral
        if abs(total - 1.0) > 0.01:  # 許容誤差
            raise ValueError(f"Scores must sum to 1.0, got {total}")

    @property
    def dominant(self) -> Sentiment:
        """支配的な感情を取得"""
        scores = {
            Sentiment.POSITIVE: self.positive,
            Sentiment.NEGATIVE: self.negative,
            Sentiment.NEUTRAL: self.neutral,
        }
        return max(scores, key=scores.get)  # type: ignore

    @property
    def dominant_score(self) -> float:
        """支配的な感情のスコア"""
        return max(self.positive, self.negative, self.neutral)

    @property
    def is_positive(self) -> bool:
        """ポジティブが支配的か"""
        return self.dominant == Sentiment.POSITIVE

    @property
    def is_negative(self) -> bool:
        """ネガティブが支配的か"""
        return self.dominant == Sentiment.NEGATIVE

    @property
    def confidence(self) -> float:
        """支配的感情の確信度（他との差）"""
        sorted_scores = sorted([self.positive, self.negative, self.neutral], reverse=True)
        return sorted_scores[0] - sorted_scores[1]

    def to_dict(self) -> dict[str, Any]:
        """辞書に変換"""
        return {
            "positive": self.positive,
            "negative": self.negative,
            "neutral": self.neutral,
            "dominant": self.dominant.value,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> SentimentScore:
        """辞書から生成"""
        return cls(
            positive=data["positive"],
            negative=data["negative"],
            neutral=data["neutral"],
        )

    @classmethod
    def neutral_default(cls) -> SentimentScore:
        """デフォルト（中立）のスコアを生成"""
        return cls(positive=0.0, negative=0.0, neutral=1.0)

