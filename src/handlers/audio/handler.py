"""
Audio Handler Lambda

Nova Sonic を使用した音声処理 Lambda ハンドラー。
"""
import json
import os
import logging
import base64
from typing import Any
from datetime import datetime
import uuid

import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Environment variables
EVENT_STORE_TABLE = os.environ.get('EVENT_STORE_TABLE', 'nova-event-store')
CONTENT_BUCKET = os.environ.get('CONTENT_BUCKET', '')
NOVA_SONIC_MODEL_ID = os.environ.get('NOVA_SONIC_MODEL_ID', 'amazon.nova-sonic-v1')

dynamodb = boto3.resource('dynamodb')
s3 = boto3.client('s3')
bedrock = boto3.client('bedrock-runtime')


def lambda_handler(event: dict, context: Any) -> dict:
    """Lambda エントリポイント"""
    logger.info(f"Event: {json.dumps(event)}")
    
    http_method = event.get('httpMethod', 'POST')
    path = event.get('path', '')
    body = json.loads(event.get('body', '{}')) if event.get('body') else {}
    
    try:
        if path == '/audio/transcribe' and http_method == 'POST':
            return handle_transcribe(body)
        elif path == '/audio/analyze' and http_method == 'POST':
            return handle_analyze(body)
        else:
            return response(404, {'error': 'Not Found'})
    
    except Exception as e:
        logger.exception("Handler error")
        return response(500, {'error': str(e)})


def handle_transcribe(body: dict) -> dict:
    """
    音声文字起こし処理
    
    Nova Sonic を使用して音声をテキストに変換。
    """
    audio_url = body.get('audio_url')
    audio_base64 = body.get('audio_base64')
    language = body.get('language', 'ja-JP')
    
    if not audio_url and not audio_base64:
        return response(400, {'error': 'audio_url or audio_base64 is required'})
    
    transcription_id = str(uuid.uuid4())
    
    # Get audio data
    if audio_url and audio_url.startswith('s3://'):
        bucket, key = parse_s3_url(audio_url)
        obj = s3.get_object(Bucket=bucket, Key=key)
        audio_data = base64.b64encode(obj['Body'].read()).decode('utf-8')
    elif audio_base64:
        audio_data = audio_base64
    else:
        return response(400, {'error': 'Invalid audio source'})
    
    # TODO: Nova Sonic API が利用可能になったら実装
    # 現時点ではプレースホルダー
    transcription_result = {
        'transcription_id': transcription_id,
        'text': '[Placeholder] Nova Sonic transcription result',
        'language': language,
        'confidence': 0.95,
        'segments': [
            {
                'start_time': 0.0,
                'end_time': 5.0,
                'text': '[Placeholder segment 1]',
                'speaker': 'Speaker 1',
            }
        ],
    }
    
    # Store event
    store_event(
        aggregate_id=transcription_id,
        event_type='TranscriptionCompleted',
        data=transcription_result,
    )
    
    return response(200, transcription_result)


def handle_analyze(body: dict) -> dict:
    """
    音声分析処理
    
    感情分析、話者識別など。
    """
    audio_url = body.get('audio_url')
    analysis_types = body.get('analysis_types', ['sentiment'])
    
    if not audio_url:
        return response(400, {'error': 'audio_url is required'})
    
    analysis_id = str(uuid.uuid4())
    
    # TODO: 実際の分析実装
    analysis_result = {
        'analysis_id': analysis_id,
        'audio_url': audio_url,
        'results': {
            'sentiment': {
                'overall': 'positive',
                'score': 0.8,
                'segments': [],
            },
            'speakers': [
                {'speaker_id': 'speaker_1', 'duration_seconds': 30.5},
            ],
        },
    }
    
    # Store event
    store_event(
        aggregate_id=analysis_id,
        event_type='AudioAnalyzed',
        data=analysis_result,
    )
    
    return response(200, analysis_result)


def parse_s3_url(url: str) -> tuple[str, str]:
    """S3 URL をパース"""
    # s3://bucket/key
    parts = url.replace('s3://', '').split('/', 1)
    return parts[0], parts[1] if len(parts) > 1 else ''


def store_event(aggregate_id: str, event_type: str, data: dict) -> None:
    """イベントを Event Store に保存"""
    table = dynamodb.Table(EVENT_STORE_TABLE)
    event_id = str(uuid.uuid4())
    timestamp = datetime.utcnow().isoformat()
    
    table.put_item(Item={
        'pk': f'AGGREGATE#{aggregate_id}',
        'sk': f'EVENT#{timestamp}#{event_id}',
        'gsi1pk': f'EVENT_TYPE#{event_type}',
        'gsi1sk': timestamp,
        'event_id': event_id,
        'event_type': event_type,
        'aggregate_id': aggregate_id,
        'timestamp': timestamp,
        'data': data,
    })


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

