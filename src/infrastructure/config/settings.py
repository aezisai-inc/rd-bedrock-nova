"""Application Settings"""
from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """
    アプリケーション設定

    12-Factor App の Config 原則に従い、
    すべての設定は環境変数から取得する。
    """

    # Service
    service_name: str = "nova-platform"
    environment: str = "development"
    log_level: str = "INFO"
    debug: bool = False

    # AWS
    aws_region: str = "us-east-1"

    # Bedrock Models
    nova_sonic_model_id: str = "amazon.nova-sonic-v1:0"
    nova_omni_model_id: str = "amazon.nova-omni-v1:0"
    nova_embeddings_model_id: str = "amazon.nova-embed-multimodal-v1:0"
    claude_model_id: str = "anthropic.claude-3-5-sonnet-20241022-v2:0"

    # DynamoDB
    event_store_table: str = "nova-event-store"
    read_model_table: str = "nova-read-model"

    # S3
    content_bucket: str = "nova-content"

    # OpenSearch
    opensearch_endpoint: str = ""
    opensearch_index: str = "nova-search"

    # Redis
    redis_url: str = "redis://localhost:6379"

    # EventBridge
    event_bus_name: str = "nova-events"

    # Bedrock Agent
    agent_id: str = ""
    agent_alias_id: str = ""
    knowledge_base_id: str = ""
    guardrail_id: str = ""

    class Config:
        env_prefix = "NOVA_"
        env_file = ".env"
        case_sensitive = False

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def is_development(self) -> bool:
        return self.environment == "development"


@lru_cache()
def get_settings() -> Settings:
    """設定のシングルトンインスタンスを取得"""
    return Settings()

