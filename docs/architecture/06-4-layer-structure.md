# 4層分離アーキテクチャ

## 概要

言語・責務・デプロイ単位で明確に分離された4層構造

```
rd-bedrock-nova/
├── frontend/      # 1. フロントエンド (Next.js + FSD + Atomic)
├── backend/       # 2. バックエンド (Clean Architecture)
├── agents/        # 3. エージェント (Strands + Bedrock)
└── infra/         # 4. インフラ (Amplify + CDK)
```

## 1. Frontend層 (`frontend/`)

**責務**: ユーザーインターフェース

**技術**: Next.js 14 + TypeScript + Tailwind CSS

**設計パターン**: FSD + Atomic Design + 依存性逆転

```
frontend/
├── src/
│   ├── app/                 # Next.js App Router
│   ├── features/            # FSD Feature Slices
│   │   └── chat/
│   │       ├── model/       # ビジネスロジック
│   │       └── ui/          # UIコンポーネント
│   ├── shared/
│   │   ├── api/             # Port (インターフェース)
│   │   │   └── ports/       # AuthPort, ApiPort, StoragePort
│   │   ├── infrastructure/  # Adapter (Amplify実装)
│   │   │   ├── auth/
│   │   │   ├── api/
│   │   │   └── storage/
│   │   └── ui/              # Atomic Design
│   │       ├── atoms/
│   │       └── molecules/
│   └── entities/
└── package.json
```

## 2. Backend層 (`backend/`)

**責務**: ビジネスロジック（外部依存なし）

**技術**: TypeScript (Pure)

**設計パターン**: Clean Architecture + Event Sourcing + CQRS

```
backend/
├── domain/                  # Enterprise Business Rules
│   ├── shared/             # 基底クラス
│   │   ├── aggregate-root.ts
│   │   ├── entity.ts
│   │   ├── value-object.ts
│   │   └── domain-event.ts
│   └── chat/               # Chat Bounded Context
│       ├── aggregates/     # ChatSession
│       ├── events/         # SessionCreated, MessageAdded
│       └── value-objects/  # SessionId, MessageContent
├── application/             # Application Business Rules
│   ├── commands/           # CQRS Write (StartSession, SendMessage)
│   └── queries/            # CQRS Read (GetSession, ListSessions)
├── infrastructure/          # External Adapters
│   ├── event-store/        # DynamoDB EventStore
│   └── projectors/         # Read Model Projector
└── package.json
```

## 3. Agents層 (`agents/`)

**責務**: AI Agent ロジック

**技術**: TypeScript + Strands Agents SDK + Bedrock API

**設計パターン**: 12 Agent Factor

```
agents/
├── strands/                 # Strands Agent統合
│   └── index.ts            # AgentService (Bedrock Converse)
├── chat/                    # Chat Service Facade
│   └── index.ts            # ChatService (CQRS統合)
├── file/                    # File Service
│   └── index.ts            # FileService (S3 Presigned)
├── bedrock/                 # Bedrock モデル設定
│   └── models.ts           # Nova Micro/Lite/Pro設定
└── tools/                   # Agent Tools
    ├── search.ts           # 検索ツール
    └── calculator.ts       # 計算ツール
```

## 4. Infra層 (`infra/`)

**責務**: インフラ定義・デプロイ

**技術**: Amplify Gen2 + AWS CDK (Python)

```
infra/
├── amplify/                 # Amplify Gen2
│   ├── auth/               # Cognito設定
│   │   └── resource.ts
│   ├── data/               # AppSync GraphQL
│   │   └── resource.ts
│   ├── storage/            # S3設定
│   │   └── resource.ts
│   ├── functions/          # Lambda統合
│   │   └── agent/          # agents/を呼び出し
│   └── backend.ts          # エントリポイント
├── cdk/                     # AWS CDK (Python)
│   └── ...                 # 追加リソース用
└── stacks/                  # CDK Stacks
    ├── compute_stack.py
    ├── data_stack.py
    └── api_stack.py
```

## 依存関係

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend                              │
│                    (Next.js + FSD)                          │
│                           │                                  │
│                           ↓ HTTP/GraphQL                     │
├─────────────────────────────────────────────────────────────┤
│                         Infra                                │
│                  (Amplify + API Gateway)                     │
│                           │                                  │
│                           ↓ Lambda Invoke                    │
├─────────────────────────────────────────────────────────────┤
│                        Agents                                │
│                (Strands + Bedrock + Tools)                   │
│                           │                                  │
│                           ↓ Import                           │
├─────────────────────────────────────────────────────────────┤
│                        Backend                               │
│              (Domain + Application + Infra)                  │
│                                                              │
│   Domain ← Application ← Infrastructure                      │
│   (外部依存なし)  (CQRS)    (DynamoDB/S3)                    │
└─────────────────────────────────────────────────────────────┘
```

## ビルド順序

```bash
# 1. Backend (依存なし)
npm run build -w backend

# 2. Agents (Backend依存)
npm run build -w agents

# 3. Frontend (独立)
npm run build -w frontend

# 4. Infra Deploy (全依存)
cd infra/amplify && npx ampx deploy
```

## テスト戦略

| 層 | テスト種別 | ツール |
|---|---|---|
| Backend | Unit Test | Vitest |
| Backend | Integration Test | Vitest + DynamoDB Local |
| Agents | Unit Test | Vitest + Mock Bedrock |
| Frontend | Component Test | Vitest + Testing Library |
| Frontend | E2E Test | Playwright |

## 12 Agent Factor マッピング

| Factor | 実装場所 |
|---|---|
| #1 Codebase | Git monorepo + workspaces |
| #2 Dependencies | 各層のpackage.json |
| #3 Config | 環境変数 + Amplify outputs |
| #4 Backing services | infra/ で定義 |
| #5 Build/Release/Run | npm workspaces + Amplify |
| #6 Processes | Lambda (ステートレス) |
| #7 Port binding | API Gateway + AppSync |
| #8 Concurrency | Lambda並行実行 |
| #9 Disposability | Lambda高速起動 |
| #10 Dev/prod parity | Amplify sandbox |
| #11 Logs | CloudWatch + AgentCore |
| #12 Admin processes | Amplify CLI |
