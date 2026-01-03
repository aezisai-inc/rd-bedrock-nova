/**
 * DynamoDB Event Store アダプター
 * 
 * Event Sourcing: DynamoDBでイベントを永続化
 * 
 * テーブル設計:
 * - PK: aggregateId
 * - SK: version (number)
 * - GSI1: eventType + timestamp（イベントタイプ別クエリ用）
 */
import {
  DynamoDBClient,
  PutItemCommand,
  QueryCommand,
  TransactWriteItemsCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { DomainEvent } from '../../domain/shared/domain-event';
import {
  EventStorePort,
  StoredEvent,
  EventStream,
  EventMetadata,
  ConcurrencyError,
} from './event-store';

export interface DynamoDBEventStoreConfig {
  tableName: string;
  region?: string;
  endpoint?: string;  // ローカル開発用
}

export class DynamoDBEventStore implements EventStorePort {
  private readonly client: DynamoDBClient;
  private readonly tableName: string;

  constructor(config: DynamoDBEventStoreConfig) {
    this.tableName = config.tableName;
    this.client = new DynamoDBClient({
      region: config.region ?? process.env.AWS_REGION ?? 'ap-northeast-1',
      ...(config.endpoint && { endpoint: config.endpoint }),
    });
  }

  async append(
    aggregateId: string,
    aggregateType: string,
    events: DomainEvent[],
    expectedVersion: number,
    metadata?: EventMetadata
  ): Promise<void> {
    if (events.length === 0) return;

    // トランザクションでイベントを追加
    const transactItems = events.map((event, index) => {
      const version = expectedVersion + index + 1;
      const storedEvent: StoredEvent = {
        eventId: event.eventId,
        aggregateId,
        aggregateType,
        eventType: event.eventType,
        eventData: event.toJSON(),
        metadata: {
          ...metadata,
          correlationId: metadata?.correlationId ?? event.eventId,
        },
        version,
        timestamp: event.occurredAt,
      };

      return {
        Put: {
          TableName: this.tableName,
          Item: marshall({
            PK: aggregateId,
            SK: version,
            ...storedEvent,
            timestamp: storedEvent.timestamp.toISOString(),
          }),
          // 楽観的ロック: 同じバージョンが存在しないこと
          ConditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
        },
      };
    });

    try {
      await this.client.send(
        new TransactWriteItemsCommand({
          TransactItems: transactItems,
        })
      );
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'TransactionCanceledException') {
        // 楽観的ロック違反
        const stream = await this.getStream(aggregateId);
        throw new ConcurrencyError(
          aggregateId,
          expectedVersion,
          stream?.version ?? 0
        );
      }
      throw error;
    }
  }

  async getStream(aggregateId: string): Promise<EventStream | null> {
    const response = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: marshall({
          ':pk': aggregateId,
        }),
        ScanIndexForward: true, // バージョン順
      })
    );

    if (!response.Items || response.Items.length === 0) {
      return null;
    }

    const events = response.Items.map((item) => {
      const data = unmarshall(item) as StoredEvent & { timestamp: string };
      return {
        ...data,
        timestamp: new Date(data.timestamp),
      };
    });

    return {
      aggregateId,
      events,
      version: events[events.length - 1].version,
    };
  }

  async getEventsAfterVersion(aggregateId: string, version: number): Promise<StoredEvent[]> {
    const response = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'PK = :pk AND SK > :version',
        ExpressionAttributeValues: marshall({
          ':pk': aggregateId,
          ':version': version,
        }),
        ScanIndexForward: true,
      })
    );

    return (response.Items ?? []).map((item) => {
      const data = unmarshall(item) as StoredEvent & { timestamp: string };
      return {
        ...data,
        timestamp: new Date(data.timestamp),
      };
    });
  }

  async *scanAllEvents(afterTimestamp?: Date): AsyncIterable<StoredEvent> {
    // Note: 本番では GSI を使用すべき
    let exclusiveStartKey: Record<string, unknown> | undefined;

    do {
      const response = await this.client.send(
        new QueryCommand({
          TableName: this.tableName,
          // 全テーブルスキャンは非推奨だが、Projector再構築用
          ExclusiveStartKey: exclusiveStartKey as never,
        })
      );

      for (const item of response.Items ?? []) {
        const data = unmarshall(item) as StoredEvent & { timestamp: string };
        const event: StoredEvent = {
          ...data,
          timestamp: new Date(data.timestamp),
        };

        if (!afterTimestamp || event.timestamp > afterTimestamp) {
          yield event;
        }
      }

      exclusiveStartKey = response.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (exclusiveStartKey);
  }
}
