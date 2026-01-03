"""
Search Tools - Nova Embeddings + S3 Vectors Integration

Nova Multimodal Embeddings + S3 Vectors を使用:
- マルチモーダル埋め込み生成
- ベクトル類似検索
- Knowledge Base 統合
"""
import os
import logging
from typing import Optional
from dataclasses import dataclass

from .audio import tool
from src.infrastructure.gateways.bedrock import (
    NovaEmbeddingsGateway,
    EmbeddingDimension,
    InputModality,
    EmbeddingResult as GatewayEmbeddingResult,
)
from src.infrastructure.gateways.s3 import (
    S3VectorsGateway,
    DistanceMetric,
    VectorRecord,
)

logger = logging.getLogger(__name__)


# Gateway シングルトン
_embeddings_gateway: Optional[NovaEmbeddingsGateway] = None
_vectors_gateway: Optional[S3VectorsGateway] = None


def get_embeddings_gateway() -> NovaEmbeddingsGateway:
    """Nova Embeddings Gateway インスタンスを取得"""
    global _embeddings_gateway
    if _embeddings_gateway is None:
        _embeddings_gateway = NovaEmbeddingsGateway(
            region=os.environ.get("AWS_REGION", "us-east-1"),
            model_id=os.environ.get("NOVA_EMBEDDINGS_MODEL_ID", "amazon.titan-embed-image-v1"),
        )
    return _embeddings_gateway


def get_vectors_gateway() -> S3VectorsGateway:
    """S3 Vectors Gateway インスタンスを取得"""
    global _vectors_gateway
    if _vectors_gateway is None:
        _vectors_gateway = S3VectorsGateway(
            region=os.environ.get("AWS_REGION", "us-east-1"),
        )
    return _vectors_gateway


@dataclass
class SearchResult:
    """検索結果"""
    documents: list
    total_count: int
    query_id: str


@tool(
    name="search_knowledge",
    description="Knowledge Baseからテキストまたは画像で類似検索します。Nova Embeddings + S3 Vectorsを使用。"
)
async def search_knowledge(
    query: Optional[str] = None,
    query_image_url: Optional[str] = None,
    top_k: int = 10,
    filters: dict = None,
) -> dict:
    """
    マルチモーダルベクトル検索 (Nova Embeddings + S3 Vectors)
    
    Args:
        query: テキストクエリ (optional)
        query_image_url: 画像クエリのURL (optional)
        top_k: 返却件数
        filters: メタデータフィルタ
        
    Returns:
        dict: 検索結果
    """
    if not query and not query_image_url:
        raise ValueError("Either query or query_image_url must be provided")
    
    logger.info(f"Searching knowledge base: query={query}, image={query_image_url}, top_k={top_k}")
    
    gateway = get_embeddings_gateway()
    
    try:
        # 1. クエリの埋め込みベクトルを生成
        if query and query_image_url:
            # マルチモーダル
            s3_key = query_image_url.replace("s3://", "") if query_image_url.startswith("s3://") else query_image_url
            embedding_result = await gateway.generate_multimodal_embedding(
                text=query,
                s3_key=s3_key,
            )
        elif query:
            # テキストのみ
            embedding_result = await gateway.generate_text_embedding(text=query)
        else:
            # 画像のみ
            s3_key = query_image_url.replace("s3://", "") if query_image_url.startswith("s3://") else query_image_url
            embedding_result = await gateway.generate_image_embedding(s3_key=s3_key)
        
        # 2. S3 Vectors で検索
        content_bucket = os.environ.get('CONTENT_BUCKET', 'nova-content-bucket')
        vector_index = os.environ.get('VECTOR_INDEX', 'nova-vector-index')
        
        vectors_gateway = get_vectors_gateway()
        
        try:
            # S3 Vectors API で検索
            query_response = await vectors_gateway.query_vectors(
                bucket_name=content_bucket,
                index_name=vector_index,
                query_vector=embedding_result.embedding,
                top_k=top_k,
                filter_expression=filters,
            )
            
            return {
                "documents": [
                    {
                        'document_id': r.key,
                        'score': r.score,
                        'metadata': r.metadata,
                    }
                    for r in query_response.results
                ],
                "total_count": len(query_response.results),
                "query_id": f'query-{hash(query or query_image_url) % 10000}',
                "embedding_dimension": embedding_result.dimension,
                "embedding_modality": embedding_result.modality.value,
                "vectors_scanned": query_response.total_vectors_scanned,
            }
        except Exception as vectors_error:
            # S3 Vectors未対応リージョンの場合はモック結果を返す
            logger.warning(f"S3 Vectors query failed (may not be GA): {vectors_error}")
            return {
                "documents": [
                    {
                        'document_id': f'doc-{i}',
                        'score': 0.95 - (i * 0.05),
                        'content': f'[Mock document {i} - S3 Vectors not available]',
                        'metadata': {'source': 'mock', 'reason': 's3-vectors-not-available'},
                    }
                    for i in range(min(3, top_k))
                ],
                "total_count": 3,
                "query_id": f'query-{hash(query or query_image_url) % 10000}',
                "embedding_dimension": embedding_result.dimension,
                "embedding_modality": embedding_result.modality.value,
                "warning": "S3 Vectors API not available, using mock results",
            }
        
    except Exception as e:
        logger.exception(f"Knowledge search failed: {e}")
        return {
            "documents": [],
            "total_count": 0,
            "query_id": 'error',
            "error": str(e),
        }


