"""Event Publisher Interface (Port)"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from src.domain.audio.events.audio_events import DomainEvent


class IEventPublisher(ABC):
    """
    Event Publisher Interface

    ドメインイベントを外部に発行するための抽象インターフェース。
    具体的な実装（EventBridge等）はインフラ層で提供する。
    """

    @abstractmethod
    async def publish(self, event: "DomainEvent") -> None:
        """イベントを発行"""
        pass

    @abstractmethod
    async def publish_batch(self, events: list["DomainEvent"]) -> None:
        """イベントをバッチ発行"""
        pass

