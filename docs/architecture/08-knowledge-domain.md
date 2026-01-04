# Knowledge Domain - RDRA + DDD + Event Storming

## 1. システムコンテキスト（RDRA）

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Knowledge System Context                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────┐                            ┌─────────────────────────┐ │
│  │    User     │ ──── Query/Ingest ────────▶│   Knowledge Service     │ │
│  │  (Actor)    │ ◀──── Results ─────────────│                         │ │
│  └─────────────┘                            │  ┌───────────────────┐  │ │
│                                             │  │ Bedrock KB        │  │ │
│                                             │  │ (RAG Engine)      │  │ │
│                                             │  └───────────────────┘  │ │
│                                             │  ┌───────────────────┐  │ │
│                                             │  │ S3 Vectors        │  │ │
│                                             │  │ (Vector Store)    │  │ │
│                                             │  └───────────────────┘  │ │
│                                             │  ┌───────────────────┐  │ │
│                                             │  │ S3 Bucket         │  │ │
│                                             │  │ (Document Store)  │  │ │
│                                             │  └───────────────────┘  │ │
│                                             └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

## 2. 業務フロー

### 2.1 ドキュメント取り込みフロー

```
┌────────────┐     ┌────────────┐     ┌────────────┐     ┌────────────┐
│   Upload   │────▶│  Validate  │────▶│   Ingest   │────▶│   Index    │
│  Document  │     │   Format   │     │  to KB     │     │  Vectors   │
└────────────┘     └────────────┘     └────────────┘     └────────────┘
```

### 2.2 ナレッジ検索フロー

```
┌────────────┐     ┌────────────┐     ┌────────────┐     ┌────────────┐
│   Input    │────▶│  Embed     │────▶│  Search    │────▶│  Rerank &  │
│   Query    │     │   Query    │     │  Vectors   │     │  Return    │
└────────────┘     └────────────┘     └────────────┘     └────────────┘
```

## 3. ユースケース

| ID | ユースケース | アクター | 説明 |
|----|-------------|---------|------|
| UC-K01 | ドキュメント検索 | User | 自然言語クエリでドキュメントを検索 |
| UC-K02 | ドキュメント取り込み | Admin | PDF/テキストをKBに取り込み |
| UC-K03 | RAG応答生成 | User | 検索結果を基にLLMで応答生成 |
| UC-K04 | メタデータフィルター | User | ソース種別・日付でフィルター |

## 4. 情報モデル（DDD エンティティ）

### 4.1 集約ルート

```typescript
// KnowledgeSession - 検索セッションを管理
interface KnowledgeSession {
  id: KnowledgeSessionId;        // 値オブジェクト
  userId: UserId;
  queries: Query[];              // エンティティリスト
  createdAt: Date;
  status: SessionStatus;
}

// Document - 取り込みドキュメント
interface Document {
  id: DocumentId;                // 値オブジェクト
  sourceUri: S3Uri;
  metadata: DocumentMetadata;
  status: DocumentStatus;
  ingestedAt: Date;
}
```

### 4.2 値オブジェクト

```typescript
interface KnowledgeSessionId {
  value: string;  // UUID
}

interface DocumentId {
  value: string;  // UUID
}

interface SearchResult {
  documentId: DocumentId;
  score: number;           // 0.0 - 1.0
  excerpt: string;         // 抜粋テキスト
  metadata: ResultMetadata;
}

interface Query {
  id: QueryId;
  text: string;
  filters?: SearchFilters;
  results: SearchResult[];
  executedAt: Date;
}
```

## 5. イベントストーミング

### 5.1 ドメインイベント

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Knowledge Domain Events                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐       │
│  │ SessionCreated   │  │ QueryExecuted    │  │ ResultsReturned  │       │
│  │                  │  │                  │  │                  │       │
│  │ - sessionId      │  │ - sessionId      │  │ - sessionId      │       │
│  │ - userId         │  │ - queryId        │  │ - queryId        │       │
│  │ - createdAt      │  │ - queryText      │  │ - results[]      │       │
│  └──────────────────┘  │ - filters        │  │ - totalCount     │       │
│                        └──────────────────┘  └──────────────────┘       │
│                                                                          │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐       │
│  │ DocumentUploaded │  │ DocumentIngested │  │ DocumentIndexed  │       │
│  │                  │  │                  │  │                  │       │
│  │ - documentId     │  │ - documentId     │  │ - documentId     │       │
│  │ - sourceUri      │  │ - knowledgeBaseId│  │ - vectorCount    │       │
│  │ - metadata       │  │ - chunkCount     │  │ - indexedAt      │       │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘       │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.2 コマンド

| コマンド | 入力 | 出力イベント |
|---------|------|-------------|
| CreateSession | userId | SessionCreated |
| ExecuteQuery | sessionId, queryText, filters | QueryExecuted, ResultsReturned |
| UploadDocument | file, metadata | DocumentUploaded |
| IngestDocument | documentId, knowledgeBaseId | DocumentIngested, DocumentIndexed |

## 6. コンテキストマップ

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Context Map                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────┐         ┌─────────────────┐                        │
│  │  Chat Context   │◀──ACL──▶│Knowledge Context│                        │
│  │                 │         │                 │                        │
│  │ - ChatSession   │         │ - KnowledgeSession                       │
│  │ - Message       │         │ - Document      │                        │
│  └─────────────────┘         │ - Query         │                        │
│         │                    └─────────────────┘                        │
│         │                           │                                    │
│         │ OHS                       │ OHS                                │
│         ▼                           ▼                                    │
│  ┌─────────────────┐         ┌─────────────────┐                        │
│  │  Agent Context  │         │  Memory Context │                        │
│  │                 │         │                 │                        │
│  │ - StrandsAgent  │         │ - AgentCore     │                        │
│  │ - Tools         │         │ - Memory        │                        │
│  └─────────────────┘         └─────────────────┘                        │
│                                                                          │
│  Legend: ACL = Anti-Corruption Layer, OHS = Open Host Service           │
└─────────────────────────────────────────────────────────────────────────┘
```

## 7. Bedrock Knowledge Bases 統合仕様

### 7.1 使用する Bedrock APIs

| API | 用途 |
|-----|------|
| `RetrieveAndGenerate` | RAG 検索 + 応答生成 |
| `Retrieve` | ベクトル検索のみ |
| `CreateKnowledgeBase` | KB 作成（CDK経由） |
| `StartIngestionJob` | ドキュメント取り込み |

### 7.2 Agent Tool 定義

```typescript
// @tool デコレータで Strands Agent に統合
@tool("knowledge_search")
async function searchKnowledge(query: string, filters?: SearchFilters): Promise<SearchResult[]>

@tool("knowledge_rag")
async function ragQuery(query: string): Promise<RagResponse>

@tool("document_ingest")
async function ingestDocument(documentUri: string, metadata: DocumentMetadata): Promise<IngestResult>
```
