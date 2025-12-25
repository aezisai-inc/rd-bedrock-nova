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

logger = logging.getLogger(__name__)


# Gateway シングルトン
_embeddings_gateway: Optional[NovaEmbeddingsGateway] = None


def get_embeddings_gateway() -> NovaEmbeddingsGateway:
    """Nova Embeddings Gateway インスタンスを取得"""
    global _embeddings_gateway
    if _embeddings_gateway is None:
        _embeddings_gateway = NovaEmbeddingsGateway(
            region=os.environ.get("AWS_REGION", "us-east-1"),
            model_id=os.environ.get("NOVA_EMBEDDINGS_MODEL_ID", "amazon.titan-embed-image-v1"),
        )
    return _embeddings_gateway


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
        
        # 2. S3 Vectors で検索 (Preview API - GA後に実装)
        # Note: S3 Vectors が GA になったら実装
        content_bucket = os.environ.get('CONTENT_BUCKET', 'nova-content-bucket')
        vector_index = os.environ.get('VECTOR_INDEX', 'nova-vector-index')
        
        # モック結果（S3 Vectors GA後に置き換え）
        return {
            "documents": [
                {
                    'document_id': f'doc-{i}',
                    'score': 0.95 - (i * 0.05),
                    'content': f'[Mock document {i} content]',
                    'metadata': {'source': 's3-vectors'},
                }
                for i in range(min(3, top_k))
            ],
            "total_count": 3,
            "query_id": f'query-{hash(query or query_image_url) % 10000}',
            "embedding_dimension": embedding_result.dimension,
            "embedding_modality": embedding_result.modality.value,
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
