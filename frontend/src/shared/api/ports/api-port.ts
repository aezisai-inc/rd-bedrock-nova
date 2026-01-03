/**
 * API通信ポート（インターフェース）
 * 
 * Clean Architecture: バックエンドAPI通信の抽象化
 */

export interface MessageInput {
  sessionId: string;
  message: string;
  fileKeys?: string[];
}

export interface MessageResponse {
  content: string;
  metadata?: Record<string, unknown>;
}

export interface ChatSession {
  id: string;
  title: string;
  lastMessageAt?: Date;
  messageCount?: number;
  status: 'active' | 'archived';
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface UploadUrlResult {
  uploadUrl: string;
  s3Key: string;
}

export interface PaginatedResult<T> {
  items: T[];
  nextToken?: string;
}

/**
 * API通信ポート
 */
export interface ApiPort {
  /**
   * Agent呼び出し
   */
  invokeAgent(input: MessageInput): Promise<string>;

  /**
   * セッション一覧取得
   */
  listSessions(limit?: number, nextToken?: string): Promise<PaginatedResult<ChatSession>>;

  /**
   * メッセージ一覧取得
   */
  listMessages(sessionId: string, limit?: number, nextToken?: string): Promise<PaginatedResult<ChatMessage>>;

  /**
   * セッション作成
   */
  createSession(title?: string): Promise<ChatSession>;

  /**
   * アップロードURL取得
   */
  getUploadUrl(fileName: string, fileType: string): Promise<UploadUrlResult>;
}
