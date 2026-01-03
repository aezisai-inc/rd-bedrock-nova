import { DomainEvent, DomainEventMetadata } from '../../shared/domain-event';

export interface SessionCreatedEventPayload {
  sessionId: string;
  ownerId: string;
  title: string;
}

/**
 * セッション作成イベント
 */
export class SessionCreatedEvent extends DomainEvent {
  readonly sessionId: string;
  readonly ownerId: string;
  readonly title: string;

  constructor(payload: SessionCreatedEventPayload, metadata?: DomainEventMetadata) {
    super(metadata);
    this.sessionId = payload.sessionId;
    this.ownerId = payload.ownerId;
    this.title = payload.title;
  }

  toJSON(): Record<string, unknown> {
    return {
      eventId: this.eventId,
      eventType: this.eventType,
      occurredAt: this.occurredAt.toISOString(),
      sessionId: this.sessionId,
      ownerId: this.ownerId,
      title: this.title,
      metadata: this.metadata,
    };
  }

  static fromJSON(data: Record<string, unknown>): SessionCreatedEvent {
    return new SessionCreatedEvent(
      {
        sessionId: data.sessionId as string,
        ownerId: data.ownerId as string,
        title: data.title as string,
      },
      data.metadata as DomainEventMetadata
    );
  }
}
