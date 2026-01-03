/**
 * ListSessions Query
 * 
 * CQRS: ユーザーのセッション一覧取得クエリ
 */
import { Query, QueryHandler } from '../query';
import { ChatSessionReadModel, ChatReadModelRepository } from './get-session.query';

export interface ListSessionsResult {
  sessions: ChatSessionReadModel[];
  nextToken?: string;
}

/**
 * ListSessions Query
 */
export class ListSessionsQuery extends Query<ListSessionsResult> {
  constructor(
    public readonly userId: string,
    public readonly limit: number = 20
  ) {
    super();
  }
}

/**
 * ListSessions Handler
 */
export class ListSessionsHandler implements QueryHandler<ListSessionsQuery, ListSessionsResult> {
  constructor(private readonly readModelRepo: ChatReadModelRepository) {}

  async execute(query: ListSessionsQuery): Promise<ListSessionsResult> {
    const sessions = await this.readModelRepo.listSessionsByUser(
      query.userId,
      query.limit
    );
    return { sessions };
  }
}
