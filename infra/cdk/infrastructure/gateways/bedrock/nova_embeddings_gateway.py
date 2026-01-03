"""Nova Embeddings Gateway Implementation"""
from __future__ import annotations

import base64
import json
from dataclasses import dataclass
from enum import Enum
from typing import Any, Optional

import boto3
import structlog

logger = structlog.get_logger()


class InputModality(str, Enum):
    """入力モダリティ"""
    TEXT = "text"
    IMAGE = "image"
    MULTIMODAL = "multimodal"


class EmbeddingDimension(int, Enum):
    """埋め込み次元数"""
    DIM_256 = 256
    DIM_384 = 384
    DIM_1024 = 1024


@dataclass
class EmbeddingResult:
    """埋め込みベクトル結果"""
    embedding: list[float]
    dimension: int
    modality: InputModality
    input_token_count: int
    model_id: str


@dataclass
class BatchEmbeddingResult:
    """バッチ埋め込み結果"""
    embeddings: list[EmbeddingResult]
    total_input_tokens: int
    success_count: int
    error_count: int


class NovaEmbeddingsGateway:
    """
    Nova Embeddings Gateway
    
    Amazon Bedrock Nova Multimodal Embeddings を使用した埋め込み生成。
    
    機能:
    - テキスト埋め込み生成
    - 画像埋め込み生成
    - マルチモーダル埋め込み（テキスト+画像）
    - バッチ埋め込み生成
    - 次元数カスタマイズ (256, 384, 1024)
    """

    # 対応画像フォーマット
    SUPPORTED_IMAGE_FORMATS = {"png", "jpeg", "jpg", "gif", "webp"}
    
    # 最大入力サイズ
    MAX_TEXT_LENGTH = 2048
    MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024  # 5MB
    MAX_BATCH_SIZE = 32

    def __init__(
        self,
        region: str = "us-east-1",
        model_id: str = "amazon.titan-embed-image-v1",  # Nova Embeddings model
    ):
        self.region = region
        self.model_id = model_id
        self._client = boto3.client("bedrock-runtime", region_name=region)
        self._s3_client = boto3.client("s3", region_name=region)

    async def generate_text_embedding(
        self,
        text: str,
        output_dimension: EmbeddingDimension = EmbeddingDimension.DIM_1024,
        normalize: bool = True,
    ) -> EmbeddingResult:
        """
        テキスト埋め込みを生成
        
        Args:
            text: 入力テキスト
            output_dimension: 出力次元数
            normalize: L2正規化するか
            
        Returns:
            EmbeddingResult: 埋め込み結果
        """
        log = logger.bind(text_length=len(text), dimension=output_dimension.value)
        log.info("text_embedding_started")

        if len(text) > self.MAX_TEXT_LENGTH:
            text = text[:self.MAX_TEXT_LENGTH]
            log.warning("text_truncated", original_length=len(text))

        try:
            request_body = {
                "inputText": text,
                "embeddingConfig": {
                    "outputEmbeddingLength": output_dimension.value,
                },
            }

            response = self._client.invoke_model(
                modelId=self.model_id,
                body=json.dumps(request_body),
                contentType="application/json",
            )

            result = json.loads(response["body"].read())
            embedding = result.get("embedding", [])
            
            if normalize:
                embedding = self._normalize(embedding)

            log.info("text_embedding_completed", dimension=len(embedding))

            return EmbeddingResult(
                embedding=embedding,
                dimension=len(embedding),
                modality=InputModality.TEXT,
                input_token_count=result.get("inputTextTokenCount", 0),
                model_id=self.model_id,
            )

        except Exception as e:
            log.error("text_embedding_failed", error=str(e))
            raise

    async def generate_image_embedding(
        self,
        image_data: bytes | None = None,
        s3_key: str | None = None,
        output_dimension: EmbeddingDimension = EmbeddingDimension.DIM_1024,
        normalize: bool = True,
    ) -> EmbeddingResult:
        """
        画像埋め込みを生成
        
        Args:
            image_data: 画像バイトデータ（直接渡す場合）
            s3_key: S3キー（bucket/key形式）
            output_dimension: 出力次元数
            normalize: L2正規化するか
            
        Returns:
            EmbeddingResult: 埋め込み結果
        """
        log = logger.bind(s3_key=s3_key, dimension=output_dimension.value)
        log.info("image_embedding_started")

        if not image_data and not s3_key:
            raise ValueError("Either image_data or s3_key must be provided")

        try:
            # S3から取得
            if s3_key and not image_data:
                bucket = s3_key.split("/")[0] if "/" in s3_key else "nova-content"
                key = "/".join(s3_key.split("/")[1:]) if "/" in s3_key else s3_key
                
                response = self._s3_client.get_object(Bucket=bucket, Key=key)
                image_data = response["Body"].read()

            if len(image_data) > self.MAX_IMAGE_SIZE_BYTES:
                raise ValueError(f"Image size exceeds {self.MAX_IMAGE_SIZE_BYTES} bytes")

            # Base64エンコード
            image_base64 = base64.b64encode(image_data).decode("utf-8")

            request_body = {
                "inputImage": image_base64,
                "embeddingConfig": {
                    "outputEmbeddingLength": output_dimension.value,
                },
            }

            response = self._client.invoke_model(
                modelId=self.model_id,
                body=json.dumps(request_body),
                contentType="application/json",
            )

            result = json.loads(response["body"].read())
            embedding = result.get("embedding", [])
            
            if normalize:
                embedding = self._normalize(embedding)

            log.info("image_embedding_completed", dimension=len(embedding))

            return EmbeddingResult(
                embedding=embedding,
                dimension=len(embedding),
                modality=InputModality.IMAGE,
                input_token_count=0,
                model_id=self.model_id,
            )

        except Exception as e:
            log.error("image_embedding_failed", error=str(e))
            raise

    async def generate_multimodal_embedding(
        self,
        text: str,
        image_data: bytes | None = None,
        s3_key: str | None = None,
        output_dimension: EmbeddingDimension = EmbeddingDimension.DIM_1024,
        normalize: bool = True,
    ) -> EmbeddingResult:
        """
        マルチモーダル埋め込みを生成（テキスト+画像）
        
        Args:
            text: 入力テキスト
            image_data: 画像バイトデータ
            s3_key: S3キー
            output_dimension: 出力次元数
            normalize: L2正規化するか
            
        Returns:
            EmbeddingResult: 埋め込み結果
        """
        log = logger.bind(text_length=len(text), s3_key=s3_key, dimension=output_dimension.value)
        log.info("multimodal_embedding_started")

        if not image_data and not s3_key:
            # テキストのみの場合
            return await self.generate_text_embedding(text, output_dimension, normalize)

        try:
            # 画像データ取得
            if s3_key and not image_data:
                bucket = s3_key.split("/")[0] if "/" in s3_key else "nova-content"
                key = "/".join(s3_key.split("/")[1:]) if "/" in s3_key else s3_key
                
                response = self._s3_client.get_object(Bucket=bucket, Key=key)
                image_data = response["Body"].read()

            if len(text) > self.MAX_TEXT_LENGTH:
                text = text[:self.MAX_TEXT_LENGTH]

            image_base64 = base64.b64encode(image_data).decode("utf-8")

            request_body = {
                "inputText": text,
                "inputImage": image_base64,
                "embeddingConfig": {
                    "outputEmbeddingLength": output_dimension.value,
                },
            }

            response = self._client.invoke_model(
                modelId=self.model_id,
                body=json.dumps(request_body),
                contentType="application/json",
            )

            result = json.loads(response["body"].read())
            embedding = result.get("embedding", [])
            
            if normalize:
                embedding = self._normalize(embedding)

            log.info("multimodal_embedding_completed", dimension=len(embedding))

            return EmbeddingResult(
                embedding=embedding,
                dimension=len(embedding),
                modality=InputModality.MULTIMODAL,
                input_token_count=result.get("inputTextTokenCount", 0),
                model_id=self.model_id,
            )

        except Exception as e:
            log.error("multimodal_embedding_failed", error=str(e))
            raise

    async def generate_batch_embeddings(
        self,
        texts: list[str],
        output_dimension: EmbeddingDimension = EmbeddingDimension.DIM_1024,
        normalize: bool = True,
    ) -> BatchEmbeddingResult:
        """
        バッチテキスト埋め込み生成
        
        Args:
            texts: テキストリスト
            output_dimension: 出力次元数
            normalize: L2正規化するか
            
        Returns:
            BatchEmbeddingResult: バッチ結果
        """
        log = logger.bind(batch_size=len(texts), dimension=output_dimension.value)
        log.info("batch_embedding_started")

        if len(texts) > self.MAX_BATCH_SIZE:
            raise ValueError(f"Batch size exceeds maximum of {self.MAX_BATCH_SIZE}")

        embeddings = []
        total_tokens = 0
        error_count = 0

        for i, text in enumerate(texts):
            try:
                result = await self.generate_text_embedding(text, output_dimension, normalize)
                embeddings.append(result)
                total_tokens += result.input_token_count
            except Exception as e:
                log.warning("batch_item_failed", index=i, error=str(e))
                error_count += 1
                # エラーの場合はゼロベクトルを追加
                embeddings.append(EmbeddingResult(
                    embedding=[0.0] * output_dimension.value,
                    dimension=output_dimension.value,
                    modality=InputModality.TEXT,
                    input_token_count=0,
                    model_id=self.model_id,
                ))

        log.info("batch_embedding_completed", 
                 success_count=len(embeddings) - error_count,
                 error_count=error_count)

        return BatchEmbeddingResult(
            embeddings=embeddings,
            total_input_tokens=total_tokens,
            success_count=len(embeddings) - error_count,
            error_count=error_count,
        )

    def compute_similarity(
        self,
        embedding1: list[float],
        embedding2: list[float],
    ) -> float:
        """
        2つの埋め込みベクトルのコサイン類似度を計算
        
        Args:
            embedding1: ベクトル1
            embedding2: ベクトル2
            
        Returns:
            float: コサイン類似度 (-1 to 1)
        """
        if len(embedding1) != len(embedding2):
            raise ValueError("Embedding dimensions must match")

        dot_product = sum(a * b for a, b in zip(embedding1, embedding2))
        norm1 = sum(a * a for a in embedding1) ** 0.5
        norm2 = sum(b * b for b in embedding2) ** 0.5

        if norm1 == 0 or norm2 == 0:
            return 0.0

        return dot_product / (norm1 * norm2)

    def _normalize(self, embedding: list[float]) -> list[float]:
        """L2正規化"""
        norm = sum(x * x for x in embedding) ** 0.5
        if norm == 0:
            return embedding
        return [x / norm for x in embedding]




