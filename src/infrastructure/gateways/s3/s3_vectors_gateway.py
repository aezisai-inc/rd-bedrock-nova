"""S3 Vectors Gateway Implementation"""
from __future__ import annotations

import json
from dataclasses import dataclass
from enum import Enum
from typing import Any, Optional

import boto3
import structlog

logger = structlog.get_logger()


class DistanceMetric(str, Enum):
    """距離メトリック"""
    COSINE = "cosine"
    EUCLIDEAN = "euclidean"
    DOT_PRODUCT = "dotProduct"


class IndexState(str, Enum):
    """インデックス状態"""
    CREATING = "CREATING"
    ACTIVE = "ACTIVE"
    DELETING = "DELETING"
    FAILED = "FAILED"


@dataclass
class VectorIndex:
    """ベクトルインデックス情報"""
    bucket_name: str
    index_name: str
    dimension: int
    distance_metric: DistanceMetric
    state: IndexState
    vector_count: int


@dataclass
class VectorRecord:
    """ベクトルレコード"""
    key: str
    vector: list[float]
    metadata: dict[str, Any]
    data: Optional[bytes] = None


@dataclass
class QueryResult:
    """クエリ結果"""
    key: str
    score: float
    metadata: dict[str, Any]


@dataclass
class QueryResponse:
    """クエリレスポンス"""
    results: list[QueryResult]
    query_vector_dimension: int
    total_vectors_scanned: int


