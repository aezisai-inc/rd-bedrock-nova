"""
Event Projector Lambda

DynamoDB Stream から Read Model を更新する CQRS Projector。
"""
import json
import os
import logging
from typing import Any
from datetime import datetime

import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Environment variables
READ_MODEL_TABLE = os.environ.get('READ_MODEL_TABLE', 'nova-read-model')

dynamodb = boto3.resource('dynamodb')


def lambda_handler(event: dict, context: Any) -> dict:
    """
    DynamoDB Stream イベントを処理し、Read Model を更新。
    
    Event Sourcing + CQRS パターン:
    - Event Store (Write Side) の変更をキャッチ
    - Read Model (Read Side) に投影
    """
    logger.info(f"Processing {len(event.get('Records', []))} records")
    
    read_model_table = dynamodb.Table(READ_MODEL_TABLE)
    
    for record in event.get('Records', []):
        try:
            if record['eventName'] == 'INSERT':
                process_insert(record, read_model_table)
            elif record['eventName'] == 'MODIFY':
                process_modify(record, read_model_table)
            elif record['eventName'] == 'REMOVE':
                process_remove(record, read_model_table)
        except Exception as e:
            logger.exception(f"Error processing record: {record}")
            # Continue processing other records
            continue
    
    return {'statusCode': 200, 'body': 'OK'}


def process_insert(record: dict, table) -> None:
    """INSERT イベントを処理"""
    new_image = record['dynamodb'].get('NewImage', {})
    event_type = new_image.get('event_type', {}).get('S', '')
    
    if not event_type:
        return
    
    # Event Type に基づいて Read Model を更新
    projectors = {
        'TranscriptionCompleted': project_transcription,
        'AudioAnalyzed': project_audio_analysis,
        'VideoAnalyzed': project_video_analysis,
    }
    
    projector = projectors.get(event_type)
    if projector:
        projector(new_image, table)


def process_modify(record: dict, table) -> None:
    """MODIFY イベントを処理"""
    # 必要に応じて実装
    pass


def process_remove(record: dict, table) -> None:
    """REMOVE イベントを処理"""
    # 必要に応じて実装
    pass


def project_transcription(event_image: dict, table) -> None:
    """TranscriptionCompleted イベントを Read Model に投影"""
    aggregate_id = event_image.get('aggregate_id', {}).get('S', '')
    data = deserialize_dynamodb_item(event_image.get('data', {}).get('M', {}))
    timestamp = event_image.get('timestamp', {}).get('S', '')
    
    table.put_item(Item={
        'pk': f'TRANSCRIPTION#{aggregate_id}',
        'sk': 'LATEST',
        'transcription_id': aggregate_id,
        'text': data.get('text', ''),
        'language': data.get('language', ''),
        'confidence': data.get('confidence', 0),
        'segment_count': len(data.get('segments', [])),
        'created_at': timestamp,
        'updated_at': datetime.utcnow().isoformat(),
    })
    
    logger.info(f"Projected transcription: {aggregate_id}")


def project_audio_analysis(event_image: dict, table) -> None:
    """AudioAnalyzed イベントを Read Model に投影"""
    aggregate_id = event_image.get('aggregate_id', {}).get('S', '')
    data = deserialize_dynamodb_item(event_image.get('data', {}).get('M', {}))
    timestamp = event_image.get('timestamp', {}).get('S', '')
    
    results = data.get('results', {})
    
    table.put_item(Item={
        'pk': f'AUDIO_ANALYSIS#{aggregate_id}',
        'sk': 'LATEST',
        'analysis_id': aggregate_id,
        'audio_url': data.get('audio_url', ''),
        'sentiment': results.get('sentiment', {}).get('overall', ''),
        'sentiment_score': results.get('sentiment', {}).get('score', 0),
        'speaker_count': len(results.get('speakers', [])),
        'created_at': timestamp,
        'updated_at': datetime.utcnow().isoformat(),
    })
    
    logger.info(f"Projected audio analysis: {aggregate_id}")


def project_video_analysis(event_image: dict, table) -> None:
    """VideoAnalyzed イベントを Read Model に投影"""
    aggregate_id = event_image.get('aggregate_id', {}).get('S', '')
    data = deserialize_dynamodb_item(event_image.get('data', {}).get('M', {}))
    timestamp = event_image.get('timestamp', {}).get('S', '')
    
    results = data.get('results', {})
    
    table.put_item(Item={
        'pk': f'VIDEO_ANALYSIS#{aggregate_id}',
        'sk': 'LATEST',
        'analysis_id': aggregate_id,
        'video_url': data.get('video_url', ''),
        'analysis_type': data.get('analysis_type', ''),
        'duration_seconds': results.get('duration_seconds', 0),
        'scene_count': len(results.get('scenes', [])),
        'anomaly_count': len(results.get('anomalies', [])),
        'created_at': timestamp,
        'updated_at': datetime.utcnow().isoformat(),
    })
    
    logger.info(f"Projected video analysis: {aggregate_id}")


def deserialize_dynamodb_item(item: dict) -> dict:
    """DynamoDB 形式のアイテムを Python dict に変換"""
    result = {}
    for key, value in item.items():
        result[key] = deserialize_value(value)
    return result


def deserialize_value(value: dict) -> Any:
    """DynamoDB 値をデシリアライズ"""
    if 'S' in value:
        return value['S']
    elif 'N' in value:
        num_str = value['N']
        return float(num_str) if '.' in num_str else int(num_str)
    elif 'BOOL' in value:
        return value['BOOL']
    elif 'L' in value:
        return [deserialize_value(v) for v in value['L']]
    elif 'M' in value:
        return deserialize_dynamodb_item(value['M'])
    elif 'NULL' in value:
        return None
    else:
        return value

