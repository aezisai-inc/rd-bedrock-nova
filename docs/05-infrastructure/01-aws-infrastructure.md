# AWS インフラストラクチャ設計書（サーバレス構成）

## 1. 全体アーキテクチャ

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         SERVERLESS ARCHITECTURE                                   │
│                  (Lambda + API Gateway + DynamoDB + S3)                          │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                              Internet                                    │    │
│  └────────────────────────────────┬────────────────────────────────────────┘    │
│                                   │                                              │
│                                   ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                    API Gateway (REST)                                    │    │
│  │                    • Throttling  • API Key  • Logging                   │    │
│  └────────────────────────────────┬────────────────────────────────────────┘    │
│                                   │                                              │
│  ┌────────────────────────────────┼────────────────────────────────────────┐    │
│  │                Lambda Functions (Serverless Compute)                     │    │
│  │                                                                          │    │
│  │  ┌──────────────────────────────────────────────────────────────────┐   │    │
│  │  │        Lambda: Agent Core (Container Image from ECR)              │   │    │
│  │  │                                                                    │   │    │
│  │  │  • Strands SDK Tool Orchestration                                 │   │    │
│  │  │  • DynamoDB Memory (TTL-based Session)                            │   │    │
│  │  │  • Bedrock Guardrails                                             │   │    │
│  │  │  • Foundation Model: Claude 3.5 Sonnet                            │   │    │
│  │  └──────────────────────────────────────────────────────────────────┘   │    │
│  │                                │                                         │    │
│  │         ┌──────────────────────┼──────────────────────┐                 │    │
│  │         │                      │                      │                 │    │
│  │         ▼                      ▼                      ▼                 │    │
│  │  ┌────────────┐        ┌────────────┐        ┌────────────┐            │    │
│  │  │  Lambda:   │        │  Lambda:   │        │  Lambda:   │            │    │
│  │  │  Audio     │        │  Video     │        │  Search    │            │    │
│  │  │  (256MB)   │        │  (512MB)   │        │  (256MB)   │            │    │
│  │  │            │        │            │        │            │            │    │
│  │  │ Nova Sonic │        │ Nova Omni  │        │ Nova       │            │    │
│  │  │ • 音声認識 │        │ • 映像解析 │        │ Embeddings │            │    │
│  │  │ • 話者識別 │        │ • 時系列   │        │ + S3       │            │    │
│  │  │ • 感情分析 │        │ • 異常検知 │        │ Vectors    │            │    │
│  │  └────────────┘        └────────────┘        └────────────┘            │    │
│  │                                                                         │    │
│  │  ┌──────────────────────────────────────────────────────────────────┐   │    │
│  │  │  Lambda: Event Projector (DynamoDB Stream Trigger)               │   │    │
│  │  │  • Event Sourcing → CQRS Read Model                              │   │    │
│  │  └──────────────────────────────────────────────────────────────────┘   │    │
│  │                                                                         │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                          DATA LAYER (Serverless)                         │    │
│  │                                                                          │    │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐  │    │
│  │  │ DynamoDB         │  │ S3               │  │ S3 Vectors (Preview) │  │    │
│  │  │ (On-Demand)      │  │                  │  │                      │  │    │
│  │  │                  │  │ • Audio files    │  │ • ベクトル検索       │  │    │
│  │  │ • Event Store    │  │ • Video files    │  │ • 90%コスト削減      │  │    │
│  │  │ • Session Memory │  │ • Images         │  │ • ペタバイト対応     │  │    │
│  │  │ • Read Models    │  │ • Documents      │  │                      │  │    │
│  │  └──────────────────┘  └──────────────────┘  └──────────────────────┘  │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                          EVENT-DRIVEN (Async)                            │    │
│  │                                                                          │    │
│  │  EventBridge ──── Rule ──── Lambda: Event Handler                       │    │
│  │  DynamoDB Stream ──────── Lambda: Projector                             │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## 2. コスト比較

