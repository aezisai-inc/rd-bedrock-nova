/**
 * Event Store インターフェース
 * 
 * Event Sourcing: 状態変更をイベントとして永続化
 * DynamoDB実装はアダプターで提供
 */
import { DomainEvent } from '../../domain/shared/domain-event';

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

export interface EventMetadata {
  correlationId?: string;
  causationId?: string;
  userId?: string;
  traceId?: string;  // CloudTrail/AgentCore連携用
}

export interface EventStream {
  aggregateId: string;
  events: StoredEvent[];
  version: number;
}

/**
 * Event Store ポート（インターフェース）
 */
export interface EventStorePort {
  /**
   * イベントを追加（楽観的ロック付き）
   */
  append(
    aggregateId: string,
    aggregateType: string,
    events: DomainEvent[],
    expectedVersion: number,
    metadata?: EventMetadata
  ): Promise<void>;

  /**
   * 集約のイベントストリームを取得
   */
  getStream(aggregateId: string): Promise<EventStream | null>;

  /**
   * 特定バージョン以降のイベントを取得
   */
  getEventsAfterVersion(aggregateId: string, version: number): Promise<StoredEvent[]>;

  /**
   * 全イベントをスキャン（Projector用）
   */
  scanAllEvents(afterTimestamp?: Date): AsyncIterable<StoredEvent>;
}

/**
 * 楽観的ロック違反エラー
 */
export class ConcurrencyError extends Error {
  constructor(
    public readonly aggregateId: string,
    public readonly expectedVersion: number,
    public readonly actualVersion: number
  ) {
    super(
      `Concurrency conflict for aggregate ${aggregateId}: ` +
      `expected version ${expectedVersion}, actual ${actualVersion}`
    );
    this.name = 'ConcurrencyError';
  }
}
