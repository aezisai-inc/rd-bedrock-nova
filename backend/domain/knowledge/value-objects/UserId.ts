/**
 * UserId Value Object
 */

import { v4 as uuidv4 } from 'uuid';

export class UserId {
  private constructor(public readonly value: string) {
    if (!value || value.trim() === '') {
      throw new Error('UserId cannot be empty');
    }
  }

  static generate(): UserId {
    return new UserId(`user-${uuidv4()}`);
  }

  static fromString(value: string): UserId {
    return new UserId(value);
  }

  equals(other: UserId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
