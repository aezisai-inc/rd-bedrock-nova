# 🏛️ クリーンアーキテクチャ + Event Sourcing + CQRS

## 1. レイヤー構成

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Interfaces Layer                             │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐    │
│   │   AppSync   │  │   Lambda    │  │    REST API (optional)  │    │
│   │  Resolvers  │  │  Handlers   │  │                         │    │
│   └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘    │
└──────────┼────────────────┼─────────────────────┼───────────────────┘
           │                │                     │
           ▼                ▼                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        Application Layer                             │
│   ┌─────────────────────┐     ┌─────────────────────┐              │
│   │   Command Handlers  │     │   Query Handlers    │              │
│   │   (Write Side)      │     │   (Read Side)       │              │
│   │                     │     │                     │              │
│   │ • SendMessage       │     │ • GetChatHistory    │              │
│   │ • InvokeAgent       │     │ • GetSessionList    │              │
│   │ • UploadFile        │     │ • GetUploadUrl      │              │
│   └──────────┬──────────┘     └──────────┬──────────┘              │
│              │                           │                          │
│              ▼                           ▼                          │
│   ┌─────────────────────┐     ┌─────────────────────┐              │
│   │   Event Handlers    │     │   Read Model        │              │
│   │                     │     │   Projectors        │              │
│   │ • OnMessageAdded    │     │                     │              │
│   │ • OnAgentCompleted  │     │ • SessionListProj   │              │
│   │ • OnFileUploaded    │     │ • ChatHistoryProj   │              │
│   └──────────┬──────────┘     └──────────┬──────────┘              │
└──────────────┼────────────────────────────┼─────────────────────────┘
               │                            │
               ▼                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          Domain Layer                                │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐    │
│   │ Aggregates  │  │  Entities   │  │    Value Objects        │    │
│   │             │  │             │  │                         │    │
│   │ ChatSession │  │  Message    │  │ SessionId, MessageContent│    │
│   │ AgentInvoke │  │  ToolCall   │  │ UserId, Timestamp       │    │
│   │ UploadedFile│  │             │  │                         │    │
│   └─────────────┘  └─────────────┘  └─────────────────────────┘    │
│                                                                      │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐    │
│   │   Domain    │  │  Domain     │  │    Repository           │    │
│   │   Events    │  │  Services   │  │    Interfaces           │    │
│   └─────────────┘  └─────────────┘  └─────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
               │                            │
               ▼                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Infrastructure Layer                            │
│   ┌─────────────────────┐     ┌─────────────────────┐              │
│   │    Event Store      │     │   Read Model Store  │              │
│   │    (DynamoDB)       │     │   (DynamoDB)        │              │
│   └─────────────────────┘     └─────────────────────┘              │
│                                                                      │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐    │
│   │  Bedrock    │  │ S3 Vectors  │  │    Messaging            │    │
│   │  Gateway    │  │  Gateway    │  │    (EventBridge)        │    │
│   └─────────────┘  └─────────────┘  └─────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

## 2. Event Sourcing

### 2.1 集約基底クラス

```typescript
// packages/domain/shared/aggregate-root.ts
abstract class AggregateRoot<TId extends ValueObject<unknown>> {
  private _id: TId;
  private _version: number = 0;
  private _uncommittedEvents: DomainEvent[] = [];

  protected constructor() {}

  get id(): TId {
    return this._id;
  }

  get version(): number {
    return this._version;
  }

  get uncommittedEvents(): readonly DomainEvent[] {
    return [...this._uncommittedEvents];
  }

  protected apply(event: DomainEvent): void {
    // イベント適用
    this.when(event);
    this._uncommittedEvents.push(event);
    this._version++;
  }

  // 子クラスで実装
  protected abstract when(event: DomainEvent): void;

  // リプレイ用
  loadFromHistory(events: DomainEvent[]): void {
    for (const event of events) {
      this.when(event);
      this._version++;
    }
  }

  clearUncommittedEvents(): void {
    this._uncommittedEvents = [];
  }
}
```

### 2.2 イベントストアインターフェース

