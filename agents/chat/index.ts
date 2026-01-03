/**
 * Chat Service
 * 
 * 12 Agent Factor マイクロサービス
 * 
 * 責務:
 * - セッション管理
 * - メッセージ永続化
 * - Read Model更新
 * 
 * Factor準拠:
 * - #1 Codebase: 独立したサービス
 * - #3 Config: 環境変数で設定
 * - #6 Processes: ステートレス
 * - #11 Logs: 構造化ログ出力
 */

import { EventStorePort } from '../../infrastructure/event-store';
import { StartSessionCommand, StartSessionHandler } from '../../application/commands/chat/start-session.command';
import { SendMessageCommand, SendMessageHandler } from '../../application/commands/chat/send-message.command';
import { GetSessionQuery, GetSessionHandler, ChatReadModelRepository } from '../../application/queries/chat/get-session.query';
import { ListSessionsQuery, ListSessionsHandler } from '../../application/queries/chat/list-sessions.query';

export interface ChatServiceConfig {
  eventStore: EventStorePort;
  readModelRepo: ChatReadModelRepository;
}

/**
 * Chat Service Facade
 * 
 * CQRS Command/Query を統合
 */
export class ChatService {
  private readonly startSessionHandler: StartSessionHandler;
  private readonly sendMessageHandler: SendMessageHandler;
  private readonly getSessionHandler: GetSessionHandler;
  private readonly listSessionsHandler: ListSessionsHandler;

  constructor(config: ChatServiceConfig) {
    // Command Handlers
    this.startSessionHandler = new StartSessionHandler(config.eventStore);
    this.sendMessageHandler = new SendMessageHandler(config.eventStore);
    
    // Query Handlers
    this.getSessionHandler = new GetSessionHandler(config.readModelRepo);
    this.listSessionsHandler = new ListSessionsHandler(config.readModelRepo);
  }

  // === Commands ===

  async startSession(userId: string, title?: string, traceId?: string) {
    const command = new StartSessionCommand(
      { userId, title },
      { userId, traceId }
    );
    return this.startSessionHandler.execute(command);
  }

  async sendMessage(
    sessionId: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
    options?: { fileKeys?: string[]; userId?: string; traceId?: string }
  ) {
    const command = new SendMessageCommand(
      { sessionId, role, content, fileKeys: options?.fileKeys },
      { userId: options?.userId, traceId: options?.traceId }
    );
    return this.sendMessageHandler.execute(command);
  }

  // === Queries ===

  async getSession(sessionId: string) {
    const query = new GetSessionQuery(sessionId);
    return this.getSessionHandler.execute(query);
  }

  async listSessions(userId: string, limit?: number) {
    const query = new ListSessionsQuery(userId, limit);
    return this.listSessionsHandler.execute(query);
  }
}

export * from '../../application/commands/chat/start-session.command';
export * from '../../application/commands/chat/send-message.command';
export * from '../../application/queries/chat/get-session.query';
export * from '../../application/queries/chat/list-sessions.query';
