"""
Video Service Lambda Handler

Nova Omni を使用した映像処理:
- シーン分析 (scene analysis)
- オブジェクト検出 (object detection)
- 時系列イベント検出 (temporal event detection)
- 異常検知 (anomaly detection)
"""
import json
import os
import logging
from typing import Any

import boto3

from src.agent.tools.video import analyze_video

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
        if path == '/video/analyze' and http_method == 'POST':
            return handle_analyze(body)
        elif path == '/video/upload' and http_method == 'POST':
            return handle_upload_url(body)
        else:
            return response(404, {'error': 'Not Found'})
    
    except Exception as e:
        logger.exception("Handler error")
        return response(500, {'error': str(e)})


def handle_analyze(body: dict) -> dict:
    """映像分析"""
    video_url = body.get('video_url')
    analysis_types = body.get('analysis_types', ['scene', 'object', 'event', 'anomaly'])
    temporal_analysis = body.get('temporal_analysis', True)
    
    if not video_url:
        return response(400, {'error': 'video_url is required'})
    
    import asyncio
    result = asyncio.get_event_loop().run_until_complete(
        analyze_video(
            video_url=video_url,
            analysis_types=analysis_types,
            temporal_analysis=temporal_analysis,
        )
    )
    
    # Event Store に保存
    store_event('VideoAnalyzed', {
        'video_url': video_url,
        'summary': result.summary,
        'scene_count': len(result.scenes),
        'object_count': len(result.detected_objects),
        'event_count': len(result.events),
        'anomaly_count': len(result.anomalies),
    })
    
    return response(200, {
        'summary': result.summary,
        'scenes': result.scenes,
        'detected_objects': result.detected_objects,
        'events': result.events,
        'anomalies': result.anomalies,
    })


def handle_upload_url(body: dict) -> dict:
    """S3 Presigned URL 発行"""
    filename = body.get('filename', 'video.mp4')
    content_type = body.get('content_type', 'video/mp4')
    
    if not CONTENT_BUCKET:
        return response(500, {'error': 'CONTENT_BUCKET not configured'})
    
    import uuid
    key = f"video/{uuid.uuid4()}/{filename}"
    
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
        'video_url': f"s3://{CONTENT_BUCKET}/{key}",
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
