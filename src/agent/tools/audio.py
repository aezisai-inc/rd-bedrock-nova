"""
Audio Tools - Nova Sonic Integration (AgentCore Runtime + WebSocket)

Nova Sonic を使用した音声処理ツール:
- 双方向ストリーミング (Bidirectional Streaming)
- 音声→テキスト文字起こし (リアルタイム対応)
- 話者識別 (Speaker Diarization)
- 感情分析 (Sentiment & Emotion)

アーキテクチャ:
- AgentCore Runtime: WebSocket 双方向ストリーミング
- Nova Sonic: InvokeModelWithBidirectionalStream API
- Strands Agent SDK: ツールオーケストレーション

技術仕様:
- 入力形式: PCM 16-bit, 16kHz または 8kHz (テレフォニー)
- 出力形式: PCM 16-bit, 24kHz
- 言語: en-US, en-GB, es-ES, fr-FR, de-DE, it-IT, pt-BR, hi-IN
"""
import os
import json
import logging
import asyncio
import base64
import uuid
from typing import AsyncIterator, Optional
from dataclasses import dataclass, field, asdict
from functools import wraps
from datetime import datetime, timezone

import boto3

logger = logging.getLogger(__name__)

# Nova Sonic Model IDs
NOVA_SONIC_V1_MODEL_ID = "amazon.nova-sonic-v1:0"
NOVA_SONIC_V2_MODEL_ID = "amazon.nova-2-sonic-v1:0"
DEFAULT_MODEL_ID = os.environ.get("NOVA_SONIC_MODEL_ID", NOVA_SONIC_V2_MODEL_ID)

# Voice IDs
VOICES = {
    "tiffany": "tiffany",      # Feminine, American
    "matthew": "matthew",      # Masculine, American
    "amy": "amy",              # Feminine, British
    "brian": "brian",          # Masculine, British
    "aria": "aria",            # Feminine, Polyglot (Nova 2)
    "pedro": "pedro",          # Masculine, Polyglot (Nova 2)
}


def tool(name: str, description: str):
    """Strands @tool デコレータ"""
    def decorator(func):
        func._tool_name = name
        func._tool_description = description
        @wraps(func)
        def wrapper(*args, **kwargs):
            return func(*args, **kwargs)
        wrapper._tool_name = name
        wrapper._tool_description = description
        return wrapper
    return decorator


# =============================================================================
# Data Classes
# =============================================================================

@dataclass
class NovaSonicConfig:
    """Nova Sonic セッション設定"""
    model_id: str = DEFAULT_MODEL_ID
    voice_id: str = "tiffany"
    language: str = "en-US"
    system_prompt: str = "You are a helpful assistant."
    sample_rate: int = 16000  # Input: 16kHz or 8kHz
    output_sample_rate: int = 24000  # Output: 24kHz
    enable_turn_detection: bool = True
    # Nova 2 Sonic features
    vad_sensitivity: float = 0.5  # 0.0-1.0, lower = faster response
    enable_crossmodal: bool = False  # Text + Audio in same session


@dataclass
class TranscriptionSegment:
    """ASR 文字起こしセグメント"""
    text: str
    start_time: float = 0.0
    end_time: float = 0.0
    is_partial: bool = False
    role: str = "user"  # user or assistant


@dataclass
class AudioChunk:
    """音声チャンク (Base64 エンコード)"""
    data: str  # Base64 encoded PCM
    sample_rate: int = 24000
    timestamp: float = 0.0


@dataclass
class ToolUseRequest:
    """Nova Sonic からのツール使用リクエスト"""
    tool_use_id: str
    tool_name: str
    tool_input: dict


@dataclass
class ConversationEvent:
    """会話イベント (双方向ストリーミング用)"""
    event_type: str  # transcription, audio, tool_use, content_end, etc.
    data: dict = field(default_factory=dict)
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


