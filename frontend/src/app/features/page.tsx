'use client';

/**
 * Features Page - Voice/Memory/Multimodal機能統合ページ
 * 
 * FSD app layer
 * E2Eテスト対応用の機能統合ページ
 */

import { useState } from 'react';
import { VoicePanel } from '@/features/voice/ui/VoicePanel';
import { MemoryPanel } from '@/features/memory/ui/MemoryPanel';
import { MultimodalPanel } from '@/features/multimodal/ui/MultimodalPanel';

type TabType = 'voice' | 'memory' | 'multimodal';

export default function FeaturesPage() {
  const [activeTab, setActiveTab] = useState<TabType>('voice');
  const [sessionId] = useState(() => `session-${Date.now()}`);

  const tabs: { key: TabType; label: string; icon: string }[] = [
    { key: 'voice', label: 'Voice', icon: '🎤' },
    { key: 'memory', label: 'Memory', icon: '🧠' },
    { key: 'multimodal', label: 'Multimodal', icon: '🎨' },
  ];

  return (
    <div className="max-w-6xl mx-auto p-4 h-[calc(100vh-80px)] flex flex-col">
      {/* Tab Navigation */}
      <nav className="flex gap-2 mb-4" data-testid="feature-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            data-testid={`tab-${tab.key}`}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              activeTab === tab.key
                ? 'bg-purple-600 text-white shadow-lg'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            <span className="mr-2">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Tab Content */}
      <div className="flex-1 bg-white rounded-xl shadow-xl overflow-hidden" data-testid="feature-content">
        {activeTab === 'voice' && (
          <div data-testid="voice-panel-container">
            <VoicePanel sessionId={sessionId} />
          </div>
        )}

        {activeTab === 'memory' && (
          <div data-testid="memory-panel-container">
            <MemoryPanel sessionId={sessionId} />
          </div>
        )}

        {activeTab === 'multimodal' && (
          <div data-testid="multimodal-panel-container">
            <MultimodalPanel />
          </div>
        )}
      </div>

      {/* Session Info */}
      <div className="mt-4 text-center text-slate-400 text-xs">
        Session ID: <code className="bg-slate-800 px-2 py-1 rounded">{sessionId}</code>
      </div>
    </div>
  );
}
