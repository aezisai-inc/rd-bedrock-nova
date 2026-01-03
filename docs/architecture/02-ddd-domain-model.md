# 🎯 DDD ドメインモデル設計

## 1. 戦略的設計

### 1.1 境界づけられたコンテキスト

```
┌─────────────────────────────────────────────────────────────────┐
│                      Nova AI Platform                            │
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │    Chat      │    │    Agent     │    │   File Storage   │  │
│  │   Context    │◄──►│   Context    │◄──►│    Context       │  │
│  │              │    │              │    │                  │  │
│  │ • Session    │    │ • Invocation │    │ • Upload         │  │
│  │ • Message    │    │ • Tool       │    │ • Metadata       │  │
│  │ • History    │    │ • Response   │    │ • Processing     │  │
│  └──────────────┘    └──────────────┘    └──────────────────┘  │
│           │                  │                    │             │
│           └──────────────────┴────────────────────┘             │
│                              │                                   │
│                    ┌─────────┴─────────┐                        │
│                    │   Shared Kernel   │                        │
│                    │                   │                        │
│                    │ • UserId          │                        │
│                    │ • SessionId       │                        │
│                    │ • Timestamp       │                        │
│                    │ • DomainEvent     │                        │
│                    └───────────────────┘                        │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 コンテキストマップ

| 上流 | 下流 | 関係パターン |
|------|------|-------------|
| Chat Context | Agent Context | Customer-Supplier |
| Agent Context | File Context | Partnership |
| Shared Kernel | All Contexts | Shared Kernel |

## 2. 戦術的設計

### 2.1 Chat Context

#### 集約: ChatSession

```typescript
// 集約ルート
class ChatSession extends AggregateRoot<SessionId> {
  private _title: SessionTitle;
  private _status: SessionStatus;
  private _messages: Message[];
  private _ownerId: UserId;

  // ファクトリメソッド
  static create(props: CreateSessionProps): ChatSession {
    const session = new ChatSession();
    session.apply(new SessionCreatedEvent({
      sessionId: SessionId.generate(),
      ownerId: props.ownerId,
      title: props.title,
    }));
    return session;
  }

  // コマンド
  addMessage(content: MessageContent, role: MessageRole): void {
    this.ensureActive();
    this.apply(new MessageAddedEvent({
      sessionId: this.id,
      messageId: MessageId.generate(),
      content,
      role,
      timestamp: Timestamp.now(),
    }));
  }

  archive(): void {
    this.ensureActive();
    this.apply(new SessionArchivedEvent({
      sessionId: this.id,
    }));
  }

  // 不変条件
  private ensureActive(): void {
    if (this._status !== SessionStatus.ACTIVE) {
      throw new SessionNotActiveError(this.id);
    }
  }
}
```

#### エンティティ: Message

```typescript
class Message extends Entity<MessageId> {
  readonly sessionId: SessionId;
  readonly role: MessageRole;
  readonly content: MessageContent;
  readonly timestamp: Timestamp;
  readonly metadata: MessageMetadata;

  // 不変エンティティ（追加のみ、更新なし）
  constructor(props: MessageProps) {
    super(props.id);
    this.sessionId = props.sessionId;
    this.role = props.role;
    this.content = props.content;
    this.timestamp = props.timestamp;
    this.metadata = props.metadata ?? MessageMetadata.empty();
  }
}
```

#### 値オブジェクト

```typescript
// セッションID
class SessionId extends ValueObject<{ value: string }> {
  static generate(): SessionId {
    return new SessionId({ value: uuid() });
  }

  static fromString(value: string): SessionId {
    if (!isValidUuid(value)) {
      throw new InvalidSessionIdError(value);
    }
    return new SessionId({ value });
  }
}

// メッセージ内容
class MessageContent extends ValueObject<{ text: string }> {
  static readonly MAX_LENGTH = 100_000; // 100KB

  static create(text: string): MessageContent {
    if (text.length > this.MAX_LENGTH) {
      throw new MessageTooLongError(text.length);
    }
    return new MessageContent({ text });
  }
}

