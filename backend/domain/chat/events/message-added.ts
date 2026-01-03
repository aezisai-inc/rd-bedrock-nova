import { DomainEvent, DomainEventMetadata } from '../../shared/domain-event';
import { MessageRole } from '../value-objects/message-role';

export interface MessageAddedEventPayload {
  sessionId: string;
  messageId: string;
  role: MessageRole;
  content: string;
  timestamp: string;
  fileKeys?: string[];
}

/**
 * メッセージ追加イベント
 */
export class MessageAddedEvent extends DomainEvent {
  readonly sessionId: string;
  readonly messageId: string;
  readonly role: MessageRole;
  readonly content: string;
  readonly timestamp: string;
  readonly fileKeys: string[];

  constructor(payload: MessageAddedEventPayload, metadata?: DomainEventMetadata) {
    super(metadata);
    this.sessionId = payload.sessionId;
    this.messageId = payload.messageId;
    this.role = payload.role;
    this.content = payload.content;
    this.timestamp = payload.timestamp;
    this.fileKeys = payload.fileKeys ?? [];
  }

  toJSON(): Record<string, unknown> {
    return {
      eventId: this.eventId,
      eventType: this.eventType,
      occurredAt: this.occurredAt.toISOString(),
      sessionId: this.sessionId,
      messageId: this.messageId,
      role: this.role,
      content: this.content,
      timestamp: this.timestamp,
      fileKeys: this.fileKeys,
      metadata: this.metadata,
    };
  }

  static fromJSON(data: Record<string, unknown>): MessageAddedEvent {
    return new MessageAddedEvent(
      {
        sessionId: data.sessionId as string,
        messageId: data.messageId as string,
        role: data.role as MessageRole,
        content: data.content as string,
        timestamp: data.timestamp as string,
        fileKeys: data.fileKeys as string[],
      },
      data.metadata as DomainEventMetadata
    );
  }
}