class S3VectorsGateway:
    """
    S3 Vectors Gateway
    
    Amazon S3 Vectors API を使用したベクトル検索。
    
    機能:
    - ベクトルインデックス作成・管理
    - ベクトル追加・更新・削除
    - k近傍 (kNN) 検索
    - メタデータフィルタリング
    
    Note: S3 Vectors は 2025年7月 GA予定。現在はPreview API。
    """

    # 制限
    MAX_VECTORS_PER_INDEX = 2_000_000_000  # 20億ベクトル
    MAX_DIMENSION = 8192
    MAX_METADATA_SIZE_BYTES = 40 * 1024  # 40KB
    MAX_QUERY_TOP_K = 10000

    def __init__(
        self,
        region: str = "us-east-1",
    ):
        self.region = region
        self._client = boto3.client("s3vectors", region_name=region)
        self._s3_client = boto3.client("s3", region_name=region)

    async def create_index(
        self,
        bucket_name: str,
        index_name: str,
        dimension: int,
        distance_metric: DistanceMetric = DistanceMetric.COSINE,
    ) -> VectorIndex:
        """
        ベクトルインデックスを作成
        
        Args:
            bucket_name: S3バケット名
            index_name: インデックス名
            dimension: ベクトル次元数
            distance_metric: 距離メトリック
            
        Returns:
            VectorIndex: 作成されたインデックス情報
        """
        log = logger.bind(bucket=bucket_name, index=index_name, dimension=dimension)
        log.info("creating_vector_index")

        if dimension > self.MAX_DIMENSION:
            raise ValueError(f"Dimension {dimension} exceeds maximum {self.MAX_DIMENSION}")

        try:
            response = self._client.create_index(
                bucketName=bucket_name,
                indexName=index_name,
                dimension=dimension,
                distanceMetric=distance_metric.value,
            )

            log.info("vector_index_created", state=response.get("state"))

            return VectorIndex(
                bucket_name=bucket_name,
                index_name=index_name,
                dimension=dimension,
                distance_metric=distance_metric,
                state=IndexState(response.get("state", "CREATING")),
                vector_count=0,
            )

        except Exception as e:
            log.error("create_index_failed", error=str(e))
            raise

    async def describe_index(
        self,
        bucket_name: str,
        index_name: str,
    ) -> VectorIndex:
        """
        インデックス情報を取得
        
        Args:
            bucket_name: S3バケット名
            index_name: インデックス名
            
        Returns:
            VectorIndex: インデックス情報
        """
        log = logger.bind(bucket=bucket_name, index=index_name)
        log.info("describing_vector_index")

        try:
            response = self._client.describe_index(
                bucketName=bucket_name,
                indexName=index_name,
            )

            return VectorIndex(
                bucket_name=bucket_name,
                index_name=index_name,
                dimension=response.get("dimension", 0),
                distance_metric=DistanceMetric(response.get("distanceMetric", "cosine")),
                state=IndexState(response.get("state", "ACTIVE")),
                vector_count=response.get("vectorCount", 0),
            )

        except Exception as e:
            log.error("describe_index_failed", error=str(e))
            raise

    async def delete_index(
        self,
        bucket_name: str,
        index_name: str,
    ) -> bool:
        """
        インデックスを削除
        
        Args:
            bucket_name: S3バケット名
            index_name: インデックス名
            
        Returns:
            bool: 成功したかどうか
        """
        log = logger.bind(bucket=bucket_name, index=index_name)
        log.info("deleting_vector_index")

        try:
            self._client.delete_index(
                bucketName=bucket_name,
                indexName=index_name,
            )
            log.info("vector_index_deleted")
            return True

        except Exception as e:
            log.error("delete_index_failed", error=str(e))
            raise

    async def put_vectors(
        self,
        bucket_name: str,
        index_name: str,
        vectors: list[VectorRecord],
    ) -> dict[str, Any]:
        """
        ベクトルを追加・更新
        
        Args:
            bucket_name: S3バケット名
            index_name: インデックス名
            vectors: ベクトルレコードリスト
            
        Returns:
            dict: 結果
        """
        log = logger.bind(bucket=bucket_name, index=index_name, count=len(vectors))
        log.info("putting_vectors")

        try:
            records = []
            for v in vectors:
                record = {
                    "key": v.key,
                    "vector": v.vector,
                    "metadata": v.metadata,
                }
                if v.data:
                    record["data"] = v.data
                records.append(record)

            response = self._client.put_vectors(
                bucketName=bucket_name,
                indexName=index_name,
                vectors=records,
            )

            log.info("vectors_put", success_count=response.get("successCount", 0))

            return {
                "success_count": response.get("successCount", 0),
                "error_count": response.get("errorCount", 0),
                "errors": response.get("errors", []),
            }

        except Exception as e:
            log.error("put_vectors_failed", error=str(e))
            raise

    async def get_vectors(
        self,
        bucket_name: str,
        index_name: str,
        keys: list[str],
    ) -> list[VectorRecord]:
        """
        ベクトルを取得
        
        Args:
            bucket_name: S3バケット名
            index_name: インデックス名
            keys: キーリスト
            
        Returns:
            list[VectorRecord]: ベクトルレコードリスト
        """
        log = logger.bind(bucket=bucket_name, index=index_name, key_count=len(keys))
        log.info("getting_vectors")

        try:
            response = self._client.get_vectors(
                bucketName=bucket_name,
                indexName=index_name,
                keys=keys,
            )

            results = []
            for v in response.get("vectors", []):
                results.append(VectorRecord(
                    key=v.get("key", ""),
                    vector=v.get("vector", []),
                    metadata=v.get("metadata", {}),
                    data=v.get("data"),
                ))

            log.info("vectors_retrieved", count=len(results))
            return results

        except Exception as e:
            log.error("get_vectors_failed", error=str(e))
            raise

    async def delete_vectors(
        self,
        bucket_name: str,
        index_name: str,
        keys: list[str],
    ) -> dict[str, Any]:
        """
        ベクトルを削除
        
        Args:
            bucket_name: S3バケット名
            index_name: インデックス名
            keys: キーリスト
            
        Returns:
            dict: 結果
        """
        log = logger.bind(bucket=bucket_name, index=index_name, key_count=len(keys))
        log.info("deleting_vectors")

        try:
            response = self._client.delete_vectors(
                bucketName=bucket_name,
                indexName=index_name,
                keys=keys,
            )

            log.info("vectors_deleted", success_count=response.get("successCount", 0))

            return {
                "success_count": response.get("successCount", 0),
                "error_count": response.get("errorCount", 0),
            }

        except Exception as e:
            log.error("delete_vectors_failed", error=str(e))
            raise

    async def query_vectors(
        self,
        bucket_name: str,
        index_name: str,
        query_vector: list[float],
        top_k: int = 10,
        filter_expression: Optional[dict[str, Any]] = None,
        include_metadata: bool = True,
    ) -> QueryResponse:
        """
        ベクトル検索 (kNN)
        
        Args:
            bucket_name: S3バケット名
            index_name: インデックス名
            query_vector: クエリベクトル
            top_k: 返却件数
            filter_expression: メタデータフィルタ
            include_metadata: メタデータを含めるか
            
        Returns:
            QueryResponse: 検索結果
        """
        log = logger.bind(bucket=bucket_name, index=index_name, top_k=top_k)
        log.info("querying_vectors")

        if top_k > self.MAX_QUERY_TOP_K:
            top_k = self.MAX_QUERY_TOP_K
            log.warning("top_k_clamped", max_value=self.MAX_QUERY_TOP_K)

        try:
            params = {
                "bucketName": bucket_name,
                "indexName": index_name,
                "queryVector": query_vector,
                "topK": top_k,
                "includeMetadata": include_metadata,
            }

            if filter_expression:
                params["filter"] = filter_expression

            response = self._client.query_vectors(**params)

            results = [
                QueryResult(
                    key=r.get("key", ""),
                    score=r.get("score", 0.0),
                    metadata=r.get("metadata", {}),
                )
                for r in response.get("results", [])
            ]

            log.info("vectors_queried", result_count=len(results))

            return QueryResponse(
                results=results,
                query_vector_dimension=len(query_vector),
                total_vectors_scanned=response.get("totalVectorsScanned", 0),
            )

        except Exception as e:
            log.error("query_vectors_failed", error=str(e))
            raise

    async def hybrid_search(
        self,
        bucket_name: str,
        index_name: str,
        query_vector: list[float],
        text_query: Optional[str] = None,
        top_k: int = 10,
        filter_expression: Optional[dict[str, Any]] = None,
        vector_weight: float = 0.7,
    ) -> QueryResponse:
        """
        ハイブリッド検索（ベクトル + テキスト）
        
        Args:
            bucket_name: S3バケット名
            index_name: インデックス名
            query_vector: クエリベクトル
            text_query: テキストクエリ（メタデータ検索用）
            top_k: 返却件数
            filter_expression: メタデータフィルタ
            vector_weight: ベクトルスコアの重み (0-1)
            
        Returns:
            QueryResponse: 検索結果
        """
        log = logger.bind(bucket=bucket_name, index=index_name, top_k=top_k)
        log.info("hybrid_search_started")

        # まずベクトル検索
        vector_results = await self.query_vectors(
            bucket_name=bucket_name,
            index_name=index_name,
            query_vector=query_vector,
            top_k=top_k * 2,  # 多めに取得
            filter_expression=filter_expression,
        )

        # テキストクエリがある場合はメタデータでフィルタリング
        if text_query:
            text_lower = text_query.lower()
            filtered_results = []
            
            for r in vector_results.results:
                # メタデータ内のテキストマッチングスコアを計算
                text_score = 0.0
                for key, value in r.metadata.items():
                    if isinstance(value, str) and text_lower in value.lower():
                        text_score = 1.0
                        break
                
                # ハイブリッドスコア = vector_weight * vector_score + (1 - vector_weight) * text_score
                hybrid_score = vector_weight * r.score + (1 - vector_weight) * text_score
                
                filtered_results.append(QueryResult(
                    key=r.key,
                    score=hybrid_score,
                    metadata=r.metadata,
                ))
            
            # スコアでソート
            filtered_results.sort(key=lambda x: x.score, reverse=True)
            results = filtered_results[:top_k]
        else:
            results = vector_results.results[:top_k]

        log.info("hybrid_search_completed", result_count=len(results))

        return QueryResponse(
            results=results,
            query_vector_dimension=len(query_vector),
            total_vectors_scanned=vector_results.total_vectors_scanned,
        )