| 構成 | 月額コスト (アイドル) | 月額コスト (軽負荷) | 備考 |
|------|---------------------|-------------------|------|
| **ECS Fargate (2サービス)** | ~$50/月 | ~$100/月 | 最小 2 Task 常駐 |
| **Lambda (Serverless)** | ~$0/月 | ~$5/月 | 使用量課金のみ |
| **ElastiCache Redis** | ~$30/月 | ~$30/月 | 最小構成でも固定費 |
| **DynamoDB TTL** | ~$0/月 | ~$1/月 | Redis代替 |
| **OpenSearch Serverless** | ~$100/月 | ~$150/月 | 2 OCU 最低 |
| **S3 Vectors** | ~$0/月 | ~$10/月 | 使用量課金 |

**サーバレス構成の月額コスト削減: 約 90%**

## 3. CDK スタック構成 (Python)

```
infra/
├── app.py                    # CDK アプリエントリポイント
└── stacks/
    ├── nova_platform_stack.py  # メインスタック
    ├── data_stack.py           # DynamoDB, S3
    ├── compute_stack.py        # Lambda Functions
    ├── api_stack.py            # API Gateway
    └── events_stack.py         # EventBridge
```

### 3.1 Data Stack

```python
# infra/stacks/data_stack.py
from aws_cdk import (
    NestedStack,
    aws_dynamodb as dynamodb,
    aws_s3 as s3,
)

class DataStack(NestedStack):
    def __init__(self, scope, construct_id, **kwargs):
        super().__init__(scope, construct_id, **kwargs)

        # Event Store (Event Sourcing)
        self.event_store_table = dynamodb.Table(
            self, 'EventStore',
            table_name='nova-event-store',
            partition_key=dynamodb.Attribute(
                name='pk', type=dynamodb.AttributeType.STRING
            ),
            sort_key=dynamodb.Attribute(
                name='sk', type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            stream=dynamodb.StreamViewType.NEW_IMAGE,
        )

        # Session Memory (Redis代替 - TTL付き)
        self.session_table = dynamodb.Table(
            self, 'SessionMemory',
            table_name='nova-session-memory',
            partition_key=dynamodb.Attribute(
                name='session_id', type=dynamodb.AttributeType.STRING
            ),
            sort_key=dynamodb.Attribute(
                name='sk', type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            time_to_live_attribute='ttl',  # 自動期限切れ
        )

        # Read Model (CQRS)
        self.read_model_table = dynamodb.Table(
            self, 'ReadModel',
            table_name='nova-read-model',
            partition_key=dynamodb.Attribute(
                name='pk', type=dynamodb.AttributeType.STRING
            ),
            sort_key=dynamodb.Attribute(
                name='sk', type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
        )

        # Content Bucket
        self.content_bucket = s3.Bucket(
            self, 'ContentBucket',
            encryption=s3.BucketEncryption.S3_MANAGED,
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
        )
```

### 3.2 Compute Stack (Lambda)

