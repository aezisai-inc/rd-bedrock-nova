"""Gateway Interfaces (Ports)"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any
from uuid import UUID


@dataclass
class TranscriptionResult:
    """文字起こし結果DTO"""

    text: str
    confidence: float
    segments: list[dict[str, Any]] = field(default_factory=list)
    language: str = "ja-JP"
    speakers: list[str] = field(default_factory=list)


@dataclass
class EmbeddingResult:
    """埋め込みベクトル結果DTO"""

    vector: list[float]
    model_id: str
    dimensions: int


@dataclass
class AgentResponse:
    """Agent 応答DTO"""

    completion: str
    tool_calls: list[dict[str, Any]] = field(default_factory=list)
    citations: list[dict[str, Any]] = field(default_factory=list)
    stop_reason: str = ""


class ITranscriptionGateway(ABC):
    """
    Transcription Gateway Interface

    Nova Sonic などの音声認識サービスとの通信を抽象化する。
    """

    @abstractmethod
    async def transcribe(
        self,
        s3_key: str,
        language: str = "ja-JP",
        enable_diarization: bool = False,
    ) -> TranscriptionResult:
        """音声を文字起こし"""
        pass

    @abstractmethod
    async def transcribe_stream(
        self,
        audio_stream: bytes,
        language: str = "ja-JP",
    ) -> TranscriptionResult:
        """ストリーミング音声を文字起こし"""
        pass


class IEmbeddingsGateway(ABC):
    """
    Embeddings Gateway Interface

    Nova Embeddings などのベクトル化サービスとの通信を抽象化する。
    """

    @abstractmethod
    async def embed_text(self, text: str) -> EmbeddingResult:
        """テキストをベクトル化"""
        pass

    @abstractmethod
    async def embed_image(self, image_data: bytes) -> EmbeddingResult:
        """画像をベクトル化"""
        pass

    @abstractmethod
    async def embed_audio(self, audio_data: bytes) -> EmbeddingResult:
        """音声をベクトル化"""
        pass


class IAgentGateway(ABC):
    """
    Agent Gateway Interface

    Bedrock Agents との通信を抽象化する。
    """

    @abstractmethod
    async def invoke(
        self,
        session_id: str,
        input_text: str,
        context: dict[str, Any] | None = None,
    ) -> AgentResponse:
        """Agent を呼び出し"""
        pass

    @abstractmethod
    async def invoke_stream(
        self,
        session_id: str,
        input_text: str,
        context: dict[str, Any] | None = None,
    ):
        """Agent をストリーミング呼び出し"""
        pass


class IStorageGateway(ABC):
    """
    Storage Gateway Interface

    S3 などのストレージサービスとの通信を抽象化する。
    """

    @abstractmethod
    async def upload(
        self,
        key: str,
        data: bytes,
        content_type: str = "application/octet-stream",
    ) -> str:
        """ファイルをアップロード"""
        pass

    @abstractmethod
    async def download(self, key: str) -> bytes:
        """ファイルをダウンロード"""
        pass

    @abstractmethod
    async def generate_presigned_url(
        self,
        key: str,
        expires_in: int = 3600,
        operation: str = "get_object",
    ) -> str:
        """署名付きURLを生成"""
        pass

    @abstractmethod
    async def delete(self, key: str) -> bool:
        """ファイルを削除"""
        pass

    @abstractmethod
    async def exists(self, key: str) -> bool:
        """ファイルが存在するか確認"""
        pass