@tool(
    name="generate_embeddings",
    description="テキストまたは画像の埋め込みベクトルを生成します。Nova Multimodal Embeddingsを使用。"
)
async def generate_embeddings(
    text: Optional[str] = None,
    image_url: Optional[str] = None,
    dimension: int = 1024,
) -> dict:
    """
    マルチモーダル埋め込み生成 (Nova Multimodal Embeddings)
    
    Args:
        text: テキスト入力 (optional)
        image_url: 画像URL (optional)
        dimension: 出力次元数 (256, 384, 1024)
        
    Returns:
        dict: 埋め込みベクトル
    """
    if not text and not image_url:
        raise ValueError("Either text or image_url must be provided")
    
    logger.info(f"Generating embeddings: text={text[:50] if text else None}, image={image_url}")
    
    gateway = get_embeddings_gateway()
    
    # 次元数マッピング
    dim_mapping = {
        256: EmbeddingDimension.DIM_256,
        384: EmbeddingDimension.DIM_384,
        1024: EmbeddingDimension.DIM_1024,
    }
    output_dimension = dim_mapping.get(dimension, EmbeddingDimension.DIM_1024)
    
    try:
        if text and image_url:
            s3_key = image_url.replace("s3://", "") if image_url.startswith("s3://") else image_url
            result = await gateway.generate_multimodal_embedding(
                text=text,
                s3_key=s3_key,
                output_dimension=output_dimension,
            )
        elif text:
            result = await gateway.generate_text_embedding(
                text=text,
                output_dimension=output_dimension,
            )
        else:
            s3_key = image_url.replace("s3://", "") if image_url.startswith("s3://") else image_url
            result = await gateway.generate_image_embedding(
                s3_key=s3_key,
                output_dimension=output_dimension,
            )
        
        return {
            "embedding": result.embedding,
            "dimension": result.dimension,
            "modality": result.modality.value,
            "input_token_count": result.input_token_count,
            "model_id": result.model_id,
        }
        
    except Exception as e:
        logger.exception(f"Embedding generation failed: {e}")
        return {
            "embedding": [0.0] * dimension,
            "dimension": dimension,
            "modality": "unknown",
            "error": str(e),
        }


