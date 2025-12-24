# 12-Factor App Agents 設計書

## 1. 12-Factor Agents 概要

従来の 12-Factor App 原則を AI Agent システム向けに拡張した **15 Factor** で構築します。

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    12-FACTOR APP AGENTS (15 FACTORS)                         │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                 ORIGINAL 12 FACTORS                                  │    │
│  │                                                                      │    │
│  │   1. Codebase        7. Port Binding                                │    │
│  │   2. Dependencies    8. Concurrency                                 │    │
│  │   3. Config          9. Disposability                               │    │
│  │   4. Backing Services 10. Dev/Prod Parity                           │    │
│  │   5. Build/Release/Run 11. Logs                                     │    │
│  │   6. Processes       12. Admin Processes                            │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                 AI AGENT EXTENSIONS (3 NEW)                          │    │
│  │                                                                      │    │
│  │   13. Agent Memory     - 会話履歴・コンテキスト管理                   │    │
│  │   14. Tool Orchestration - ツール選択・実行の抽象化                  │    │
│  │   15. Guardrails      - 安全性・コンプライアンス制御                 │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 2. 各ファクターの実装

### Factor 1: Codebase
**1つのコードベース、複数のデプロイ**

```
nova-platform/                      # Monorepo
├── services/
│   ├── audio-service/             # Audio Processing Microservice
│   ├── video-service/             # Video Processing Microservice
│   ├── agent-service/             # Agent Orchestration Microservice
│   ├── search-service/            # Search Microservice
│   └── gateway-service/           # API Gateway
├── packages/
│   ├── domain/                    # Shared Domain Models
│   ├── infrastructure/            # Shared Infrastructure
│   └── testing/                   # Testing Utilities
├── infra/                         # CDK Infrastructure
└── .github/workflows/             # CI/CD
```

### Factor 2: Dependencies
**明示的な依存関係宣言**

```toml
# services/audio-service/pyproject.toml
[project]
name = "nova-audio-service"
version = "1.0.0"
requires-python = ">=3.12"

dependencies = [
    "fastapi>=0.109.0",
    "uvicorn>=0.27.0",
    "boto3>=1.34.0",
    "pydantic>=2.5.0",
    "structlog>=24.1.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=7.4.0",
    "pytest-asyncio>=0.23.0",
    "pytest-cov>=4.1.0",
    "mypy>=1.8.0",
    "ruff>=0.1.0",
]

# Lock file for reproducible builds
[tool.pdm.lock]
```

### Factor 3: Config
**環境変数での設定**

```python
# services/audio-service/src/config.py
from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    # Service
    service_name: str = "nova-audio-service"
    environment: str = "development"
    log_level: str = "INFO"
    
    # AWS
    aws_region: str = "us-east-1"
    
    # Bedrock
    nova_sonic_model_id: str = "amazon.nova-sonic-v1"
    
    # Data Stores
    event_store_table: str = "nova-event-store"
    read_model_table: str = "nova-audio-read-model"
    
    # Event Bus
    event_bus_name: str = "nova-events"
    
    # Secrets (from AWS Secrets Manager)
    db_credentials_secret: str = "nova/db-credentials"
    
    class Config:
        env_prefix = "NOVA_"
        env_file = ".env"

@lru_cache()
def get_settings() -> Settings:
    return Settings()
```

```yaml
# Kubernetes ConfigMap / ECS Task Definition
env:
  - name: NOVA_ENVIRONMENT
    value: "production"
  - name: NOVA_AWS_REGION
    value: "us-east-1"
  - name: NOVA_EVENT_BUS_NAME
    value: "nova-events"
  - name: NOVA_LOG_LEVEL
    value: "INFO"
```

### Factor 4: Backing Services
**接続可能なリソースとして扱う**

