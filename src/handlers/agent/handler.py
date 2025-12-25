"""
Agent Core Lambda Handler

Strands Agent SDK を使用した Agent Core のエントリポイント。
Lambda Container Image としてデプロイ。
"""
import json
import os
import logging
from typing import Any
from datetime import datetime, timedelta

import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Environment variables
EVENT_STORE_TABLE = os.environ.get('EVENT_STORE_TABLE', 'nova-event-store')
SESSION_TABLE = os.environ.get('SESSION_TABLE', 'nova-session-memory')
CONTENT_BUCKET = os.environ.get('CONTENT_BUCKET', '')

dynamodb = boto3.resource('dynamodb')
bedrock = boto3.client('bedrock-runtime')


def lambda_handler(event: dict, context: Any) -> dict:
    """Lambda エントリポイント"""
    logger.info(f"Event: {json.dumps(event)}")
    
    http_method = event.get('httpMethod', 'POST')
    path = event.get('path', '')
    body = json.loads(event.get('body', '{}')) if event.get('body') else {}
    path_params = event.get('pathParameters', {}) or {}
    
    try:
        # Routing
        if path == '/agent/chat' and http_method == 'POST':
            return handle_chat(body)
        elif path == '/agent/sessions' and http_method == 'POST':
            return handle_create_session(body)
        elif path.startswith('/agent/sessions/') and http_method == 'GET':
            session_id = path_params.get('sessionId')
            return handle_get_session(session_id)
        elif path.startswith('/agent/sessions/') and http_method == 'DELETE':
            session_id = path_params.get('sessionId')
            return handle_delete_session(session_id)
        else:
            return response(404, {'error': 'Not Found'})
    
    except Exception as e:
        logger.exception("Handler error")
        return response(500, {'error': str(e)})


def handle_chat(body: dict) -> dict:
    """
    チャット処理
    
    Strands Agent SDK の本来の使い方:
    - ツールの自動選択
    - Memory からの過去コンテキスト取得
    - Guardrails 適用
    """
    session_id = body.get('session_id')
    message = body.get('message', '')
    
    if not session_id or not message:
        return response(400, {'error': 'session_id and message are required'})
    
    # Get session memory
    session = get_session(session_id)
    if not session:
        return response(404, {'error': 'Session not found'})
    
    # Build conversation history
    history = session.get('history', [])
    history.append({'role': 'user', 'content': message})
    
    # Call Bedrock (Claude 3.5 Sonnet)
    # TODO: Strands SDK 統合時に置き換え
    bedrock_response = bedrock.invoke_model(
        modelId='anthropic.claude-3-5-sonnet-20240620-v1:0',
        contentType='application/json',
        accept='application/json',
        body=json.dumps({
            'anthropic_version': 'bedrock-2023-05-31',
            'max_tokens': 4096,
            'messages': [
                {'role': msg['role'], 'content': msg['content']}
                for msg in history
            ],
            'system': """あなたは Nova Platform の AI アシスタントです。
音声処理 (Nova Sonic)、映像解析 (Nova Omni)、検索 (Nova Embeddings) の
ツールを使って、ユーザーのリクエストに応答してください。""",
        })
    )
    
    result = json.loads(bedrock_response['body'].read())
    assistant_message = result['content'][0]['text']
    
    # Update history
    history.append({'role': 'assistant', 'content': assistant_message})
    update_session(session_id, history)
    
    return response(200, {
        'session_id': session_id,
        'response': assistant_message,
    })


def handle_create_session(body: dict) -> dict:
    """新しいセッションを作成"""
    import uuid
    
    session_id = str(uuid.uuid4())
    user_id = body.get('user_id', 'anonymous')
    
    table = dynamodb.Table(SESSION_TABLE)
    ttl = int((datetime.utcnow() + timedelta(hours=24)).timestamp())
    
    table.put_item(Item={
        'session_id': session_id,
        'sk': 'SESSION#METADATA',
        'user_id': user_id,
        'created_at': datetime.utcnow().isoformat(),
        'history': [],
        'ttl': ttl,
    })
    
    return response(201, {
        'session_id': session_id,
        'created_at': datetime.utcnow().isoformat(),
    })


def handle_get_session(session_id: str) -> dict:
    """セッション情報を取得"""
    session = get_session(session_id)
    if not session:
        return response(404, {'error': 'Session not found'})
    
    return response(200, {
        'session_id': session_id,
        'user_id': session.get('user_id'),
        'created_at': session.get('created_at'),
        'message_count': len(session.get('history', [])),
    })


def handle_delete_session(session_id: str) -> dict:
    """セッションを削除"""
    table = dynamodb.Table(SESSION_TABLE)
    table.delete_item(Key={
        'session_id': session_id,
        'sk': 'SESSION#METADATA',
    })
    
    return response(204, {})


def get_session(session_id: str) -> dict | None:
    """セッションを取得"""
    table = dynamodb.Table(SESSION_TABLE)
    result = table.get_item(Key={
        'session_id': session_id,
        'sk': 'SESSION#METADATA',
    })
    return result.get('Item')


def update_session(session_id: str, history: list) -> None:
    """セッション履歴を更新"""
    table = dynamodb.Table(SESSION_TABLE)
    ttl = int((datetime.utcnow() + timedelta(hours=24)).timestamp())
    
    table.update_item(
        Key={
            'session_id': session_id,
            'sk': 'SESSION#METADATA',
        },
        UpdateExpression='SET history = :h, #ttl = :t',
        ExpressionAttributeNames={'#ttl': 'ttl'},
        ExpressionAttributeValues={
            ':h': history,
            ':t': ttl,
        },
    )


def response(status_code: int, body: dict) -> dict:
    """API Gateway レスポンス形式"""
    return {
        'statusCode': status_code,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
        },
        'body': json.dumps(body) if body else '',
    }