@tool(
    name="generate_batch_embeddings",
    description="複数テキストの埋め込みベクトルを一括生成します。最大32件。"
)
async def generate_batch_embeddings(
    texts: list[str],
    dimension: int = 1024,
) -> dict:
    """
    バッチ埋め込み生成 (Nova Embeddings)
    
    Args:
        texts: テキストリスト（最大32件）
        dimension: 出力次元数
        
    Returns:
        dict: バッチ埋め込み結果
    """
    if not texts:
        raise ValueError("texts list cannot be empty")
    
    if len(texts) > 32:
        raise ValueError("Maximum 32 texts allowed per batch")
    
    logger.info(f"Generating batch embeddings: count={len(texts)}")
    
    gateway = get_embeddings_gateway()
    
    dim_mapping = {
        256: EmbeddingDimension.DIM_256,
        384: EmbeddingDimension.DIM_384,
        1024: EmbeddingDimension.DIM_1024,
    }
    output_dimension = dim_mapping.get(dimension, EmbeddingDimension.DIM_1024)
    
    try:
        result = await gateway.generate_batch_embeddings(
            texts=texts,
            output_dimension=output_dimension,
        )
        
        return {
            "embeddings": [
                {
                    "embedding": e.embedding,
                    "dimension": e.dimension,
                    "modality": e.modality.value,
                }
                for e in result.embeddings
            ],
            "total_input_tokens": result.total_input_tokens,
            "success_count": result.success_count,
            "error_count": result.error_count,
        }
        
    except Exception as e:
        logger.exception(f"Batch embedding generation failed: {e}")
        return {
            "embeddings": [],
            "total_input_tokens": 0,
            "success_count": 0,
            "error_count": len(texts),
            "error": str(e),
        }


@tool(
    name="compute_similarity",
    description="2つの埋め込みベクトルのコサイン類似度を計算します。"
)
async def compute_similarity(
    embedding1: list[float],
    embedding2: list[float],
) -> dict:
    """
    コサイン類似度を計算
    
    Args:
        embedding1: ベクトル1
        embedding2: ベクトル2
        
    Returns:
        dict: 類似度スコア
    """
    gateway = get_embeddings_gateway()
    
    try:
        similarity = gateway.compute_similarity(embedding1, embedding2)
        return {
            "similarity": similarity,
            "dimension": len(embedding1),
        }
    except Exception as e:
        logger.exception(f"Similarity computation failed: {e}")
        return {
            "similarity": 0.0,
            "error": str(e),
        }


# ========== S3 Vectors Tools ==========

@tool(
    name="create_vector_index",
    description="S3 Vectorsにベクトルインデックスを作成します。"
)
async def create_vector_index(
    bucket_name: str,
    index_name: str,
    dimension: int = 1024,
    distance_metric: str = "cosine",
) -> dict:
    """
    ベクトルインデックスを作成 (S3 Vectors)
    
    Args:
        bucket_name: S3バケット名
        index_name: インデックス名
        dimension: ベクトル次元数
        distance_metric: 距離メトリック (cosine, euclidean, dotProduct)
        
    Returns:
        dict: インデックス情報
    """
    logger.info(f"Creating vector index: {bucket_name}/{index_name}")
    
    gateway = get_vectors_gateway()
    
    metric_mapping = {
        "cosine": DistanceMetric.COSINE,
        "euclidean": DistanceMetric.EUCLIDEAN,
        "dotProduct": DistanceMetric.DOT_PRODUCT,
    }
    metric = metric_mapping.get(distance_metric, DistanceMetric.COSINE)
    
    try:
        result = await gateway.create_index(
            bucket_name=bucket_name,
            index_name=index_name,
            dimension=dimension,
            distance_metric=metric,
        )
        
        return {
            "bucket_name": result.bucket_name,
            "index_name": result.index_name,
            "dimension": result.dimension,
            "distance_metric": result.distance_metric.value,
            "state": result.state.value,
        }
    except Exception as e:
        logger.exception(f"Create index failed: {e}")
        return {"error": str(e)}


