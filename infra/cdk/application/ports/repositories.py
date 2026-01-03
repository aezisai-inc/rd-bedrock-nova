"""Repository Interfaces (Ports)"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING
from uuid import UUID

if TYPE_CHECKING:
    from src.domain.audio.entities import AudioFile


class IAudioRepository(ABC):
    """
    Audio Repository Interface

    依存性逆転の原則に従い、ドメイン層から参照可能な抽象インターフェース。
    具体的な実装（DynamoDB等）はインフラ層で提供する。
    """

    @abstractmethod
    async def find_by_id(self, audio_id: UUID) -> AudioFile | None:
        """IDで音声ファイルを取得"""
        pass

    @abstractmethod
    async def save(self, audio: AudioFile) -> None:
        """音声ファイルを保存（イベントソーシング）"""
        pass

    @abstractmethod
    async def find_by_user(
        self,
        user_id: UUID,
        limit: int = 100,
        cursor: str | None = None,
    ) -> tuple[list[AudioFile], str | None]:
        """ユーザーIDで音声ファイル一覧を取得（ページネーション対応）"""
        pass

    @abstractmethod
    async def delete(self, audio_id: UUID) -> bool:
        """音声ファイルを削除"""
        pass


class ISessionRepository(ABC):
    """
    Session Repository Interface

    Agent セッションの永続化を抽象化する。
    """

    @abstractmethod
    async def find_by_id(self, session_id: UUID) -> "AgentSession | None":
        """セッションIDで取得"""
        pass

    @abstractmethod
    async def save(self, session: "AgentSession") -> None:
        """セッションを保存"""
        pass

    @abstractmethod
    async def find_active_by_user(self, user_id: UUID) -> list["AgentSession"]:
        """ユーザーのアクティブセッション一覧"""
        pass

    @abstractmethod
    async def delete(self, session_id: UUID) -> bool:
        """セッションを削除"""
        pass


# Forward reference for type hints
class AgentSession:
    """Agent Session (placeholder for type hints)"""

    pass

