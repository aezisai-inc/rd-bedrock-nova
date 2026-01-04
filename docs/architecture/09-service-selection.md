# サービス選定ドキュメント

## 概要

rd-bedrock-nova プロジェクトにおけるAWSサービス選定の根拠と、各レイヤーでの技術選定理由を記載する。

## アーキテクチャ原則

### 設計アプローチ
- **RDRA + DDD + Event Storming**: 要件分析・ドメインモデリング
- **Clean Architecture + Event Sourcing + CQRS**: バックエンド設計
- **FSD + Atomic Design**: フロントエンドUI設計
- **TDD + Test Pyramid**: 品質保証
- **12 Factor App + 12 Agent Factor**: マイクロサービス/エージェント設計

### レイヤー構成
```
┌─────────────────────────────────────────────────────────────┐
│                    frontend/                                │
│  Next.js + Tailwind CSS + FSD + Atomic Design               │
├─────────────────────────────────────────────────────────────┤
│                    backend/                                 │
│  NestJS/FastAPI (Clean Architecture 4層)                    │
├─────────────────────────────────────────────────────────────┤
│                    agents/                                  │
│  strands-agents + bedrock-agentcore (Application/Platform)  │
├─────────────────────────────────────────────────────────────┤
│                    infra/                                   │
│  AWS CDK + Amplify Gen2 + Docker                            │
└─────────────────────────────────────────────────────────────┘
```

---

## AI/MLサービス選定

### 1. テキスト生成 (LLM)

| サービス | 選定 | 理由 |
|---------|------|------|
| **Amazon Bedrock (Claude 3.5 Sonnet)** | ✅ 採用 | 高品質日本語対応、推論速度、コスト効率 |
| **Amazon Bedrock (Nova Pro)** | ✅ 採用 | AWS最適化、低コスト |
| OpenAI API | ❌ 非採用 | 外部依存、データ規約の制約 |
| Azure OpenAI | ❌ 非採用 | マルチクラウド複雑化 |

**選定理由**:
- Bedrock統一でガバナンス・監視が容易
- Converse API統一でモデル切替が容易
- VPC PrivateLinkでデータセキュリティ確保

### 2. 画像生成

| サービス | 選定 | 理由 |
|---------|------|------|
| **Amazon Nova Canvas** | ✅ 採用 | Bedrock統合、AWS最適化 |
| Stable Diffusion (Bedrock) | ⚠️ 予備 | 特定スタイル要件時 |
| DALL-E 3 | ❌ 非採用 | 外部API依存 |

### 3. 動画生成

| サービス | 選定 | 理由 |
|---------|------|------|
| **Amazon Nova Reel** | ✅ 採用 | Bedrock統合、AWS統合 |
| Runway Gen-3 | ❌ 非採用 | 外部依存 |

### 4. 音声認識/合成

| サービス | 選定 | 理由 |
|---------|------|------|
| **Amazon Nova Sonic** | ✅ 採用 | Bedrock統合、リアルタイム対話 |
| Amazon Transcribe | ⚠️ 予備 | バッチ処理時 |
| Amazon Polly | ⚠️ 予備 | 高品質TTS要件時 |

---

## メモリ・ストレージ選定

### フェーズ戦略

```
Phase 1 (MVP): ~$20/月
└── AgentCore Memory のみ

Phase 2 (ドキュメント検索): ~$70/月
└── + Bedrock Knowledge Base with S3 Vectors

Phase 3 (知識グラフ): ~$120/月
└── + Amazon Neptune (or Neo4j on EC2)
```

### メモリサービス比較

| サービス | 月額コスト | ユースケース | 選定 |
|---------|-----------|-------------|------|
| **AgentCore Memory** | ~$20 | セッション/長期記憶 | ✅ Phase 1 |
| **Bedrock KB + S3 Vectors** | ~$50 | ベクトル検索 | ✅ Phase 2 |
| **Amazon Neptune** | ~$100 | 知識グラフ | ✅ Phase 3 |
| OpenSearch Serverless | ~$100+ | ハイブリッド検索 | ❌ 非採用 |

**OpenSearch Serverless非採用理由**:
- 最低月額$100以上（2 OCU固定費用）
- 100万件超のハイブリッド検索要件がない限り過剰投資
- S3 VectorsやNeptuneで代替可能

### ストレージ選定

| サービス | ユースケース | 選定 |
|---------|-------------|------|
| **Amazon S3** | メディアファイル、ドキュメント | ✅ |
| **DynamoDB** | セッション、メタデータ | ✅ |
| **Neptune** | 知識グラフ（Phase 3） | ✅ |

---

## エージェントフレームワーク選定

### 3層アーキテクチャ