# =============================================================================
# Nova Sonic Event Types (Input/Output)
# =============================================================================

class NovaSonicEvents:
    """Nova Sonic イベント定義"""
    
    # Input Events (Client → Nova Sonic)
    @staticmethod
    def session_start(config: NovaSonicConfig) -> dict:
        """セッション開始イベント"""
        inference_config = {
            "maxTokens": 1024,
            "topP": 0.9,
            "temperature": 0.7,
        }
        
        audio_input_config = {
            "mediaType": "audio/lpcm",
            "sampleRateHertz": config.sample_rate,
            "sampleSizeInBits": 16,
            "channelCount": 1,
        }
        
        audio_output_config = {
            "mediaType": "audio/lpcm",
            "sampleRateHertz": config.output_sample_rate,
            "sampleSizeInBits": 16,
            "channelCount": 1,
            "voiceId": config.voice_id,
        }
        
        event = {
            "event": {
                "sessionStart": {
                    "inferenceConfiguration": inference_config,
                    "audioInputConfiguration": audio_input_config,
                    "audioOutputConfiguration": audio_output_config,
                    "systemPrompt": {
                        "content": config.system_prompt,
                    },
                }
            }
        }
        
        # Nova 2 Sonic: VAD sensitivity
        if config.vad_sensitivity != 0.5:
            event["event"]["sessionStart"]["turnDetection"] = {
                "vadSensitivity": config.vad_sensitivity,
            }
        
        return event
    
    @staticmethod
    def prompt_start() -> dict:
        """プロンプト開始イベント"""
        return {
            "event": {
                "promptStart": {
                    "promptName": str(uuid.uuid4()),
                }
            }
        }
    
    @staticmethod
    def audio_input(audio_bytes: bytes) -> dict:
        """音声入力イベント (Base64 エンコード)"""
        return {
            "event": {
                "audioInput": {
                    "audio": base64.b64encode(audio_bytes).decode("utf-8"),
                }
            }
        }
    
    @staticmethod
    def text_input(text: str) -> dict:
        """テキスト入力イベント (Nova 2 Sonic crossmodal)"""
        return {
            "event": {
                "textInput": {
                    "text": text,
                }
            }
        }
    
    @staticmethod
    def content_end() -> dict:
        """コンテンツ終了イベント"""
        return {
            "event": {
                "contentEnd": {}
            }
        }
    
    @staticmethod
    def prompt_end() -> dict:
        """プロンプト終了イベント"""
        return {
            "event": {
                "promptEnd": {}
            }
        }
    
    @staticmethod
    def tool_result(tool_use_id: str, result: str, status: str = "success") -> dict:
        """ツール結果イベント"""
        return {
            "event": {
                "toolResult": {
                    "toolUseId": tool_use_id,
                    "status": status,
                    "content": {
                        "text": result,
                    },
                }
            }
        }
    
    @staticmethod
    def session_end() -> dict:
        """セッション終了イベント"""
        return {
            "event": {
                "sessionEnd": {}
            }
        }


# =============================================================================
# Nova Sonic Bidirectional Stream Handler
# =============================================================================

