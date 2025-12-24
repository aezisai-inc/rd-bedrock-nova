"""DynamoDB Audio Repository Implementation"""
from __future__ import annotations

from uuid import UUID

import structlog

from src.application.ports.repositories import IAudioRepository
from src.domain.audio.entities import AudioFile
from src.infrastructure.event_store import DynamoDBEventStore

logger = structlog.get_logger()


class DynamoDBAudioRepository(IAudioRepository):
    """
    DynamoDB ベースの Audio Repository

    Event Sourcing パターンで AudioFile 集約を管理する。
    """

    AGGREGATE_TYPE = "AudioFile"

    def __init__(self, event_store: DynamoDBEventStore):
        self._event_store = event_store

    async def find_by_id(self, audio_id: UUID) -> AudioFile | None:
        """
        IDで音声ファイルを取得

        イベント履歴から集約を再構築する。
        """
        log = logger.bind(audio_id=str(audio_id))
        log.info("finding_audio_by_id")

        events = await self._event_store.get_events(
            aggregate_type=self.AGGREGATE_TYPE,
            aggregate_id=audio_id,
        )

        if not events:
            log.info("audio_not_found")
            return None

        audio = AudioFile.reconstitute(events)
        log.info("audio_found", status=audio.status.value)

        return audio

    async def save(self, audio: AudioFile) -> None:
        """
        音声ファイルを保存

        未コミットのイベントを Event Store に追記する。
        """
        log = logger.bind(audio_id=str(audio.id))
        log.info("saving_audio")

        events = audio.get_uncommitted_events()
        if not events:
            log.info("no_events_to_save")
            return

        await self._event_store.append_events(
            aggregate_type=self.AGGREGATE_TYPE,
            aggregate_id=audio.id,
            events=events,
            expected_version=audio.version,
        )

        log.info("audio_saved", event_count=len(events))

    async def find_by_user(
        self,
        user_id: UUID,
        limit: int = 100,
        cursor: str | None = None,
    ) -> tuple[list[AudioFile], str | None]:
        """
        ユーザーIDで音声ファイル一覧を取得

        注: Event Sourcing では一覧取得は Read Model から行うのが一般的。
        ここでは簡易実装として、イベントから取得する。
        """
        log = logger.bind(user_id=str(user_id))
        log.info("finding_audio_by_user")

        # AudioCreated イベントからユーザーの音声を検索
        events = await self._event_store.get_events_by_type(
            event_type="AudioCreated",
            limit=limit * 2,  # フィルタリング用に多めに取得
        )

        # ユーザーでフィルタリング
        user_events = [
            e
            for e in events
            if e["event_data"].get("user_id") == str(user_id)
        ][:limit]

        # 各音声の集約を再構築
        audio_files = []
        for event in user_events:
            audio_id = UUID(event["event_data"]["audio_id"])
            audio = await self.find_by_id(audio_id)
            if audio:
                audio_files.append(audio)

        log.info("audio_list_retrieved", count=len(audio_files))

        # 簡易カーソル（最後のIDを返す）
        next_cursor = str(audio_files[-1].id) if audio_files else None

        return audio_files, next_cursor

    async def delete(self, audio_id: UUID) -> bool:
        """
        音声ファイルを削除

        Event Sourcing では物理削除せず、
        削除イベントを発行するのが一般的。
        """
        log = logger.bind(audio_id=str(audio_id))
        log.info("deleting_audio")

        audio = await self.find_by_id(audio_id)
        if not audio:
            log.info("audio_not_found")
            return False

        # 削除マーカーとしてフェイルさせる
        audio.fail_processing("Deleted by user", "USER_DELETED")
        await self.save(audio)

        log.info("audio_deleted")
        return True

