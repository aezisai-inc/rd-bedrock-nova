import { randomUUID } from 'crypto';
import { ValueObject } from '../../shared/value-object';

/**
 * セッションID値オブジェクト
 */
export class SessionId extends ValueObject<{ value: string }> {
  private constructor(value: string) {
    super({ value });
  }

  get value(): string {
    return this.props.value;
  }

  /**
   * 新しいセッションIDを生成
   */
  static generate(): SessionId {
    return new SessionId(randomUUID());
  }

  /**
   * 文字列からセッションIDを作成
   */
  static fromString(value: string): SessionId {
    if (!SessionId.isValid(value)) {
      throw new InvalidSessionIdError(value);
    }
    return new SessionId(value);
  }

  /**
   * UUIDとして有効かチェック
   */
  static isValid(value: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(value);
  }

  toString(): string {
    return this.props.value;
  }
}

export class InvalidSessionIdError extends Error {
  constructor(value: string) {
    super(`Invalid session ID: ${value}`);
    this.name = 'InvalidSessionIdError';
  }
}
