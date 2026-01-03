import { randomUUID } from 'crypto';

/**
 * ドメインイベント基底クラス
 * 
 * イベントソーシングの基盤となるイベント
 */
export interface DomainEventMetadata {
  userId?: string;
  correlationId?: string;
  causationId?: string;
}

export abstract class DomainEvent {
  readonly eventId: string;
  readonly occurredAt: Date;
  readonly metadata: DomainEventMetadata;

  protected constructor(metadata?: DomainEventMetadata) {
    this.eventId = randomUUID();
    this.occurredAt = new Date();
    this.metadata = metadata ?? {};
  }

  /**
   * イベントタイプ名を取得
   */
  get eventType(): string {
    return this.constructor.name;
  }

  /**
   * JSON表現
   */
  abstract toJSON(): Record<string, unknown>;

  /**
   * JSONからイベントを復元
   */
  static fromJSON(_data: Record<string, unknown>): DomainEvent {
    throw new Error('Subclass must implement fromJSON');
  }
}
