"""
Search Service - Nova Multimodal Embeddings を使用したベクトル検索サービス

Nova Multimodal Embeddings の機能:
- テキスト/画像/音声のマルチモーダル埋め込み生成
- DynamoDB でのベクトル管理 (OpenSearch Serverless 廃止)
- セマンティック検索

Note: OpenSearch Serverless 廃止
代替案として以下を検討中:
- Bedrock Knowledge Bases (マネージド)
- PostgreSQL + pgvector
- DynamoDB + アプリレベル類似検索
"""
from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel, Field
from typing import Dict, Any, List, Optional
from datetime import datetime
import logging
import uuid
import os
import json
import boto3

logger = logging.getLogger(__name__)

# Environment
CONTENT_BUCKET = os.environ.get('CONTENT_BUCKET', 'nova-content-bucket')
EVENT_STORE_TABLE = os.environ.get('EVENT_STORE_TABLE', 'nova-event-store')
READ_MODEL_TABLE = os.environ.get('READ_MODEL_TABLE', 'nova-read-model')
NOVA_EMBEDDINGS_MODEL_ID = os.environ.get('NOVA_EMBEDDINGS_MODEL_ID', 'amazon.nova-multimodal-embeddings-v1')
AWS_REGION = os.environ.get('AWS_REGION', 'ap-northeast-1')

# Clients
bedrock_client = boto3.client('bedrock-runtime', region_name=AWS_REGION)
dynamodb_client = boto3.client('dynamodb', region_name=AWS_REGION)
s3_client = boto3.client('s3', region_name=AWS_REGION)


app = FastAPI(
    title="Nova Search Service",
    version="0.1.0",
    description="ベクトル検索サービス - Bedrock Nova Multimodal Embeddings (OpenSearch廃止)",
)


# === DTOs ===
class SearchQuery(BaseModel):
    """検索クエリ"""
    query_text: Optional[str] = Field(default=None, description="テキストクエリ")
    query_image_base64: Optional[str] = Field(default=None, description="Base64エンコードされた画像")
    filters: Optional[Dict[str, Any]] = Field(default=None, description="フィルタ条件")
    top_k: int = Field(default=10, ge=1, le=100, description="返却する結果の数")
    include_embeddings: bool = Field(default=False, description="埋め込みベクトルを結果に含めるか")


class SearchResult(BaseModel):
    """検索結果アイテム"""
    document_id: str
    score: float
    content_type: str  # text, image, audio, video
    title: Optional[str] = None
    snippet: Optional[str] = None
    metadata: Dict[str, Any] = {}
    embedding: Optional[List[float]] = None


class SearchResponse(BaseModel):
    """検索レスポンス"""
    query_id: str
    total_results: int
    results: List[SearchResult]
    processing_time_ms: float


class IndexRequest(BaseModel):
    """インデックス登録リクエスト"""
    document_id: str
    content: str
    content_type: str = "text"
    metadata: Dict[str, Any] = {}


class IndexResponse(BaseModel):
    """インデックス登録レスポンス"""
    document_id: str
    status: str
    indexed_at: str


class EmbeddingRequest(BaseModel):
    """埋め込み生成リクエスト"""
    text: Optional[str] = None
    image_base64: Optional[str] = None


class EmbeddingResponse(BaseModel):
    """埋め込みレスポンス"""
    embedding: List[float]
    dimension: int
    model_id: str


# === Helper Functions ===
async def generate_embedding_vector(text: Optional[str] = None, image_base64: Optional[str] = None) -> List[float]:
    """Nova Embeddings でベクトル生成"""
    embedding_input = {}
    if text:
        embedding_input['inputText'] = text
    if image_base64:
        embedding_input['inputImage'] = image_base64

    response = bedrock_client.invoke_model(
        modelId=NOVA_EMBEDDINGS_MODEL_ID,
        body=json.dumps(embedding_input),
    )

    result = json.loads(response['body'].read())
    return result.get('embedding', [])


def cosine_similarity(vec1: List[float], vec2: List[float]) -> float:
    """コサイン類似度を計算"""
    if len(vec1) != len(vec2):
        return 0.0

    dot_product = sum(a * b for a, b in zip(vec1, vec2))
    magnitude1 = sum(a * a for a in vec1) ** 0.5
    magnitude2 = sum(b * b for b in vec2) ** 0.5

    if magnitude1 == 0 or magnitude2 == 0:
        return 0.0

    return dot_product / (magnitude1 * magnitude2)