```python
# services/audio-service/src/infrastructure/backing_services.py
from abc import ABC, abstractmethod
from typing import Protocol

class TranscriptionService(Protocol):
    """Backing Service: 音声認識"""
    async def transcribe(self, audio_data: bytes) -> TranscriptionResult: ...

class EventStore(Protocol):
    """Backing Service: イベントストア"""
    async def append(self, events: list) -> None: ...
    async def get(self, aggregate_id: str) -> list: ...

class MessageBus(Protocol):
    """Backing Service: メッセージバス"""
    async def publish(self, event: dict) -> None: ...

# 実装は設定で切り替え可能
class BackingServiceFactory:
    @staticmethod
    def create_transcription_service(config: Settings) -> TranscriptionService:
        if config.environment == "test":
            return MockTranscriptionService()
        return NovaSonicTranscriptionService(config)
    
    @staticmethod
    def create_event_store(config: Settings) -> EventStore:
        if config.environment == "test":
            return InMemoryEventStore()
        return DynamoDBEventStore(config.event_store_table)
```

### Factor 5: Build, Release, Run
**ビルド・リリース・実行の厳密な分離**

```yaml
# .github/workflows/deploy.yml
name: Build, Release, Run

on:
  push:
    branches: [main]

jobs:
  # BUILD: ソースコードをビルドアーティファクトに変換
  build:
    runs-on: ubuntu-latest
    outputs:
      image_tag: ${{ steps.build.outputs.tag }}
    steps:
      - uses: actions/checkout@v4
      
      - name: Build Docker Image
        id: build
        run: |
          TAG="${GITHUB_SHA::8}"
          docker build -t nova-audio-service:$TAG services/audio-service/
          echo "tag=$TAG" >> $GITHUB_OUTPUT
      
      - name: Push to ECR
        run: |
          aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_REGISTRY
          docker push $ECR_REGISTRY/nova-audio-service:${{ steps.build.outputs.tag }}

  # RELEASE: ビルドアーティファクトに設定を組み合わせ
  release:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - name: Create Release
        run: |
          # CDK でインフラとコードをデプロイ
          cd infra
          npm run cdk deploy -- \
            --context imageTag=${{ needs.build.outputs.image_tag }} \
            --context environment=production \
            NovaAudioServiceStack

  # RUN: リリースを実行環境で起動（ECS/Lambda が自動実行）
```

### Factor 6: Processes
**ステートレスプロセス**

```python
# services/audio-service/src/main.py
from fastapi import FastAPI, Depends
from contextlib import asynccontextmanager

# ステートレス: すべての状態は外部サービスに保存
app = FastAPI()

@app.post("/transcribe")
async def transcribe(
    request: TranscribeRequest,
    # 状態は外部サービスから取得
    event_store: EventStore = Depends(get_event_store),
    transcription_service: TranscriptionService = Depends(get_transcription_service),
):
    # プロセスローカルな状態は持たない
    # すべてのデータは backing services から取得
    audio = await event_store.get(request.audio_id)
    result = await transcription_service.transcribe(audio)
    await event_store.append(result.events)
    return result

# セッションも外部サービス（Redis/DynamoDB）に保存
# ファイルシステムは一時的なキャッシュにのみ使用
```

### Factor 7: Port Binding
**ポートバインディングでサービス公開**

```dockerfile
# services/audio-service/Dockerfile
FROM python:3.12-slim

WORKDIR /app
COPY . .
RUN pip install -e .

# 環境変数でポート指定
ENV PORT=8080
EXPOSE $PORT

# 自己完結型のサービス
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "${PORT}"]
```

```typescript
// infra/lib/services/audio-service-stack.ts
const service = new ecs.FargateService(this, 'AudioService', {
  // ALB がトラフィックをルーティング
});

// API Gateway でエンドポイント公開
new apigateway.RestApi(this, 'AudioApi', {
  defaultIntegration: new apigateway.HttpIntegration(
    `http://${alb.loadBalancerDnsName}/`
  ),
});
```

### Factor 8: Concurrency
**プロセスモデルでスケールアウト**

```typescript
// infra/lib/services/audio-service-stack.ts
const scaling = service.autoScaleTaskCount({
  minCapacity: 2,
  maxCapacity: 100,
});

