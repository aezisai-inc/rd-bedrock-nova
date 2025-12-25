"""
Audio Service Lambda Handler (非ストリーミング / S3ファイル処理用)

Nova Sonic 双方向ストリーミングは websocket_handler.py を使用。
このハンドラーは S3 上の音声ファイルを処理する REST API を提供。

リアルタイム音声会話:
    → websocket_handler.py (AgentCore Runtime + WebSocket)
    → wss://bedrock-agentcore.<region>.amazonaws.com/runtimes/<arn>/ws

S3 ファイル処理:
    → このハンドラー (Lambda + API Gateway)
    → POST /audio/upload → S3 → POST /audio/transcribe

技術仕様:
- 入力形式: WAV, MP3, FLAC
- サンプリングレート: 8kHz〜48kHz
- 言語: en-US, en-GB, es-ES, fr-FR, de-DE, it-IT, pt-BR, hi-IN
"""
import json
import os
import logging
import asyncio
import uuid
from datetime import datetime, timezone
from typing import Any

import boto3

from src.agent.tools.audio import (
    transcribe_audio,
    analyze_audio,
    detect_speech_quality,
    serialize_result,
    TranscriptionResult,
    AudioAnalysisResult,
)

logger = logging.getLogger()
logger.setLevel(os.environ.get('LOG_LEVEL', 'INFO'))

# Environment variables
CONTENT_BUCKET = os.environ.get('CONTENT_BUCKET', '')
EVENT_STORE_TABLE = os.environ.get('EVENT_STORE_TABLE', 'nova-event-store')
CACHE_TABLE = os.environ.get('CACHE_TABLE', '')  # オプション: 結果キャッシュ用

s3 = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')


def lambda_handler(event: dict, context: Any) -> dict:
    """Lambda エントリポイント"""
    logger.info(f"Event: {json.dumps(event)}")
    
    # HTTP API (API Gateway v2) 形式対応
    request_context = event.get('requestContext', {})
    http_info = request_context.get('http', {})
    
    http_method = http_info.get('method') or event.get('httpMethod', 'POST')
    path = http_info.get('path') or event.get('path', '')
    
    # Body の解析
    body = {}
    if event.get('body'):
        try:
            body = json.loads(event['body']) if isinstance(event['body'], str) else event['body']
        except json.JSONDecodeError:
            return response(400, {'error': 'Invalid JSON body'})
    
    # リクエストID
    request_id = context.aws_request_id if context else str(uuid.uuid4())
    
    try:
        # ルーティング
        if '/transcribe' in path and http_method == 'POST':
            return handle_transcribe(body, request_id)
        elif '/analyze' in path and http_method == 'POST':
            return handle_analyze(body, request_id)
        elif '/quality' in path and http_method == 'POST':
            return handle_quality_check(body, request_id)
        elif '/upload' in path and http_method == 'POST':
            return handle_upload_url(body)
        elif '/batch' in path and http_method == 'POST':
            return handle_batch_transcribe(body, request_id)
        elif path.endswith('/health') and http_method == 'GET':
            return response(200, {'status': 'healthy', 'service': 'audio'})
        else:
            return response(404, {'error': 'Not Found', 'path': path})
    
    except Exception as e:
        logger.exception("Handler error")
        return response(500, {
            'error': str(e),
            'request_id': request_id,
            'message': 'Internal server error'
        })


def handle_transcribe(body: dict, request_id: str) -> dict:
    """
    音声文字起こし
    
    Request:
        {
            "audio_url": "s3://bucket/path/audio.wav",
            "language": "ja-JP",
            "enable_speaker_diarization": true,
            "max_speakers": 10
        }
    """
    audio_url = body.get('audio_url')
    language = body.get('language', 'ja-JP')
    enable_speaker_diarization = body.get('enable_speaker_diarization', True)
    max_speakers = body.get('max_speakers', 10)
    
    if not audio_url:
        return response(400, {'error': 'audio_url is required'})
    
    # 非同期処理を同期的に実行
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    try:
        result = loop.run_until_complete(
            transcribe_audio(
                audio_url=audio_url,
                language=language,
                enable_speaker_diarization=enable_speaker_diarization,
                max_speakers=max_speakers,
            )
        )
    finally:
        loop.close()
    
    # Event Store に保存
    store_event('AudioTranscribed', {
        'request_id': request_id,
        'audio_url': audio_url,
        'text': result.text,
        'confidence': result.confidence,
        'language': result.language,
        'segment_count': len(result.segments),
        'audio_duration': result.audio_duration,
        'processing_time': result.processing_time,
    })
    
    # レスポンス
    response_data = serialize_result(result)
    response_data['request_id'] = request_id
    
    return response(200, response_data)


