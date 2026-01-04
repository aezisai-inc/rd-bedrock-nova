/**
 * Amplify GraphQL Schema Types (Generated from infra/amplify/data/resource.ts)
 *
 * フロントエンドで使用するGraphQL Schemaの型定義
 * infraディレクトリから分離してビルド可能にする
 */

// =============================================================================
// Base Types
// =============================================================================

export type ChatMessageRole = 'user' | 'assistant' | 'system';
export type ChatSessionStatus = 'active' | 'archived';
export type MemoryType = 'short_term' | 'long_term' | 'episodic';
export type VoiceType = 'Mizuki' | 'Takumi' | 'Kazuha' | 'Tomoko';

// =============================================================================
// Chat Bounded Context
// =============================================================================

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: ChatMessageRole;
  content: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
  owner?: string;
}

export interface ChatSession {
  id: string;
  title?: string;
  lastMessageAt?: string;
  messageCount?: number;
  status?: ChatSessionStatus;
  owner?: string;
}

export interface UploadedFile {
  id: string;
  sessionId: string;
  fileName: string;
  fileType: string;
  s3Key: string;
  size?: number;
  uploadedAt?: string;
  owner?: string;
}

// =============================================================================
// Knowledge Bounded Context
// =============================================================================

export interface KnowledgeSearchResult {
  documentId: string;
  score: number;
  excerpt: string;
  sourceUri?: string;
  metadata?: Record<string, unknown>;
}

export interface KnowledgeCitation {
  documentId: string;
  excerpt: string;
  pageNumber?: number;
}

export interface KnowledgeRAGResponse {
  answer: string;
  citations: KnowledgeCitation[];
  confidence: number;
}

// =============================================================================
// Generation Bounded Context
// =============================================================================

export interface GeneratedImage {
  imageId: string;
  s3Uri: string;
  prompt: string;
  model: string;
  width: number;
  height: number;
  generatedAt: string;
}

export interface VideoGenerationStatus {
  invocationId: string;
  status: string;
  progress?: number;
  outputS3Uri?: string;
  error?: string;
}

// =============================================================================
// Voice Bounded Context
// =============================================================================

export interface TranscriptionResult {
  text: string;
  confidence: number;
  language: string;
  duration: number;
}

export interface SynthesizedAudio {
  audioId: string;
  s3Uri: string;
  text: string;
  voice: string;
  duration: number;
}

export interface VoiceConverseResponse {
  transcription: TranscriptionResult;
  response: string;
  audio?: SynthesizedAudio;
}

// =============================================================================
// Memory Bounded Context
// =============================================================================

export interface MemoryEntry {
  memoryId: string;
  sessionId: string;
  content: string;
  memoryType: MemoryType;
  importance: number;
  createdAt: string;
  expiresAt?: string;
}

export interface SessionHistory {
  sessionId: string;
  messages: {
    role: string;
    content: string;
    timestamp: string;
  }[];
  summary?: string;
  lastActiveAt: string;
}

// =============================================================================
// Schema Type (Compatible with Amplify generateClient<Schema>())
// =============================================================================

export interface Schema {
  // Models
  ChatMessage: {
    type: ChatMessage;
  };
  ChatSession: {
    type: ChatSession;
  };
  UploadedFile: {
    type: UploadedFile;
  };

  // Mutations
  invokeAgent: {
    args: { sessionId: string; message: string; fileKeys?: string[] };
    type: string;
  };
  searchKnowledge: {
    args: { query: string; maxResults?: number; filters?: Record<string, unknown> };
    type: KnowledgeSearchResult[];
  };
  ragQuery: {
    args: { query: string; sessionId?: string; systemPrompt?: string };
    type: KnowledgeRAGResponse;
  };
  generateImage: {
    args: { prompt: string; negativePrompt?: string; width?: number; height?: number };
    type: GeneratedImage;
  };
  generateVideo: {
    args: { prompt: string; imageS3Key?: string; durationSeconds?: number };
    type: VideoGenerationStatus;
  };
  transcribeAudio: {
    args: { audioS3Key: string; language?: string };
    type: TranscriptionResult;
  };
  synthesizeSpeech: {
    args: { text: string; voice?: VoiceType };
    type: SynthesizedAudio;
  };
  voiceConverse: {
    args: { sessionId: string; audioS3Key: string };
    type: VoiceConverseResponse;
  };
  storeMemory: {
    args: { sessionId: string; content: string; memoryType: MemoryType; importance?: number };
    type: MemoryEntry;
  };

  // Queries
  getUploadUrl: {
    args: { fileName: string; fileType: string };
    type: { uploadUrl: string; s3Key: string };
  };
  getVideoStatus: {
    args: { invocationId: string };
    type: VideoGenerationStatus;
  };
  recallMemory: {
    args: { sessionId: string; query?: string; memoryType?: MemoryType; limit?: number };
    type: MemoryEntry[];
  };
  getSessionHistory: {
    args: { sessionId: string };
    type: SessionHistory;
  };
}

export default Schema;
