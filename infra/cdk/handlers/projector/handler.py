"""
Event Projector Lambda Handler

DynamoDB Streams を使用した CQRS Read Model 更新:
- Event Store からの変更を検知
- Read Model (クエリ最適化ビュー) を更新
"""
import json
import os
import logging
from typing import Any

import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Environment variables
READ_MODEL_TABLE = os.environ.get('READ_MODEL_TABLE', 'nova-read-model')

dynamodb = boto3.resource('dynamodb')


def lambda_handler(event: dict, context: Any) -> dict:
    """
    DynamoDB Streams イベントハンドラ
    
    Event Sourcing の Projector パターン:
    - Event Store の変更を検知
    - Read Model を更新
    """
    logger.info(f"Processing {len(event.get('Records', []))} records")
    
    processed = 0
    errors = 0
    
    for record in event.get('Records', []):
        try:
            if record['eventName'] in ['INSERT', 'MODIFY']:
                new_image = record['dynamodb'].get('NewImage', {})
                process_event(new_image)
                processed += 1
        except Exception as e:
            logger.exception(f"Error processing record: {e}")
            errors += 1
    
    logger.info(f"Processed: {processed}, Errors: {errors}")
    
    return {
        'statusCode': 200,
        'body': json.dumps({
            'processed': processed,
            'errors': errors,
        }),
    }


def process_event(new_image: dict) -> None:
    """イベントを処理して Read Model を更新"""
    # DynamoDB Streams の AttributeValue 形式をパース
    pk = new_image.get('pk', {}).get('S', '')
    event_type = new_image.get('event_type', {}).get('S', '')
    data_str = new_image.get('data', {}).get('S', '{}')
    timestamp = new_image.get('timestamp', {}).get('S', '')
    
    if not pk.startswith('EVENT#'):
        return
    
    data = json.loads(data_str)
    
    # イベントタイプ別の処理
    if event_type == 'AudioTranscribed':
        project_audio_transcription(data, timestamp)
    elif event_type == 'AudioAnalyzed':
        project_audio_analysis(data, timestamp)
    elif event_type == 'VideoAnalyzed':
        project_video_analysis(data, timestamp)
    elif event_type == 'SearchPerformed':
        project_search_stats(data, timestamp)
    elif event_type == 'DocumentIndexed':
        project_document_stats(data, timestamp)
    else:
        logger.debug(f"Unknown event type: {event_type}")


def project_audio_transcription(data: dict, timestamp: str) -> None:
    """音声文字起こし Read Model 更新"""
    table = dynamodb.Table(READ_MODEL_TABLE)
    
    audio_url = data.get('audio_url', '')
    
    table.put_item(Item={
        'pk': f"AUDIO#{hash(audio_url) % 1000000}",
        'sk': f"TRANSCRIPTION#{timestamp}",
        'audio_url': audio_url,
        'text': data.get('text', ''),
        'confidence': str(data.get('confidence', 0)),
        'language': data.get('language', ''),
        'processed_at': timestamp,
    })


def project_audio_analysis(data: dict, timestamp: str) -> None:
    """音声分析 Read Model 更新"""
    table = dynamodb.Table(READ_MODEL_TABLE)
    
    audio_url = data.get('audio_url', '')
    
    table.put_item(Item={
        'pk': f"AUDIO#{hash(audio_url) % 1000000}",
        'sk': f"ANALYSIS#{timestamp}",
        'audio_url': audio_url,
        'sentiment': data.get('sentiment', ''),
        'sentiment_score': str(data.get('sentiment_score', 0)),
        'speaker_count': str(len(data.get('speakers', []))),
        'processed_at': timestamp,
    })


def project_video_analysis(data: dict, timestamp: str) -> None:
    """映像分析 Read Model 更新"""
    table = dynamodb.Table(READ_MODEL_TABLE)
    
    video_url = data.get('video_url', '')
    
    table.put_item(Item={
        'pk': f"VIDEO#{hash(video_url) % 1000000}",
        'sk': f"ANALYSIS#{timestamp}",
        'video_url': video_url,
        'summary': data.get('summary', ''),
        'scene_count': str(data.get('scene_count', 0)),
        'object_count': str(data.get('object_count', 0)),
        'event_count': str(data.get('event_count', 0)),
        'anomaly_count': str(data.get('anomaly_count', 0)),
        'processed_at': timestamp,
    })


def project_search_stats(data: dict, timestamp: str) -> None:
    """検索統計 Read Model 更新"""
    table = dynamodb.Table(READ_MODEL_TABLE)
    
    # 日次検索統計を更新
    date_key = timestamp[:10]  # YYYY-MM-DD
    
    table.update_item(
        Key={
            'pk': 'STATS#SEARCH',
            'sk': f"DAILY#{date_key}",
        },
        UpdateExpression='ADD search_count :inc',
        ExpressionAttributeValues={
            ':inc': 1,
        },
    )


def project_document_stats(data: dict, timestamp: str) -> None:
    """ドキュメント統計 Read Model 更新"""
    table = dynamodb.Table(READ_MODEL_TABLE)
    
    date_key = timestamp[:10]
    
    table.update_item(
        Key={
            'pk': 'STATS#DOCUMENT',
            'sk': f"DAILY#{date_key}",
        },
        UpdateExpression='ADD indexed_count :inc',
        ExpressionAttributeValues={
            ':inc': 1,
        },
    )
