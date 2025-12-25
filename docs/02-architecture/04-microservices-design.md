# マイクロサービス設計書（ECS Fargate + Agent Core）

## 1. アーキテクチャ概要

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    AGENT CORE MICROSERVICES                                  │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    API Gateway / ALB                                 │    │
│  └───────────────────────────┬─────────────────────────────────────────┘    │
│                              │                                               │
│  ┌───────────────────────────┴───────────────────────────┐                  │
│  │                                                        │                  │
│  │              Agent Core Service (Coordinator)          │                  │
│  │                                                        │                  │
│  │  ┌─────────────────────────────────────────────────┐  │                  │
│  │  │  • セッション管理 (Redis)                        │  │                  │
│  │  │  • オーケストレーション                          │  │                  │
│  │  │  • ツール呼び出し管理                            │  │                  │
│  │  │  • Claude 3.5 Sonnet (Bedrock Runtime)          │  │                  │
│  │  └─────────────────────────────────────────────────┘  │                  │
│  │                                                        │                  │
│  └───────────────────────────┬───────────────────────────┘                  │
│                              │                                               │
│         ┌────────────────────┼────────────────────┐                         │
│         │                    │                    │                         │
│         ▼                    ▼                    ▼                         │
│  ┌────────────┐       ┌────────────┐       ┌────────────┐                  │
│  │ Audio      │       │ Video      │       │ Search     │                  │
│  │ Service    │       │ Service    │       │ Service    │                  │
│  │            │       │            │       │            │                  │
│  │ Nova Sonic │       │ Nova Omni  │       │ Embeddings │                  │
│  │ 文字起こし │       │ 映像解析   │       │ ベクトル   │                  │
│  │ 感情分析   │       │ 異常検知   │       │ 検索       │                  │
│  └──────┬─────┘       └──────┬─────┘       └──────┬─────┘                  │
│         │                    │                    │                         │
│         └────────────────────┼────────────────────┘                         │
│                              │                                               │
│                              ▼                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                      EVENT BUS (EventBridge)                         │    │
│  └───────────────────────────┬─────────────────────────────────────────┘    │
│                              │                                               │
│                              ▼                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                      Event Projector Service                         │    │
│  │                      (CQRS Read Model 更新)                          │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 2. Agent Core とは

**Agent Core** は AWS Strands Framework に基づくセルフホスト型エージェントです。

### Bedrock Agents (マネージド) との比較

| 観点 | Bedrock Agents | Agent Core |
|------|---------------|------------|
| **デプロイ** | AWSマネージド | ECS/ECR にコンテナ |
| **カスタマイズ** | 制限あり | 完全カスタマイズ |
| **ツール統合** | Lambda経由 | 直接コード統合 |
| **状態管理** | 限定的 | Redis/DynamoDB |
| **スケーリング** | 自動 | ECS Auto Scaling |
| **コスト** | 呼び出し課金 | コンピュート課金 |

## 3. サービス詳細

### 3.1 Agent Core Service (Coordinator)

```yaml
service: nova-agent-core
runtime: python3.12
framework: FastAPI + Agent Core Framework
container:
  image: ECR/nova-agent-core:latest
  port: 8000
  cpu: 1024
  memory: 2048

responsibilities:
  - エージェントセッション管理
  - オーケストレーション (ツール選択・実行)
  - 短期記憶 (Redis)
  - 長期記憶 (DynamoDB)
  - Bedrock Runtime API 呼び出し (Claude 3.5 Sonnet)

apis:
  - POST /sessions           # セッション開始
  - POST /sessions/{id}/chat # メッセージ送信
  - GET /sessions/{id}       # セッション取得
  - DELETE /sessions/{id}    # セッション終了

internal_calls:
  - audio-service.nova.local  # Nova Sonic
  - video-service.nova.local  # Nova Omni
  - search-service.nova.local # Nova Embeddings

backing_services:
  - Redis (短期記憶・セッション)
  - DynamoDB (長期記憶・Event Store)
  - Bedrock Runtime (Claude 3.5 Sonnet)
```

