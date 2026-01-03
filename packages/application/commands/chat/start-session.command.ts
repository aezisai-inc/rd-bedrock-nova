/**
 * StartSession Command
 * 
 * CQRS: チャットセッション開始コマンド
 */
import { Command, CommandHandler, CommandMetadata } from '../command';
import { ChatSession } from '../../../domain/chat/aggregates/chat-session';
import { EventStorePort } from '../../../infrastructure/event-store';

export interface StartSessionPayload {
  userId: string;
  title?: string;
}

export class StartSessionCommand extends Command<StartSessionPayload> {
  constructor(payload: StartSessionPayload, metadata?: Partial<CommandMetadata>) {
    super(payload, metadata);
  }
}

export interface StartSessionResult {
  sessionId: string;
}

/**
 * StartSession Handler
 */
export class StartSessionHandler implements CommandHandler<StartSessionCommand, StartSessionResult> {
  constructor(private readonly eventStore: EventStorePort) {}

  async execute(command: StartSessionCommand): Promise<StartSessionResult> {
    // 集約を作成
    const session = ChatSession.create(
      command.payload.userId,
      command.payload.title
    );

    // イベントを永続化
    await this.eventStore.append(
      session.id,
      'ChatSession',
      session.getUncommittedEvents(),
      0, // 新規作成なのでバージョン0
      {
        correlationId: command.metadata.correlationId,
        userId: command.payload.userId,
        traceId: command.metadata.traceId,
      }
    );

    // イベントをコミット
    session.clearUncommittedEvents();

    return { sessionId: session.id };
  }
}
