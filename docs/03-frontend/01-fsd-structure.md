# Feature-Sliced Design (FSD) 設計書

## 1. FSD レイヤー構造

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    FEATURE-SLICED DESIGN LAYERS                              │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ Layer 7: app                                                         │    │
│  │                                                                      │    │
│  │ • アプリケーション初期化                                               │    │
│  │ • グローバルスタイル・プロバイダー                                      │    │
│  │ • ルーティング設定                                                    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                              │                                               │
│                              ▼                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ Layer 6: pages                                                       │    │
│  │                                                                      │    │
│  │ • ページコンポーネント                                                 │    │
│  │ • ルートごとのレイアウト                                               │    │
│  │ • ページ固有のロジック                                                 │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                              │                                               │
│                              ▼                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ Layer 5: widgets                                                     │    │
│  │                                                                      │    │
│  │ • 複合UIブロック                                                      │    │
│  │ • ビジネスロジックを含む                                              │    │
│  │ • 複数のfeature/entityを組み合わせ                                    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                              │                                               │
│                              ▼                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ Layer 4: features                                                    │    │
│  │                                                                      │    │
│  │ • ユーザーアクション                                                   │    │
│  │ • ビジネスロジック                                                    │    │
│  │ • インタラクション                                                    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                              │                                               │
│                              ▼                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ Layer 3: entities                                                    │    │
│  │                                                                      │    │
│  │ • ビジネスエンティティ                                                 │    │
│  │ • データ構造                                                          │    │
│  │ • CRUD操作                                                           │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                              │                                               │
│                              ▼                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ Layer 2: shared                                                      │    │
│  │                                                                      │    │
│  │ • 再利用可能なコンポーネント (Atomic Design)                          │    │
│  │ • ユーティリティ関数                                                  │    │
│  │ • 型定義・定数                                                        │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 2. ディレクトリ構造

```
frontend/
├── src/
│   ├── app/                          # Layer 7: App
│   │   ├── providers/
│   │   │   ├── AuthProvider.tsx
│   │   │   ├── QueryProvider.tsx
│   │   │   └── ThemeProvider.tsx
│   │   ├── styles/
│   │   │   ├── globals.css
│   │   │   └── themes.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   │
│   ├── pages/                        # Layer 6: Pages
│   │   ├── dashboard/
│   │   │   ├── ui/
│   │   │   │   └── DashboardPage.tsx
│   │   │   └── index.ts
│   │   ├── audio/
│   │   │   ├── ui/
│   │   │   │   ├── AudioListPage.tsx
│   │   │   │   └── AudioDetailPage.tsx
│   │   │   └── index.ts
│   │   ├── agent/
│   │   │   └── ui/
│   │   │       └── AgentChatPage.tsx
│   │   └── search/
│   │       └── ui/
│   │           └── SearchPage.tsx
│   │
│   ├── widgets/                      # Layer 5: Widgets
│   │   ├── audio-player/
│   │   │   ├── ui/
│   │   │   │   └── AudioPlayerWidget.tsx
│   │   │   └── index.ts
│   │   ├── transcription-viewer/
│   │   │   ├── ui/
│   │   │   │   └── TranscriptionViewer.tsx
│   │   │   └── index.ts
│   │   ├── chat-interface/
│   │   │   ├── ui/
│   │   │   │   └── ChatInterface.tsx
│   │   │   └── index.ts
│   │   └── search-results/
│   │       ├── ui/
│   │       │   └── SearchResults.tsx
│   │       └── index.ts
│   │
│   ├── features/                     # Layer 4: Features
│   │   ├── audio-upload/
│   │   │   ├── api/
│   │   │   │   └── uploadAudio.ts
│   │   │   ├── model/
│   │   │   │   └── useAudioUpload.ts
│   │   │   ├── ui/
│   │   │   │   └── AudioUploadForm.tsx
│   │   │   └── index.ts
│   │   ├── transcription/
│   │   │   ├── api/
│   │   │   │   └── transcribeAudio.ts
│   │   │   ├── model/
│   │   │   │   └── useTranscription.ts
│   │   │   └── ui/
│   │   │       └── TranscriptionPanel.tsx
│   │   ├── agent-chat/
│   │   │   ├── api/
│   │   │   │   └── invokeAgent.ts
│   │   │   ├── model/
│   │   │   │   ├── useAgentSession.ts
│   │   │   │   └── chatStore.ts
│   │   │   └── ui/
│   │   │       ├── ChatInput.tsx
│   │   │       └── MessageList.tsx
│   │   └── semantic-search/
│   │       ├── api/
│   │       │   └── searchContent.ts
│   │       ├── model/
│   │       │   └── useSearch.ts
│   │       └── ui/
│   │           └── SearchBar.tsx
│   │
│   ├── entities/                     # Layer 3: Entities
│   │   ├── audio/
│   │   │   ├── api/
│   │   │   │   └── audioApi.ts
│   │   │   ├── model/
│   │   │   │   ├── types.ts
│   │   │   │   └── audioStore.ts
│   │   │   ├── ui/
│   │   │   │   └── AudioCard.tsx
│   │   │   └── index.ts
│   │   ├── session/
│   │   │   ├── api/
│   │   │   │   └── sessionApi.ts
│   │   │   ├── model/
│   │   │   │   └── types.ts
│   │   │   └── index.ts
│   │   └── user/
│   │       ├── api/
│   │       │   └── userApi.ts
│   │       ├── model/
│   │       │   └── types.ts
│   │       └── index.ts
│   │
│   └── shared/                       # Layer 2: Shared (Atomic Design)
│       ├── ui/                       # Atomic Components
│       │   ├── atoms/
│       │   │   ├── Button/
│       │   │   ├── Input/
│       │   │   ├── Icon/
│       │   │   └── Spinner/
│       │   ├── molecules/
│       │   │   ├── FormField/
│       │   │   ├── Card/
│       │   │   └── Modal/
│       │   └── organisms/
│       │       ├── Header/
│       │       ├── Sidebar/
│       │       └── DataTable/
│       ├── lib/
│       │   ├── api/
│       │   │   └── apiClient.ts
│       │   ├── hooks/
│       │   │   ├── useDebounce.ts
│       │   │   └── useMediaQuery.ts
│       │   └── utils/
│       │       ├── formatters.ts
│       │       └── validators.ts
│       ├── config/
│       │   └── env.ts
│       └── types/
│           └── common.ts
│
├── public/
├── next.config.js
├── tailwind.config.js
├── tsconfig.json
└── package.json
```

