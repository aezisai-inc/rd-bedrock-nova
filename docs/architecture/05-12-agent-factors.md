# 🤖 12 Agent Factors マイクロサービス設計

## 概要

12 Factor App をAIエージェント開発に拡張した「12 Agent Factors」に基づいた設計。

## 1. 基本12 Factor

### I. Codebase - 単一コードベース、複数デプロイ

```
rd-bedrock-nova/
├── packages/              # 共有パッケージ（Monorepo）
│   ├── domain/            # ドメイン層
│   ├── application/       # アプリケーション層
│   ├── infrastructure/    # インフラ層
│   └── interfaces/        # インターフェース層
├── frontend/              # フロントエンドアプリ
├── infra/                 # IaC（CDK）
└── tests/                 # テスト
```

**実装**: Yarn Workspaces / npm Workspaces

### II. Dependencies - 明示的な依存関係宣言

```json
// packages/domain/package.json
{
  "name": "@rd-bedrock-nova/domain",
  "version": "1.0.0",
  "dependencies": {
    "zod": "^3.23.0"    // スキーマ検証
  },
  "peerDependencies": {}  // 外部依存なし
}
```

**原則**: ドメイン層は外部依存ゼロ（Pure TypeScript）

### III. Config - 環境変数による設定

```typescript
// packages/infrastructure/config/environment.ts
export const config = {
  // AWS
  awsRegion: process.env.AWS_REGION || 'ap-northeast-1',
  
  // Bedrock
  bedrockRegion: process.env.BEDROCK_REGION || 'ap-northeast-1',
  bedrockModel: process.env.BEDROCK_MODEL || 'amazon.nova-pro-v1:0',
  
  // DynamoDB
  eventStoreTable: process.env.EVENT_STORE_TABLE || 'nova-event-store',
  readModelTable: process.env.READ_MODEL_TABLE || 'nova-read-model',
  
  // S3
  storageBucket: process.env.STORAGE_BUCKET || '',
  
  // Feature Flags
  enableStreaming: process.env.ENABLE_STREAMING === 'true',
};
```

### IV. Backing Services - 外部サービスとしてアタッチ

```yaml
# 接続設定は環境変数で注入
services:
  dynamodb:
    type: "aws:dynamodb"
    config: ${EVENT_STORE_TABLE}
    
  s3:
    type: "aws:s3"
    config: ${STORAGE_BUCKET}
    
  bedrock:
    type: "aws:bedrock"
    region: ${BEDROCK_REGION}
```

### V. Build, Release, Run - ステージ分離

```yaml
# CI/CD Pipeline
stages:
  build:
    - npm ci
    - npm run build
    - npm run test
    
  release:
    - cdk synth
    - create deployment artifact
    
  run:
    - cdk deploy
    - health check
```

### VI. Processes - ステートレスプロセス

```typescript
// Lambda Handler - ステートレス設計
export const handler = async (event: AppSyncEvent): Promise<unknown> => {
  // 1. イベントからコンテキスト取得
  const context = extractContext(event);
  
  // 2. DIコンテナからサービス取得
  const service = container.resolve(ChatService);
  
  // 3. 処理実行（状態は外部ストアに保存）
  return service.handle(context);
};
```

### VII. Port Binding - ポートバインドによるサービス公開

```graphql
# AppSync Schema - ポートとしてのGraphQL API
type Mutation {
  invokeAgent(sessionId: String!, message: String!, fileKeys: [String]): String
}

type Query {
  getUploadUrl(fileName: String!, fileType: String!): GetUploadUrlResult
}
```

### VIII. Concurrency - プロセスモデルによるスケールアウト

```typescript
// Lambda設定
const agentFunction = new NodejsFunction(this, 'AgentHandler', {
  // 同時実行数制限
  reservedConcurrentExecutions: 100,
  
  // プロビジョニング済み同時実行
  provisionedConcurrentExecutions: 10,
  
  // メモリ・タイムアウト
  memorySize: 1024,
  timeout: Duration.minutes(5),
});
```

### IX. Disposability - 高速起動・グレースフルシャットダウン

```typescript
// Lambda最適化
const handler = async (event: unknown) => {
  // Cold Start最適化: 初期化を最小限に
  const service = await getService(); // Lazy initialization
  
  try {
    return await service.process(event);
  } finally {
    // Graceful shutdown: リソースクリーンアップ
    await service.cleanup();
  }
};
```

### X. Dev/Prod Parity - 開発/本番環境の一致

```typescript
// 環境による差異は設定のみ
const config = {
  sandbox: {
    eventStoreTable: 'nova-sandbox-events',
    logLevel: 'DEBUG',
  },
  production: {
    eventStoreTable: 'nova-prod-events',
    logLevel: 'INFO',
  },
}[process.env.STAGE || 'sandbox'];
```

### XI. Logs - イベントストリームとしてのログ

```typescript
// 構造化ログ
import { Logger } from '@aws-lambda-powertools/logger';

const logger = new Logger({
  serviceName: 'nova-agent',
  logLevel: process.env.LOG_LEVEL || 'INFO',
});

logger.info('Agent invoked', {
  sessionId,
  messageLength: message.length,
  fileCount: fileKeys.length,
});
```

### XII. Admin Processes - 管理タスクの一時プロセス化