```python
# infra/stacks/compute_stack.py
from aws_cdk import (
    NestedStack,
    Duration,
    aws_lambda as lambda_,
    aws_ecr as ecr,
    aws_iam as iam,
    aws_lambda_event_sources as event_sources,
)

class ComputeStack(NestedStack):
    def __init__(self, scope, construct_id, event_store_table, 
                 read_model_table, session_table, content_bucket, **kwargs):
        super().__init__(scope, construct_id, **kwargs)

        # ECR Repository (Agent Core コンテナイメージ用)
        self.agent_core_repo = ecr.Repository(
            self, 'AgentCoreRepo',
            repository_name='nova-agent-core',
        )

        # Agent Core Lambda (Container Image)
        self.agent_core_fn = lambda_.DockerImageFunction(
            self, 'AgentCoreFn',
            function_name='nova-agent-core',
            code=lambda_.DockerImageCode.from_ecr(
                repository=self.agent_core_repo, tag_or_digest='latest'
            ),
            memory_size=1024,
            timeout=Duration.seconds(300),
            environment={
                'EVENT_STORE_TABLE': event_store_table.table_name,
                'SESSION_TABLE': session_table.table_name,
            },
        )

        # Bedrock 権限
        self.agent_core_fn.add_to_role_policy(
            iam.PolicyStatement(
                actions=['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
                resources=['arn:aws:bedrock:*:*:model/*'],
            )
        )
        event_store_table.grant_read_write_data(self.agent_core_fn)
        session_table.grant_read_write_data(self.agent_core_fn)

        # Audio Handler Lambda
        self.audio_fn = lambda_.Function(
            self, 'AudioFn',
            function_name='nova-audio-handler',
            runtime=lambda_.Runtime.PYTHON_3_12,
            handler='handler.lambda_handler',
            code=lambda_.Code.from_asset('src/handlers/audio'),
            memory_size=256,
            timeout=Duration.seconds(300),
            environment={
                'EVENT_STORE_TABLE': event_store_table.table_name,
                'CONTENT_BUCKET': content_bucket.bucket_name,
            },
        )

        # Video Handler Lambda
        self.video_fn = lambda_.Function(
            self, 'VideoFn',
            function_name='nova-video-handler',
            runtime=lambda_.Runtime.PYTHON_3_12,
            handler='handler.lambda_handler',
            code=lambda_.Code.from_asset('src/handlers/video'),
            memory_size=512,
            timeout=Duration.seconds(300),
        )

        # Search Handler Lambda
        self.search_fn = lambda_.Function(
            self, 'SearchFn',
            function_name='nova-search-handler',
            runtime=lambda_.Runtime.PYTHON_3_12,
            handler='handler.lambda_handler',
            code=lambda_.Code.from_asset('src/handlers/search'),
            memory_size=256,
            timeout=Duration.seconds(60),
        )

        # S3 Vectors 権限 (Preview)
        self.search_fn.add_to_role_policy(
            iam.PolicyStatement(
                actions=['s3vectors:*'],
                resources=['*'],
            )
        )

        # Event Projector Lambda (DynamoDB Stream → Read Model)
        self.projector_fn = lambda_.Function(
            self, 'ProjectorFn',
            function_name='nova-event-projector',
            runtime=lambda_.Runtime.PYTHON_3_12,
            handler='handler.lambda_handler',
            code=lambda_.Code.from_asset('src/handlers/projector'),
            memory_size=256,
            timeout=Duration.seconds(60),
        )
        read_model_table.grant_read_write_data(self.projector_fn)

        # DynamoDB Stream Trigger
        self.projector_fn.add_event_source(
            event_sources.DynamoEventSource(
                event_store_table,
                starting_position=lambda_.StartingPosition.LATEST,
                batch_size=100,
            )
        )
```

### 3.3 API Stack

```python
# infra/stacks/api_stack.py
from aws_cdk import (
    NestedStack,
    aws_apigateway as apigw,
)

class ApiStack(NestedStack):
    def __init__(self, scope, construct_id, agent_core_fn, 
                 audio_fn, video_fn, search_fn, **kwargs):
        super().__init__(scope, construct_id, **kwargs)

        self.api = apigw.RestApi(
            self, 'NovaApi',
            rest_api_name='nova-platform-api',
            deploy_options=apigw.StageOptions(
                stage_name='v1',
                throttling_rate_limit=1000,
                throttling_burst_limit=500,
            ),
        )

        # /agent/chat
        agent = self.api.root.add_resource('agent')
        chat = agent.add_resource('chat')
        chat.add_method('POST', apigw.LambdaIntegration(agent_core_fn))

        # /audio/transcribe
        audio = self.api.root.add_resource('audio')
        transcribe = audio.add_resource('transcribe')
        transcribe.add_method('POST', apigw.LambdaIntegration(audio_fn))

        # /video/analyze
        video = self.api.root.add_resource('video')
        analyze = video.add_resource('analyze')
        analyze.add_method('POST', apigw.LambdaIntegration(video_fn))

        # /search
        search = self.api.root.add_resource('search')
        search.add_method('POST', apigw.LambdaIntegration(search_fn))

        self.api_url = self.api.url
```

## 4. DynamoDB Session Memory (Redis代替)