```python
# src/services/agent_core/agent.py
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import httpx
import boto3
import redis
import json
from typing import List, Dict, Any, Optional

app = FastAPI(title="Nova Agent Core")

# Clients
bedrock = boto3.client('bedrock-runtime')
redis_client = redis.Redis(host=os.environ['REDIS_HOST'], port=6379)

# Tool definitions
TOOLS = [
    {
        "name": "transcribe_audio",
        "description": "音声ファイルをテキストに変換します",
        "service": "http://audio-service.nova.local:8000",
        "endpoint": "/transcribe",
    },
    {
        "name": "analyze_video",
        "description": "映像を解析して異常やアクションを検出します",
        "service": "http://video-service.nova.local:8000",
        "endpoint": "/analyze",
    },
    {
        "name": "search_similar",
        "description": "マルチモーダル類似検索を実行します",
        "service": "http://search-service.nova.local:8000",
        "endpoint": "/search",
    },
]


class ChatRequest(BaseModel):
    message: str
    context: Optional[Dict[str, Any]] = None


class ChatResponse(BaseModel):
    session_id: str
    response: str
    tools_used: List[str]


@app.post("/sessions/{session_id}/chat", response_model=ChatResponse)
async def chat(session_id: str, request: ChatRequest):
    """Agent Core のメインチャットエンドポイント"""
    
    # 1. セッション履歴を取得 (Redis)
    history = get_session_history(session_id)
    
    # 2. Bedrock Claude でツール選択・実行を決定
    tools_used = []
    tool_results = {}
    
    # Claude API でツール使用を判断
    response = await call_claude_with_tools(
        message=request.message,
        history=history,
        tools=TOOLS,
    )
    
    # 3. ツール呼び出しが必要な場合は実行
    if response.get('tool_use'):
        for tool_call in response['tool_use']:
            tool_name = tool_call['name']
            tool_input = tool_call['input']
            
            result = await execute_tool(tool_name, tool_input)
            tool_results[tool_name] = result
            tools_used.append(tool_name)
        
        # ツール結果を含めて再度 Claude に問い合わせ
        final_response = await call_claude_with_tool_results(
            message=request.message,
            history=history,
            tool_results=tool_results,
        )
    else:
        final_response = response['content']
    
    # 4. セッション履歴を更新 (Redis)
    update_session_history(session_id, request.message, final_response, tools_used)
    
    return ChatResponse(
        session_id=session_id,
        response=final_response,
        tools_used=tools_used,
    )


async def call_claude_with_tools(message: str, history: List, tools: List) -> Dict:
    """Claude 3.5 Sonnet をツール使用モードで呼び出し"""
    
    # ツール定義を Claude 形式に変換
    claude_tools = [
        {
            "name": t["name"],
            "description": t["description"],
            "input_schema": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "検索クエリやファイルURL"},
                },
            },
        }
        for t in tools
    ]
    
    response = bedrock.invoke_model(
        modelId='anthropic.claude-3-5-sonnet-20241022-v2:0',
        body=json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "messages": history + [{"role": "user", "content": message}],
            "tools": claude_tools,
            "max_tokens": 4096,
            "system": """あなたはNova Platformのコーディネーターエージェントです。
            ユーザーの要求を理解し、適切なツールを使って処理してください。
            日本語で丁寧に対応してください。""",
        }),
    )
    
    return json.loads(response['body'].read())


async def execute_tool(tool_name: str, tool_input: Dict) -> Dict:
    """ツール（マイクロサービス）を呼び出し"""
    tool_config = next(t for t in TOOLS if t['name'] == tool_name)
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{tool_config['service']}{tool_config['endpoint']}",
            json=tool_input,
            timeout=60.0,
        )
        response.raise_for_status()
        return response.json()


def get_session_history(session_id: str) -> List:
    """Redis からセッション履歴を取得"""
    data = redis_client.get(f"session:{session_id}")
    if data:
        return json.loads(data)
    return []


def update_session_history(session_id: str, user_msg: str, assistant_msg: str, tools: List):
    """Redis にセッション履歴を保存"""
    history = get_session_history(session_id)
    history.append({"role": "user", "content": user_msg})
    history.append({
        "role": "assistant",
        "content": assistant_msg,
        "tools_used": tools,
    })
    redis_client.setex(
        f"session:{session_id}",
        3600,  # 1時間
        json.dumps(history),
    )
```

### 3.2 Audio Service

```yaml
service: nova-audio-service
runtime: python3.12
framework: FastAPI
container:
  image: ECR/nova-audio-service:latest
  port: 8000
  cpu: 512
  memory: 1024

responsibilities:
  - 音声ファイルのアップロード・管理
  - Nova Sonic による文字起こし
  - 感情分析・話者識別
  - 音声のベクトル化

apis:
  - POST /audio              # アップロード
  - GET /audio/{id}          # 取得
  - POST /transcribe         # 文字起こし (Agent Core から呼び出し)
  - GET /audio/{id}/transcript   # 結果取得

events_produced:
  - AudioUploaded
  - TranscriptionCompleted
  - SentimentAnalyzed

backing_services:
  - S3 (audio files)
  - DynamoDB (event store + read model)
  - Bedrock (Nova Sonic)
  - EventBridge (events)
```

