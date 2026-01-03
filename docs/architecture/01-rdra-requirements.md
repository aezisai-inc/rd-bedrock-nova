# 📋 RDRA 要件分析

## 1. システムコンテキスト

### 1.1 システム境界

```
┌─────────────────────────────────────────────────────────────┐
│                    Nova AI Platform                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │   Chat      │  │   Agent     │  │   File Processing   │ │
│  │   Service   │  │   Service   │  │   Service           │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
         ↑                  ↑                    ↑
    ┌────┴────┐        ┌───┴────┐          ┌────┴────┐
    │  User   │        │ Bedrock │          │   S3    │
    │(Browser)│        │  Nova   │          │ Storage │
    └─────────┘        └─────────┘          └─────────┘
```

### 1.2 アクター

| アクター | 説明 | 主要ユースケース |
|----------|------|------------------|
| User | システム利用者 | チャット、ファイルアップロード |
| Agent | AIエージェント | メッセージ処理、ツール実行 |
| System | バックグラウンド処理 | イベント投影、通知 |

## 2. 業務フロー

### 2.1 チャット業務フロー

```
[User]
   │
   ├─① メッセージ送信
   │     │
   │     ▼
   │  [Chat Service]
   │     │
   │     ├─② セッション検証
   │     │     │
   │     │     ▼
   │     │  [Session Repository]
   │     │
   │     ├─③ メッセージ永続化
   │     │     │
   │     │     ▼
   │     │  [Event Store]
   │     │     │
   │     │     └─ MessageSentEvent
   │     │
   │     └─④ Agent呼び出し
   │           │
   │           ▼
   │        [Agent Service]
   │           │
   │           ├─⑤ Tool Orchestration
   │           │     │
   │           │     ▼
   │           │  [Bedrock Nova Pro]
   │           │
   │           └─⑥ レスポンス生成
   │                 │
   │                 ▼
   │              [Event Store]
   │                 │
   │                 └─ AgentRespondedEvent
   │
   └─⑦ ストリーミング応答受信
```

### 2.2 ファイル処理業務フロー

```
[User]
   │
   ├─① Presigned URL取得
   │     │
   │     ▼
   │  [Upload Service]
   │     │
   │     └─ GetUploadUrlQuery
   │
   ├─② S3へ直接アップロード
   │     │
   │     ▼
   │  [S3 Storage]
   │
   └─③ ファイル分析リクエスト
         │
         ▼
      [Agent Service]
         │
         ├─ Nova Omni (画像)
         ├─ Nova Sonic (音声)
         └─ Nova Embeddings (ベクトル化)
```

## 3. ユースケース

### 3.1 Chat ドメイン

| UC-ID | ユースケース | アクター | 事前条件 | 事後条件 |
|-------|-------------|----------|----------|----------|
| UC-C01 | セッション作成 | User | 認証済み | セッションが作成される |
| UC-C02 | メッセージ送信 | User | セッション存在 | メッセージが保存される |
| UC-C03 | 履歴取得 | User | セッション存在 | メッセージ一覧が返る |
| UC-C04 | セッション削除 | User | セッション所有者 | セッションがアーカイブされる |

### 3.2 Agent ドメイン

| UC-ID | ユースケース | アクター | 事前条件 | 事後条件 |
|-------|-------------|----------|----------|----------|
| UC-A01 | Agent呼び出し | System | メッセージ存在 | Agent応答が生成される |
| UC-A02 | ツール実行 | Agent | ツール定義存在 | ツール結果が返る |
| UC-A03 | 画像分析 | Agent | 画像ファイル存在 | 分析結果が返る |
| UC-A04 | 音声文字起こし | Agent | 音声ファイル存在 | テキストが返る |

### 3.3 File ドメイン

| UC-ID | ユースケース | アクター | 事前条件 | 事後条件 |
|-------|-------------|----------|----------|----------|
| UC-F01 | アップロードURL取得 | User | 認証済み | Presigned URLが返る |
| UC-F02 | ファイル一覧取得 | User | セッション存在 | ファイル一覧が返る |
| UC-F03 | ファイル削除 | User | ファイル所有者 | ファイルが削除される |

## 4. 情報モデル

### 4.1 主要エンティティ

```
┌─────────────────┐      ┌─────────────────┐
│   ChatSession   │ 1──* │  ChatMessage    │
├─────────────────┤      ├─────────────────┤
│ id: UUID        │      │ id: UUID        │
│ userId: String  │      │ sessionId: UUID │
│ title: String   │      │ role: Role      │
│ status: Status  │      │ content: String │
│ createdAt: Date │      │ timestamp: Date │
└─────────────────┘      │ metadata: JSON  │
                         └─────────────────┘
                                  │
                                  │ 0..* files
                                  ▼
                         ┌─────────────────┐
                         │  UploadedFile   │
                         ├─────────────────┤
                         │ id: UUID        │
                         │ sessionId: UUID │
                         │ fileName: String│
                         │ fileType: String│
                         │ s3Key: String   │
                         │ size: Number    │
                         └─────────────────┘
```

### 4.2 値オブジェクト

| 値オブジェクト | 属性 | 制約 |
|---------------|------|------|
| SessionId | value: UUID | 不変、一意 |
| MessageContent | text: String | 最大100KB |
| FileMetadata | type, size, checksum | 不変 |
| AgentResponse | content, toolCalls, usage | 不変 |

## 5. 非機能要件

### 5.1 性能要件

| 項目 | 要件 |
|------|------|
| レスポンス時間 | 初回トークン < 2秒 |
| スループット | 100 req/sec |
| 同時セッション | 1000セッション |

### 5.2 セキュリティ要件

| 項目 | 要件 |
|------|------|
| 認証 | Cognito User Pool |
| 認可 | Owner-based Access |
| 暗号化 | At-rest, In-transit |
| 監査 | CloudTrail, AgentCore Observability |

### 5.3 可用性要件

| 項目 | 要件 |
|------|------|
| 稼働率 | 99.9% |
| RTO | 1時間 |
| RPO | 15分 |
