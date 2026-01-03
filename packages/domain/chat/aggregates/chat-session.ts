import { randomUUID } from 'crypto';
import { AggregateRoot } from '../../shared/aggregate-root';
import { DomainEvent } from '../../shared/domain-event';
import { SessionId } from '../value-objects/session-id';
import { MessageContent } from '../value-objects/message-content';
import { MessageRole } from '../value-objects/message-role';
import { SessionCreatedEvent } from '../events/session-created';
import { MessageAddedEvent } from '../events/message-added';

export enum SessionStatus {
  ACTIVE = 'active',
  ARCHIVED = 'archived',
}

export interface Message {
  messageId: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  fileKeys: string[];
}

export interface CreateSessionProps {
  ownerId: string;
  title?: string;
}

/**
 * チャットセッション集約
 * 
 * 境界:
 * - セッション自体
 * - セッション内のメッセージ
 * 
 * 不変条件:
 * - アクティブなセッションのみメッセージ追加可能
 * - メッセージは追加のみ（更新・削除不可）
 */
export class ChatSession extends AggregateRoot<SessionId> {
  private _ownerId!: string;
  private _title!: string;
  private _status!: SessionStatus;
  private _messages: Message[] = [];
  private _createdAt!: Date;

  private constructor(id: SessionId) {
    super(id);
  }

  // Getters
  get ownerId(): string {
    return this._ownerId;
  }

  get title(): string {
    return this._title;
  }

  get status(): SessionStatus {
    return this._status;
  }

  get messages(): readonly Message[] {
    return [...this._messages];
  }

  get messageCount(): number {
    return this._messages.length;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  get lastMessageAt(): Date | null {
    if (this._messages.length === 0) return null;
    return this._messages[this._messages.length - 1].timestamp;
  }

  /**
   * 新しいセッションを作成
   */
  static create(props: CreateSessionProps): ChatSession {
    const sessionId = SessionId.generate();
    const session = new ChatSession(sessionId);
    
    session.apply(
      new SessionCreatedEvent({
        sessionId: sessionId.value,
        ownerId: props.ownerId,
        title: props.title ?? `Chat ${new Date().toLocaleDateString()}`,
      })
    );
    
    return session;
  }

  /**
   * イベント履歴からセッションを再構築
   */
  static fromHistory(id: SessionId, events: DomainEvent[]): ChatSession {
    const session = new ChatSession(id);
    session.loadFromHistory(events);
    return session;
  }

  /**
   * メッセージを追加
   */
  addMessage(content: MessageContent, role: MessageRole, fileKeys?: string[]): void {
    this.ensureActive();
    
    this.apply(
      new MessageAddedEvent({
        sessionId: this.id.value,
        messageId: randomUUID(),
        role,
        content: content.text,
        timestamp: new Date().toISOString(),
        fileKeys,
      })
    );
  }

  /**
   * セッションをアーカイブ
   */
  archive(): void {
    this.ensureActive();
    // SessionArchivedEvent を発行
    this._status = SessionStatus.ARCHIVED;
  }

  /**
   * イベントハンドラ
   */
  protected when(event: DomainEvent): void {
    if (event instanceof SessionCreatedEvent) {
      this._ownerId = event.ownerId;
      this._title = event.title;
      this._status = SessionStatus.ACTIVE;
      this._messages = [];
      this._createdAt = event.occurredAt;
    } else if (event instanceof MessageAddedEvent) {
      this._messages.push({
        messageId: event.messageId,
        role: event.role,
        content: event.content,
        timestamp: new Date(event.timestamp),
        fileKeys: event.fileKeys,
      });
    }
  }

  /**
   * アクティブ状態を検証
   */
  private ensureActive(): void {
    if (this._status !== SessionStatus.ACTIVE) {
      throw new SessionNotActiveError(this.id.value);
    }
  }
}

export class SessionNotActiveError extends Error {
  constructor(sessionId: string) {
    super(`Session ${sessionId} is not active`);
    this.name = 'SessionNotActiveError';
  }
}
