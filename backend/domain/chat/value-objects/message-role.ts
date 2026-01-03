/**
 * メッセージロール
 */
export enum MessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system',
}

export function isValidMessageRole(value: string): value is MessageRole {
  return Object.values(MessageRole).includes(value as MessageRole);
}
