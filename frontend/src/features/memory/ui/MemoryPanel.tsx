'use client';

/**
 * MemoryPanel - Memory Management UI
 *
 * FSD features/memory/ui layer
 * Atomic Design: Organism
 */

import React, { useState, useCallback, FormEvent, useMemo } from 'react';
import { useMemorySession, useMemorySearch, type MemoryEvent } from '../model/use-memory';

// =============================================================================
// Sub-components (Molecules)
// =============================================================================

interface MemoryEventCardProps {
  event: MemoryEvent;
  isHighlighted?: boolean;
}

function MemoryEventCard({ event, isHighlighted = false }: MemoryEventCardProps) {
  const roleConfig = {
    user: {
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
      icon: '👤',
      label: 'User',
    },
    assistant: {
      bgColor: 'bg-emerald-50',
      borderColor: 'border-emerald-200',
      icon: '🤖',
      label: 'Assistant',
    },
    system: {
      bgColor: 'bg-slate-50',
      borderColor: 'border-slate-200',
      icon: '⚙️',
      label: 'System',
    },
  };

  const config = roleConfig[event.role];
  const timestamp = new Date(event.timestamp).toLocaleString('ja-JP');

  return (
    <div
      className={`rounded-lg border p-4 ${config.bgColor} ${config.borderColor} ${
        isHighlighted ? 'ring-2 ring-indigo-500' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="text-xl">{config.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-slate-700">{config.label}</span>
            <span className="text-xs text-slate-400">{timestamp}</span>
          </div>
          <p className="text-sm text-slate-800 whitespace-pre-wrap break-words">
            {event.content}
          </p>
        </div>
      </div>
    </div>
  );
}

interface TimelineProps {
  events: MemoryEvent[];
  highlightedIds?: Set<string>;
}

function Timeline({ events, highlightedIds }: TimelineProps) {
  if (events.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500">
        <p className="text-4xl mb-4">📝</p>
        <p>まだ記憶がありません</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {events.map((event) => (
        <MemoryEventCard
          key={event.eventId}
          event={event}
          isHighlighted={highlightedIds?.has(event.eventId)}
        />
      ))}
    </div>
  );
}

// =============================================================================
// Main Component (Organism)
// =============================================================================

interface MemoryPanelProps {
  sessionId?: string;
}

export function MemoryPanel({ sessionId: propSessionId }: MemoryPanelProps) {
  // 仮のセッションID（本番ではpropsまたはコンテキストから取得）
  const sessionId = propSessionId || `demo-session-${Date.now()}`;

  const { events, isLoading, error, storeEvent, refresh } = useMemorySession(sessionId);
  const { results: searchResults, isSearching, search, clear: clearSearch } = useMemorySearch(sessionId);

  const [activeTab, setActiveTab] = useState<'timeline' | 'search'>('timeline');
  const [searchQuery, setSearchQuery] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [messageRole, setMessageRole] = useState<'user' | 'assistant'>('user');

  const handleSearch = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!searchQuery.trim()) return;
      await search(searchQuery);
    },
    [searchQuery, search]
  );

  const handleAddMessage = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!newMessage.trim()) return;

      try {
        await storeEvent(messageRole, newMessage);
        setNewMessage('');
      } catch {
        // Error is handled by the hook
      }
    },
    [newMessage, messageRole, storeEvent]
  );

  const highlightedIds = useMemo(() => {
    if (!searchResults) return new Set<string>();
    return new Set(searchResults.events.map((e) => e.eventId));
  }, [searchResults]);

  const displayEvents = activeTab === 'search' && searchResults
    ? searchResults.events
    : events;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-slate-200 bg-gradient-to-r from-violet-50 to-purple-50 px-6 py-4">
        <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <span className="text-2xl">🧠</span> Memory
        </h2>
        <p className="text-sm text-slate-600 mt-1">
          AgentCore Memory で会話履歴を管理
        </p>
        <p className="text-xs text-slate-400 mt-1 font-mono">
          Session: {sessionId.substring(0, 16)}...
        </p>
      </div>

      {/* Tab Toggle */}
      <div className="px-6 py-3 border-b border-slate-100 bg-slate-50">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setActiveTab('timeline');
              clearSearch();
            }}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
              activeTab === 'timeline'
                ? 'bg-violet-600 text-white shadow-md'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            📜 タイムライン
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('search')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
              activeTab === 'search'
                ? 'bg-violet-600 text-white shadow-md'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            🔍 検索
          </button>
          <button
            type="button"
            onClick={refresh}
            disabled={isLoading}
            className="ml-auto px-3 py-2 text-sm text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all"
          >
            🔄
          </button>
        </div>
      </div>

      {/* Search Form (when search tab active) */}
      {activeTab === 'search' && (
        <form onSubmit={handleSearch} className="px-6 py-4 border-b border-slate-100 bg-white">
          <div className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="記憶を検索..."
              className="flex-1 px-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent text-slate-800"
            />
            <button
              type="submit"
              disabled={isSearching || !searchQuery.trim()}
              className="px-4 py-2 bg-violet-600 text-white font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isSearching ? '...' : '検索'}
            </button>
          </div>
          {searchResults && (
            <p className="text-xs text-slate-500 mt-2">
              {searchResults.totalCount} 件の結果
              {searchResults.hasMore && ' (さらに表示可能)'}
            </p>
          )}
        </form>
      )}

      {/* Events List */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-red-700 mb-4">
            <p className="font-medium">エラーが発生しました</p>
            <p className="text-sm mt-1">{error.message}</p>
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-12 text-slate-500">
            <div className="animate-spin text-4xl mb-4">⏳</div>
            <p>読み込み中...</p>
          </div>
        ) : (
          <Timeline events={displayEvents} highlightedIds={highlightedIds} />
        )}
      </div>

      {/* Add Message Form */}
      <div className="border-t border-slate-200 bg-slate-50 px-6 py-4">
        <form onSubmit={handleAddMessage} className="space-y-3">
          <div className="flex gap-2">
            <select
              value={messageRole}
              onChange={(e) => setMessageRole(e.target.value as 'user' | 'assistant')}
              className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              <option value="user">👤 User</option>
              <option value="assistant">🤖 Assistant</option>
            </select>
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="メッセージを追加..."
              className="flex-1 px-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent text-slate-800"
            />
            <button
              type="submit"
              disabled={!newMessage.trim()}
              className="px-4 py-2 bg-violet-600 text-white font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              追加
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default MemoryPanel;
