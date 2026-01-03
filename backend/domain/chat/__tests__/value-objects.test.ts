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
  describe('create', () => {
    it('should create with generated UUID', () => {
      const sessionId = SessionId.create();
      expect(sessionId.value).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('should create from existing value', () => {
      const value = 'existing-session-id';
      const sessionId = SessionId.fromString(value);
      expect(sessionId.value).toBe(value);
    });
  });

  describe('equality', () => {
    it('should be equal when values are same', () => {
      const id1 = SessionId.fromString('test-id');
      const id2 = SessionId.fromString('test-id');
      expect(id1.equals(id2)).toBe(true);
    });

    it('should not be equal when values differ', () => {
      const id1 = SessionId.fromString('test-id-1');
      const id2 = SessionId.fromString('test-id-2');
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
    expect(MessageRole.user).toBe('user');
  });

  it('should have assistant role', () => {
    expect(MessageRole.assistant).toBe('assistant');
  });

  it('should have system role', () => {
    expect(MessageRole.system).toBe('system');
  });
});
