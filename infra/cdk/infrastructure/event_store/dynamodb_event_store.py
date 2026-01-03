"""DynamoDB Event Store Implementation"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

import boto3
from boto3.dynamodb.conditions import Key
import structlog

logger = structlog.get_logger()


class ConcurrencyError(Exception):
    """楽観的ロック違反エラー"""

    pass


class DynamoDBEventStore:
    """
    DynamoDB ベースの Event Store

    Event Sourcing パターンで集約のイベント履歴を管理する。
    """

    def __init__(
        self,
        table_name: str = "nova-event-store",
        region: str = "us-east-1",
    ):
        self.table_name = table_name
        self._dynamodb = boto3.resource("dynamodb", region_name=region)
        self._table = self._dynamodb.Table(table_name)

    async def append_events(
        self,
        aggregate_type: str,
        aggregate_id: UUID,
        events: list[Any],
        expected_version: int,
    ) -> None:
        """
        イベントを追記（楽観的ロック付き）

        Args:
            aggregate_type: 集約タイプ（例: "AudioFile"）
            aggregate_id: 集約ID
            events: ドメインイベントのリスト
            expected_version: 期待するバージョン（楽観的ロック）
        """
        log = logger.bind(
            aggregate_type=aggregate_type,
            aggregate_id=str(aggregate_id),
            event_count=len(events),
        )
        log.info("appending_events")

        # 現在のバージョンを確認
        current_version = await self._get_current_version(aggregate_type, aggregate_id)

        if current_version != expected_version:
            log.error(
                "concurrency_error",
                expected=expected_version,
                actual=current_version,
            )
            raise ConcurrencyError(
                f"Expected version {expected_version}, but found {current_version}"
            )

        # イベントをバッチ書き込み
        with self._table.batch_writer() as batch:
            for i, event in enumerate(events):
                version = expected_version + i + 1
                item = self._serialize_event(
                    aggregate_type=aggregate_type,
                    aggregate_id=aggregate_id,
                    event=event,
                    version=version,
                )
                batch.put_item(Item=item)

        log.info("events_appended", new_version=expected_version + len(events))

    async def get_events(
        self,
        aggregate_type: str,
        aggregate_id: UUID,
        from_version: int = 0,
    ) -> list[dict[str, Any]]:
        """
        集約のイベント履歴を取得

        Args:
            aggregate_type: 集約タイプ
            aggregate_id: 集約ID
            from_version: 開始バージョン

        Returns:
            イベントのリスト
        """
        log = logger.bind(
            aggregate_type=aggregate_type,
            aggregate_id=str(aggregate_id),
        )
        log.info("getting_events", from_version=from_version)

        pk = f"{aggregate_type}#{aggregate_id}"

        response = self._table.query(
            KeyConditionExpression=Key("pk").eq(pk)
            & Key("sk").gte(f"v{from_version:010d}"),
        )

        events = [self._deserialize_event(item) for item in response["Items"]]
        log.info("events_retrieved", count=len(events))

        return events

    async def get_events_by_type(
        self,
        event_type: str,
        from_time: datetime | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        """
        イベントタイプで検索（GSI使用）

        Args:
            event_type: イベントタイプ（例: "TranscriptionCompleted"）
            from_time: 開始時刻
            limit: 最大件数

        Returns:
            イベントのリスト
        """
        key_condition = Key("gsi1pk").eq(event_type)

        if from_time:
            key_condition = key_condition & Key("gsi1sk").gte(from_time.isoformat())

        response = self._table.query(
            IndexName="gsi1",
            KeyConditionExpression=key_condition,
            Limit=limit,
        )

        return [self._deserialize_event(item) for item in response["Items"]]

    async def _get_current_version(
        self,
        aggregate_type: str,
        aggregate_id: UUID,
    ) -> int:
        """現在のバージョンを取得"""
        pk = f"{aggregate_type}#{aggregate_id}"

        response = self._table.query(
            KeyConditionExpression=Key("pk").eq(pk),
            ScanIndexForward=False,
            Limit=1,
        )

        if not response["Items"]:
            return 0

        return response["Items"][0]["version"]

    def _serialize_event(
        self,
        aggregate_type: str,
        aggregate_id: UUID,
        event: Any,
        version: int,
    ) -> dict[str, Any]:
        """イベントをDynamoDBアイテムにシリアライズ"""
        event_id = getattr(event, "event_id", None)
        occurred_at = getattr(event, "occurred_at", datetime.now(timezone.utc))

        # イベントデータを抽出
        event_data = {}
        for key, value in event.__dict__.items():
            if key.startswith("_"):
                continue
            if isinstance(value, UUID):
                event_data[key] = str(value)
            elif isinstance(value, datetime):
                event_data[key] = value.isoformat()
            else:
                event_data[key] = value

        return {
            "pk": f"{aggregate_type}#{aggregate_id}",
            "sk": f"v{version:010d}",
            "event_id": str(event_id) if event_id else None,
            "aggregate_type": aggregate_type,
            "aggregate_id": str(aggregate_id),
            "event_type": type(event).__name__,
            "event_data": json.dumps(event_data),
            "version": version,
            "occurred_at": occurred_at.isoformat(),
            "gsi1pk": type(event).__name__,
            "gsi1sk": occurred_at.isoformat(),
        }

    def _deserialize_event(self, item: dict[str, Any]) -> dict[str, Any]:
        """DynamoDBアイテムをイベントにデシリアライズ"""
        return {
            "event_id": item.get("event_id"),
            "aggregate_type": item["aggregate_type"],
            "aggregate_id": UUID(item["aggregate_id"]),
            "event_type": item["event_type"],
            "event_data": json.loads(item["event_data"]),
            "version": item["version"],
            "occurred_at": datetime.fromisoformat(item["occurred_at"]),
        }

