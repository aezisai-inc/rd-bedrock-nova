/**
 * DomainEvent Interface
 *
 * Event Sourcing pattern の基盤インターフェース
 */

export interface DomainEvent {
  readonly eventType: string;
  readonly occurredAt: Date;
}

export interface EventMetadata {
  correlationId?: string;
  causationId?: string;
  userId?: string;
  timestamp: Date;
}

export interface StoredEvent {
  eventId: string;
  aggregateId: string;
  aggregateType: string;
  eventType: string;
  eventData: Record<string, unknown>;
  metadata: EventMetadata;
  version: number;
  timestamp: Date;
}
