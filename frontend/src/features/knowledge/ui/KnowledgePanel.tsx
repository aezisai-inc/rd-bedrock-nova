'use client';

/**
 * KnowledgePanel - Knowledge Base Search UI
 *
 * FSD features/knowledge/ui layer
 * Atomic Design: Organism
 */

import React, { useState, useCallback, FormEvent } from 'react';
import { useKnowledgeSearch, useRagQuery, type SearchResult } from '../model/use-knowledge';

// =============================================================================
// Sub-components (Molecules)
// =============================================================================

interface SearchResultCardProps {
  result: SearchResult;
  index: number;
}

function SearchResultCard({ result, index }: SearchResultCardProps) {
  const relevanceColor =
    result.score >= 0.8
      ? 'bg-emerald-50 border-emerald-200'
      : result.score >= 0.5
        ? 'bg-amber-50 border-amber-200'
        : 'bg-slate-50 border-slate-200';

  return (
    <div
      className={`rounded-lg border p-4 ${relevanceColor} transition-all hover:shadow-md`}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <p className="text-sm text-slate-700 line-clamp-3">{result.excerpt}</p>
          {result.sourceUri && (
            <p className="mt-2 text-xs text-slate-500 truncate" title={result.sourceUri}>
              📄 {result.sourceUri.split('/').pop()}
            </p>
          )}
        </div>
        <div className="shrink-0">
          <span
            className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
              result.score >= 0.8
                ? 'bg-emerald-100 text-emerald-700'
                : result.score >= 0.5
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-slate-100 text-slate-600'
            }`}
          >
            {(result.score * 100).toFixed(0)}%
          </span>
        </div>
      </div>
    </div>
  );
}

interface RagAnswerCardProps {
  answer: string;
  citations: Array<{ documentId: string; excerpt: string; pageNumber?: number }>;
}

function RagAnswerCard({ answer, citations }: RagAnswerCardProps) {
  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-6">
      <div className="mb-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-indigo-900">
          <span className="text-lg">💡</span> AI 回答
        </h3>
      </div>
      <p className="text-slate-800 whitespace-pre-wrap leading-relaxed">{answer}</p>

      {citations.length > 0 && (
        <div className="mt-6 border-t border-indigo-200 pt-4">
          <h4 className="text-xs font-semibold text-indigo-700 mb-2">参照元:</h4>
          <ul className="space-y-2">
            {citations.map((citation, idx) => (
              <li
                key={idx}
                className="text-xs text-slate-600 bg-white/50 rounded p-2 line-clamp-2"
              >
                📎 {citation.excerpt}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Main Component (Organism)
// =============================================================================

type SearchMode = 'search' | 'rag';

export function KnowledgePanel() {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<SearchMode>('rag');

  const {
    results: searchResults,
    isLoading: isSearchLoading,
    error: searchError,
    search,
    clear: clearSearch,
  } = useKnowledgeSearch({ topK: 5 });

  const {
    response: ragResponse,
    isLoading: isRagLoading,
    error: ragError,
    query: ragQuery,
    clear: clearRag,
  } = useRagQuery();

  const isLoading = mode === 'search' ? isSearchLoading : isRagLoading;
  const error = mode === 'search' ? searchError : ragError;

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!query.trim()) return;

      if (mode === 'search') {
        await search(query);
      } else {
        await ragQuery(query);
      }
    },
    [query, mode, search, ragQuery]
  );

  const handleClear = useCallback(() => {
    setQuery('');
    clearSearch();
    clearRag();
  }, [clearSearch, clearRag]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-slate-200 bg-gradient-to-r from-indigo-50 to-violet-50 px-6 py-4">
        <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <span className="text-2xl">🔍</span> Knowledge Base
        </h2>
        <p className="text-sm text-slate-600 mt-1">
          Bedrock Knowledge Bases でドキュメントを検索
        </p>
      </div>

      {/* Mode Toggle */}
      <div className="px-6 py-3 border-b border-slate-100 bg-slate-50">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode('rag')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
              mode === 'rag'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            💡 RAG 質問応答
          </button>
          <button
            type="button"
            onClick={() => setMode('search')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
              mode === 'search'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            🔎 ベクトル検索
          </button>
        </div>
      </div>

      {/* Search Form */}
      <form onSubmit={handleSubmit} className="px-6 py-4 border-b border-slate-100">
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              mode === 'rag' ? '質問を入力してください...' : '検索キーワードを入力...'
            }
            className="flex-1 px-4 py-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-slate-800 placeholder:text-slate-400"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !query.trim()}
            className="px-6 py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <svg
                  className="animate-spin h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                処理中
              </span>
            ) : (
              '検索'
            )}
          </button>
          {(searchResults.length > 0 || ragResponse) && (
            <button
              type="button"
              onClick={handleClear}
              className="px-4 py-3 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all"
            >
              クリア
            </button>
          )}
        </div>
      </form>

      {/* Results Area */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {/* Error State */}
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-red-700">
            <p className="font-medium">エラーが発生しました</p>
            <p className="text-sm mt-1">{error.message}</p>
          </div>
        )}

        {/* RAG Response */}
        {mode === 'rag' && ragResponse && (
          <RagAnswerCard answer={ragResponse.answer} citations={ragResponse.citations} />
        )}

        {/* Search Results */}
        {mode === 'search' && searchResults.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600 mb-4">
              {searchResults.length} 件の結果が見つかりました
            </p>
            {searchResults.map((result, idx) => (
              <SearchResultCard key={result.documentId} result={result} index={idx} />
            ))}
          </div>
        )}

        {/* Empty State */}
        {!isLoading &&
          !error &&
          ((mode === 'search' && searchResults.length === 0 && query) ||
            (mode === 'rag' && !ragResponse && query)) && (
            <div className="text-center py-12 text-slate-500">
              <p className="text-4xl mb-4">📭</p>
              <p>結果が見つかりませんでした</p>
            </div>
          )}

        {/* Initial State */}
        {!query && !searchResults.length && !ragResponse && (
          <div className="text-center py-12 text-slate-500">
            <p className="text-5xl mb-4">📚</p>
            <p className="font-medium">Knowledge Base を検索</p>
            <p className="text-sm mt-2">
              {mode === 'rag'
                ? '質問を入力すると、関連ドキュメントを参照して回答します'
                : 'キーワードを入力して、関連ドキュメントを検索します'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default KnowledgePanel;
