/**
 * ChatSession 集約 ユニットテスト
 * 
 * TDD: Red-Green-Refactor サイクル
 * 実装: AggregateRoot + Event Sourcing
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ChatSession, SessionStatus } from '../aggregates/chat-session';
import { MessageRole } from '../value-objects/message-role';
import { MessageContent } from '../value-objects/message-content';

describe('ChatSession Aggregate', () => {
  describe('create', () => {
    it('should create a new session with initial state', () => {
      // Act
      const session = ChatSession.create({ 
        ownerId: 'user-123', 
        title: 'Test Session' 
      });

      // Assert
      expect(session.id).toBeDefined();
      expect(session.ownerId).toBe('user-123');
      expect(session.title).toBe('Test Session');
      expect(session.status).toBe(SessionStatus.ACTIVE);
      expect(session.messageCount).toBe(0);
    });

    it('should use default title if not provided', () => {
      // Act
      const session = ChatSession.create({ ownerId: 'user-123' });

      // Assert - default title is "Chat {date}"
      expect(session.title).toMatch(/^Chat/);
    });
  });

  describe('addMessage', () => {
    let session: ChatSession;

    beforeEach(() => {
      session = ChatSession.create({ 
        ownerId: 'user-123', 
        title: 'Test Session' 
      });
    });

    it('should add a user message', () => {
      // Act
      const content = MessageContent.create('Hello, AI!');
      session.addMessage(content, MessageRole.USER);

      // Assert
      expect(session.messageCount).toBe(1);
      expect(session.messages[0].role).toBe(MessageRole.USER);
      expect(session.messages[0].content).toBe('Hello, AI!');
    });

    it('should add an assistant message', () => {
      // Act
      const userContent = MessageContent.create('Hello');
      session.addMessage(userContent, MessageRole.USER);
      
      const assistantContent = MessageContent.create('Hi there!');
      session.addMessage(assistantContent, MessageRole.ASSISTANT);

      // Assert
      expect(session.messageCount).toBe(2);
      expect(session.messages[1].role).toBe(MessageRole.ASSISTANT);
    });

    it('should include fileKeys in message', () => {
      // Act
      const content = MessageContent.create('Check this file');
      session.addMessage(content, MessageRole.USER, ['file-1.jpg']);

      // Assert
      expect(session.messages[0].fileKeys).toEqual(['file-1.jpg']);
    });

    it('should throw error for empty content', () => {
      // Act & Assert
      expect(() => MessageContent.create('')).toThrow();
    });

    it('should throw error for archived session', () => {
      // Arrange
      session.archive();

      // Act & Assert
      const content = MessageContent.create('Test');
      expect(() => session.addMessage(content, MessageRole.USER)).toThrow('not active');
    });
  });

  describe('archive', () => {
    it('should archive an active session', () => {
      // Arrange
      const session = ChatSession.create({ 
        ownerId: 'user-123', 
        title: 'Test' 
      });

      // Act
      session.archive();

      // Assert
      expect(session.status).toBe(SessionStatus.ARCHIVED);
    });

    it('should throw error when archiving already archived session', () => {
      // Arrange
      const session = ChatSession.create({ 
        ownerId: 'user-123', 
        title: 'Test' 
      });
      session.archive();

      // Act & Assert
      expect(() => session.archive()).toThrow('not active');
    });
  });

  describe('messages', () => {
    it('should track last message timestamp', () => {
      // Arrange
      const session = ChatSession.create({ 
        ownerId: 'user-123', 
        title: 'Test' 
      });

      // Initially no last message
      expect(session.lastMessageAt).toBeNull();

      // Act
      const content = MessageContent.create('Hello');
      session.addMessage(content, MessageRole.USER);

      // Assert
      expect(session.lastMessageAt).toBeInstanceOf(Date);
    });

    it('should return immutable messages array', () => {
      // Arrange
      const session = ChatSession.create({ 
        ownerId: 'user-123', 
        title: 'Test' 
      });
      const content = MessageContent.create('Test message');
      session.addMessage(content, MessageRole.USER);

      // Act
      const messages = session.messages;
      
      // Assert - messages should be readonly copy
      expect(messages).toHaveLength(1);
      expect(messages === session.messages).toBe(false); // Different array reference
    });
  });
});