```python
# src/services/audio/main.py
from fastapi import FastAPI, UploadFile, HTTPException
from pydantic import BaseModel
import boto3
import json
import uuid

app = FastAPI(title="Nova Audio Service")

bedrock = boto3.client('bedrock-runtime')
s3 = boto3.client('s3')
events = boto3.client('events')


class TranscribeRequest(BaseModel):
    audio_url: str
    language: str = "ja-JP"


class TranscribeResponse(BaseModel):
    transcription: str
    segments: list
    sentiment: dict | None
    status: str


@app.post("/transcribe", response_model=TranscribeResponse)
async def transcribe(request: TranscribeRequest):
    """
    Nova Sonic で音声を文字起こし。
    Agent Core Service から呼び出される。
    """
    # S3から音声データをダウンロード
    bucket, key = parse_s3_url(request.audio_url)
    audio_data = s3.get_object(Bucket=bucket, Key=key)['Body'].read()
    
    # Nova Sonic で文字起こし
    response = bedrock.invoke_model(
        modelId='amazon.nova-sonic-v1',
        contentType='application/json',
        body=json.dumps({
            'audio': base64.b64encode(audio_data).decode(),
            'languageCode': request.language,
            'enableSpeakerDiarization': True,
            'enableSentimentAnalysis': True,
        }),
    )
    
    result = json.loads(response['body'].read())
    
    # EventBridge にイベント発行
    events.put_events(
        Entries=[{
            'Source': 'nova.audio-service',
            'DetailType': 'TranscriptionCompleted',
            'Detail': json.dumps({
                'audio_url': request.audio_url,
                'transcript': result.get('transcription', ''),
            }),
            'EventBusName': 'nova-events',
        }]
    )
    
    return TranscribeResponse(
        transcription=result.get('transcription', ''),
        segments=result.get('segments', []),
        sentiment=result.get('sentiment'),
        status='completed',
    )


@app.post("/audio")
async def upload_audio(file: UploadFile):
    """音声ファイルをS3にアップロード"""
    audio_id = str(uuid.uuid4())
    s3_key = f"audio/{audio_id}/{file.filename}"
    
    s3.upload_fileobj(
        file.file,
        os.environ['CONTENT_BUCKET'],
        s3_key,
        ExtraArgs={'ContentType': file.content_type},
    )
    
    # イベント発行
    events.put_events(
        Entries=[{
            'Source': 'nova.audio-service',
            'DetailType': 'AudioUploaded',
            'Detail': json.dumps({
                'audio_id': audio_id,
                's3_key': s3_key,
                'file_name': file.filename,
            }),
            'EventBusName': 'nova-events',
        }]
    )
    
    return {
        'audio_id': audio_id,
        's3_url': f"s3://{os.environ['CONTENT_BUCKET']}/{s3_key}",
    }
```

### 3.3 Video Service

```yaml
service: nova-video-service
runtime: python3.12
framework: FastAPI
container:
  image: ECR/nova-video-service:latest
  port: 8000
  cpu: 1024
  memory: 2048

responsibilities:
  - 映像ファイルのアップロード・管理
  - Nova Omni による映像解析
  - 異常検知・アラート発行
  - 時系列分析

apis:
  - POST /video              # アップロード
  - GET /video/{id}          # 取得
  - POST /analyze            # 解析 (Agent Core から呼び出し)
  - GET /video/{id}/anomalies # 異常一覧

events_produced:
  - VideoUploaded
  - VideoAnalyzed
  - AnomalyDetected

backing_services:
  - S3 (video files)
  - DynamoDB (event store + read model)
  - Bedrock (Nova Omni)
  - EventBridge (events)
  - SNS (alerts)
```