# === Endpoints ===
@app.post("/search", response_model=SearchResponse)
async def semantic_search(query: SearchQuery):
    """
    Nova Multimodal Embeddings を使用したセマンティック検索を実行します。
    
    Note: OpenSearch Serverless 廃止
    DynamoDB から全ドキュメントを取得し、アプリレベルで類似度計算を行う簡易実装。
    大規模データには Bedrock Knowledge Bases または pgvector を推奨。
    """
    query_id = str(uuid.uuid4())
    start_time = datetime.utcnow()

    if not query.query_text and not query.query_image_base64:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either query_text or query_image_base64 must be provided"
        )

    logger.info(f"Search query received. Query ID: {query_id}")

    try:
        # 1. クエリのベクトル化
        query_embedding = await generate_embedding_vector(
            text=query.query_text,
            image_base64=query.query_image_base64
        )

        # 2. DynamoDB からインデックス済みドキュメントを取得
        # Note: 大規模データの場合はページネーションが必要
        response = dynamodb_client.query(
            TableName=READ_MODEL_TABLE,
            KeyConditionExpression='pk = :pk',
            ExpressionAttributeValues={
                ':pk': {'S': 'VECTOR_INDEX'}
            },
            Limit=1000,
        )

        # 3. 類似度計算
        results = []
        for item in response.get('Items', []):
            doc_embedding = json.loads(item.get('embedding', {}).get('S', '[]'))
            if doc_embedding:
                score = cosine_similarity(query_embedding, doc_embedding)
                results.append({
                    'document_id': item.get('document_id', {}).get('S', ''),
                    'score': score,
                    'content_type': item.get('content_type', {}).get('S', 'text'),
                    'title': item.get('title', {}).get('S'),
                    'snippet': item.get('content', {}).get('S', '')[:200],
                    'metadata': json.loads(item.get('metadata', {}).get('S', '{}')),
                })

        # 4. スコア順にソート
        results.sort(key=lambda x: x['score'], reverse=True)
        top_results = results[:query.top_k]

        processing_time = (datetime.utcnow() - start_time).total_seconds() * 1000

        return SearchResponse(
            query_id=query_id,
            total_results=len(top_results),
            results=[SearchResult(**r) for r in top_results],
            processing_time_ms=processing_time
        )

    except Exception as e:
        logger.error(f"Search failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Search failed: {str(e)}"
        )


@app.post("/index", response_model=IndexResponse, status_code=status.HTTP_201_CREATED)
async def index_document(request: IndexRequest):
    """
    ドキュメントをベクトルインデックスに登録します。
    
    Nova Embeddings で埋め込みを生成し、DynamoDB に保存します。
    """
    logger.info(f"Indexing document: {request.document_id}")

    try:
        # 1. ベクトル生成
        embedding = await generate_embedding_vector(text=request.content)

        # 2. DynamoDB に保存
        indexed_at = datetime.utcnow().isoformat()
        dynamodb_client.put_item(
            TableName=READ_MODEL_TABLE,
            Item={
                'pk': {'S': 'VECTOR_INDEX'},
                'sk': {'S': f"DOC#{request.document_id}"},
                'document_id': {'S': request.document_id},
                'content': {'S': request.content},
                'content_type': {'S': request.content_type},
                'embedding': {'S': json.dumps(embedding)},
                'metadata': {'S': json.dumps(request.metadata)},
                'indexed_at': {'S': indexed_at},
            }
        )

        return IndexResponse(
            document_id=request.document_id,
            status="INDEXED",
            indexed_at=indexed_at
        )

    except Exception as e:
        logger.error(f"Indexing failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Indexing failed: {str(e)}"
        )


@app.post("/embeddings", response_model=EmbeddingResponse)
async def generate_embedding(request: EmbeddingRequest):
    """
    Nova Multimodal Embeddings を使用して埋め込みベクトルを生成します。
    """
    if not request.text and not request.image_base64:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either text or image_base64 must be provided"
        )

    logger.info("Generating embedding")

    try:
        embedding = await generate_embedding_vector(
            text=request.text,
            image_base64=request.image_base64
        )

        return EmbeddingResponse(
            embedding=embedding,
            dimension=len(embedding),
            model_id=NOVA_EMBEDDINGS_MODEL_ID
        )

    except Exception as e:
        logger.error(f"Embedding generation failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Embedding generation failed: {str(e)}"
        )


@app.delete("/index/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(document_id: str):
    """
    ドキュメントをベクトルインデックスから削除します。
    """
    logger.info(f"Deleting document from index: {document_id}")

    try:
        dynamodb_client.delete_item(
            TableName=READ_MODEL_TABLE,
            Key={
                'pk': {'S': 'VECTOR_INDEX'},
                'sk': {'S': f"DOC#{document_id}"},
            }
        )
    except Exception as e:
        logger.error(f"Delete failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Delete failed: {str(e)}"
        )


@app.get("/health", response_model=Dict[str, str])
async def health_check():
    """
    Search Service のヘルスチェックエンドポイント。
    """
    return {"status": "ok", "service": "search-service", "message": "Service is healthy"}
