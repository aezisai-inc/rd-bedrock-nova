"""API Dependencies"""
from __future__ import annotations

from typing import TYPE_CHECKING

import structlog

from src.application.ports.event_publisher import IEventPublisher

if TYPE_CHECKING:
    from src.domain.audio.events.audio_events import DomainEvent

logger = structlog.get_logger()


class NoopEventPublisher(IEventPublisher):
    """
    No-op Event Publisher（開発用）

    実際の EventBridge Publisher が実装されるまでの仮実装。
    """

    async def publish(self, event: "DomainEvent") -> None:
        """イベントをログ出力のみ"""
        logger.info(
            "event_published_noop",
            event_type=event.event_type,
            event_id=str(event.event_id),
        )

    async def publish_batch(self, events: list["DomainEvent"]) -> None:
        """イベントをバッチログ出力のみ"""
        for event in events:
            await self.publish(event)