```python
# src/services/video/main.py
from fastapi import FastAPI, UploadFile
from pydantic import BaseModel
import boto3
import json

app = FastAPI(title="Nova Video Service")

bedrock = boto3.client('bedrock-runtime')
s3 = boto3.client('s3')
events = boto3.client('events')


class AnalyzeRequest(BaseModel):
    video_url: str
    analysis_type: str = "anomaly"  # anomaly, action, quality


class AnalyzeResponse(BaseModel):
    description: str
    frames: list
    anomalies: list
    actions: list
    status: str


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(request: AnalyzeRequest):
    """
    Nova Omni で映像を解析。
    Agent Core Service から呼び出される。
    """
    # Nova Omni で映像解析
    response = bedrock.invoke_model(
        modelId='amazon.nova-omni-v1',
        contentType='application/json',
        body=json.dumps({
            'video': {'s3Uri': request.video_url},
            'analysisType': request.analysis_type,
            'enableTemporalAnalysis': True,
            'detectAnomalies': True,
        }),
    )
    
    result = json.loads(response['body'].read())
    
    # 異常検出時はイベント発行
    anomalies = result.get('anomalies', [])
    for anomaly in anomalies:
        if anomaly.get('severity') in ['HIGH', 'CRITICAL']:
            events.put_events(
                Entries=[{
                    'Source': 'nova.video-service',
                    'DetailType': 'AnomalyDetected',
                    'Detail': json.dumps(anomaly),
                    'EventBusName': 'nova-events',
                }]
            )
    
    return AnalyzeResponse(
        description=result.get('description', ''),
        frames=result.get('frames', []),
        anomalies=anomalies,
        actions=result.get('actions', []),
        status='completed',
    )
```

### 3.4 Search Service

```yaml
service: nova-search-service
runtime: python3.12
framework: FastAPI
container:
  image: ECR/nova-search-service:latest
  port: 8000
  cpu: 512
  memory: 1024

responsibilities:
  - マルチモーダルコンテンツ検索
  - Nova Embeddings によるベクトル化
  - DynamoDB でのベクトル管理（代替検討中）

apis:
  - POST /search             # 検索 (Agent Core から呼び出し)
  - POST /index              # インデックス作成

events_consumed:
  - TranscriptionCompleted   # インデックス対象
  - VideoAnalyzed            # インデックス対象

backing_services:
  - DynamoDB (ベクトルストレージ - 将来: Bedrock KB or pgvector)
  - Bedrock (Nova Embeddings)
  - S3 (images)
```

```python
# src/services/search/main.py
# Note: OpenSearch Serverless 廃止 - DynamoDB + Bedrock で代替検討中
from fastapi import FastAPI
from pydantic import BaseModel
import boto3
import json

app = FastAPI(title="Nova Search Service")

bedrock = boto3.client('bedrock-runtime')
dynamodb = boto3.client('dynamodb')


class SearchRequest(BaseModel):
    text: str | None = None
    image_url: str | None = None
    limit: int = 10


class SearchResponse(BaseModel):
    results: list
    count: int


@app.post("/search", response_model=SearchResponse)
async def search(request: SearchRequest):
    """
    Nova Embeddings でベクトル検索。
    Agent Core Service から呼び出される。
    
    Note: OpenSearch Serverless 廃止
    代替案として以下を検討中:
    - Bedrock Knowledge Bases
    - PostgreSQL + pgvector
    - DynamoDB + アプリレベル類似検索
    """
    # ベクトル化
    embedding_input = {}
    if request.text:
        embedding_input['inputText'] = request.text
    if request.image_url:
        image_data = download_from_s3(request.image_url)
        embedding_input['inputImage'] = base64.b64encode(image_data).decode()
    
    response = bedrock.invoke_model(
        modelId='amazon.nova-multimodal-embeddings-v1',
        body=json.dumps(embedding_input),
    )
    
    embedding = json.loads(response['body'].read())['embedding']
    
    # TODO: 代替ベクトル検索実装
    # 現在は DynamoDB から直接検索（類似度計算はアプリレベル）
    results = []
    
    return SearchResponse(results=results, count=len(results))
```

## 4. サービス間通信

### 4.1 Cloud Map によるサービスディスカバリ

```
┌────────────────────────────────────────────────────────────────────────────┐
│                    AWS Cloud Map (nova.local)                               │
│                                                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │  agent-core.nova.local:8000                                         │  │
│  │    └── 10.0.1.10, 10.0.2.20 (ECS Tasks)                            │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │  audio-service.nova.local:8000                                      │  │
│  │    └── 10.0.1.30, 10.0.2.40 (ECS Tasks)                            │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │  video-service.nova.local:8000                                      │  │
│  │    └── 10.0.1.50, 10.0.2.60 (ECS Tasks)                            │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │  search-service.nova.local:8000                                     │  │
│  │    └── 10.0.1.70, 10.0.2.80 (ECS Tasks)                            │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Agent Core からの内部呼び出し

```python
# Agent Core が各サービスを呼び出す
SERVICES = {
    "audio": "http://audio-service.nova.local:8000",
    "video": "http://video-service.nova.local:8000",
    "search": "http://search-service.nova.local:8000",
}