// CPU ベースでスケール
scaling.scaleOnCpuUtilization('CpuScaling', {
  targetUtilizationPercent: 70,
});

// キュー深度でスケール（SQS）
scaling.scaleOnMetric('QueueScaling', {
  metric: queue.metricApproximateNumberOfMessagesVisible(),
  scalingSteps: [
    { upper: 0, change: -1 },
    { lower: 100, change: +1 },
    { lower: 500, change: +5 },
  ],
});
```

### Factor 9: Disposability
**高速起動・グレースフルシャットダウン**

```python
# services/audio-service/src/main.py
import signal
import asyncio
from contextlib import asynccontextmanager

shutdown_event = asyncio.Event()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: 高速起動
    logger.info("Service starting...")
    
    # シグナルハンドラ設定
    for sig in (signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, lambda s, f: shutdown_event.set())
    
    yield
    
    # Shutdown: グレースフル停止
    logger.info("Shutting down gracefully...")
    
    # 進行中のリクエストを待機
    await asyncio.sleep(5)
    
    # リソースクリーンアップ
    await cleanup_resources()
    
    logger.info("Shutdown complete")

app = FastAPI(lifespan=lifespan)

@app.get("/health")
async def health():
    if shutdown_event.is_set():
        return {"status": "draining"}, 503
    return {"status": "healthy"}
```

### Factor 10: Dev/Prod Parity
**開発・本番環境の類似性**

```python
# services/audio-service/tests/conftest.py
import pytest
from testcontainers.localstack import LocalStackContainer

@pytest.fixture(scope="session")
def localstack():
    """開発環境で本番同等のAWSサービスを使用"""
    with LocalStackContainer(image="localstack/localstack:latest") as localstack:
        yield localstack

@pytest.fixture
def dynamodb(localstack):
    """DynamoDB テストインスタンス"""
    import boto3
    return boto3.resource(
        "dynamodb",
        endpoint_url=localstack.get_url(),
        region_name="us-east-1"
    )
```

### Factor 11: Logs
**ログをイベントストリームとして扱う**

```python
# services/audio-service/src/logging.py
import structlog
import sys

def configure_logging():
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(file=sys.stdout),
        cache_logger_on_first_use=True,
    )

# 使用例
logger = structlog.get_logger()

@app.post("/transcribe")
async def transcribe(request: TranscribeRequest):
    logger.info(
        "transcription_started",
        audio_id=request.audio_id,
        language=request.language,
    )
    # ... 処理 ...
    logger.info(
        "transcription_completed",
        audio_id=request.audio_id,
        duration_ms=elapsed,
        confidence=result.confidence,
    )
```

### Factor 12: Admin Processes
**管理タスクをワンオフプロセスで実行**

```python
# services/audio-service/scripts/admin_tasks.py
import typer
from src.config import get_settings
from src.infrastructure.event_store import DynamoDBEventStore

app = typer.Typer()

@app.command()
def rebuild_read_model(
    from_timestamp: str = None,
    dry_run: bool = False
):
    """Read Model を再構築"""
    settings = get_settings()
    event_store = DynamoDBEventStore(settings.event_store_table)
    
    events = event_store.get_all_events(from_timestamp=from_timestamp)
    
    for event in events:
        if not dry_run:
            projector.project(event)
        typer.echo(f"Processed: {event.event_type}")

@app.command()
def migrate_schema(version: str):
    """スキーママイグレーション"""
    # One-off migration task
    pass

if __name__ == "__main__":
    app()
```

```bash
# Lambda / ECS Run Task で実行
aws lambda invoke \
  --function-name nova-admin-tasks \
  --payload '{"command": "rebuild_read_model", "args": {"from_timestamp": "2024-01-01"}}'
```

## 3. AI Agent 拡張ファクター

### Factor 13: Agent Memory
**会話履歴・コンテキストの管理**

```python
# services/agent-service/src/memory/agent_memory.py
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import List, Optional
from datetime import datetime, timedelta