```typescript
// マイグレーション Lambda
export const migrationHandler = async () => {
  // イベントストア マイグレーション
  await migrateEventStore();
  
  // 読み取りモデル 再構築
  await rebuildReadModel();
};
```

## 2. Agent 固有 Factor

### XIII. Observability - AgentCore_Observability

```typescript
// Strands Agents SDK + X-Ray + CloudTrail
import { Agent } from '@aws/strands-agents';
import { tracer } from '@aws-lambda-powertools/tracer';

const agent = new Agent({
  model: 'amazon.nova-pro-v1:0',
  observability: {
    tracing: true,        // X-Ray トレーシング
    metrics: true,        // CloudWatch メトリクス
    audit: true,          // CloudTrail 監査
  },
});

// カスタムトレースセグメント
tracer.putAnnotation('sessionId', sessionId);
tracer.putMetadata('input', { message, fileCount: fileKeys.length });
```

### XIV. Memory - AgentCore_Memory + S3 Vectors

```typescript
// メモリアーキテクチャ
interface MemoryArchitecture {
  // 短期記憶: セッション内コンテキスト
  shortTerm: {
    provider: 'DynamoDB';
    ttl: '24h';
    scope: 'session';
  };
  
  // 長期記憶: ベクトル埋め込み
  longTerm: {
    provider: 'S3Vectors';  // OpenSearchは不使用（コスト最適化）
    indexType: 'HNSW';
    dimensions: 1024;
  };
}
```

```typescript
// S3 Vectors 実装
import { S3VectorsClient } from '@aws/s3-vectors';

const vectorStore = new S3VectorsClient({
  bucket: process.env.VECTOR_BUCKET,
  region: 'ap-northeast-1',
});

// ベクトル検索
const results = await vectorStore.query({
  vector: embedding,
  topK: 10,
  filter: { sessionId },
});
```

### XV. Tool Orchestration - ツール管理

```typescript
// ツール定義（Strands Agents SDK）
const tools = [
  {
    name: 'analyze_image',
    description: '画像を分析します',
    inputSchema: {
      type: 'object',
      properties: {
        s3Key: { type: 'string', description: 'S3上の画像キー' },
        analysisType: { 
          type: 'string', 
          enum: ['caption', 'objects', 'text', 'all'] 
        },
      },
      required: ['s3Key'],
    },
    handler: async (input) => {
      // Nova Pro マルチモーダル呼び出し
      return bedrockGateway.analyzeImage(input);
    },
  },
  // ... 他のツール
];

// ツールオーケストレーション
const agent = new Agent({
  model: 'amazon.nova-pro-v1:0',
  tools,
  maxIterations: 10,
});
```

### XVI. Guardrails - 安全性・コンプライアンス

```typescript
// Bedrock Guardrails 統合
const guardrailConfig = {
  guardrailId: process.env.GUARDRAIL_ID,
  guardrailVersion: process.env.GUARDRAIL_VERSION || 'DRAFT',
  
  // コンテンツフィルタリング
  contentPolicy: {
    filtersConfig: [
      { type: 'HATE', strength: 'HIGH' },
      { type: 'VIOLENCE', strength: 'HIGH' },
      { type: 'SEXUAL', strength: 'HIGH' },
      { type: 'INSULTS', strength: 'MEDIUM' },
    ],
  },
  
  // トピック制限
  topicPolicy: {
    topicsConfig: [
      { name: 'Financial Advice', type: 'DENY' },
      { name: 'Medical Advice', type: 'DENY' },
    ],
  },
};
```

## 3. マイクロサービス境界

```
┌─────────────────────────────────────────────────────────────────────┐
│                        API Gateway (AppSync)                         │
└─────────────────────────┬───────────────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
        ▼                 ▼                 ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│  Chat Service │ │ Agent Service │ │  File Service │
│               │ │               │ │               │
│ • Session     │ │ • Invocation  │ │ • Upload      │
│ • Message     │ │ • Tool Call   │ │ • Processing  │
│ • History     │ │ • Response    │ │ • Metadata    │
└───────┬───────┘ └───────┬───────┘ └───────┬───────┘
        │                 │                 │
        ▼                 ▼                 ▼
┌───────────────────────────────────────────────────────────────────┐
│                       Event Bus (EventBridge)                      │
└───────────────────────────────────────────────────────────────────┘
        │                 │                 │
        ▼                 ▼                 ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│  Event Store  │ │   Bedrock     │ │   S3 Storage  │
│  (DynamoDB)   │ │   Nova Pro    │ │   + Vectors   │
└───────────────┘ └───────────────┘ └───────────────┘
```

## 4. デプロイメントアーキテクチャ

```yaml
# CDK Stack 構成
stacks:
  - name: SharedStack
    resources:
      - EventStore (DynamoDB)
      - ReadModel (DynamoDB)
      - VectorBucket (S3)
      - EventBus (EventBridge)
      
  - name: ChatServiceStack
    resources:
      - ChatFunction (Lambda)
      - ChatAPI (AppSync)
      
  - name: AgentServiceStack
    resources:
      - AgentFunction (Lambda)
      - BedrockPermissions (IAM)
      
  - name: FileServiceStack
    resources:
      - FileFunction (Lambda)
      - StorageBucket (S3)
```
