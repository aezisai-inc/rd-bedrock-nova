"""S3 Gateway Implementation"""
from __future__ import annotations

import boto3
from botocore.exceptions import ClientError
import structlog

from src.application.ports.gateways import IStorageGateway

logger = structlog.get_logger()


class S3Gateway(IStorageGateway):
    """
    S3 Gateway

    Amazon S3 を使用したストレージサービス。
    """

    def __init__(
        self,
        bucket_name: str,
        region: str = "us-east-1",
    ):
        self.bucket_name = bucket_name
        self.region = region
        self._client = boto3.client("s3", region_name=region)

    async def upload(
        self,
        key: str,
        data: bytes,
        content_type: str = "application/octet-stream",
    ) -> str:
        """
        ファイルをアップロード

        Args:
            key: S3オブジェクトキー
            data: ファイルデータ
            content_type: Content-Type

        Returns:
            str: S3 URI
        """
        log = logger.bind(bucket=self.bucket_name, key=key)
        log.info("upload_started", size=len(data))

        try:
            self._client.put_object(
                Bucket=self.bucket_name,
                Key=key,
                Body=data,
                ContentType=content_type,
            )

            uri = f"s3://{self.bucket_name}/{key}"
            log.info("upload_completed", uri=uri)
            return uri

        except ClientError as e:
            log.error("upload_failed", error=str(e))
            raise

    async def download(self, key: str) -> bytes:
        """
        ファイルをダウンロード

        Args:
            key: S3オブジェクトキー

        Returns:
            bytes: ファイルデータ
        """
        log = logger.bind(bucket=self.bucket_name, key=key)
        log.info("download_started")

        try:
            response = self._client.get_object(
                Bucket=self.bucket_name,
                Key=key,
            )
            data = response["Body"].read()

            log.info("download_completed", size=len(data))
            return data

        except ClientError as e:
            log.error("download_failed", error=str(e))
            raise

    async def generate_presigned_url(
        self,
        key: str,
        expires_in: int = 3600,
        operation: str = "get_object",
    ) -> str:
        """
        署名付きURLを生成

        Args:
            key: S3オブジェクトキー
            expires_in: 有効期限（秒）
            operation: 操作（get_object, put_object）

        Returns:
            str: 署名付きURL
        """
        log = logger.bind(bucket=self.bucket_name, key=key)
        log.info("generating_presigned_url", operation=operation)

        try:
            url = self._client.generate_presigned_url(
                ClientMethod=operation,
                Params={"Bucket": self.bucket_name, "Key": key},
                ExpiresIn=expires_in,
            )

            log.info("presigned_url_generated", expires_in=expires_in)
            return url

        except ClientError as e:
            log.error("presigned_url_generation_failed", error=str(e))
            raise

    async def delete(self, key: str) -> bool:
        """
        ファイルを削除

        Args:
            key: S3オブジェクトキー

        Returns:
            bool: 成功したかどうか
        """
        log = logger.bind(bucket=self.bucket_name, key=key)
        log.info("delete_started")

        try:
            self._client.delete_object(
                Bucket=self.bucket_name,
                Key=key,
            )

            log.info("delete_completed")
            return True

        except ClientError as e:
            log.error("delete_failed", error=str(e))
            return False

    async def exists(self, key: str) -> bool:
        """
        ファイルが存在するか確認

        Args:
            key: S3オブジェクトキー

        Returns:
            bool: 存在するかどうか
        """
        try:
            self._client.head_object(
                Bucket=self.bucket_name,
                Key=key,
            )
            return True

        except ClientError as e:
            if e.response["Error"]["Code"] == "404":
                return False
            raise