@dataclass
class MemoryEntry:
    content: str
    role: str
    timestamp: datetime
    metadata: dict

class AgentMemory(ABC):
    """Agent Memory Interface"""
    
    @abstractmethod
    async def add(self, entry: MemoryEntry) -> None:
        pass
    
    @abstractmethod
    async def get_recent(self, limit: int = 10) -> List[MemoryEntry]:
        pass
    
    @abstractmethod
    async def search(self, query: str, limit: int = 5) -> List[MemoryEntry]:
        pass
    
    @abstractmethod
    async def clear(self) -> None:
        pass

class HybridAgentMemory(AgentMemory):
    """短期記憶（Redis）+ 長期記憶（DynamoDB + Vector）"""
    
    def __init__(self, session_id: str, redis, dynamodb, vector_store):
        self.session_id = session_id
        self.redis = redis
        self.dynamodb = dynamodb
        self.vector_store = vector_store
        self.short_term_ttl = timedelta(hours=1)
    
    async def add(self, entry: MemoryEntry) -> None:
        # 短期記憶（最新の会話）
        await self.redis.lpush(
            f"memory:{self.session_id}",
            entry.to_json()
        )
        await self.redis.ltrim(f"memory:{self.session_id}", 0, 99)
        await self.redis.expire(f"memory:{self.session_id}", int(self.short_term_ttl.total_seconds()))
        
        # 長期記憶（永続化）
        await self.dynamodb.put_item(
            TableName="nova-agent-memory",
            Item=entry.to_dynamodb_item()
        )
        
        # セマンティック検索用
        embedding = await self.vector_store.embed(entry.content)
        await self.vector_store.index(
            id=f"{self.session_id}:{entry.timestamp.isoformat()}",
            vector=embedding,
            metadata={"content": entry.content, "role": entry.role}
        )
    
    async def get_recent(self, limit: int = 10) -> List[MemoryEntry]:
        """短期記憶から取得"""
        items = await self.redis.lrange(f"memory:{self.session_id}", 0, limit - 1)
        return [MemoryEntry.from_json(item) for item in items]
    
    async def search(self, query: str, limit: int = 5) -> List[MemoryEntry]:
        """長期記憶からセマンティック検索"""
        query_embedding = await self.vector_store.embed(query)
        results = await self.vector_store.search(
            vector=query_embedding,
            filter={"session_id": self.session_id},
            limit=limit
        )
        return [MemoryEntry.from_vector_result(r) for r in results]
```

### Factor 14: Tool Orchestration
**ツール選択・実行の抽象化**

```python
# services/agent-service/src/tools/orchestrator.py
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

@dataclass
class Tool:
    name: str
    description: str
    parameters: Dict[str, Any]
    handler: callable

@dataclass
class ToolResult:
    tool_name: str
    success: bool
    result: Any
    error: Optional[str] = None
    execution_time_ms: int = 0

class ToolOrchestrator:
    """ツールの登録・選択・実行を管理"""
    
    def __init__(self):
        self._tools: Dict[str, Tool] = {}
    
    def register(self, tool: Tool) -> None:
        self._tools[tool.name] = tool
    
    def get_tool_descriptions(self) -> List[Dict]:
        """LLM に提供するツール説明"""
        return [
            {
                "name": tool.name,
                "description": tool.description,
                "parameters": tool.parameters
            }
            for tool in self._tools.values()
        ]
    
    async def execute(self, tool_name: str, parameters: Dict) -> ToolResult:
        """ツールを実行"""
        if tool_name not in self._tools:
            return ToolResult(
                tool_name=tool_name,
                success=False,
                result=None,
                error=f"Unknown tool: {tool_name}"
            )
        
        tool = self._tools[tool_name]
        start_time = time.time()
        
        try:
            result = await tool.handler(**parameters)
            return ToolResult(
                tool_name=tool_name,
                success=True,
                result=result,
                execution_time_ms=int((time.time() - start_time) * 1000)
            )
        except Exception as e:
            return ToolResult(
                tool_name=tool_name,
                success=False,
                result=None,
                error=str(e),
                execution_time_ms=int((time.time() - start_time) * 1000)
            )