## 3. スライス実装例

### 3.1 Feature: Agent Chat

```typescript
// src/features/agent-chat/api/invokeAgent.ts
import { apiClient } from '@/shared/lib/api/apiClient';
import type { AgentMessage, AgentResponse } from '../model/types';

export async function invokeAgent(
  sessionId: string,
  message: string
): Promise<AgentResponse> {
  const response = await apiClient.post<AgentResponse>(
    `/sessions/${sessionId}/invoke`,
    { message }
  );
  return response.data;
}

export async function createSession(): Promise<{ sessionId: string }> {
  const response = await apiClient.post('/sessions');
  return response.data;
}
```

```typescript
// src/features/agent-chat/model/useAgentSession.ts
import { create } from 'zustand';
import { invokeAgent, createSession } from '../api/invokeAgent';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  toolCalls?: ToolCall[];
}

interface AgentSessionStore {
  sessionId: string | null;
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  
  startSession: () => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  clearSession: () => void;
}

export const useAgentSession = create<AgentSessionStore>((set, get) => ({
  sessionId: null,
  messages: [],
  isLoading: false,
  error: null,
  
  startSession: async () => {
    try {
      set({ isLoading: true, error: null });
      const { sessionId } = await createSession();
      set({ sessionId, messages: [], isLoading: false });
    } catch (error) {
      set({ error: 'Failed to start session', isLoading: false });
    }
  },
  
  sendMessage: async (content: string) => {
    const { sessionId, messages } = get();
    if (!sessionId) return;
    
    // ユーザーメッセージを追加
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: new Date(),
    };
    
    set({ 
      messages: [...messages, userMessage],
      isLoading: true,
      error: null,
    });
    
    try {
      const response = await invokeAgent(sessionId, content);
      
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: response.response,
        timestamp: new Date(),
        toolCalls: response.toolCalls,
      };
      
      set(state => ({
        messages: [...state.messages, assistantMessage],
        isLoading: false,
      }));
    } catch (error) {
      set({ error: 'Failed to get response', isLoading: false });
    }
  },
  
  clearSession: () => {
    set({ sessionId: null, messages: [], error: null });
  },
}));
```

```tsx
// src/features/agent-chat/ui/ChatInput.tsx
'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/shared/ui/atoms/Button';
import { Input } from '@/shared/ui/atoms/Input';
import { useAgentSession } from '../model/useAgentSession';

export function ChatInput() {
  const [input, setInput] = useState('');
  const { sendMessage, isLoading } = useAgentSession();
  
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    
    await sendMessage(input.trim());
    setInput('');
  }, [input, isLoading, sendMessage]);
  
  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <Input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="メッセージを入力..."
        disabled={isLoading}
        className="flex-1"
      />
      <Button type="submit" disabled={isLoading || !input.trim()}>
        {isLoading ? '送信中...' : '送信'}
      </Button>
    </form>
  );
}
```

### 3.2 Entity: Audio

