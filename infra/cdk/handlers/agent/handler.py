"""
Agent Core Lambda Handler

Strands Agent SDK を使用したコーディネーター Lambda。
API Gateway からのリクエストを処理し、Agent Core を実行。
"""
import os
import json
import asyncio
import logging
from typing import Any

# Agent Core インポート
from src.agent.coordinator import NovaCoordinatorAgent

logger = logging.getLogger(__name__)
logger.setLevel(os.environ.get("LOG_LEVEL", "INFO"))

# グローバル Agent インスタンス (Warm Start 対応)
_agent_instance: NovaCoordinatorAgent | None = None


def get_agent() -> NovaCoordinatorAgent:
    """Agent インスタンスを取得 (シングルトン)"""
    global _agent_instance
    
    if _agent_instance is None:
        logger.info("Initializing Agent Core...")
        _agent_instance = NovaCoordinatorAgent(
            session_table=os.environ.get('SESSION_TABLE'),
            event_store_table=os.environ.get('EVENT_STORE_TABLE'),
            model_id=os.environ.get('MODEL_ID', 'anthropic.claude-opus-4-5-20251101-v1:0'),  # Claude Opus 4.5
            guardrail_id=os.environ.get('GUARDRAIL_ID'),
        )
        logger.info("Agent Core initialized successfully")
    
    return _agent_instance


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """
    Lambda Handler for Agent Core
    
    API Gateway HTTP API Integration:
    - POST /agent/chat - 会話処理
    - POST /agent/sessions - セッション作成
    - GET /agent/sessions/{id} - セッション取得
    - DELETE /agent/sessions/{id} - セッション削除
    """
    logger.info(f"Received event: {json.dumps(event)}")
    
    try:
        # HTTP メソッドとパスを取得
        http_method = event.get('requestContext', {}).get('http', {}).get('method', 'POST')
        path = event.get('rawPath', '/agent/chat')
        path_params = event.get('pathParameters', {})
        
        # Body を解析
        body = {}
        if event.get('body'):
            body = json.loads(event['body']) if isinstance(event['body'], str) else event['body']
        
        # Agent インスタンスを取得
        agent = get_agent()
        
        # ルーティング
        if path.endswith('/chat') and http_method == 'POST':
            return _handle_chat(agent, body, context)
        elif '/sessions' in path:
            if http_method == 'POST' and not path_params.get('session_id'):
                return _handle_create_session(agent, body)
            elif http_method == 'GET' and path_params.get('session_id'):
                return _handle_get_session(agent, path_params['session_id'])
            elif http_method == 'DELETE' and path_params.get('session_id'):
                return _handle_delete_session(agent, path_params['session_id'])
        
        # デフォルト: チャット処理
        return _handle_chat(agent, body, context)
        
    except Exception as e:
        logger.exception(f"Error processing request: {e}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e), 'message': 'Internal server error'}),
            'headers': {'Content-Type': 'application/json'},
        }


def _handle_chat(agent: NovaCoordinatorAgent, body: dict, context: Any) -> dict[str, Any]:
    """チャット処理"""
    user_input = body.get('user_input') or body.get('message')
    session_id = body.get('session_id') or str(context.aws_request_id)
    user_id = body.get('user_id')
    
    if not user_input:
        return {
            'statusCode': 400,
            'body': json.dumps({'error': 'user_input or message is required'}),
            'headers': {'Content-Type': 'application/json'},
        }
    
    # 非同期処理を同期的に実行
    result = asyncio.get_event_loop().run_until_complete(
        agent.process(
            user_input=user_input,
            session_id=session_id,
            user_id=user_id,
        )
    )
    
    return {
        'statusCode': 200,
        'body': json.dumps(result, ensure_ascii=False),
        'headers': {'Content-Type': 'application/json'},
    }


def _handle_create_session(agent: NovaCoordinatorAgent, body: dict) -> dict[str, Any]:
    """セッション作成"""
    user_id = body.get('user_id')
    
    session_id = asyncio.get_event_loop().run_until_complete(
        agent.create_session(user_id=user_id)
    )
    
    return {
        'statusCode': 201,
        'body': json.dumps({'session_id': session_id}),
        'headers': {'Content-Type': 'application/json'},
    }


def _handle_get_session(agent: NovaCoordinatorAgent, session_id: str) -> dict[str, Any]:
    """セッション取得"""
    session = asyncio.get_event_loop().run_until_complete(
        agent.get_session(session_id)
    )
    
    if not session:
        return {
            'statusCode': 404,
            'body': json.dumps({'error': 'Session not found'}),
            'headers': {'Content-Type': 'application/json'},
        }
    
    return {
        'statusCode': 200,
        'body': json.dumps(session, ensure_ascii=False, default=str),
        'headers': {'Content-Type': 'application/json'},
    }


def _handle_delete_session(agent: NovaCoordinatorAgent, session_id: str) -> dict[str, Any]:
    """セッション削除"""
    asyncio.get_event_loop().run_until_complete(
        agent.delete_session(session_id)
    )
    
    return {
        'statusCode': 204,
        'body': '',
        'headers': {'Content-Type': 'application/json'},
    }
