"""
Search Service Lambda Handler

Nova Embeddings + S3 Vectors を使用:
- マルチモーダル埋め込み生成
- ベクトル類似検索
- Knowledge Base 統合
"""
import json
import os
import logging
from typing import Any

import boto3

from src.agent.tools.search import search_knowledge, generate_embeddings

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Environment variables
CONTENT_BUCKET = os.environ.get('CONTENT_BUCKET', '')
VECTOR_INDEX = os.environ.get('VECTOR_INDEX', 'nova-vector-index')
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
        if path == '/search' and http_method == 'POST':
            return handle_search(body)
        elif path == '/search/embeddings' and http_method == 'POST':
            return handle_embeddings(body)
        elif path == '/search/index' and http_method == 'POST':
            return handle_index_document(body)
        else:
            return response(404, {'error': 'Not Found'})
    
    except Exception as e:
        logger.exception("Handler error")
        return response(500, {'error': str(e)})


def handle_search(body: dict) -> dict:
    """ベクトル検索"""
    query = body.get('query')
    query_image_url = body.get('query_image_url')
    top_k = body.get('top_k', 10)
    filters = body.get('filters')
    
    if not query and not query_image_url:
        return response(400, {'error': 'Either query or query_image_url is required'})
    
    import asyncio
    result = asyncio.get_event_loop().run_until_complete(
        search_knowledge(
            query=query,
            query_image_url=query_image_url,
            top_k=top_k,
            filters=filters,
        )
    )
    
    # Event Store に保存
    store_event('SearchPerformed', {
        'query': query,
        'query_image_url': query_image_url,
        'top_k': top_k,
        'result_count': result.total_count,
    })
    
    return response(200, {
        'query_id': result.query_id,
        'total_count': result.total_count,
        'documents': result.documents,
    })


def handle_embeddings(body: dict) -> dict:
    """埋め込みベクトル生成"""
    text = body.get('text')
    image_url = body.get('image_url')
    
    if not text and not image_url:
        return response(400, {'error': 'Either text or image_url is required'})
    
    import asyncio
    result = asyncio.get_event_loop().run_until_complete(
        generate_embeddings(text=text, image_url=image_url)
    )
    
    return response(200, {
        'embedding': result.embedding,
        'dimension': result.dimension,
        'modality': result.modality,
    })


def handle_index_document(body: dict) -> dict:
    """ドキュメントをインデックスに追加"""
    document_id = body.get('document_id')
    text = body.get('text')
    image_url = body.get('image_url')
    metadata = body.get('metadata', {})
    
    if not document_id:
        return response(400, {'error': 'document_id is required'})
    
    if not text and not image_url:
        return response(400, {'error': 'Either text or image_url is required'})
    
    # 埋め込みベクトルを生成
    import asyncio
    embedding_result = asyncio.get_event_loop().run_until_complete(
        generate_embeddings(text=text, image_url=image_url)
    )
    
    # S3 Vectors にインデックス (GA後に実装)
    # 現在はメタデータを DynamoDB に保存
    store_document_metadata(document_id, {
        'text': text,
        'image_url': image_url,
        'embedding_dimension': embedding_result.dimension,
        'modality': embedding_result.modality,
        **metadata,
    })
    
    store_event('DocumentIndexed', {
        'document_id': document_id,
        'modality': embedding_result.modality,
        'dimension': embedding_result.dimension,
    })
    
    return response(201, {
        'document_id': document_id,
        'indexed': True,
        'dimension': embedding_result.dimension,
        'modality': embedding_result.modality,
    })


def store_document_metadata(document_id: str, metadata: dict) -> None:
    """ドキュメントメタデータを保存"""
    from datetime import datetime
    
    table = dynamodb.Table(EVENT_STORE_TABLE)
    timestamp = datetime.utcnow().isoformat()
    
    table.put_item(Item={
        'pk': f"DOCUMENT#{document_id}",
        'sk': 'METADATA',
        'document_id': document_id,
        'metadata': json.dumps(metadata),
        'indexed_at': timestamp,
        'gsi1pk': 'DOCUMENT',
        'gsi1sk': timestamp,
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
