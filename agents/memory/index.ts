/**
 * AgentCore Memory Module
 *
 * Bedrock AgentCore Memory との統合を提供
 * Strands Agents SDK + AgentCore Memory API
 *
 * 設計原則:
 * - Application層: strands-agents (@tool デコレータ)
 * - Platform層: bedrock-agentcore (Memory/Observability)
 * - Model層: bedrock-runtime
 *
 * メモリ階層:
 * - Phase 1 (MVP): AgentCore Memory ~$20/月
 * - Phase 2: + Bedrock KB with S3 Vectors ~$70/月
 * - Phase 3: + Neptune ~$120/月
 *
 * 禁止事項:
 * - boto3 直接使用
 * - OpenSearch Serverless (コスト高)
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  GetCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

// =============================================================================
// Configuration
// =============================================================================

const REGION = process.env.AWS_REGION || 'ap-northeast-1';
const MEMORY_TABLE = process.env.MEMORY_TABLE || 'rd-bedrock-nova-memory';
const SESSION_TABLE = process.env.SESSION_TABLE || 'rd-bedrock-nova-sessions';

// DynamoDB Client
const ddbClient = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(ddbClient);

// =============================================================================
// Types
// =============================================================================

export interface MemoryEvent {
  eventId: string;
  sessionId: string;
  actorId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
  ttl?: number;
}

export interface Session {
  sessionId: string;
  actorId: string;
  title?: string;
  createdAt: string;
  lastActivityAt: string;
  messageCount: number;
  status: 'active' | 'closed';
  metadata?: Record<string, unknown>;
}

export interface MemoryQuery {
  sessionId: string;
  query?: string;
  limit?: number;
  offset?: number;
  startTime?: string;
  endTime?: string;
}

export interface MemorySearchResult {
  events: MemoryEvent[];
  totalCount: number;
  hasMore: boolean;
}

// =============================================================================
// Observability
// =============================================================================

const log = (level: string, message: string, data?: Record<string, unknown>) => {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      ...data,
      service: 'agentcore-memory',
    })
  );
};

// =============================================================================
// Memory Service
// =============================================================================

export class AgentCoreMemoryService {
  /**
   * 記憶イベントを保存
   */
  async storeEvent(event: Omit<MemoryEvent, 'eventId' | 'timestamp' | 'ttl'>): Promise<MemoryEvent> {
    const now = new Date();
    const eventId = `evt-${now.getTime()}-${Math.random().toString(36).substring(7)}`;
    const timestamp = now.toISOString();

    // TTL: 90日後に自動削除（短期記憶）
    const ttl = Math.floor(now.getTime() / 1000) + 90 * 24 * 60 * 60;

    const fullEvent: MemoryEvent = {
      ...event,
      eventId,
      timestamp,
      ttl,
    };

    log('INFO', 'Storing memory event', {
      sessionId: event.sessionId,
      role: event.role,
      eventId,
    });

    await docClient.send(
      new PutCommand({
        TableName: MEMORY_TABLE,
        Item: {
          pk: `SESSION#${event.sessionId}`,
          sk: `EVENT#${timestamp}#${eventId}`,
          ...fullEvent,
        },
      })
    );

    // Update session last activity
    await this.updateSessionActivity(event.sessionId);

    return fullEvent;
  }

  /**
   * セッション履歴を取得
   */
  async getSessionHistory(
    sessionId: string,
    limit: number = 50
  ): Promise<MemoryEvent[]> {
    log('INFO', 'Getting session history', { sessionId, limit });

    const result = await docClient.send(
      new QueryCommand({
        TableName: MEMORY_TABLE,
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
        ExpressionAttributeValues: {
          ':pk': `SESSION#${sessionId}`,
          ':sk': 'EVENT#',
        },
        ScanIndexForward: false, // 最新順
        Limit: limit,
      })
    );

    const events = (result.Items || []) as MemoryEvent[];
    return events.reverse(); // 時系列順に戻す
  }

  /**
   * 記憶を検索
   */
  async searchMemory(query: MemoryQuery): Promise<MemorySearchResult> {
    const { sessionId, limit = 10, offset = 0, startTime, endTime } = query;
    log('INFO', 'Searching memory', { sessionId, limit });

    let keyCondition = 'pk = :pk AND begins_with(sk, :sk)';
    const expressionValues: Record<string, unknown> = {
      ':pk': `SESSION#${sessionId}`,
      ':sk': 'EVENT#',
    };

    // 時間範囲フィルター
    if (startTime && endTime) {
      keyCondition = 'pk = :pk AND sk BETWEEN :start AND :end';
      expressionValues[':start'] = `EVENT#${startTime}`;
      expressionValues[':end'] = `EVENT#${endTime}`;
    }

    const result = await docClient.send(
      new QueryCommand({
        TableName: MEMORY_TABLE,
        KeyConditionExpression: keyCondition,
        ExpressionAttributeValues: expressionValues,
        ScanIndexForward: true,
      })
    );

    const allEvents = (result.Items || []) as MemoryEvent[];

    // クエリ文字列でフィルター（簡易実装）
    let filteredEvents = allEvents;
    if (query.query) {
      const searchTerm = query.query.toLowerCase();
      filteredEvents = allEvents.filter((e) =>
        e.content.toLowerCase().includes(searchTerm)
      );
    }

    const pagedEvents = filteredEvents.slice(offset, offset + limit);

    return {
      events: pagedEvents,
      totalCount: filteredEvents.length,
      hasMore: offset + limit < filteredEvents.length,
    };
  }

  /**
   * セッションを作成
   */
  async createSession(actorId: string, title?: string): Promise<Session> {
    const now = new Date();
    const sessionId = `ses-${now.getTime()}-${Math.random().toString(36).substring(7)}`;
    const timestamp = now.toISOString();

    const session: Session = {
      sessionId,
      actorId,
      title: title || `Session ${sessionId.substring(0, 8)}`,
      createdAt: timestamp,
      lastActivityAt: timestamp,
      messageCount: 0,
      status: 'active',
    };

    log('INFO', 'Creating session', { sessionId, actorId });

    await docClient.send(
      new PutCommand({
        TableName: SESSION_TABLE,
        Item: {
          pk: `ACTOR#${actorId}`,
          sk: `SESSION#${sessionId}`,
          ...session,
        },
      })
    );

    return session;
  }

  /**
   * セッションを取得
   */
  async getSession(actorId: string, sessionId: string): Promise<Session | null> {
    const result = await docClient.send(
      new GetCommand({
        TableName: SESSION_TABLE,
        Key: {
          pk: `ACTOR#${actorId}`,
          sk: `SESSION#${sessionId}`,
        },
      })
    );

    return (result.Item as Session) || null;
  }

  /**
   * アクターのセッション一覧を取得
   */
  async listSessions(actorId: string, limit: number = 20): Promise<Session[]> {
    log('INFO', 'Listing sessions', { actorId, limit });

    const result = await docClient.send(
      new QueryCommand({
        TableName: SESSION_TABLE,
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
        ExpressionAttributeValues: {
          ':pk': `ACTOR#${actorId}`,
          ':sk': 'SESSION#',
        },
        ScanIndexForward: false,
        Limit: limit,
      })
    );

    return (result.Items || []) as Session[];
  }

  /**
   * セッションの最終活動時刻を更新
   */
  private async updateSessionActivity(sessionId: string): Promise<void> {
    // Note: 実際にはactorIdが必要だが、簡略化
    // 本番ではGSIを使用してsessionIdからactorIdを取得
  }

  /**
   * セッションを閉じる
   */
  async closeSession(actorId: string, sessionId: string): Promise<void> {
    log('INFO', 'Closing session', { sessionId });

    await docClient.send(
      new UpdateCommand({
        TableName: SESSION_TABLE,
        Key: {
          pk: `ACTOR#${actorId}`,
          sk: `SESSION#${sessionId}`,
        },
        UpdateExpression: 'SET #status = :status, lastActivityAt = :lastActivity',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':status': 'closed',
          ':lastActivity': new Date().toISOString(),
        },
      })
    );
  }
}