```typescript
// packages/domain/shared/event-store.ts
interface EventStore {
  // イベントを保存
  append(
    aggregateId: string,
    events: DomainEvent[],
    expectedVersion: number
  ): Promise<void>;

  // イベント履歴を取得
  getEvents(
    aggregateId: string,
    fromVersion?: number
  ): Promise<DomainEvent[]>;

  // スナップショット保存（大量イベント対策）
  saveSnapshot(
    aggregateId: string,
    snapshot: AggregateSnapshot
  ): Promise<void>;

  // スナップショット取得
  getSnapshot(aggregateId: string): Promise<AggregateSnapshot | null>;
}
```

### 2.3 DynamoDB実装

```typescript
// packages/infrastructure/persistence/event-store/dynamodb-event-store.ts
class DynamoDBEventStore implements EventStore {
  constructor(
    private readonly client: DynamoDBClient,
    private readonly tableName: string
  ) {}

  async append(
    aggregateId: string,
    events: DomainEvent[],
    expectedVersion: number
  ): Promise<void> {
    const items = events.map((event, index) => ({
      PK: aggregateId,
      SK: expectedVersion + index + 1,
      eventType: event.constructor.name,
      payload: event.toJSON(),
      occurredAt: event.occurredAt.toISOString(),
      metadata: event.metadata,
    }));

    // 楽観的同時実行制御
    await this.client.send(
      new TransactWriteItemsCommand({
        TransactItems: [
          // バージョンチェック
          {
            ConditionCheck: {
              TableName: this.tableName,
              Key: { PK: aggregateId, SK: 'VERSION' },
              ConditionExpression: 'version = :expected OR attribute_not_exists(PK)',
              ExpressionAttributeValues: {
                ':expected': expectedVersion,
              },
            },
          },
          // イベント追加
          ...items.map((item) => ({
            Put: {
              TableName: this.tableName,
              Item: item,
            },
          })),
          // バージョン更新
          {
            Update: {
              TableName: this.tableName,
              Key: { PK: aggregateId, SK: 'VERSION' },
              UpdateExpression: 'SET version = :newVersion',
              ExpressionAttributeValues: {
                ':newVersion': expectedVersion + events.length,
              },
            },
          },
        ],
      })
    );
  }
}
```

## 3. CQRS パターン

### 3.1 コマンドハンドラ

```typescript
// packages/application/commands/send-message.ts
interface SendMessageCommand {
  sessionId: string;
  content: string;
  fileKeys?: string[];
}

class SendMessageHandler {
  constructor(
    private readonly sessionRepository: ChatSessionRepository,
    private readonly eventPublisher: EventPublisher
  ) {}

  async execute(command: SendMessageCommand): Promise<void> {
    // 集約取得
    const session = await this.sessionRepository.findById(
      SessionId.fromString(command.sessionId)
    );

    if (!session) {
      throw new SessionNotFoundError(command.sessionId);
    }

    // ドメインロジック実行
    session.addMessage(
      MessageContent.create(command.content),
      MessageRole.USER
    );

    // 保存（イベント発行含む）
    await this.sessionRepository.save(session);

    // イベント公開（非同期処理用）
    for (const event of session.uncommittedEvents) {
      await this.eventPublisher.publish(event);
    }
  }
}
```

### 3.2 クエリハンドラ

```typescript
// packages/application/queries/get-chat-history.ts
interface GetChatHistoryQuery {
  sessionId: string;
  limit?: number;
  cursor?: string;
}

interface ChatHistoryResult {
  messages: MessageView[];
  nextCursor?: string;
}

class GetChatHistoryHandler {
  constructor(
    private readonly readModel: ChatHistoryReadModel
  ) {}

  async execute(query: GetChatHistoryQuery): Promise<ChatHistoryResult> {
    // 読み取りモデルから直接クエリ（イベントストア不使用）
    return this.readModel.getHistory(
      query.sessionId,
      query.limit ?? 50,
      query.cursor
    );
  }
}
```

### 3.3 イベントハンドラ（プロジェクター）

```typescript
// packages/application/events/on-message-added.ts
class OnMessageAddedHandler {
  constructor(
    private readonly chatHistoryReadModel: ChatHistoryReadModel,
    private readonly sessionListReadModel: SessionListReadModel,
    private readonly agentService: AgentService
  ) {}

  async handle(event: MessageAddedEvent): Promise<void> {
    // 読み取りモデル更新
    await this.chatHistoryReadModel.addMessage({
      sessionId: event.sessionId,
      messageId: event.messageId,
      role: event.role,
      content: event.content,
      timestamp: event.timestamp,
    });

    await this.sessionListReadModel.updateLastMessage({
      sessionId: event.sessionId,
      timestamp: event.timestamp,
    });

    // ユーザーメッセージの場合、Agentを呼び出す
    if (event.role === MessageRole.USER) {
      await this.agentService.invoke({
        sessionId: event.sessionId,
        input: event.content,
      });
    }
  }
}
```

