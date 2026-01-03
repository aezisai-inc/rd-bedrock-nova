/**
 * ChatSession 集約 ユニットテスト
 * 
 * TDD: Red-Green-Refactor サイクル
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ChatSession } from '../aggregates/chat-session';
import { MessageRole } from '../value-objects/message-role';

describe('ChatSession Aggregate', () => {
  describe('create', () => {
    it('should create a new session with initial state', () => {
      // Act
      const session = ChatSession.create('user-123', 'Test Session');

      // Assert
      expect(session.id).toBeDefined();
      expect(session.userId).toBe('user-123');
      expect(session.title).toBe('Test Session');
      expect(session.status).toBe('active');
      expect(session.messageCount).toBe(0);
    });

    it('should emit SessionCreated event', () => {
      // Act
      const session = ChatSession.create('user-123', 'Test Session');
      const events = session.getUncommittedEvents();

      // Assert
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('SessionCreated');
    });

    it('should use default title if not provided', () => {
      // Act
      const session = ChatSession.create('user-123');

      // Assert
      expect(session.title).toMatch(/^New Chat/);
    });
  });

  describe('addMessage', () => {
    let session: ChatSession;

    beforeEach(() => {
      session = ChatSession.create('user-123', 'Test Session');
      session.clearUncommittedEvents(); // 初期イベントをクリア
    });

    it('should add a user message', () => {
      // Act
      const messageId = session.addMessage(MessageRole.user, 'Hello, AI!');

      // Assert
      expect(messageId).toBeDefined();
      expect(session.messageCount).toBe(1);
    });

    it('should add an assistant message', () => {
      // Act
      session.addMessage(MessageRole.user, 'Hello');
      const messageId = session.addMessage(MessageRole.assistant, 'Hi there!');

      // Assert
      expect(messageId).toBeDefined();
      expect(session.messageCount).toBe(2);
    });

    it('should emit MessageAdded event', () => {
      // Act
      session.addMessage(MessageRole.user, 'Test message');
      const events = session.getUncommittedEvents();

      // Assert
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('MessageAdded');
    });

    it('should include fileKeys in message', () => {
      // Act
      session.addMessage(MessageRole.user, 'Check this file', ['file-1.jpg']);
      const events = session.getUncommittedEvents();

      // Assert
      const eventData = events[0].toJSON();
      expect(eventData.fileKeys).toEqual(['file-1.jpg']);
    });

    it('should throw error for empty content', () => {
      // Act & Assert
      expect(() => session.addMessage(MessageRole.user, '')).toThrow();
    });

    it('should throw error for archived session', () => {
      // Arrange
      session.archive();
      session.clearUncommittedEvents();

      // Act & Assert
      expect(() => session.addMessage(MessageRole.user, 'Test')).toThrow('archived');
    });
  });

  describe('archive', () => {
    it('should archive an active session', () => {
      // Arrange
      const session = ChatSession.create('user-123', 'Test');
      session.clearUncommittedEvents();

      // Act
      session.archive();

      // Assert
      expect(session.status).toBe('archived');
    });

    it('should emit SessionArchived event', () => {
      // Arrange
      const session = ChatSession.create('user-123', 'Test');
      session.clearUncommittedEvents();

      // Act
      session.archive();
      const events = session.getUncommittedEvents();

      // Assert
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('SessionArchived');
    });

    it('should not archive already archived session', () => {
      // Arrange
      const session = ChatSession.create('user-123', 'Test');
      session.archive();
      session.clearUncommittedEvents();

      // Act
      session.archive();
      const events = session.getUncommittedEvents();

      // Assert
      expect(events).toHaveLength(0); // 重複イベントなし
    });
  });

  describe('fromEvents (Event Sourcing reconstitution)', () => {
    it('should reconstitute session from events', () => {
      // Arrange
      const events = [
        {
          eventType: 'SessionCreated',
          sessionId: 'session-123',
          userId: 'user-456',
          title: 'Reconstituted Session',
          createdAt: new Date().toISOString(),
        },
        {
          eventType: 'MessageAdded',
          messageId: 'msg-1',
          sessionId: 'session-123',
          role: 'user',
          content: 'Hello',
          addedAt: new Date().toISOString(),
        },
        {
          eventType: 'MessageAdded',
          messageId: 'msg-2',
          sessionId: 'session-123',
          role: 'assistant',
          content: 'Hi!',
          addedAt: new Date().toISOString(),
        },
      ];

      // Act
      const session = ChatSession.fromEvents(events);

      // Assert
      expect(session.id).toBe('session-123');
      expect(session.userId).toBe('user-456');
      expect(session.title).toBe('Reconstituted Session');
      expect(session.messageCount).toBe(2);
      expect(session.status).toBe('active');
    });

    it('should handle archived session reconstitution', () => {
      // Arrange
      const events = [
        {
          eventType: 'SessionCreated',
          sessionId: 'session-123',
          userId: 'user-456',
          title: 'Archived Session',
          createdAt: new Date().toISOString(),
        },
        {
          eventType: 'SessionArchived',
          sessionId: 'session-123',
          archivedAt: new Date().toISOString(),
        },
      ];

      // Act
      const session = ChatSession.fromEvents(events);

      // Assert
      expect(session.status).toBe('archived');
    });
  });
});
