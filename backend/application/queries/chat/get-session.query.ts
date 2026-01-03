/**
 * GetSession Query
 * 
 * CQRS: セッション取得クエリ（Read Model経由）
 */
import { Query, QueryHandler } from '../query';

// Read Model（読み取り専用ビュー）
export interface ChatSessionReadModel {
  id: string;
  userId: string;
  title: string;
  status: 'active' | 'archived';
  messageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatMessageReadModel {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  fileKeys?: string[];
  createdAt: Date;
}

export interface SessionWithMessagesReadModel {
  session: ChatSessionReadModel;
  messages: ChatMessageReadModel[];
}

/**
 * GetSession Query
 */
export class GetSessionQuery extends Query<SessionWithMessagesReadModel | null> {
  constructor(public readonly sessionId: string) {
    super();
  }
}

/**
 * Read Model Repository インターフェース
 */
export interface ChatReadModelRepository {
  getSession(sessionId: string): Promise<ChatSessionReadModel | null>;
  getSessionWithMessages(sessionId: string): Promise<SessionWithMessagesReadModel | null>;
  listSessionsByUser(userId: string, limit?: number): Promise<ChatSessionReadModel[]>;
}

/**
 * GetSession Handler
 */
export class GetSessionHandler implements QueryHandler<GetSessionQuery, SessionWithMessagesReadModel | null> {
  constructor(private readonly readModelRepo: ChatReadModelRepository) {}

  async execute(query: GetSessionQuery): Promise<SessionWithMessagesReadModel | null> {
    return this.readModelRepo.getSessionWithMessages(query.sessionId);
  }
}