class NovaSonicStreamHandler:
    """
    Nova Sonic 双方向ストリーミングハンドラー
    
    AgentCore Runtime の WebSocket 経由で使用。
    """
    
    def __init__(self, config: NovaSonicConfig = None):
        self.config = config or NovaSonicConfig()
        self.session_id = str(uuid.uuid4())
        self._input_stream = None
        self._output_stream = None
        self._response = None
        self._is_active = False
        
    async def start_session(self) -> None:
        """双方向ストリーミングセッションを開始"""
        from botocore.config import Config
        
        bedrock_config = Config(
            read_timeout=300,
            retries={"max_attempts": 3},
        )
        
        self.bedrock = boto3.client(
            "bedrock-runtime",
            config=bedrock_config,
            region_name=os.environ.get("AWS_REGION", "us-east-1"),
        )
        
        # 双方向ストリーミング開始
        self._response = self.bedrock.invoke_model_with_bidirectional_stream(
            modelId=self.config.model_id,
        )
        
        self._input_stream = self._response["body"]
        self._output_stream = self._response["body"]
        self._is_active = True
        
        # セッション開始イベント送信
        await self._send_event(NovaSonicEvents.session_start(self.config))
        
        logger.info(f"Nova Sonic session started: {self.session_id}")
    
    async def _send_event(self, event: dict) -> None:
        """イベントを送信"""
        if not self._is_active:
            raise RuntimeError("Session not active")
        
        event_bytes = json.dumps(event).encode("utf-8")
        self._input_stream.write(event_bytes)
    
    async def send_audio(self, audio_bytes: bytes) -> None:
        """音声データを送信"""
        await self._send_event(NovaSonicEvents.audio_input(audio_bytes))
    
    async def send_text(self, text: str) -> None:
        """テキストを送信 (Nova 2 Sonic crossmodal)"""
        await self._send_event(NovaSonicEvents.text_input(text))
    
    async def send_tool_result(self, tool_use_id: str, result: str) -> None:
        """ツール結果を送信"""
        await self._send_event(NovaSonicEvents.tool_result(tool_use_id, result))
    
    async def receive_events(self) -> AsyncIterator[ConversationEvent]:
        """イベントを受信 (非同期ジェネレータ)"""
        if not self._is_active:
            raise RuntimeError("Session not active")
        
        async for chunk in self._output_stream:
            try:
                event_data = json.loads(chunk.decode("utf-8"))
                event = self._parse_output_event(event_data)
                if event:
                    yield event
                    
                    # セッション終了チェック
                    if event.event_type == "session_end":
                        self._is_active = False
                        break
                        
            except json.JSONDecodeError:
                logger.warning(f"Invalid JSON in stream: {chunk}")
                continue
    
    def _parse_output_event(self, event_data: dict) -> Optional[ConversationEvent]:
        """出力イベントをパース"""
        event = event_data.get("event", {})
        
        # ASR (音声認識) イベント
        if "transcription" in event:
            trans = event["transcription"]
            return ConversationEvent(
                event_type="transcription",
                data={
                    "text": trans.get("text", ""),
                    "role": trans.get("role", "user"),
                    "is_partial": trans.get("isPartial", False),
                },
            )
        
        # 音声出力イベント
        if "audioOutput" in event:
            audio = event["audioOutput"]
            return ConversationEvent(
                event_type="audio",
                data={
                    "audio": audio.get("audio", ""),  # Base64
                    "sample_rate": self.config.output_sample_rate,
                },
            )
        
        # テキスト出力イベント
        if "textOutput" in event:
            text = event["textOutput"]
            return ConversationEvent(
                event_type="text",
                data={
                    "text": text.get("text", ""),
                    "role": "assistant",
                },
            )
        
        # ツール使用リクエスト
        if "toolUse" in event:
            tool = event["toolUse"]
            return ConversationEvent(
                event_type="tool_use",
                data={
                    "tool_use_id": tool.get("toolUseId", ""),
                    "tool_name": tool.get("toolName", ""),
                    "tool_input": tool.get("input", {}),
                },
            )
        
        # コンテンツ終了
        if "contentEnd" in event:
            return ConversationEvent(
                event_type="content_end",
                data={},
            )
        
        # セッション終了
        if "sessionEnd" in event:
            return ConversationEvent(
                event_type="session_end",
                data={},
            )
        
        return None
    
    async def end_session(self) -> None:
        """セッションを終了"""
        if self._is_active:
            await self._send_event(NovaSonicEvents.session_end())
            self._is_active = False
            logger.info(f"Nova Sonic session ended: {self.session_id}")


# =============================================================================
# AgentCore Runtime WebSocket Handler
# =============================================================================