# ツール定義
audio_transcription_tool = Tool(
    name="transcribe_audio",
    description="音声ファイルをテキストに変換します",
    parameters={
        "type": "object",
        "properties": {
            "audio_s3_key": {"type": "string", "description": "S3上の音声ファイルキー"},
            "language": {"type": "string", "default": "ja-JP"}
        },
        "required": ["audio_s3_key"]
    },
    handler=transcribe_audio_handler
)

search_knowledge_tool = Tool(
    name="search_knowledge",
    description="ナレッジベースから関連情報を検索します",
    parameters={
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "検索クエリ"},
            "limit": {"type": "integer", "default": 5}
        },
        "required": ["query"]
    },
    handler=search_knowledge_handler
)
```

### Factor 15: Guardrails
**安全性・コンプライアンス制御**

```python
# services/agent-service/src/guardrails/guardrails.py
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import List, Optional
from enum import Enum

class GuardrailAction(Enum):
    ALLOW = "allow"
    BLOCK = "block"
    ANONYMIZE = "anonymize"
    WARN = "warn"

@dataclass
class GuardrailResult:
    action: GuardrailAction
    reason: Optional[str] = None
    modified_content: Optional[str] = None

class Guardrail(ABC):
    @abstractmethod
    async def check_input(self, content: str) -> GuardrailResult:
        pass
    
    @abstractmethod
    async def check_output(self, content: str) -> GuardrailResult:
        pass

class CompositeGuardrails:
    """複数のガードレールを組み合わせ"""
    
    def __init__(self, guardrails: List[Guardrail]):
        self.guardrails = guardrails
    
    async def check_input(self, content: str) -> GuardrailResult:
        for guardrail in self.guardrails:
            result = await guardrail.check_input(content)
            if result.action == GuardrailAction.BLOCK:
                return result
            if result.modified_content:
                content = result.modified_content
        return GuardrailResult(action=GuardrailAction.ALLOW)
    
    async def check_output(self, content: str) -> GuardrailResult:
        for guardrail in self.guardrails:
            result = await guardrail.check_output(content)
            if result.action == GuardrailAction.BLOCK:
                return result
            if result.modified_content:
                content = result.modified_content
        return GuardrailResult(
            action=GuardrailAction.ALLOW,
            modified_content=content
        )

# Bedrock Guardrails を使用した実装
class BedrockGuardrailsAdapter(Guardrail):
    def __init__(self, guardrail_id: str, guardrail_version: str):
        self.client = boto3.client("bedrock-runtime")
        self.guardrail_id = guardrail_id
        self.guardrail_version = guardrail_version
    
    async def check_input(self, content: str) -> GuardrailResult:
        response = self.client.apply_guardrail(
            guardrailIdentifier=self.guardrail_id,
            guardrailVersion=self.guardrail_version,
            source="INPUT",
            content=[{"text": {"text": content}}]
        )
        
        if response["action"] == "GUARDRAIL_INTERVENED":
            return GuardrailResult(
                action=GuardrailAction.BLOCK,
                reason=response.get("assessments", [{}])[0].get("reason")
            )
        
        return GuardrailResult(action=GuardrailAction.ALLOW)

# PII 検出・匿名化ガードレール
class PIIGuardrail(Guardrail):
    async def check_output(self, content: str) -> GuardrailResult:
        # Amazon Comprehend で PII 検出
        comprehend = boto3.client("comprehend")
        response = comprehend.detect_pii_entities(
            Text=content,
            LanguageCode="ja"
        )
        
        if response["Entities"]:
            anonymized = self._anonymize(content, response["Entities"])
            return GuardrailResult(
                action=GuardrailAction.ANONYMIZE,
                modified_content=anonymized
            )
        
        return GuardrailResult(action=GuardrailAction.ALLOW)
```