def handle_analyze(body: dict, request_id: str) -> dict:
    """
    音声分析 (感情・話者)
    
    Request:
        {
            "audio_url": "s3://bucket/path/audio.wav",
            "analysis_types": ["sentiment", "speaker_diarization", "emotion"],
            "detect_noise": true
        }
    """
    audio_url = body.get('audio_url')
    analysis_types = body.get('analysis_types', ['sentiment', 'speaker_diarization', 'emotion'])
    detect_noise = body.get('detect_noise', True)
    
    if not audio_url:
        return response(400, {'error': 'audio_url is required'})
    
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    try:
        result = loop.run_until_complete(
            analyze_audio(
                audio_url=audio_url,
                analysis_types=analysis_types,
                detect_noise=detect_noise,
            )
        )
    finally:
        loop.close()
    
    # Event Store に保存
    store_event('AudioAnalyzed', {
        'request_id': request_id,
        'audio_url': audio_url,
        'sentiment': result.sentiment,
        'sentiment_score': result.sentiment_score,
        'dominant_emotion': result.dominant_emotion,
        'speaker_count': len(result.speakers),
        'audio_quality': result.audio_quality,
        'noise_level': result.noise_level,
    })
    
    response_data = serialize_result(result)
    response_data['request_id'] = request_id
    
    return response(200, response_data)


def handle_quality_check(body: dict, request_id: str) -> dict:
    """
    音声品質チェック
    
    Request:
        {
            "audio_url": "s3://bucket/path/audio.wav"
        }
    """
    audio_url = body.get('audio_url')
    
    if not audio_url:
        return response(400, {'error': 'audio_url is required'})
    
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    try:
        result = loop.run_until_complete(
            detect_speech_quality(audio_url=audio_url)
        )
    finally:
        loop.close()
    
    result['request_id'] = request_id
    
    return response(200, result)


def handle_batch_transcribe(body: dict, request_id: str) -> dict:
    """
    バッチ文字起こし (複数ファイル)
    
    Request:
        {
            "audio_urls": [
                "s3://bucket/path/audio1.wav",
                "s3://bucket/path/audio2.wav"
            ],
            "language": "ja-JP"
        }
    """
    audio_urls = body.get('audio_urls', [])
    language = body.get('language', 'ja-JP')
    
    if not audio_urls:
        return response(400, {'error': 'audio_urls is required'})
    
    if len(audio_urls) > 10:
        return response(400, {'error': 'Maximum 10 audio files per batch'})
    
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    try:
        # 並列処理
        async def process_batch():
            tasks = [
                transcribe_audio(audio_url=url, language=language)
                for url in audio_urls
            ]
            return await asyncio.gather(*tasks, return_exceptions=True)
        
        results = loop.run_until_complete(process_batch())
    finally:
        loop.close()
    
    # 結果を構造化
    batch_results = []
    for i, (url, result) in enumerate(zip(audio_urls, results)):
        if isinstance(result, Exception):
            batch_results.append({
                'audio_url': url,
                'success': False,
                'error': str(result),
            })
        else:
            batch_results.append({
                'audio_url': url,
                'success': True,
                **serialize_result(result),
            })
    
    # Event Store に保存
    store_event('BatchAudioTranscribed', {
        'request_id': request_id,
        'file_count': len(audio_urls),
        'success_count': sum(1 for r in batch_results if r.get('success')),
        'language': language,
    })
    
    return response(200, {
        'request_id': request_id,
        'total': len(audio_urls),
        'results': batch_results,
    })


def handle_upload_url(body: dict) -> dict:
    """
    S3 Presigned URL 発行
    
    Request:
        {
            "filename": "meeting.wav",
            "content_type": "audio/wav"
        }
    """
    filename = body.get('filename', 'audio.wav')
    content_type = body.get('content_type', 'audio/wav')
    
    # サポートされる形式のチェック
    supported_types = ['audio/wav', 'audio/mpeg', 'audio/mp3', 'audio/flac', 'audio/x-flac']
    if content_type not in supported_types:
        return response(400, {
            'error': f'Unsupported content type: {content_type}',
            'supported_types': supported_types,
        })
    
    if not CONTENT_BUCKET:
        return response(500, {'error': 'CONTENT_BUCKET not configured'})
    
    # ユニークなキーを生成
    timestamp = datetime.now(timezone.utc).strftime('%Y/%m/%d')
    unique_id = str(uuid.uuid4())
    key = f"audio/{timestamp}/{unique_id}/{filename}"
    
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
        'key': key,
        'expires_in': 3600,
        'supported_formats': ['WAV', 'MP3', 'FLAC'],
        'max_duration': '3600 seconds',
    })


def store_event(event_type: str, data: dict) -> None:
    """Event Store にイベントを保存"""
    try:
        table = dynamodb.Table(EVENT_STORE_TABLE)
        event_id = str(uuid.uuid4())
        timestamp = datetime.now(timezone.utc).isoformat()
        
        table.put_item(Item={
            'pk': f"EVENT#{event_type}",
            'sk': f"{timestamp}#{event_id}",
            'event_id': event_id,
            'event_type': event_type,
            'data': json.dumps(data, default=str),
            'timestamp': timestamp,
            'service': 'audio',
            'gsi1pk': event_type,
            'gsi1sk': timestamp,
        })
        
        logger.info(f"Stored event: {event_type} ({event_id})")
        
    except Exception as e:
        logger.error(f"Failed to store event: {e}")
        # イベント保存失敗は処理を継続


def response(status_code: int, body: dict) -> dict:
    """API Gateway レスポンス形式"""
    return {
        'statusCode': status_code,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
        'body': json.dumps(body, default=str, ensure_ascii=False) if body else '',
    }
