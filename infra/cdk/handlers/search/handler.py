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
import asyncio
from typing import Any

import boto3

from src.agent.tools.search import (
    search_knowledge,
    generate_embeddings,
    generate_batch_embeddings,
    compute_similarity,
    create_vector_index,
    put_vectors,
    query_vectors,
    hybrid_search,
)

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
        elif path == '/search/embeddings/batch' and http_method == 'POST':
            return handle_batch_embeddings(body)
        elif path == '/search/similarity' and http_method == 'POST':
            return handle_similarity(body)
        elif path == '/search/index' and http_method == 'POST':
            return handle_index_document(body)
        # S3 Vectors endpoints
        elif path == '/vectors/index' and http_method == 'POST':
            return handle_create_vector_index(body)
        elif path == '/vectors' and http_method == 'POST':
            return handle_put_vectors(body)
        elif path == '/vectors/query' and http_method == 'POST':
            return handle_query_vectors(body)
        elif path == '/vectors/hybrid' and http_method == 'POST':
            return handle_hybrid_search(body)
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
    
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        result = loop.run_until_complete(
            search_knowledge(
                query=query,
                query_image_url=query_image_url,
                top_k=top_k,
                filters=filters,
            )
        )
    finally:
        loop.close()
    
    # Event Store に保存
    if 'error' not in result:
        store_event('SearchPerformed', {
            'query': query,
            'query_image_url': query_image_url,
            'top_k': top_k,
            'result_count': result.get('total_count', 0),
            'embedding_modality': result.get('embedding_modality'),
        })
    
    return response(200, result)


def handle_embeddings(body: dict) -> dict:
    """埋め込みベクトル生成"""
    text = body.get('text')
    image_url = body.get('image_url')
    dimension = body.get('dimension', 1024)
    
    if not text and not image_url:
        return response(400, {'error': 'Either text or image_url is required'})
    
    if dimension not in [256, 384, 1024]:
        return response(400, {'error': 'dimension must be 256, 384, or 1024'})
    
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        result = loop.run_until_complete(
            generate_embeddings(text=text, image_url=image_url, dimension=dimension)
        )
    finally:
        loop.close()
    
    return response(200, result)


def handle_batch_embeddings(body: dict) -> dict:
    """バッチ埋め込み生成"""
    texts = body.get('texts')
    dimension = body.get('dimension', 1024)
    
    if not texts or not isinstance(texts, list):
        return response(400, {'error': 'texts (array) is required'})
    
    if len(texts) > 32:
        return response(400, {'error': 'Maximum 32 texts allowed'})
    
    if dimension not in [256, 384, 1024]:
        return response(400, {'error': 'dimension must be 256, 384, or 1024'})
    
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        result = loop.run_until_complete(
            generate_batch_embeddings(texts=texts, dimension=dimension)
        )
    finally:
        loop.close()
    
    # Event Store に保存
    store_event('BatchEmbeddingsGenerated', {
        'batch_size': len(texts),
        'dimension': dimension,
        'success_count': result.get('success_count', 0),
    })
    
    return response(200, result)


def handle_similarity(body: dict) -> dict:
    """類似度計算"""
    embedding1 = body.get('embedding1')
    embedding2 = body.get('embedding2')
    
    if not embedding1 or not embedding2:
        return response(400, {'error': 'embedding1 and embedding2 are required'})
    
    if not isinstance(embedding1, list) or not isinstance(embedding2, list):
        return response(400, {'error': 'embeddings must be arrays'})
    
    if len(embedding1) != len(embedding2):
        return response(400, {'error': 'embeddings must have the same dimension'})
    
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        result = loop.run_until_complete(
            compute_similarity(embedding1=embedding1, embedding2=embedding2)
        )
    finally:
        loop.close()
    
    return response(200, result)


