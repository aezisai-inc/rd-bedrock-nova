/**
 * SendMessage Command
 * 
 * CQRS: メッセージ送信コマンド
 */
import { Command, CommandHandler, CommandMetadata } from '../command';
import { ChatSession } from '../../../domain/chat/aggregates/chat-session';
import { EventStorePort } from '../../../infrastructure/event-store';
import { MessageRole } from '../../../domain/chat/value-objects/message-role';

export interface SendMessagePayload {
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  fileKeys?: string[];
}

export class SendMessageCommand extends Command<SendMessagePayload> {
  constructor(payload: SendMessagePayload, metadata?: Partial<CommandMetadata>) {
    super(payload, metadata);
  }
}

export interface SendMessageResult {
  messageId: string;
}

/**
 * SendMessage Handler
 */
export class SendMessageHandler implements CommandHandler<SendMessageCommand, SendMessageResult> {
  constructor(private readonly eventStore: EventStorePort) {}

  async execute(command: SendMessageCommand): Promise<SendMessageResult> {
    // イベントストリームから集約を復元
    const stream = await this.eventStore.getStream(command.payload.sessionId);
    
    if (!stream) {
      throw new Error(`Session not found: ${command.payload.sessionId}`);
    }

    const session = ChatSession.fromEvents(stream.events.map(e => e.eventData));

    // メッセージを追加
    const role = MessageRole[command.payload.role];
    const messageId = session.addMessage(
      role,
      command.payload.content,
      command.payload.fileKeys
    );

    // イベントを永続化
    await this.eventStore.append(
      session.id,
      'ChatSession',
      session.getUncommittedEvents(),
      stream.version,
      {
        correlationId: command.metadata.correlationId,
        userId: command.metadata.userId,
        traceId: command.metadata.traceId,
      }
    );

    session.clearUncommittedEvents();

    return { messageId };
  }
}
