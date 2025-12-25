"""
Audio Service Lambda Handler

Nova Sonic を使用した音声処理:
- 文字起こし (transcription)
- 感情分析 (sentiment analysis)
- 話者識別 (speaker diarization)
"""
import json
import os
import logging
from typing import Any

import boto3

from src.agent.tools.audio import transcribe_audio, analyze_audio

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Environment variables
CONTENT_BUCKET = os.environ.get('CONTENT_BUCKET', '')
EVENT_STORE_TABLE = os.environ.get('EVENT_STORE_TABLE', 'nova-event-store')

s3 = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')


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
        elif path == '/audio/upload' and http_method == 'POST':
            return handle_upload_url(body)
        else:
            return response(404, {'error': 'Not Found'})
    
    except Exception as e:
        logger.exception("Handler error")
        return response(500, {'error': str(e)})


def handle_transcribe(body: dict) -> dict:
    """音声文字起こし"""
    audio_url = body.get('audio_url')
    language = body.get('language', 'ja-JP')
    
    if not audio_url:
        return response(400, {'error': 'audio_url is required'})
    
    # Tool を使用して文字起こし
    import asyncio
    result = asyncio.get_event_loop().run_until_complete(
        transcribe_audio(audio_url=audio_url, language=language)
    )
    
    # Event Store に保存
    store_event('AudioTranscribed', {
        'audio_url': audio_url,
        'text': result.text,
        'confidence': result.confidence,
        'language': result.language,
    })
    
    return response(200, {
        'text': result.text,
        'confidence': result.confidence,
        'language': result.language,
        'segments': result.segments,
    })


def handle_analyze(body: dict) -> dict:
    """音声分析 (感情・話者)"""
    audio_url = body.get('audio_url')
    analysis_types = body.get('analysis_types', ['sentiment', 'speaker_diarization', 'emotion'])
    
    if not audio_url:
        return response(400, {'error': 'audio_url is required'})
    
    import asyncio
    result = asyncio.get_event_loop().run_until_complete(
        analyze_audio(audio_url=audio_url, analysis_types=analysis_types)
    )
    
    store_event('AudioAnalyzed', {
        'audio_url': audio_url,
        'sentiment': result.sentiment,
        'sentiment_score': result.sentiment_score,
        'speakers': result.speakers,
    })
    
    return response(200, {
        'sentiment': result.sentiment,
        'sentiment_score': result.sentiment_score,
        'speakers': result.speakers,
        'emotions': result.emotions,
    })


def handle_upload_url(body: dict) -> dict:
    """S3 Presigned URL 発行"""
    filename = body.get('filename', 'audio.wav')
    content_type = body.get('content_type', 'audio/wav')
    
    if not CONTENT_BUCKET:
        return response(500, {'error': 'CONTENT_BUCKET not configured'})
    
    import uuid
    key = f"audio/{uuid.uuid4()}/{filename}"
    
    presigned_url = s3.generate_presigned_url(
        'put_object',
        Params={
            'Bucket': CONTENT_BUCKET,
            'Key': key,
            'ContentType': content_type,
        },
        ExpiresIn=3600,
    )
    
    return response(200, {
        'upload_url': presigned_url,
        'audio_url': f"s3://{CONTENT_BUCKET}/{key}",
        'expires_in': 3600,
    })


def store_event(event_type: str, data: dict) -> None:
    """Event Store にイベントを保存"""
    import uuid
    from datetime import datetime
    
    table = dynamodb.Table(EVENT_STORE_TABLE)
    event_id = str(uuid.uuid4())
    timestamp = datetime.utcnow().isoformat()
    
    table.put_item(Item={
        'pk': f"EVENT#{event_type}",
        'sk': f"{timestamp}#{event_id}",
        'event_id': event_id,
        'event_type': event_type,
        'data': json.dumps(data),
        'timestamp': timestamp,
        'gsi1pk': event_type,
        'gsi1sk': timestamp,
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
