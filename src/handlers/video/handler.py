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
import asyncio
from typing import Any

import boto3

from src.agent.tools.video import (
    analyze_video,
    detect_video_anomalies,
    analyze_video_frames,
)

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
        elif path == '/video/anomalies' and http_method == 'POST':
            return handle_anomaly_detection(body)
        elif path == '/video/frames' and http_method == 'POST':
            return handle_frame_analysis(body)
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
    
    # 非同期関数を実行
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        result = loop.run_until_complete(
            analyze_video(
                video_url=video_url,
                analysis_types=analysis_types,
                temporal_analysis=temporal_analysis,
            )
        )
    finally:
        loop.close()
    
    # Event Store に保存
    if 'error' not in result:
        store_event('VideoAnalyzed', {
            'video_url': video_url,
            'summary': result.get('summary', ''),
            'scene_count': len(result.get('scenes', [])),
            'object_count': len(result.get('detected_objects', [])),
            'event_count': len(result.get('events', [])),
            'anomaly_count': len(result.get('anomalies', [])),
        })
    
    return response(200, result)


def handle_anomaly_detection(body: dict) -> dict:
    """異常検知"""
    video_url = body.get('video_url')
    baseline_description = body.get('baseline_description')
    sensitivity = body.get('sensitivity', 0.7)
    
    if not video_url:
        return response(400, {'error': 'video_url is required'})
    
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        result = loop.run_until_complete(
            detect_video_anomalies(
                video_url=video_url,
                baseline_description=baseline_description,
                sensitivity=sensitivity,
            )
        )
    finally:
        loop.close()
    
    # 異常検出時はイベント保存
    if result.get('anomaly_count', 0) > 0:
        store_event('AnomaliesDetected', {
            'video_url': video_url,
            'anomaly_count': result['anomaly_count'],
            'sensitivity': sensitivity,
        })
    
    return response(200, result)


def handle_frame_analysis(body: dict) -> dict:
    """フレーム画像分析"""
    frames_base64 = body.get('frames')
    analysis_types = body.get('analysis_types', ['scene', 'object'])
    
    if not frames_base64 or not isinstance(frames_base64, list):
        return response(400, {'error': 'frames (array of base64 strings) is required'})
    
    if len(frames_base64) > 20:
        return response(400, {'error': 'Maximum 20 frames allowed'})
    
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        result = loop.run_until_complete(
            analyze_video_frames(
                frames_base64=frames_base64,
                analysis_types=analysis_types,
            )
        )
    finally:
        loop.close()
    
    return response(200, result)


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