def handle_index_document(body: dict) -> dict:
    """ドキュメントをインデックスに追加"""
    document_id = body.get('document_id')
    text = body.get('text')
    image_url = body.get('image_url')
    metadata = body.get('metadata', {})
    dimension = body.get('dimension', 1024)
    
    if not document_id:
        return response(400, {'error': 'document_id is required'})
    
    if not text and not image_url:
        return response(400, {'error': 'Either text or image_url is required'})
    
    # 埋め込みベクトルを生成
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        embedding_result = loop.run_until_complete(
            generate_embeddings(text=text, image_url=image_url, dimension=dimension)
        )
    finally:
        loop.close()
    
    # S3 Vectors にインデックス (GA後に実装)
    # 現在はメタデータを DynamoDB に保存
    store_document_metadata(document_id, {
        'text': text,
        'image_url': image_url,
        'embedding_dimension': embedding_result.get('dimension'),
        'modality': embedding_result.get('modality'),
        **metadata,
    })
    
    store_event('DocumentIndexed', {
        'document_id': document_id,
        'modality': embedding_result.get('modality'),
        'dimension': embedding_result.get('dimension'),
    })
    
    return response(201, {
        'document_id': document_id,
        'indexed': True,
        'dimension': embedding_result.get('dimension'),
        'modality': embedding_result.get('modality'),
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


# ========== S3 Vectors Handlers ==========

def handle_create_vector_index(body: dict) -> dict:
    """ベクトルインデックス作成"""
    bucket_name = body.get('bucket_name')
    index_name = body.get('index_name')
    dimension = body.get('dimension', 1024)
    distance_metric = body.get('distance_metric', 'cosine')
    
    if not bucket_name or not index_name:
        return response(400, {'error': 'bucket_name and index_name are required'})
    
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        result = loop.run_until_complete(
            create_vector_index(
                bucket_name=bucket_name,
                index_name=index_name,
                dimension=dimension,
                distance_metric=distance_metric,
            )
        )
    finally:
        loop.close()
    
    store_event('VectorIndexCreated', {
        'bucket_name': bucket_name,
        'index_name': index_name,
        'dimension': dimension,
    })
    
    return response(201, result)


def handle_put_vectors(body: dict) -> dict:
    """ベクトル追加"""
    bucket_name = body.get('bucket_name')
    index_name = body.get('index_name')
    vectors = body.get('vectors')
    
    if not bucket_name or not index_name or not vectors:
        return response(400, {'error': 'bucket_name, index_name, and vectors are required'})
    
    if not isinstance(vectors, list):
        return response(400, {'error': 'vectors must be an array'})
    
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        result = loop.run_until_complete(
            put_vectors(
                bucket_name=bucket_name,
                index_name=index_name,
                vectors=vectors,
            )
        )
    finally:
        loop.close()
    
    store_event('VectorsPut', {
        'bucket_name': bucket_name,
        'index_name': index_name,
        'count': len(vectors),
        'success_count': result.get('success_count', 0),
    })
    
    return response(200, result)


def handle_query_vectors(body: dict) -> dict:
    """ベクトル検索"""
    bucket_name = body.get('bucket_name')
    index_name = body.get('index_name')
    query_vector = body.get('query_vector')
    top_k = body.get('top_k', 10)
    filter_expression = body.get('filter')
    
    if not bucket_name or not index_name or not query_vector:
        return response(400, {'error': 'bucket_name, index_name, and query_vector are required'})
    
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        result = loop.run_until_complete(
            query_vectors(
                bucket_name=bucket_name,
                index_name=index_name,
                query_vector=query_vector,
                top_k=top_k,
                filter_expression=filter_expression,
            )
        )
    finally:
        loop.close()
    
    return response(200, result)


def handle_hybrid_search(body: dict) -> dict:
    """ハイブリッド検索"""
    bucket_name = body.get('bucket_name')
    index_name = body.get('index_name')
    query_vector = body.get('query_vector')
    text_query = body.get('text_query')
    top_k = body.get('top_k', 10)
    vector_weight = body.get('vector_weight', 0.7)
    
    if not bucket_name or not index_name or not query_vector:
        return response(400, {'error': 'bucket_name, index_name, and query_vector are required'})
    
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        result = loop.run_until_complete(
            hybrid_search(
                bucket_name=bucket_name,
                index_name=index_name,
                query_vector=query_vector,
                text_query=text_query,
                top_k=top_k,
                vector_weight=vector_weight,
            )
        )
    finally:
        loop.close()
    
    return response(200, result)


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
