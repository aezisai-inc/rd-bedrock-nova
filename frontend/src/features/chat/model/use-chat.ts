'use client';

import { useState, useCallback, useRef } from 'react';
import { generateId } from '@/shared/lib/utils';
import { container } from '@/shared/api';  // ポート経由でアクセス

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  fileKeys?: string[];
}

export interface UseChatOptions {
  sessionId?: string;
  initialMessages?: Message[];
}

export interface UseChatReturn {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  sendMessage: (content: string, fileKeys?: string[]) => Promise<void>;
  clearMessages: () => void;
}

/**
 * チャット機能フック
 * 
 * FSD Feature層：ビジネスロジックをカプセル化
 * 
 * Clean Architecture準拠:
 * - ApiPort経由でインフラ層にアクセス
 * - 直接Amplifyに依存しない
 */
export function useChat(options: UseChatOptions = {}): UseChatReturn {
  const [messages, setMessages] = useState<Message[]>(options.initialMessages ?? []);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sessionIdRef = useRef(options.sessionId ?? generateId());

  const sendMessage = useCallback(async (content: string, fileKeys?: string[]) => {
    if (!content.trim()) return;

    setError(null);

    // ユーザーメッセージを追加
    const userMessage: Message = {
      id: generateId(),
      role: 'user',
      content,
      timestamp: new Date(),
      fileKeys,
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      // ApiPort経由でAgent呼び出し（依存性逆転）
      const response = await container.api.invokeAgent({
        sessionId: sessionIdRef.current,
        message: content,
        fileKeys: fileKeys ?? [],
      });

      // アシスタントメッセージを追加
      const assistantMessage: Message = {
        id: generateId(),
        role: 'assistant',
        content: response,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);

      // エラーメッセージを追加
      const errorResponse: Message = {
        id: generateId(),
        role: 'assistant',
        content: `エラーが発生しました: ${errorMessage}`,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, errorResponse]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    sessionIdRef.current = generateId();
  }, []);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    clearMessages,
  };
}
