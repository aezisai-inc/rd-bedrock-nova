/**
 * Memory Feature - Model Layer (FSD)
 *
 * React hooks for AgentCore Memory integration
 * GraphQL API経由でAmplify Lambdaを呼び出す
 */

import { useState, useCallback, useEffect } from 'react';
import { generateClient } from 'aws-amplify/data';

// =============================================================================
// Types
// =============================================================================

export interface MemoryEvent {
  eventId: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface Session {
  sessionId: string;
  title?: string;
  createdAt: string;
  lastActivityAt: string;
  messageCount: number;
  status: 'active' | 'closed';
}

export interface MemorySearchResult {
  events: MemoryEvent[];
  totalCount: number;
  hasMore: boolean;
}

// =============================================================================
// GraphQL Client
// =============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getClient = () => generateClient() as any;

// =============================================================================
// Hooks
// =============================================================================

/**
 * useMemorySession - セッション記憶管理フック (GraphQL API使用)
 */
export function useMemorySession(sessionId: string) {
  const [events, setEvents] = useState<MemoryEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // 初回ロード
  useEffect(() => {
    if (!sessionId) return;

    const loadHistory = async () => {
      setIsLoading(true);
      try {
        const client = getClient();
        const response = await client.queries.getSessionHistory({
          sessionId,
          limit: 50,
        });

        if (response.errors) {
          throw new Error(response.errors[0]?.message || 'Failed to load history');
        }

        const history = (response.data || []) as MemoryEvent[];
        setEvents(history);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to load history'));
      } finally {
        setIsLoading(false);
      }
    };

    loadHistory();
  }, [sessionId]);

  const storeEvent = useCallback(
    async (
      role: 'user' | 'assistant' | 'system',
      content: string,
      metadata?: Record<string, unknown>
    ) => {
      try {
        const client = getClient();
        const response = await client.mutations.storeMemory({
          sessionId,
          role,
          content,
          metadata,
        });

        if (response.errors) {
          throw new Error(response.errors[0]?.message || 'Failed to store memory');
        }

        const event = response.data as MemoryEvent;
        setEvents((prev) => [...prev, event]);
        return event;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to store'));
        throw err;
      }
    },
    [sessionId]
  );

  const search = useCallback(
    async (query: string, limit?: number) => {
      setIsLoading(true);
      try {
        const client = getClient();
        const response = await client.queries.recallMemory({
          sessionId,
          query,
          limit: limit || 10,
        });

        if (response.errors) {
          throw new Error(response.errors[0]?.message || 'Search failed');
        }

        return response.data as MemorySearchResult;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Search failed'));
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [sessionId]
  );

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const client = getClient();
      const response = await client.queries.getSessionHistory({
        sessionId,
        limit: 50,
      });

      if (response.errors) {
        throw new Error(response.errors[0]?.message || 'Refresh failed');
      }

      const history = (response.data || []) as MemoryEvent[];
      setEvents(history);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Refresh failed'));
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  return {
    events,
    isLoading,
    error,
    storeEvent,
    search,
    refresh,
  };
}

/**
 * useMemorySearch - 記憶検索フック (GraphQL API使用)
 */
export function useMemorySearch(sessionId: string) {
  const [results, setResults] = useState<MemorySearchResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const search = useCallback(
    async (query: string, options?: { limit?: number; offset?: number }) => {
      if (!query.trim()) {
        setResults(null);
        return;
      }

      setIsSearching(true);
      setError(null);

      try {
        const client = getClient();
        const response = await client.queries.recallMemory({
          sessionId,
          query,
          limit: options?.limit || 10,
          offset: options?.offset || 0,
        });

        if (response.errors) {
          throw new Error(response.errors[0]?.message || 'Search failed');
        }

        const result = response.data as MemorySearchResult;
        setResults(result);
        return result;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Search failed'));
        setResults(null);
        throw err;
      } finally {
        setIsSearching(false);
      }
    },
    [sessionId]
  );

  const clear = useCallback(() => {
    setResults(null);
    setError(null);
  }, []);

  return {
    results,
    isSearching,
    error,
    search,
    clear,
  };
}

/**
 * useMemoryStore - 記憶保存専用フック (GraphQL API使用)
 */
export function useMemoryStore(sessionId: string) {
  const [isStoring, setIsStoring] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const store = useCallback(
    async (
      role: 'user' | 'assistant' | 'system',
      content: string,
      metadata?: Record<string, unknown>
    ) => {
      setIsStoring(true);
      setError(null);

      try {
        const client = getClient();
        const response = await client.mutations.storeMemory({
          sessionId,
          role,
          content,
          metadata,
        });

        if (response.errors) {
          throw new Error(response.errors[0]?.message || 'Store failed');
        }

        return response.data as MemoryEvent;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Store failed');
        setError(error);
        throw error;
      } finally {
        setIsStoring(false);
      }
    },
    [sessionId]
  );

  return {
    isStoring,
    error,
    store,
  };
}
