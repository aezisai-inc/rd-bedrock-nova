/**
 * Memory Feature - Model Layer (FSD)
 *
 * React hooks for AgentCore Memory integration
 */

import { useState, useCallback, useEffect } from 'react';

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
// API Client
// =============================================================================

const API_ENDPOINT = process.env.NEXT_PUBLIC_API_ENDPOINT || '/api';

async function storeMemoryApi(
  sessionId: string,
  role: 'user' | 'assistant' | 'system',
  content: string,
  metadata?: Record<string, unknown>
): Promise<MemoryEvent> {
  const response = await fetch(`${API_ENDPOINT}/memory/store`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, role, content, metadata }),
  });

  if (!response.ok) {
    throw new Error(`Failed to store memory: ${response.statusText}`);
  }

  return response.json();
}

async function recallMemoryApi(
  sessionId: string,
  query?: string,
  limit?: number,
  offset?: number
): Promise<MemorySearchResult> {
  const params = new URLSearchParams({ sessionId });
  if (query) params.append('query', query);
  if (limit) params.append('limit', limit.toString());
  if (offset) params.append('offset', offset.toString());

  const response = await fetch(`${API_ENDPOINT}/memory/recall?${params}`);

  if (!response.ok) {
    throw new Error(`Failed to recall memory: ${response.statusText}`);
  }

  return response.json();
}

async function getHistoryApi(
  sessionId: string,
  limit?: number
): Promise<MemoryEvent[]> {
  const params = new URLSearchParams({ sessionId });
  if (limit) params.append('limit', limit.toString());

  const response = await fetch(`${API_ENDPOINT}/memory/history?${params}`);

  if (!response.ok) {
    throw new Error(`Failed to get history: ${response.statusText}`);
  }

  return response.json();
}

// =============================================================================
// Hooks
// =============================================================================

/**
 * useMemorySession - セッション記憶管理フック
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
        const history = await getHistoryApi(sessionId, 50);
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
        const event = await storeMemoryApi(sessionId, role, content, metadata);
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
        const result = await recallMemoryApi(sessionId, query, limit);
        return result;
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
      const history = await getHistoryApi(sessionId, 50);
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
 * useMemorySearch - 記憶検索フック
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
        const result = await recallMemoryApi(
          sessionId,
          query,
          options?.limit,
          options?.offset
        );
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
