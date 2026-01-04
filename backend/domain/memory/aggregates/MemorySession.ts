/**
 * MemorySession Aggregate Root
 *
 * Clean Architecture + Event Sourcing + CQRS
 * 会話記憶セッションを管理する集約ルート
 */

import { AggregateRoot } from '../../shared/AggregateRoot';
import { DomainEvent } from '../../shared/DomainEvent';

// =============================================================================
// Value Objects
// =============================================================================

export class MemorySessionId {
  private constructor(public readonly value: string) {}

  static generate(): MemorySessionId {
    return new MemorySessionId(`ms-${Date.now()}-${Math.random().toString(36).substring(7)}`);
  }

  static fromString(value: string): MemorySessionId {
    return new MemorySessionId(value);
  }

  equals(other: MemorySessionId): boolean {
    return this.value === other.value;
  }
}

export class ActorId {
  private constructor(public readonly value: string) {}

  static fromString(value: string): ActorId {
    return new ActorId(value);
  }

  equals(other: ActorId): boolean {
    return this.value === other.value;
  }
}

export type MemoryRole = 'user' | 'assistant' | 'system';

export class MemoryEventData {
  constructor(
    public readonly eventId: string,
    public readonly role: MemoryRole,
    public readonly content: string,
    public readonly timestamp: Date,
    public readonly metadata?: Record<string, unknown>
  ) {}
}

// =============================================================================
// Domain Events
// =============================================================================

export class MemorySessionCreated implements DomainEvent {
  readonly eventType = 'MemorySessionCreated';
  readonly occurredAt: Date;

  constructor(
    public readonly sessionId: MemorySessionId,
    public readonly actorId: ActorId,
    public readonly title: string
  ) {
    this.occurredAt = new Date();
  }
}

export class MemoryEventStored implements DomainEvent {
  readonly eventType = 'MemoryEventStored';
  readonly occurredAt: Date;

  constructor(
    public readonly sessionId: MemorySessionId,
    public readonly eventData: MemoryEventData
  ) {
    this.occurredAt = new Date();
  }
}

export class MemorySessionClosed implements DomainEvent {
  readonly eventType = 'MemorySessionClosed';
  readonly occurredAt: Date;

  constructor(public readonly sessionId: MemorySessionId) {
    this.occurredAt = new Date();
  }
}

// =============================================================================
// Aggregate Root
// =============================================================================

export type SessionStatus = 'active' | 'closed';

export class MemorySession extends AggregateRoot {
  private _id!: MemorySessionId;
  private _actorId!: ActorId;
  private _title!: string;
  private _events: MemoryEventData[] = [];
  private _status: SessionStatus = 'active';
  private _createdAt!: Date;
  private _lastActivityAt!: Date;

  private constructor() {
    super();
  }

  // =============================================================================
  // Factory Methods
  // =============================================================================

  static create(actorId: ActorId, title?: string): MemorySession {
    const session = new MemorySession();
    const sessionId = MemorySessionId.generate();
    const sessionTitle = title || `Session ${sessionId.value.substring(0, 8)}`;

    session.apply(new MemorySessionCreated(sessionId, actorId, sessionTitle));

    return session;
  }

  static reconstitute(events: DomainEvent[]): MemorySession {
    const session = new MemorySession();
    events.forEach((event) => session.applyEvent(event));
    return session;
  }

  // =============================================================================
  // Commands
  // =============================================================================

  storeEvent(role: MemoryRole, content: string, metadata?: Record<string, unknown>): MemoryEventData {
    this.ensureActive();

    const eventId = `evt-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const eventData = new MemoryEventData(
      eventId,
      role,
      content,
      new Date(),
      metadata
    );

    this.apply(new MemoryEventStored(this._id, eventData));

    return eventData;
  }

  close(): void {
    if (this._status === 'closed') {
      throw new Error('Session is already closed');
    }

    this.apply(new MemorySessionClosed(this._id));
  }

  // =============================================================================
  // Event Handlers (Event Sourcing)
  // =============================================================================

  protected applyEvent(event: DomainEvent): void {
    switch (event.eventType) {
      case 'MemorySessionCreated':
        this.onSessionCreated(event as MemorySessionCreated);
        break;
      case 'MemoryEventStored':
        this.onEventStored(event as MemoryEventStored);
        break;
      case 'MemorySessionClosed':
        this.onSessionClosed(event as MemorySessionClosed);
        break;
    }
  }

  private onSessionCreated(event: MemorySessionCreated): void {
    this._id = event.sessionId;
    this._actorId = event.actorId;
    this._title = event.title;
    this._createdAt = event.occurredAt;
    this._lastActivityAt = event.occurredAt;
    this._status = 'active';
  }

  private onEventStored(event: MemoryEventStored): void {
    this._events.push(event.eventData);
    this._lastActivityAt = event.occurredAt;
  }

  private onSessionClosed(_event: MemorySessionClosed): void {
    this._status = 'closed';
  }

  // =============================================================================
  // Invariant Checks
  // =============================================================================

  private ensureActive(): void {
    if (this._status !== 'active') {
      throw new Error('Cannot perform operation on closed session');
    }
  }

  // =============================================================================
  // Getters
  // =============================================================================

  get id(): MemorySessionId {
    return this._id;
  }

  get actorId(): ActorId {
    return this._actorId;
  }

  get title(): string {
    return this._title;
  }

  get events(): ReadonlyArray<MemoryEventData> {
    return [...this._events];
  }

  get eventCount(): number {
    return this._events.length;
  }

  get status(): SessionStatus {
    return this._status;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  get lastActivityAt(): Date {
    return this._lastActivityAt;
  }

  /**
   * 最近のイベントを取得
   */
  getRecentEvents(limit: number = 50): ReadonlyArray<MemoryEventData> {
    return this._events.slice(-limit);
  }

  /**
   * キーワード検索
   */
  searchEvents(query: string): ReadonlyArray<MemoryEventData> {
    const lowerQuery = query.toLowerCase();
    return this._events.filter((e) =>
      e.content.toLowerCase().includes(lowerQuery)
    );
  }
}