## 4. ディレクトリ構造

```
packages/
├── domain/                        # ドメイン層
│   ├── chat/                      # Chat境界コンテキスト
│   │   ├── aggregates/
│   │   │   └── chat-session.ts
│   │   ├── entities/
│   │   │   └── message.ts
│   │   ├── value-objects/
│   │   │   ├── session-id.ts
│   │   │   ├── message-content.ts
│   │   │   └── message-role.ts
│   │   ├── events/
│   │   │   ├── session-created.ts
│   │   │   ├── message-added.ts
│   │   │   └── session-archived.ts
│   │   ├── repositories/
│   │   │   └── chat-session-repository.ts (interface)
│   │   └── index.ts
│   │
│   ├── agent/                     # Agent境界コンテキスト
│   │   ├── aggregates/
│   │   │   └── agent-invocation.ts
│   │   ├── value-objects/
│   │   │   ├── invocation-id.ts
│   │   │   └── agent-response.ts
│   │   ├── events/
│   │   │   ├── agent-invoked.ts
│   │   │   ├── tool-called.ts
│   │   │   └── agent-completed.ts
│   │   ├── services/
│   │   │   └── agent-orchestrator.ts (interface)
│   │   └── index.ts
│   │
│   ├── file/                      # File境界コンテキスト
│   │   ├── aggregates/
│   │   │   └── uploaded-file.ts
│   │   ├── value-objects/
│   │   │   ├── file-id.ts
│   │   │   └── s3-key.ts
│   │   ├── events/
│   │   │   ├── file-uploaded.ts
│   │   │   └── file-processed.ts
│   │   └── index.ts
│   │
│   └── shared/                    # 共有カーネル
│       ├── aggregate-root.ts
│       ├── entity.ts
│       ├── value-object.ts
│       ├── domain-event.ts
│       ├── user-id.ts
│       └── timestamp.ts
│
├── application/                   # アプリケーション層
│   ├── commands/                  # コマンド（Write側）
│   │   ├── chat/
│   │   │   ├── start-chat.ts
│   │   │   ├── send-message.ts
│   │   │   └── archive-session.ts
│   │   ├── agent/
│   │   │   └── invoke-agent.ts
│   │   └── file/
│   │       └── register-file.ts
│   │
│   ├── queries/                   # クエリ（Read側）
│   │   ├── chat/
│   │   │   ├── get-chat-history.ts
│   │   │   └── get-session-list.ts
│   │   └── file/
│   │       └── get-upload-url.ts
│   │
│   ├── events/                    # イベントハンドラ
│   │   ├── on-message-added.ts
│   │   ├── on-agent-completed.ts
│   │   └── on-file-uploaded.ts
│   │
│   └── dto/                       # データ転送オブジェクト
│       ├── message-view.ts
│       └── session-view.ts
│
├── infrastructure/                # インフラストラクチャ層
│   ├── persistence/
│   │   ├── event-store/
│   │   │   └── dynamodb-event-store.ts
│   │   ├── read-model/
│   │   │   ├── chat-history-read-model.ts
│   │   │   └── session-list-read-model.ts
│   │   └── repositories/
│   │       ├── dynamodb-chat-session-repository.ts
│   │       └── dynamodb-uploaded-file-repository.ts
│   │
│   ├── bedrock/
│   │   └── strands-agent-orchestrator.ts
│   │
│   ├── s3-vectors/
│   │   └── s3-vectors-gateway.ts
│   │
│   └── messaging/
│       └── eventbridge-publisher.ts
│
└── interfaces/                    # インターフェース層
    ├── appsync/
    │   ├── resolvers/
    │   │   ├── chat-resolver.ts
    │   │   ├── agent-resolver.ts
    │   │   └── file-resolver.ts
    │   └── schema.graphql
    │
    └── lambda/
        ├── event-handlers/
        │   └── domain-event-handler.ts
        └── api/
            └── rest-handler.ts
```