async def call_service(service_name: str, endpoint: str, payload: dict):
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{SERVICES[service_name]}{endpoint}",
            json=payload,
            timeout=60.0,
        )
        return response.json()
```

## 5. 12-Factor App Agents 適用

```
┌─────────────────────────────────────────────────────────────────────────┐
│                  12-FACTOR APP AGENTS (ECS Fargate)                      │
│                                                                          │
│  1. Codebase: 単一リポジトリ、サービスごとに Dockerfile                    │
│  2. Dependencies: requirements.txt / pyproject.toml                      │
│  3. Config: 環境変数 (ECS Task Definition)                              │
│  4. Backing Services: S3, DynamoDB, Redis をリソースとして              │
│  5. Build/Release/Run: ECR Push → ECS Deploy                            │
│  6. Processes: ステートレスコンテナ、状態は Redis/DynamoDB               │
│  7. Port Binding: FastAPI が 8000 ポートで公開                           │
│  8. Concurrency: ECS Auto Scaling                                       │
│  9. Disposability: ヘルスチェック、グレースフルシャットダウン              │
│  10. Dev/Prod Parity: 同一 Docker Image、環境変数で分岐                  │
│  11. Logs: stdout → CloudWatch Logs                                     │
│  12. Admin Processes: ECS Run Task で管理タスク実行                      │
│                                                                          │
│  追加原則 (AI Agent 固有):                                               │
│  13. Memory: Redis (短期) + DynamoDB (長期)                              │
│  14. Tool Orchestration: Agent Core がサービス間調整                     │
│  15. Guardrails: 入力検証 + Bedrock Guardrails API                      │
└─────────────────────────────────────────────────────────────────────────┘
```

## 6. Dockerfile

```dockerfile
# Dockerfile.agent-core
FROM python:3.12-slim

WORKDIR /app

# 依存関係インストール
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# アプリケーションコード
COPY src/services/agent_core ./

# ヘルスチェック
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

## 7. デプロイトポロジー

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AWS DEPLOYMENT                                       │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    VPC (10.0.0.0/16)                                 │    │
│  │                                                                      │    │
│  │  ┌─────────────────────────────────────────────────────────────┐   │    │
│  │  │ Public Subnets                                               │   │    │
│  │  │                                                              │   │    │
│  │  │  ┌─────────────┐  ┌─────────────┐                           │   │    │
│  │  │  │ ALB         │  │ NAT Gateway │                           │   │    │
│  │  │  │             │  │             │                           │   │    │
│  │  │  └─────────────┘  └─────────────┘                           │   │    │
│  │  └─────────────────────────────────────────────────────────────┘   │    │
│  │                                                                      │    │
│  │  ┌─────────────────────────────────────────────────────────────┐   │    │
│  │  │ Private Subnets (ECS Fargate)                                │   │    │
│  │  │                                                              │   │    │
│  │  │  ┌──────────────────────────────────────────────────────┐   │   │    │
│  │  │  │ Agent Core Service (2+ tasks)                         │   │   │    │
│  │  │  └──────────────────────────────────────────────────────┘   │   │    │
│  │  │                                                              │   │    │
│  │  │  ┌─────────┐ ┌─────────┐ ┌─────────┐                       │   │    │
│  │  │  │ Audio   │ │ Video   │ │ Search  │                       │   │    │
│  │  │  │ Service │ │ Service │ │ Service │                       │   │    │
│  │  │  │(2+ tasks)│ │(2+ tasks)│ │(2+ tasks)│                     │   │    │
│  │  │  └─────────┘ └─────────┘ └─────────┘                       │   │    │
│  │  └─────────────────────────────────────────────────────────────┘   │    │
│  │                                                                      │    │
│  │  ┌─────────────────────────────────────────────────────────────┐   │    │
│  │  │ Isolated Subnets (Data)                                      │   │    │
│  │  │                                                              │   │    │
│  │  │  ┌─────────────┐  ┌─────────────┐                         │   │    │
│  │  │  │ ElastiCache │  │ DynamoDB    │                         │   │    │
│  │  │  │ (Redis)     │  │ (VPC EP)    │                         │   │    │
│  │  │  └─────────────┘  └─────────────┘                         │   │    │
│  │  └─────────────────────────────────────────────────────────────┘   │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  External Services (VPC Endpoints)                                          │
│  • S3  • Bedrock  • EventBridge  • Secrets Manager  • KMS  • ECR           │
└─────────────────────────────────────────────────────────────────────────────┘
```
