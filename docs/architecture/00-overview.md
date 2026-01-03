# 🏗️ rd-bedrock-nova アーキテクチャ設計書

## 設計プロセス

```
RDRA → DDD → Event Storming
         ↓
Clean Architecture + Event Sourcing + CQRS
         ↓
FSD + Atomic Design (Frontend)
         ↓
TDD + 12 Agent Factor (Microservices)
```

## アーキテクチャ原則

### 12 Agent Factor（AI Agent版12 Factor App）

| Factor | 説明 | 実装 |
|--------|------|------|
| 1. Codebase | 単一コードベース、複数デプロイ | Monorepo構成 |
| 2. Dependencies | 明示的な依存関係宣言 | package.json, requirements.txt |
| 3. Config | 環境変数による設定 | .env, AWS Secrets Manager |
| 4. Backing Services | 外部サービスとしてアタッチ | DynamoDB, S3, Bedrock |
| 5. Build, Release, Run | ステージ分離 | CI/CD Pipeline |
| 6. Processes | ステートレスプロセス | Lambda Functions |
| 7. Port Binding | ポートバインドによるサービス公開 | AppSync, API Gateway |
| 8. Concurrency | プロセスモデルによるスケールアウト | Lambda Auto Scaling |
| 9. Disposability | 高速起動・グレースフルシャットダウン | Lambda Cold Start最適化 |
| 10. Dev/Prod Parity | 開発/本番環境の一致 | Amplify Sandbox/Production |
| 11. Logs | イベントストリームとしてのログ | CloudWatch Logs |
| 12. Admin Processes | 管理タスクの一時プロセス化 | Lambda One-off Tasks |

### Agent固有Factor

| Factor | 説明 | 実装 |
|--------|------|------|
| 13. Observability | AgentCore_Observability必須 | X-Ray, CloudTrail |
| 14. Memory | セッション・長期記憶の分離 | AgentCore_Memory + S3 Vectors |
| 15. Tool Orchestration | ツール呼び出しの管理 | Strands Agents SDK |
| 16. Guardrails | 安全性・コンプライアンス | Bedrock Guardrails |

## ディレクトリ構造

```
rd-bedrock-nova/
├── docs/                          # 設計ドキュメント
│   ├── architecture/              # アーキテクチャ設計
│   │   ├── 00-overview.md
│   │   ├── 01-rdra-requirements.md
│   │   ├── 02-ddd-domain-model.md
│   │   ├── 03-event-storming.md
│   │   ├── 04-clean-architecture.md
│   │   ├── 05-event-sourcing-cqrs.md
│   │   └── 06-12-agent-factors.md
│   └── api/                       # API仕様
│
├── packages/                      # マイクロサービス（Monorepo）
│   ├── domain/                    # ドメイン層
│   │   ├── chat/                  # Chat境界づけられたコンテキスト
│   │   ├── agent/                 # Agent境界づけられたコンテキスト
│   │   └── shared/                # 共有カーネル
│   │
│   ├── application/               # アプリケーション層
│   │   ├── commands/              # コマンドハンドラ（Write側）
│   │   ├── queries/               # クエリハンドラ（Read側）
│   │   └── events/                # イベントハンドラ
│   │
│   ├── infrastructure/            # インフラストラクチャ層
│   │   ├── persistence/           # リポジトリ実装
│   │   │   ├── event-store/       # イベントストア（DynamoDB）
│   │   │   └── read-model/        # 読み取りモデル
│   │   ├── bedrock/               # Bedrock Gateway
│   │   ├── s3-vectors/            # S3 Vectors Gateway
│   │   └── messaging/             # メッセージング
│   │
│   └── interfaces/                # インターフェース層
│       ├── appsync/               # AppSync Resolvers
│       └── lambda/                # Lambda Handlers
│
├── frontend/                      # フロントエンド（FSD + Atomic）
│   ├── src/
│   │   ├── app/                   # Next.js App Router
│   │   ├── pages/                 # FSD: Pages
│   │   ├── widgets/               # FSD: Widgets
│   │   ├── features/              # FSD: Features
│   │   ├── entities/              # FSD: Entities
│   │   ├── shared/                # FSD: Shared
│   │   │   └── ui/                # Atomic Design Components
│   │   │       ├── atoms/
│   │   │       ├── molecules/
│   │   │       ├── organisms/
│   │   │       └── templates/
│   │   └── amplify/               # Amplify統合（Frontend専用）
│   │       ├── config.ts          # Amplify設定
│   │       ├── auth.ts            # 認証フック
│   │       ├── api.ts             # GraphQL API
│   │       └── storage.ts         # S3 Storage
│   └── ...
│
├── tests/                         # TDDテスト
│   ├── unit/                      # ユニットテスト
│   ├── integration/               # 統合テスト
│   └── e2e/                       # E2Eテスト（Playwright）
│
└── infra/                         # IaC
    └── cdk/                       # AWS CDK
```

## 技術スタック

| レイヤー | 技術 |
|----------|------|
| Domain | TypeScript, Zod |
| Application | TypeScript, Event Sourcing |
| Infrastructure | AWS DynamoDB, S3 Vectors, Bedrock |
| Interface | AppSync, Lambda |
| Frontend | Next.js, React, Tailwind CSS |
| Testing | Vitest, Playwright |
| IaC | AWS CDK |
