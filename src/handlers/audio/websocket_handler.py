"""
Audio Service WebSocket Handler (AgentCore Runtime)

Nova Sonic 双方向ストリーミング用 WebSocket ハンドラー。
AgentCore Runtime でホストされ、リアルタイム音声会話を実現。

使用方法:
    1. AgentCore Runtime にデプロイ
    2. WebSocket 接続: wss://bedrock-agentcore.<region>.amazonaws.com/runtimes/<arn>/ws
    3. 音声データを PCM 16-bit, 16kHz でストリーミング

イベントフロー:
    Client → Server: 音声データ (PCM バイナリ)
    Server → Client: JSON イベント (transcription, audio, tool_use, etc.)
"""
import os
import json
import logging
import asyncio
import base64
from dataclasses import asdict
from typing import Optional

# AgentCore SDK
from bedrock_agentcore import BedrockAgentCoreApp

# Nova Sonic Handler
from src.agent.tools.audio import (
    NovaSonicConfig,
    NovaSonicStreamHandler,
    ConversationEvent,
    VOICES,
)

logger = logging.getLogger(__name__)
logger.setLevel(os.environ.get("LOG_LEVEL", "INFO"))

# AgentCore App
app = BedrockAgentCoreApp()


# =============================================================================
# WebSocket Handler
# =============================================================================

@app.websocket
async def nova_sonic_handler(websocket, context):
    """
    Nova Sonic 双方向ストリーミング WebSocket ハンドラー
    
    Protocol:
        1. Client sends JSON config (optional)
        2. Client streams PCM audio bytes
        3. Server streams JSON events back
        
    Config Format:
        {
            "config": {
                "system_prompt": "You are a helpful assistant.",
                "voice_id": "tiffany",
                "language": "en-US",
                "vad_sensitivity": 0.5
            }
        }
        
    Event Types (Server → Client):
        - transcription: ASR テキスト
        - audio: TTS 音声 (Base64)
        - text: テキスト応答
        - tool_use: ツール使用リクエスト
        - content_end: コンテンツ終了
        - session_end: セッション終了
        - error: エラー
    """
    await websocket.accept()
    logger.info(f"WebSocket connection accepted: {context.get('session_id', 'unknown')}")
    
    # 設定を受信 (最初のメッセージが JSON の場合)
    config = await _receive_config(websocket)
    
    # Nova Sonic セッション
    handler = NovaSonicStreamHandler(config)
    
    try:
        await handler.start_session()
        
        # 入力/出力タスクを並行実行
        input_task = asyncio.create_task(_input_loop(websocket, handler))
        output_task = asyncio.create_task(_output_loop(websocket, handler))
        
        # どちらかが終了するまで待機
        done, pending = await asyncio.wait(
            [input_task, output_task],
            return_when=asyncio.FIRST_COMPLETED,
        )
        
        # 残りのタスクをキャンセル
        for task in pending:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        
    except Exception as e:
        logger.exception(f"WebSocket handler error: {e}")
        await _send_error(websocket, str(e))
    finally:
        await handler.end_session()
        await websocket.close()
        logger.info("WebSocket connection closed")


async def _receive_config(websocket) -> NovaSonicConfig:
    """設定を受信 (タイムアウト付き)"""
    try:
        # 最初のメッセージを待機 (1秒タイムアウト)
        message = await asyncio.wait_for(
            websocket.receive(),
            timeout=1.0,
        )
        
        if isinstance(message, dict) and "text" in message:
            data = json.loads(message["text"])
            config_data = data.get("config", {})
            return NovaSonicConfig(**config_data)
        
    except asyncio.TimeoutError:
        pass
    except json.JSONDecodeError:
        pass
    except Exception as e:
        logger.warning(f"Config receive error: {e}")
    
    # デフォルト設定
    return NovaSonicConfig()


async def _input_loop(websocket, handler: NovaSonicStreamHandler) -> None:
    """入力ループ: Client → Nova Sonic"""
    try:
        async for message in websocket.iter_bytes():
            if isinstance(message, bytes):
                # PCM 音声データ
                await handler.send_audio(message)
            else:
                # JSON メッセージ (テキスト入力など)
                try:
                    data = json.loads(message)
                    
                    if "text" in data:
                        # Nova 2 Sonic: テキスト入力
                        await handler.send_text(data["text"])
                    
                    elif "tool_result" in data:
                        # ツール結果
                        result = data["tool_result"]
                        await handler.send_tool_result(
                            tool_use_id=result.get("tool_use_id", ""),
                            result=result.get("result", ""),
                        )
                    
                    elif "end" in data:
                        # セッション終了リクエスト
                        break
                        
                except json.JSONDecodeError:
                    pass
                    
    except Exception as e:
        logger.error(f"Input loop error: {e}")


async def _output_loop(websocket, handler: NovaSonicStreamHandler) -> None:
    """出力ループ: Nova Sonic → Client"""
    try:
        async for event in handler.receive_events():
            await websocket.send_json(asdict(event))
            
            if event.event_type == "session_end":
                break
                
    except Exception as e:
        logger.error(f"Output loop error: {e}")


async def _send_error(websocket, message: str) -> None:
    """エラーイベントを送信"""
    try:
        await websocket.send_json({
            "event_type": "error",
            "data": {"message": message},
        })
    except Exception:
        pass


# =============================================================================
# HTTP Endpoints (ヘルスチェック・設定)
# =============================================================================

@app.entrypoint
async def http_handler(payload: dict):
    """HTTP エントリポイント"""
    path = payload.get("path", "/")
    method = payload.get("method", "GET")
    
    if path == "/health" or path == "/":
        return {
            "status": "healthy",
            "service": "nova-sonic-audio",
            "websocket_path": "/ws",
            "supported_voices": list(VOICES.keys()),
        }
    
    if path == "/config" and method == "GET":
        return {
            "default_config": asdict(NovaSonicConfig()),
            "voices": VOICES,
            "languages": [
                "en-US", "en-GB", "es-ES", "fr-FR",
                "de-DE", "it-IT", "pt-BR", "hi-IN",
            ],
        }
    
    return {"error": "Not found", "path": path}


# =============================================================================
# Entry Point
# =============================================================================

if __name__ == "__main__":
    app.run(log_level="info", port=8080)

