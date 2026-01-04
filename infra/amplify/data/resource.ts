import { defineData, a, type ClientSchema } from '@aws-amplify/backend';
import { agentFunction } from '../functions/agent/resource';

/**
 * AppSync GraphQL スキーマ定義
 *
 * ## Bounded Contexts
 * - Chat: チャットメッセージ・セッション管理
 * - Knowledge: Bedrock Knowledge Bases 検索・RAG
 * - Generation: Nova Canvas/Reel 画像/動画生成
 * - Voice: Nova Sonic 音声対話
 * - Memory: AgentCore Memory セッション記憶
 *
 * ## 設計原則
 * - 12 Factor App Agents準拠
 * - Clean Architecture + Event Sourcing + CQRS
 * - strands-agents + bedrock-agentcore統合
 */
const schema = a.schema({
  // =============================================================================
  // Chat Bounded Context
  // =============================================================================

  // チャットメッセージ
  ChatMessage: a
    .model({
      sessionId: a.string().required(),
      role: a.enum(['user', 'assistant', 'system']),
      content: a.string().required(),
      timestamp: a.datetime(),
      metadata: a.json(),
    })
    .authorization((allow) => [allow.owner()]),

  // チャットセッション
  ChatSession: a
    .model({
      title: a.string(),
      lastMessageAt: a.datetime(),
      messageCount: a.integer().default(0),
      status: a.enum(['active', 'archived']),
    })
    .authorization((allow) => [allow.owner()]),

  // ファイルアップロード情報
  UploadedFile: a
    .model({
      sessionId: a.string().required(),
      fileName: a.string().required(),
      fileType: a.string().required(),
      s3Key: a.string().required(),
      size: a.integer(),
      uploadedAt: a.datetime(),
    })
    .authorization((allow) => [allow.owner()]),

  // エージェント呼び出し（カスタムミューテーション）
  invokeAgent: a
    .mutation()
    .arguments({
      sessionId: a.string().required(),
      message: a.string().required(),
      fileKeys: a.string().array(),
    })
    .returns(a.string())
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(agentFunction)),

  // Presigned URL 取得
  getUploadUrl: a
    .query()
    .arguments({
      fileName: a.string().required(),
      fileType: a.string().required(),
    })
    .returns(
      a.customType({
        uploadUrl: a.string(),
        s3Key: a.string(),
      })
    )
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(agentFunction)),

  // =============================================================================
  // Knowledge Bounded Context (Bedrock Knowledge Bases)
  // =============================================================================

  // 検索結果型
  KnowledgeSearchResult: a.customType({
    documentId: a.string().required(),
    score: a.float().required(),
    excerpt: a.string().required(),
    sourceUri: a.string(),
    metadata: a.json(),
  }),

  // RAG引用型
  KnowledgeCitation: a.customType({
    documentId: a.string().required(),
    excerpt: a.string().required(),
    pageNumber: a.integer(),
  }),

  // RAG応答型
  KnowledgeRagResponse: a.customType({
    answer: a.string().required(),
    citations: a.json(), // KnowledgeCitation[]
    sessionId: a.string(),
  }),

  // Knowledge検索（ベクトル検索）
  searchKnowledge: a
    .query()
    .arguments({
      query: a.string().required(),
      topK: a.integer(),
      filters: a.json(), // SearchFilters
    })
    .returns(a.json()) // KnowledgeSearchResult[]
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(agentFunction)),

  // Knowledge RAG（検索+応答生成）
  ragQuery: a
    .query()
    .arguments({
      query: a.string().required(),
      sessionId: a.string(),
    })
    .returns(a.json()) // KnowledgeRagResponse
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(agentFunction)),

  // =============================================================================
  // Generation Bounded Context (Nova Canvas/Reel)
  // =============================================================================

  // 画像生成結果型
  GeneratedImage: a.customType({
    imageId: a.string().required(),
    s3Uri: a.string().required(),
    prompt: a.string().required(),
    style: a.string(),
    width: a.integer(),
    height: a.integer(),
    generatedAt: a.datetime(),
  }),

  // 動画生成結果型
  GeneratedVideo: a.customType({
    videoId: a.string().required(),
    s3Uri: a.string().required(),
    prompt: a.string().required(),
    duration: a.integer(), // seconds
    status: a.enum(['pending', 'processing', 'completed', 'failed']),
    generatedAt: a.datetime(),
  }),

  // 画像生成（Nova Canvas）
  generateImage: a
    .mutation()
    .arguments({
      prompt: a.string().required(),
      negativePrompt: a.string(),
      style: a.string(),
      width: a.integer(),
      height: a.integer(),
      numberOfImages: a.integer(),
    })
    .returns(a.json()) // GeneratedImage
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(agentFunction)),

  // 動画生成（Nova Reel）
  generateVideo: a
    .mutation()
    .arguments({
      prompt: a.string().required(),
      imageUri: a.string(), // 開始画像（オプション）
      duration: a.integer(), // 秒数
    })
    .returns(a.json()) // GeneratedVideo
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(agentFunction)),

  // 動画生成ステータス確認
  getVideoStatus: a
    .query()
    .arguments({
      videoId: a.string().required(),
    })
    .returns(a.json()) // GeneratedVideo
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(agentFunction)),

  // =============================================================================
  // Voice Bounded Context (Nova Sonic)
  // =============================================================================

  // 音声認識結果型
  TranscriptionResult: a.customType({
    text: a.string().required(),
    confidence: a.float(),
    language: a.string(),
    duration: a.float(), // seconds
    speakers: a.json(), // Speaker[]
  }),

  // 音声合成結果型
  SynthesizedAudio: a.customType({
    audioId: a.string().required(),
    s3Uri: a.string().required(),
    text: a.string().required(),
    voice: a.string(),
    duration: a.float(),
  }),

  // 音声認識（Nova Sonic STT）
  transcribeAudio: a
    .mutation()
    .arguments({
      audioS3Key: a.string().required(),
      language: a.string(),
      enableSpeakerDiarization: a.boolean(),
    })
    .returns(a.json()) // TranscriptionResult
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(agentFunction)),

  // 音声合成（Nova Sonic TTS）
  synthesizeSpeech: a
    .mutation()
    .arguments({
      text: a.string().required(),
      voice: a.string(),
      language: a.string(),
    })
    .returns(a.json()) // SynthesizedAudio
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(agentFunction)),

  // 音声対話（STT + Agent + TTS）
  voiceConverse: a
    .mutation()
    .arguments({
      sessionId: a.string().required(),
      audioS3Key: a.string().required(),
    })
    .returns(a.json()) // { transcription, response, audio }
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(agentFunction)),

  // =============================================================================
  // Memory Bounded Context (AgentCore Memory)
  // =============================================================================

  // 記憶イベント型
  MemoryEvent: a.customType({
    eventId: a.string().required(),
    sessionId: a.string().required(),
    role: a.string().required(),
    content: a.string().required(),
    timestamp: a.datetime(),
    metadata: a.json(),
  }),

  // 記憶検索結果型
  MemorySearchResult: a.customType({
    events: a.json(), // MemoryEvent[]
    totalCount: a.integer(),
    hasMore: a.boolean(),
  }),

  // 記憶保存
  storeMemory: a
    .mutation()
    .arguments({
      sessionId: a.string().required(),
      role: a.string().required(),
      content: a.string().required(),
      metadata: a.json(),
    })
    .returns(a.json()) // MemoryEvent
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(agentFunction)),

  // 記憶検索
  recallMemory: a
    .query()
    .arguments({
      sessionId: a.string().required(),
      query: a.string(),
      limit: a.integer(),
      offset: a.integer(),
    })
    .returns(a.json()) // MemorySearchResult
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(agentFunction)),

  // セッション履歴取得
  getSessionHistory: a
    .query()
    .arguments({
      sessionId: a.string().required(),
      limit: a.integer(),
    })
    .returns(a.json()) // MemoryEvent[]
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(agentFunction)),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
  },
});