```python
# Redis代替: DynamoDB TTL を使用したセッション管理

import boto3
from datetime import datetime, timedelta

dynamodb = boto3.resource('dynamodb')
session_table = dynamodb.Table('nova-session-memory')

def create_session(session_id: str, user_id: str) -> dict:
    ttl = int((datetime.utcnow() + timedelta(hours=24)).timestamp())
    
    session_table.put_item(Item={
        'session_id': session_id,
        'sk': 'SESSION#METADATA',
        'user_id': user_id,
        'history': [],
        'created_at': datetime.utcnow().isoformat(),
        'ttl': ttl,  # 24時間後に自動削除
    })
    return {'session_id': session_id}

def get_session(session_id: str) -> dict | None:
    result = session_table.get_item(Key={
        'session_id': session_id,
        'sk': 'SESSION#METADATA',
    })
    return result.get('Item')

def update_history(session_id: str, history: list) -> None:
    ttl = int((datetime.utcnow() + timedelta(hours=24)).timestamp())
    
    session_table.update_item(
        Key={'session_id': session_id, 'sk': 'SESSION#METADATA'},
        UpdateExpression='SET history = :h, #ttl = :t',
        ExpressionAttributeNames={'#ttl': 'ttl'},
        ExpressionAttributeValues={':h': history, ':t': ttl},
    )
```

## 5. S3 Vectors 統合計画

```python
# S3 Vectors (Preview 2025.07~)

import boto3

# S3 Vectors クライアント（APIが利用可能になったら使用）
# s3vectors = boto3.client('s3vectors')

def create_vector_index(bucket_name: str, index_name: str):
    """ベクトルインデックスを作成"""
    # s3vectors.create_index(
    #     BucketName=bucket_name,
    #     IndexName=index_name,
    #     IndexConfig={
    #         'Dimension': 1024,  # Nova Embeddings
    #         'DistanceMetric': 'cosine',
    #     }
    # )
    pass

def upsert_vectors(bucket_name: str, index_name: str, vectors: list):
    """ベクトルを追加/更新"""
    # s3vectors.upsert_vectors(
    #     BucketName=bucket_name,
    #     IndexName=index_name,
    #     Vectors=vectors,
    # )
    pass

def query_vectors(bucket_name: str, index_name: str, 
                  query_vector: list, top_k: int = 10):
    """類似ベクトル検索"""
    # return s3vectors.query(
    #     BucketName=bucket_name,
    #     IndexName=index_name,
    #     QueryVector=query_vector,
    #     TopK=top_k,
    # )
    pass
```

## 6. デプロイフロー

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CI/CD PIPELINE (Serverless)                          │
│                                                                              │
│  1. Code Push (GitHub)                                                      │
│        │                                                                     │
│        ▼                                                                     │
│  2. GitHub Actions                                                          │
│        │                                                                     │
│        ├── Unit Tests                                                       │
│        ├── Lint / Type Check                                                │
│        │                                                                     │
│        ▼                                                                     │
│  3. Build                                                                   │
│        │                                                                     │
│        ├── Lambda Packages (zip)                                            │
│        └── Agent Core Container (ECR push)                                  │
│        │                                                                     │
│        ▼                                                                     │
│  4. CDK Deploy                                                              │
│        │                                                                     │
│        ├── cdk synth                                                        │
│        └── cdk deploy                                                       │
│        │                                                                     │
│        ▼                                                                     │
│  5. Lambda 自動更新                                                         │
│        │                                                                     │
│        └── Instant deployment (no downtime)                                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 7. サーバレス構成のメリット

| 観点 | ECS Fargate | Lambda (Serverless) |
|------|-------------|---------------------|
| **コスト (アイドル)** | ~$50/月 | ~$0/月 |
| **スケーリング** | Auto Scaling (分単位) | 瞬時 (ミリ秒) |
| **運用負荷** | コンテナ管理必要 | ほぼゼロ |
| **コールドスタート** | なし | あり (Container ~1-2秒) |
| **実行時間制限** | なし | 15分 |
| **VPC** | 必要 | オプション |
| **適用シーン** | 常時稼働、長時間処理 | バースト、イベント駆動 |

**研究・プロトタイプには Lambda (サーバレス) が最適**