@tool(
    name="put_vectors",
    description="S3 Vectorsにベクトルを追加・更新します。"
)
async def put_vectors(
    bucket_name: str,
    index_name: str,
    vectors: list[dict],
) -> dict:
    """
    ベクトルを追加・更新 (S3 Vectors)
    
    Args:
        bucket_name: S3バケット名
        index_name: インデックス名
        vectors: ベクトルリスト [{"key": "...", "vector": [...], "metadata": {...}}]
        
    Returns:
        dict: 結果
    """
    logger.info(f"Putting {len(vectors)} vectors to {bucket_name}/{index_name}")
    
    gateway = get_vectors_gateway()
    
    try:
        records = [
            VectorRecord(
                key=v["key"],
                vector=v["vector"],
                metadata=v.get("metadata", {}),
            )
            for v in vectors
        ]
        
        result = await gateway.put_vectors(
            bucket_name=bucket_name,
            index_name=index_name,
            vectors=records,
        )
        
        return result
    except Exception as e:
        logger.exception(f"Put vectors failed: {e}")
        return {"error": str(e), "success_count": 0}


@tool(
    name="query_vectors",
    description="S3 Vectorsでベクトル検索（kNN）を実行します。"
)
async def query_vectors(
    bucket_name: str,
    index_name: str,
    query_vector: list[float],
    top_k: int = 10,
    filter_expression: dict = None,
) -> dict:
    """
    ベクトル検索 (S3 Vectors)
    
    Args:
        bucket_name: S3バケット名
        index_name: インデックス名
        query_vector: クエリベクトル
        top_k: 返却件数
        filter_expression: メタデータフィルタ
        
    Returns:
        dict: 検索結果
    """
    logger.info(f"Querying vectors from {bucket_name}/{index_name}, top_k={top_k}")
    
    gateway = get_vectors_gateway()
    
    try:
        result = await gateway.query_vectors(
            bucket_name=bucket_name,
            index_name=index_name,
            query_vector=query_vector,
            top_k=top_k,
            filter_expression=filter_expression,
        )
        
        return {
            "results": [
                {
                    "key": r.key,
                    "score": r.score,
                    "metadata": r.metadata,
                }
                for r in result.results
            ],
            "total_count": len(result.results),
            "vectors_scanned": result.total_vectors_scanned,
        }
    except Exception as e:
        logger.exception(f"Query vectors failed: {e}")
        return {"error": str(e), "results": []}


@tool(
    name="hybrid_search",
    description="S3 Vectorsでハイブリッド検索（ベクトル+テキスト）を実行します。"
)
async def hybrid_search(
    bucket_name: str,
    index_name: str,
    query_vector: list[float],
    text_query: str = None,
    top_k: int = 10,
    vector_weight: float = 0.7,
) -> dict:
    """
    ハイブリッド検索 (S3 Vectors)
    
    Args:
        bucket_name: S3バケット名
        index_name: インデックス名
        query_vector: クエリベクトル
        text_query: テキストクエリ
        top_k: 返却件数
        vector_weight: ベクトルスコアの重み (0-1)
        
    Returns:
        dict: 検索結果
    """
    logger.info(f"Hybrid search: {bucket_name}/{index_name}, text={text_query}")
    
    gateway = get_vectors_gateway()
    
    try:
        result = await gateway.hybrid_search(
            bucket_name=bucket_name,
            index_name=index_name,
            query_vector=query_vector,
            text_query=text_query,
            top_k=top_k,
            vector_weight=vector_weight,
        )
        
        return {
            "results": [
                {
                    "key": r.key,
                    "score": r.score,
                    "metadata": r.metadata,
                }
                for r in result.results
            ],
            "total_count": len(result.results),
            "vectors_scanned": result.total_vectors_scanned,
        }
    except Exception as e:
        logger.exception(f"Hybrid search failed: {e}")
        return {"error": str(e), "results": []}