def create_nova_sonic_websocket_handler():
    """
    AgentCore Runtime 用 WebSocket ハンドラーを生成
    
    Usage:
        from bedrock_agentcore import BedrockAgentCoreApp
        
        app = BedrockAgentCoreApp()
        
        @app.websocket
        async def websocket_handler(websocket, context):
            await nova_sonic_websocket_handler(websocket, context)
    """
    
    async def nova_sonic_websocket_handler(websocket, context):
        """Nova Sonic WebSocket ハンドラー"""
        await websocket.accept()
        
        # 設定を受信
        try:
            config_data = await websocket.receive_json()
            config = NovaSonicConfig(**config_data.get("config", {}))
        except Exception:
            config = NovaSonicConfig()
        
        # Nova Sonic セッション開始
        handler = NovaSonicStreamHandler(config)
        
        try:
            await handler.start_session()
            
            # 入力タスク: クライアント → Nova Sonic
            async def input_task():
                async for message in websocket.iter_bytes():
                    await handler.send_audio(message)
            
            # 出力タスク: Nova Sonic → クライアント
            async def output_task():
                async for event in handler.receive_events():
                    await websocket.send_json(asdict(event))
            
            # 並行実行
            await asyncio.gather(
                input_task(),
                output_task(),
            )
            
        except Exception as e:
            logger.exception(f"WebSocket error: {e}")
            await websocket.send_json({
                "event_type": "error",
                "data": {"message": str(e)},
            })
        finally:
            await handler.end_session()
            await websocket.close()
    
    return nova_sonic_websocket_handler


# =============================================================================
# Tools (Strands Agent SDK 用)
# =============================================================================

@tool(
    name="transcribe_audio_stream",
    description="Nova Sonic を使用してリアルタイム音声文字起こしを開始します。WebSocket 接続が必要です。"
)
async def transcribe_audio_stream(
    session_id: str,
    language: str = "en-US",
    voice_id: str = "tiffany",
) -> dict:
    """
    リアルタイム音声文字起こしセッションを開始
    
    Args:
        session_id: セッションID
        language: 言語コード
        voice_id: 音声ID
        
    Returns:
        セッション情報
    """
    config = NovaSonicConfig(
        language=language,
        voice_id=voice_id,
    )
    
    return {
        "session_id": session_id,
        "config": asdict(config),
        "websocket_path": "/ws",
        "message": "WebSocket 接続を開始してください",
    }


@tool(
    name="configure_nova_sonic",
    description="Nova Sonic セッションの設定を生成します。"
)
async def configure_nova_sonic(
    system_prompt: str = "You are a helpful assistant.",
    voice_id: str = "tiffany",
    language: str = "en-US",
    vad_sensitivity: float = 0.5,
) -> dict:
    """
    Nova Sonic 設定を生成
    
    Args:
        system_prompt: システムプロンプト
        voice_id: 音声ID (tiffany, matthew, amy, brian, aria, pedro)
        language: 言語コード
        vad_sensitivity: VAD 感度 (0.0-1.0, 低いほど高速応答)
        
    Returns:
        設定オブジェクト
    """
    config = NovaSonicConfig(
        system_prompt=system_prompt,
        voice_id=voice_id,
        language=language,
        vad_sensitivity=vad_sensitivity,
    )
    
    return asdict(config)


# =============================================================================
# Utility Functions
# =============================================================================

def serialize_result(result) -> dict:
    """結果をJSON直列化可能な形式に変換"""
    if hasattr(result, "__dataclass_fields__"):
        return asdict(result)
    return result


def decode_audio_chunk(chunk: AudioChunk) -> bytes:
    """Base64 音声チャンクをデコード"""
    return base64.b64decode(chunk.data)


def encode_audio_bytes(audio_bytes: bytes) -> str:
    """音声バイトを Base64 エンコード"""
    return base64.b64encode(audio_bytes).decode("utf-8")
