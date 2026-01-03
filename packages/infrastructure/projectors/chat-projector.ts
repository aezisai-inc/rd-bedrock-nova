/**
 * Chat Projector
 * 
 * Event Sourcing: イベントをRead Modelに投影
 * 
 * イベントを購読し、読み取り最適化されたビューを構築
 */
import { StoredEvent } from '../event-store';
import {
  ChatSessionReadModel,
  ChatMessageReadModel,
  ChatReadModelRepository,
} from '../../application/queries/chat/get-session.query';

/**
 * Read Model Writer（書き込み用インターフェース）
 */
export interface ChatReadModelWriter {
  upsertSession(session: ChatSessionReadModel): Promise<void>;
  insertMessage(message: ChatMessageReadModel): Promise<void>;
  incrementMessageCount(sessionId: string): Promise<void>;
  updateSessionStatus(sessionId: string, status: 'active' | 'archived'): Promise<void>;
}

/**
 * Chat Projector
 * 
 * イベント → Read Model 変換
 */
export class ChatProjector {
  constructor(private readonly writer: ChatReadModelWriter) {}

  /**
   * イベントを処理
   */
  async project(event: StoredEvent): Promise<void> {
    switch (event.eventType) {
      case 'SessionCreated':
        await this.onSessionCreated(event);
        break;
      case 'MessageAdded':
        await this.onMessageAdded(event);
        break;
      case 'SessionArchived':
        await this.onSessionArchived(event);
        break;
      default:
        // 未知のイベントは無視
        console.log(`[ChatProjector] Unknown event type: ${event.eventType}`);
    }
  }

  private async onSessionCreated(event: StoredEvent): Promise<void> {
    const data = event.eventData as {
      sessionId: string;
      userId: string;
      title: string;
      createdAt: string;
    };

    const session: ChatSessionReadModel = {
      id: data.sessionId,
      userId: data.userId,
      title: data.title,
      status: 'active',
      messageCount: 0,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.createdAt),
    };

    await this.writer.upsertSession(session);
  }

  private async onMessageAdded(event: StoredEvent): Promise<void> {
    const data = event.eventData as {
      messageId: string;
      sessionId: string;
      role: 'user' | 'assistant' | 'system';
      content: string;
      fileKeys?: string[];
      addedAt: string;
    };

    const message: ChatMessageReadModel = {
      id: data.messageId,
      sessionId: data.sessionId,
      role: data.role,
      content: data.content,
      fileKeys: data.fileKeys,
      createdAt: new Date(data.addedAt),
    };

    await this.writer.insertMessage(message);
    await this.writer.incrementMessageCount(data.sessionId);
  }

  private async onSessionArchived(event: StoredEvent): Promise<void> {
    const data = event.eventData as { sessionId: string };
    await this.writer.updateSessionStatus(data.sessionId, 'archived');
  }
}

/**
 * Projector Runner
 * 
 * イベントストリームを監視してProjectorを実行
 */
export class ProjectorRunner {
  constructor(
    private readonly projectors: Array<{ project: (event: StoredEvent) => Promise<void> }>
  ) {}

  async processEvent(event: StoredEvent): Promise<void> {
    for (const projector of this.projectors) {
      try {
        await projector.project(event);
      } catch (error) {
        console.error(`[ProjectorRunner] Error processing event ${event.eventId}:`, error);
        // 本番ではDLQに送信
      }
    }
  }

  /**
   * イベントストリームを再構築（Read Model再構築用）
   */
  async rebuild(events: AsyncIterable<StoredEvent>): Promise<number> {
    let count = 0;
    for await (const event of events) {
      await this.processEvent(event);
      count++;
    }
    return count;
  }
}
