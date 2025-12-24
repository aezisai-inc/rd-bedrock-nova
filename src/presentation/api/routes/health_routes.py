"""Health Check Routes"""
from fastapi import APIRouter

from src.infrastructure.config import get_settings

router = APIRouter()


@router.get("/health")
async def health_check() -> dict:
    """ヘルスチェック"""
    settings = get_settings()
    return {
        "status": "healthy",
        "service": settings.service_name,
        "environment": settings.environment,
    }


@router.get("/ready")
async def readiness_check() -> dict:
    """レディネスチェック"""
    # TODO: DynamoDB, S3, Bedrock への接続確認
    return {
        "status": "ready",
        "checks": {
            "dynamodb": "ok",
            "s3": "ok",
            "bedrock": "ok",
        },
    }

