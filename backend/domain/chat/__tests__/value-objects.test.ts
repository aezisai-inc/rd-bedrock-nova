/**
 * Value Objects ユニットテスト
 * 
 * TDD: 値オブジェクトの不変性・等価性テスト
 */
import { describe, it, expect } from 'vitest';
import { SessionId } from '../value-objects/session-id';
import { MessageContent } from '../value-objects/message-content';
import { MessageRole } from '../value-objects/message-role';

describe('SessionId Value Object', () => {
  const validUUID1 = '123e4567-e89b-12d3-a456-426614174000';
  const validUUID2 = '123e4567-e89b-12d3-a456-426614174001';

  describe('create', () => {
    it('should create with generated UUID', () => {
      const sessionId = SessionId.generate();
      expect(sessionId.value).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('should create from existing valid UUID', () => {
      const sessionId = SessionId.fromString(validUUID1);
      expect(sessionId.value).toBe(validUUID1);
    });

    it('should throw for invalid session ID format', () => {
      expect(() => SessionId.fromString('invalid-id')).toThrow('Invalid session ID');
    });
  });

  describe('equality', () => {
    it('should be equal when values are same', () => {
      const id1 = SessionId.fromString(validUUID1);
      const id2 = SessionId.fromString(validUUID1);
      expect(id1.equals(id2)).toBe(true);
    });

    it('should not be equal when values differ', () => {
      const id1 = SessionId.fromString(validUUID1);
      const id2 = SessionId.fromString(validUUID2);
      expect(id1.equals(id2)).toBe(false);
    });
  });
});

describe('MessageContent Value Object', () => {
  describe('create', () => {
    it('should create with valid content', () => {
      const content = MessageContent.create('Hello, world!');
      expect(content.value).toBe('Hello, world!');
    });

    it('should trim whitespace', () => {
      const content = MessageContent.create('  Hello  ');
      expect(content.value).toBe('Hello');
    });

    it('should throw for empty content', () => {
      expect(() => MessageContent.create('')).toThrow();
    });

    it('should throw for whitespace-only content', () => {
      expect(() => MessageContent.create('   ')).toThrow();
    });

    it('should throw for content exceeding max length', () => {
      const longContent = 'a'.repeat(100001);
      expect(() => MessageContent.create(longContent)).toThrow('100000');
    });
  });

  describe('truncate', () => {
    it('should truncate long content', () => {
      const content = MessageContent.create('Hello, world!');
      const truncated = content.truncate(5);
      expect(truncated.value).toBe('Hello...');
    });

    it('should not truncate short content', () => {
      const content = MessageContent.create('Hi');
      const truncated = content.truncate(10);
      expect(truncated.value).toBe('Hi');
    });
  });
});

describe('MessageRole Enum', () => {
  it('should have user role', () => {
    expect(MessageRole.USER).toBe('user');
  });

  it('should have assistant role', () => {
    expect(MessageRole.ASSISTANT).toBe('assistant');
  });

  it('should have system role', () => {
    expect(MessageRole.SYSTEM).toBe('system');
  });
});