// =============================================================================
// Tool Functions (Strands @tool pattern)
// =============================================================================

const memoryService = new AgentCoreMemoryService();

/**
 * @tool("memory_store")
 * 会話を記憶に保存
 */
export async function storeMemory(
  sessionId: string,
  actorId: string,
  role: 'user' | 'assistant' | 'system',
  content: string,
  metadata?: Record<string, unknown>
): Promise<MemoryEvent> {
  return memoryService.storeEvent({
    sessionId,
    actorId,
    role,
    content,
    metadata,
  });
}

/**
 * @tool("memory_recall")
 * 記憶を検索
 */
export async function recallMemory(query: MemoryQuery): Promise<MemorySearchResult> {
  return memoryService.searchMemory(query);
}

/**
 * @tool("memory_history")
 * セッション履歴を取得
 */
export async function getHistory(
  sessionId: string,
  limit?: number
): Promise<MemoryEvent[]> {
  return memoryService.getSessionHistory(sessionId, limit);
}

/**
 * Strands Agent用ツール定義を取得
 */
export function getMemoryTools() {
  return {
    memory_store: {
      description: 'Store a conversation message in memory',
      parameters: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Session ID' },
          actorId: { type: 'string', description: 'Actor/User ID' },
          role: { type: 'string', enum: ['user', 'assistant', 'system'] },
          content: { type: 'string', description: 'Message content' },
        },
        required: ['sessionId', 'actorId', 'role', 'content'],
      },
      handler: async (params: {
        sessionId: string;
        actorId: string;
        role: 'user' | 'assistant' | 'system';
        content: string;
      }) => {
        return storeMemory(params.sessionId, params.actorId, params.role, params.content);
      },
    },
    memory_recall: {
      description: 'Search and recall memories from a session',
      parameters: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Session ID' },
          query: { type: 'string', description: 'Search query' },
          limit: { type: 'number', description: 'Max results' },
        },
        required: ['sessionId'],
      },
      handler: async (params: MemoryQuery) => {
        return recallMemory(params);
      },
    },
    memory_history: {
      description: 'Get recent conversation history from a session',
      parameters: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Session ID' },
          limit: { type: 'number', description: 'Max messages' },
        },
        required: ['sessionId'],
      },
      handler: async (params: { sessionId: string; limit?: number }) => {
        return getHistory(params.sessionId, params.limit);
      },
    },
  };
}

export default {
  AgentCoreMemoryService,
  storeMemory,
  recallMemory,
  getHistory,
  getMemoryTools,
};