// メッセージロール
enum MessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system',
}
```

### 2.2 Agent Context

#### 集約: AgentInvocation

```typescript
class AgentInvocation extends AggregateRoot<InvocationId> {
  private _sessionId: SessionId;
  private _input: AgentInput;
  private _toolCalls: ToolCall[];
  private _response: AgentResponse | null;
  private _status: InvocationStatus;

  static invoke(props: InvokeAgentProps): AgentInvocation {
    const invocation = new AgentInvocation();
    invocation.apply(new AgentInvokedEvent({
      invocationId: InvocationId.generate(),
      sessionId: props.sessionId,
      input: props.input,
    }));
    return invocation;
  }

  recordToolCall(tool: ToolDefinition, result: ToolResult): void {
    this.apply(new ToolCalledEvent({
      invocationId: this.id,
      toolName: tool.name,
      input: tool.input,
      result,
    }));
  }

  complete(response: AgentResponse): void {
    this.apply(new AgentCompletedEvent({
      invocationId: this.id,
      response,
    }));
  }

  fail(error: AgentError): void {
    this.apply(new AgentFailedEvent({
      invocationId: this.id,
      error,
    }));
  }
}
```

#### ドメインサービス: AgentOrchestrator

```typescript
interface AgentOrchestrator {
  // Strands Agents SDK経由でBedrock呼び出し
  invoke(
    input: AgentInput,
    tools: ToolDefinition[],
    options: InvocationOptions,
  ): AsyncIterable<AgentStreamEvent>;
}

// ツール定義
interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: JSONSchema;
  handler: (input: unknown) => Promise<unknown>;
}
```

### 2.3 File Storage Context

#### 集約: UploadedFile

```typescript
class UploadedFile extends AggregateRoot<FileId> {
  private _sessionId: SessionId;
  private _fileName: FileName;
  private _fileType: FileType;
  private _s3Key: S3Key;
  private _metadata: FileMetadata;
  private _status: FileStatus;

  static upload(props: UploadFileProps): UploadedFile {
    const file = new UploadedFile();
    file.apply(new FileUploadedEvent({
      fileId: FileId.generate(),
      sessionId: props.sessionId,
      fileName: props.fileName,
      fileType: props.fileType,
      s3Key: props.s3Key,
      size: props.size,
    }));
    return file;
  }

  markProcessed(result: ProcessingResult): void {
    this.apply(new FileProcessedEvent({
      fileId: this.id,
      result,
    }));
  }

  delete(): void {
    this.apply(new FileDeletedEvent({
      fileId: this.id,
    }));
  }
}
```

## 3. ドメインイベント

### 3.1 Chat Context Events

| イベント | トリガー | ペイロード |
|----------|---------|-----------|
| SessionCreatedEvent | セッション作成 | sessionId, ownerId, title |
| MessageAddedEvent | メッセージ追加 | sessionId, messageId, role, content |
| SessionArchivedEvent | セッションアーカイブ | sessionId |

### 3.2 Agent Context Events

| イベント | トリガー | ペイロード |
|----------|---------|-----------|
| AgentInvokedEvent | Agent呼び出し | invocationId, sessionId, input |
| ToolCalledEvent | ツール実行 | invocationId, toolName, input, result |
| AgentCompletedEvent | Agent完了 | invocationId, response |
| AgentFailedEvent | Agent失敗 | invocationId, error |

### 3.3 File Context Events

| イベント | トリガー | ペイロード |
|----------|---------|-----------|
| FileUploadedEvent | ファイルアップロード | fileId, sessionId, s3Key |
| FileProcessedEvent | ファイル処理完了 | fileId, result |
| FileDeletedEvent | ファイル削除 | fileId |

## 4. リポジトリインターフェース

```typescript
// Chat Context
interface ChatSessionRepository {
  save(session: ChatSession): Promise<void>;
  findById(id: SessionId): Promise<ChatSession | null>;
  findByOwner(ownerId: UserId): Promise<ChatSession[]>;
}

// Agent Context
interface AgentInvocationRepository {
  save(invocation: AgentInvocation): Promise<void>;
  findById(id: InvocationId): Promise<AgentInvocation | null>;
}

// File Context
interface UploadedFileRepository {
  save(file: UploadedFile): Promise<void>;
  findById(id: FileId): Promise<UploadedFile | null>;
  findBySession(sessionId: SessionId): Promise<UploadedFile[]>;
}
```