```typescript
// src/entities/audio/model/types.ts
export interface Audio {
  id: string;
  userId: string;
  s3Key: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  transcription?: Transcription;
  createdAt: string;
  completedAt?: string;
}

export interface Transcription {
  text: string;
  confidence: number;
  segments: TranscriptSegment[];
  language: string;
}

export interface TranscriptSegment {
  startTime: number;
  endTime: number;
  text: string;
  confidence: number;
  speakerId?: string;
}
```

```typescript
// src/entities/audio/api/audioApi.ts
import { apiClient } from '@/shared/lib/api/apiClient';
import type { Audio } from '../model/types';

export const audioApi = {
  getById: async (id: string): Promise<Audio> => {
    const response = await apiClient.get<Audio>(`/audio/${id}`);
    return response.data;
  },
  
  getList: async (userId: string): Promise<Audio[]> => {
    const response = await apiClient.get<Audio[]>('/audio', {
      params: { userId },
    });
    return response.data;
  },
  
  upload: async (file: File): Promise<Audio> => {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await apiClient.post<Audio>('/audio', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },
};
```

```tsx
// src/entities/audio/ui/AudioCard.tsx
import { Card } from '@/shared/ui/molecules/Card';
import { Badge } from '@/shared/ui/atoms/Badge';
import type { Audio } from '../model/types';

interface AudioCardProps {
  audio: Audio;
  onClick?: () => void;
}

export function AudioCard({ audio, onClick }: AudioCardProps) {
  const statusColors = {
    pending: 'yellow',
    processing: 'blue',
    completed: 'green',
    failed: 'red',
  } as const;
  
  return (
    <Card onClick={onClick} className="cursor-pointer hover:shadow-lg transition">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium">{audio.s3Key.split('/').pop()}</h3>
          <p className="text-sm text-gray-500">
            {new Date(audio.createdAt).toLocaleString('ja-JP')}
          </p>
        </div>
        <Badge color={statusColors[audio.status]}>
          {audio.status}
        </Badge>
      </div>
      {audio.transcription && (
        <p className="mt-2 text-sm text-gray-600 line-clamp-2">
          {audio.transcription.text}
        </p>
      )}
    </Card>
  );
}
```

## 4. 依存関係ルール

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    FSD DEPENDENCY RULES                                      │
│                                                                              │
│  ┌─────────┐                                                                │
│  │   app   │ ───▶ 全てのレイヤーにアクセス可能                                │
│  └────┬────┘                                                                │
│       │                                                                      │
│       ▼                                                                      │
│  ┌─────────┐                                                                │
│  │  pages  │ ───▶ widgets, features, entities, shared                       │
│  └────┬────┘                                                                │
│       │                                                                      │
│       ▼                                                                      │
│  ┌─────────┐                                                                │
│  │ widgets │ ───▶ features, entities, shared                                │
│  └────┬────┘                                                                │
│       │                                                                      │
│       ▼                                                                      │
│  ┌─────────┐                                                                │
│  │features │ ───▶ entities, shared                                          │
│  └────┬────┘      ※ 同一レイヤー内の他 feature への依存は禁止               │
│       │                                                                      │
│       ▼                                                                      │
│  ┌─────────┐                                                                │
│  │entities │ ───▶ shared のみ                                                │
│  └────┬────┘      ※ 同一レイヤー内の他 entity への依存は禁止                │
│       │                                                                      │
│       ▼                                                                      │
│  ┌─────────┐                                                                │
│  │ shared  │ ───▶ 外部ライブラリのみ（他レイヤーへの依存禁止）              │
│  └─────────┘                                                                │
└─────────────────────────────────────────────────────────────────────────────┘
```

```typescript
// eslint-plugin-import / eslint-plugin-boundaries で強制
// .eslintrc.js
module.exports = {
  plugins: ['boundaries'],
  settings: {
    'boundaries/elements': [
      { type: 'app', pattern: 'src/app/*' },
      { type: 'pages', pattern: 'src/pages/*' },
      { type: 'widgets', pattern: 'src/widgets/*' },
      { type: 'features', pattern: 'src/features/*' },
      { type: 'entities', pattern: 'src/entities/*' },
      { type: 'shared', pattern: 'src/shared/*' },
    ],
  },
  rules: {
    'boundaries/element-types': [
      'error',
      {
        default: 'disallow',
        rules: [
          { from: 'app', allow: ['pages', 'widgets', 'features', 'entities', 'shared'] },
          { from: 'pages', allow: ['widgets', 'features', 'entities', 'shared'] },
          { from: 'widgets', allow: ['features', 'entities', 'shared'] },
          { from: 'features', allow: ['entities', 'shared'] },
          { from: 'entities', allow: ['shared'] },
          { from: 'shared', allow: [] },
        ],
      },
    ],
  },
};
```

