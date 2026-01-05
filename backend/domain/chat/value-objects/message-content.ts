import { ValueObject } from '../../shared/value-object';

/**
 * メッセージ内容値オブジェクト
 */
export class MessageContent extends ValueObject<{ text: string }> {
  static readonly MAX_LENGTH = 100_000; // 100KB

  private constructor(text: string) {
    super({ text });
  }

  get text(): string {
    return this.props.text;
  }

  /** Alias for text (for compatibility) */
  get value(): string {
    return this.props.text;
  }

  get length(): number {
    return this.props.text.length;
  }

  /**
   * 内容を指定長で切り詰め
   */
  truncate(maxLength: number): MessageContent {
    if (this.props.text.length <= maxLength) {
      return this;
    }
    return MessageContent.fromExisting(this.props.text.slice(0, maxLength) + '...');
  }

  /**
   * メッセージ内容を作成
   */
  static create(text: string): MessageContent {
    const trimmed = text.trim();
    
    if (trimmed.length === 0) {
      throw new EmptyMessageError();
    }
    
    if (trimmed.length > this.MAX_LENGTH) {
      throw new MessageTooLongError(trimmed.length, this.MAX_LENGTH);
    }
    
    return new MessageContent(trimmed);
  }

  /**
   * 既存のテキストから作成（バリデーションスキップ）
   * イベント再構築時に使用
   */
  static fromExisting(text: string): MessageContent {
    return new MessageContent(text);
  }

  toString(): string {
    return this.props.text;
  }
}

export class EmptyMessageError extends Error {
  constructor() {
    super('Message content cannot be empty');
    this.name = 'EmptyMessageError';
  }
}

export class MessageTooLongError extends Error {
  constructor(actual: number, max: number) {
    super(`Message too long: ${actual} characters (max: ${max})`);
    this.name = 'MessageTooLongError';
  }
}
