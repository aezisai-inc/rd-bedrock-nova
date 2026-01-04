/**
 * KnowledgeSessionId Value Object
 */

import { v4 as uuidv4 } from 'uuid';

export class KnowledgeSessionId {
  private constructor(public readonly value: string) {
    if (!value || value.trim() === '') {
      throw new Error('KnowledgeSessionId cannot be empty');
    }
  }

  static generate(): KnowledgeSessionId {
    return new KnowledgeSessionId(`ks-${uuidv4()}`);
  }

  static fromString(value: string): KnowledgeSessionId {
    return new KnowledgeSessionId(value);
  }

  equals(other: KnowledgeSessionId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
