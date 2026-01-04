/**
 * Knowledge Feature - Model Layer (FSD)
 *
 * React hooks for Knowledge Base integration
 */

import { useState, useCallback } from 'react';

// =============================================================================
// Types
// =============================================================================

export interface SearchResult {
  documentId: string;
  score: number;
  excerpt: string;
  sourceUri?: string;
  metadata?: Record<string, unknown>;
}

export interface RagResponse {
  answer: string;
  citations: Citation[];
  sessionId?: string;
}

export interface Citation {
  documentId: string;
  excerpt: string;
  pageNumber?: number;
}

export interface SearchFilters {
  sourceType?: 'pdf' | 'text' | 'html' | 'all';
  dateRange?: {
    from?: string;
    to?: string;
  };
}

export interface UseKnowledgeSearchOptions {
  topK?: number;
  filters?: SearchFilters;
}

export interface UseKnowledgeSearchReturn {
  results: SearchResult[];
  isLoading: boolean;
  error: Error | null;
  search: (query: string) => Promise<void>;
  clear: () => void;
}

export interface UseRagQueryReturn {
  response: RagResponse | null;
  isLoading: boolean;
  error: Error | null;
  query: (question: string) => Promise<void>;
  clear: () => void;
}

// =============================================================================
// API Client (will be replaced with actual GraphQL client)
// =============================================================================

const API_ENDPOINT = process.env.NEXT_PUBLIC_API_ENDPOINT || '/api';

async function searchKnowledgeApi(
  query: string,
  options?: UseKnowledgeSearchOptions
): Promise<SearchResult[]> {
  const response = await fetch(`${API_ENDPOINT}/knowledge/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      topK: options?.topK ?? 5,
      filters: options?.filters,
    }),
  });

  if (!response.ok) {
    throw new Error(`Search failed: ${response.statusText}`);
  }

  const data = await response.json();
  return data.results;
}

async function ragQueryApi(question: string, sessionId?: string): Promise<RagResponse> {
  const response = await fetch(`${API_ENDPOINT}/knowledge/rag`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: question, sessionId }),
  });

  if (!response.ok) {
    throw new Error(`RAG query failed: ${response.statusText}`);
  }

  return response.json();
}

// =============================================================================
// Hooks
// =============================================================================

/**
 * useKnowledgeSearch - Knowledge Base 検索フック
 */
export function useKnowledgeSearch(
  options?: UseKnowledgeSearchOptions
): UseKnowledgeSearchReturn {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const search = useCallback(
    async (query: string) => {
      if (!query.trim()) {
        setResults([]);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const searchResults = await searchKnowledgeApi(query, options);
        setResults(searchResults);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Search failed'));
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    },
    [options]
  );

  const clear = useCallback(() => {
    setResults([]);
    setError(null);
  }, []);

  return { results, isLoading, error, search, clear };
}

/**
 * useRagQuery - RAG クエリフック
 */
export function useRagQuery(): UseRagQueryReturn {
  const [response, setResponse] = useState<RagResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [sessionId, setSessionId] = useState<string | undefined>();

  const query = useCallback(
    async (question: string) => {
      if (!question.trim()) {
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const ragResponse = await ragQueryApi(question, sessionId);
        setResponse(ragResponse);
        if (ragResponse.sessionId) {
          setSessionId(ragResponse.sessionId);
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error('RAG query failed'));
        setResponse(null);
      } finally {
        setIsLoading(false);
      }
    },
    [sessionId]
  );

  const clear = useCallback(() => {
    setResponse(null);
    setError(null);
    setSessionId(undefined);
  }, []);

  return { response, isLoading, error, query, clear };
}