```
┌────────────────────────────────────────┐
│    Application Layer                    │
│    strands-agents                       │
│    - Agent定義                          │
│    - @tool デコレータ                   │
│    - マルチエージェント協調              │
├────────────────────────────────────────┤
│    Platform Layer                       │
│    bedrock-agentcore                    │
│    - Runtime (実行環境)                 │
│    - Memory (記憶管理)                  │
│    - Gateway (API公開)                  │
│    - Identity (認証)                    │
│    - Observability (監視)               │
├────────────────────────────────────────┤
│    Model Layer                          │
│    bedrock-runtime                      │
│    - Converse API                       │
│    - InvokeModel API                    │
└────────────────────────────────────────┘
```

### フレームワーク比較

| フレームワーク | 選定 | 理由 |
|--------------|------|------|
| **strands-agents** | ✅ 必須 | AWS公式、Bedrock最適化 |
| **bedrock-agentcore** | ✅ 必須 | プラットフォーム層統合 |
| LangChain | ⚠️ 限定使用 | 特定パターンのみ（明示的グラフワークフロー等） |
| LangGraph | ⚠️ 限定使用 | strandsに存在しないワークフロー用 |
| CrewAI | ❌ 非採用 | strands-agentsで代替可能 |

---

## インフラストラクチャ選定

### IaC (Infrastructure as Code)

| ツール | 選定 | 理由 |
|-------|------|------|
| **AWS CDK** | ✅ 採用 | TypeScript統一、Amplify Gen2連携 |
| **Amplify Gen2** | ✅ 採用 | AppSync/Lambda統合、SSR対応 |
| Terraform | ❌ 非採用 | CDK優先で複雑化回避 |
| CloudFormation | ⚠️ CDK経由 | 直接使用は非推奨 |

### CI/CD

| サービス | 選定 | 理由 |
|---------|------|------|
| **CodeBuild** | ✅ 採用 | agentcore launch統合 |
| **Amplify Hosting** | ✅ 採用 | フロントエンドデプロイ |
| GitHub Actions | ⚠️ 補助 | lint/test用 |

### 監視・Observability

| サービス | 選定 | 理由 |
|---------|------|------|
| **AgentCore Observability** | ✅ 採用 | OpenTelemetry→CloudWatch |
| **CloudWatch Logs/Metrics** | ✅ 採用 | AWS統合 |
| **CloudTrail** | ✅ 採用 | InvokeAgentRuntime追跡 |
| X-Ray | ⚠️ 補助 | 分散トレーシング必要時 |

---

## 禁止事項

### コード実装禁止

```python
# ❌ 禁止: boto3直接リソース作成
boto3.client('dynamodb').create_table(...)
boto3.client('s3').create_bucket(...)

# ❌ 禁止: AWS CLI直接実行
aws dynamodb create-table ...

# ❌ 禁止: シェルスクリプト処理
subprocess.run(['aws', ...])
```

### 理由
- トレーサビリティがない
- コードレビュー不可
- リソース削除漏れリスク

### 代替手段
- **CDK**: インフラリソースはすべてCDKで定義
- **agentcore dev**: ローカル開発
- **agentcore launch**: 本番デプロイ

---

## リージョン設定

| 用途 | リージョン | 理由 |
|-----|----------|------|
| デフォルト | **ap-northeast-1** | 東京リージョン、低レイテンシ |
| Bedrock | ap-northeast-1 | Nova/Claude利用可能 |
| DR/バックアップ | ap-northeast-3 | 大阪リージョン |

---

## コスト試算

### 月額概算（開発環境）

| カテゴリ | サービス | 月額 |
|---------|---------|------|
| AI/ML | Bedrock (Claude/Nova) | ~$50 |
| Memory | AgentCore Memory | ~$20 |
| Storage | S3 + DynamoDB | ~$10 |
| Compute | Lambda + AppSync | ~$20 |
| **合計** | | **~$100/月** |

### 月額概算（本番環境 Phase 3）

| カテゴリ | サービス | 月額 |
|---------|---------|------|
| AI/ML | Bedrock | ~$200 |
| Memory | AgentCore + KB + Neptune | ~$170 |
| Storage | S3 + DynamoDB | ~$50 |
| Compute | Lambda + AppSync | ~$80 |
| **合計** | | **~$500/月** |

---

## 参照ドキュメント

- [AWS Bedrock Developer Guide](https://docs.aws.amazon.com/bedrock/)
- [strands-agents SDK](https://github.com/strands-agents/sdk-python)
- [AgentCore Documentation](https://docs.aws.amazon.com/bedrock/agentcore/)
- [Amplify Gen2 Documentation](https://docs.amplify.aws/gen2/)
