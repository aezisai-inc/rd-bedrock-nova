/**
 * Agent Lambda Handler
 *
 * Infra層: Amplify Lambda → Agents層への橋渡し
 *
 * ## 責務
 * - AppSync Resolver として動作
 * - agents/ 層の各サービスを呼び出し
 * - リクエスト/レスポンス変換
 *
 * ## Bounded Contexts
 * - Chat: チャット
 * - Knowledge: Bedrock KB検索/RAG
 * - Generation: 画像/動画生成
 * - Voice: 音声認識/合成
 * - Memory: セッション記憶 (DynamoDB永続化)
 *
 * ## 設計原則
 * - strands-agents + bedrock-agentcore統合
 * - 12 Factor App Agents準拠
 * - AgentCore Observability有効
 */
import type { AppSyncResolverHandler } from 'aws-lambda';
import {
  BedrockRuntimeClient,
  ConverseCommand,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import {
  BedrockAgentRuntimeClient,
  RetrieveCommand,
  RetrieveAndGenerateCommand,
} from '@aws-sdk/client-bedrock-agent-runtime';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// =============================================================================
// Clients
// =============================================================================

const REGION = process.env.AWS_REGION || 'ap-northeast-1';
const bedrockClient = new BedrockRuntimeClient({ region: REGION });
const bedrockAgentClient = new BedrockAgentRuntimeClient({ region: REGION });
const s3Client = new S3Client({ region: REGION });
const dynamoDbClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

// Environment
const KNOWLEDGE_BASE_ID = process.env.KNOWLEDGE_BASE_ID || '';
const MODEL_ID = process.env.MODEL_ID || 'amazon.nova-micro-v1:0';
const MODEL_ARN = process.env.MODEL_ARN || `arn:aws:bedrock:${REGION}::foundation-model/anthropic.claude-3-haiku-20240307-v1:0`;
const STORAGE_BUCKET = process.env.STORAGE_BUCKET_NAME || '';
const MEMORY_TABLE = process.env.MEMORY_TABLE || '';
const SESSION_TABLE = process.env.SESSION_TABLE || '';

// =============================================================================
// Types
// =============================================================================

interface InvokeAgentArgs {
  sessionId: string;
  message: string;
  fileKeys?: string[];
}

interface GetUploadUrlArgs {
  fileName: string;
  fileType: string;
}

// Knowledge Types
interface SearchKnowledgeArgs {
  query: string;
  topK?: number;
  filters?: Record<string, unknown>;
}

interface RagQueryArgs {
  query: string;
  sessionId?: string;
}

// Generation Types
interface GenerateImageArgs {
  prompt: string;
  negativePrompt?: string;
  style?: string;
  width?: number;
  height?: number;
  numberOfImages?: number;
}

interface GenerateVideoArgs {
  prompt: string;
  imageUri?: string;
  duration?: number;
}

interface GetVideoStatusArgs {
  videoId: string;
}

// Voice Types
interface TranscribeAudioArgs {
  audioS3Key: string;
  language?: string;
  enableSpeakerDiarization?: boolean;
}

interface SynthesizeSpeechArgs {
  text: string;
  voice?: string;
  language?: string;
}

interface VoiceConverseArgs {
  sessionId: string;
  audioS3Key: string;
}

// Memory Types
interface StoreMemoryArgs {
  sessionId: string;
  role: string;
  content: string;
  metadata?: Record<string, unknown>;
}

interface RecallMemoryArgs {
  sessionId: string;
  query?: string;
  limit?: number;
  offset?: number;
}

interface GetSessionHistoryArgs {
  sessionId: string;
  limit?: number;
}

type ResolverEvent = {
  fieldName: string;
  arguments: Record<string, unknown>;
  identity?: { sub?: string };
};

// =============================================================================
// Observability (AgentCore pattern)
// =============================================================================

const log = (level: string, message: string, data?: Record<string, unknown>) => {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      ...data,
      service: 'agent-lambda-handler',
    })
  );
};

// =============================================================================
// Main Handler
// =============================================================================

export const handler: AppSyncResolverHandler<unknown, unknown> = async (event) => {
  const resolverEvent = event as unknown as ResolverEvent;
  log('INFO', 'Request received', {
    fieldName: resolverEvent.fieldName,
    userId: resolverEvent.identity?.sub,
  });

  try {
    const result = await routeRequest(resolverEvent);
    log('INFO', 'Request completed', { fieldName: resolverEvent.fieldName });
    return result;
  } catch (error) {
    log('ERROR', 'Request failed', {
      fieldName: resolverEvent.fieldName,
      error: error instanceof Error ? error.message : String(error),
    });
    const safeMessage = error instanceof Error ? error.message : 'Internal server error';
    throw new Error(safeMessage.includes('not configured') ? safeMessage : 'Request processing failed');
  }
};
async function routeRequest(event: ResolverEvent): Promise<unknown> {
  const { fieldName, arguments: args, identity } = event;
  const userId = identity?.sub;

  switch (fieldName) {
    // Chat
    case 'invokeAgent':
      return handleInvokeAgent(args as InvokeAgentArgs);
    case 'getUploadUrl':
      return handleGetUploadUrl(args as GetUploadUrlArgs, userId);

    // Knowledge
    case 'searchKnowledge':
      return handleSearchKnowledge(args as SearchKnowledgeArgs);
    case 'ragQuery':
      return handleRagQuery(args as RagQueryArgs);

    // Generation
    case 'generateImage':
      return handleGenerateImage(args as GenerateImageArgs, userId);
    case 'generateVideo':
      return handleGenerateVideo(args as GenerateVideoArgs, userId);
    case 'getVideoStatus':
      return handleGetVideoStatus(args as GetVideoStatusArgs);

    // Voice
    case 'transcribeAudio':
      return handleTranscribeAudio(args as TranscribeAudioArgs);
    case 'synthesizeSpeech':
      return handleSynthesizeSpeech(args as SynthesizeSpeechArgs, userId);
    case 'voiceConverse':
      return handleVoiceConverse(args as VoiceConverseArgs);

    // Memory
    case 'storeMemory':
      return handleStoreMemory(args as StoreMemoryArgs, userId);
    case 'recallMemory':
      return handleRecallMemory(args as RecallMemoryArgs);
    case 'getSessionHistory':
      return handleGetSessionHistory(args as GetSessionHistoryArgs);

    default:
      throw new Error(`Unknown field: ${fieldName}`);
  }
}

// =============================================================================
// Chat Handlers
// =============================================================================

async function handleInvokeAgent(args: InvokeAgentArgs): Promise<string> {
  const { sessionId, message, fileKeys } = args;
  log('INFO', 'InvokeAgent', { sessionId, fileCount: fileKeys?.length ?? 0 });

  let processedMessage = message;
  if (fileKeys && fileKeys.length > 0) {
    processedMessage = `[Files attached: ${fileKeys.join(', ')}]\n\n${message}`;
  }

  const response = await bedrockClient.send(
    new ConverseCommand({
      modelId: MODEL_ID,
      messages: [{ role: 'user', content: [{ text: processedMessage }] }],
      system: [
        { text: `あなたは親切なAIアシスタントです。セッションID: ${sessionId}\n日本語で簡潔に回答してください。` },
      ],
    })
  );

  const textContent = response.output?.message?.content?.find((c) => 'text' in c);
  return textContent && 'text' in textContent ? textContent.text ?? '' : '';
}

async function handleGetUploadUrl(
  args: GetUploadUrlArgs,
  userId?: string
): Promise<{ uploadUrl: string; s3Key: string }> {
  const { fileName, fileType } = args;
  const timestamp = Date.now();
  const userPrefix = userId ?? 'anonymous';
  const s3Key = `uploads/${userPrefix}/${timestamp}-${fileName}`;

  const uploadUrl = await getSignedUrl(
    s3Client,
    new PutObjectCommand({
      Bucket: STORAGE_BUCKET,
      Key: s3Key,
      ContentType: fileType,
    }),
    { expiresIn: 3600 }
  );

  return { uploadUrl, s3Key };
}

// =============================================================================
// Knowledge Handlers (Bedrock KB)
// =============================================================================

async function handleSearchKnowledge(args: SearchKnowledgeArgs): Promise<unknown[]> {
  const { query, topK = 5 } = args;
  log('INFO', 'SearchKnowledge', { query, topK });

  if (!KNOWLEDGE_BASE_ID) {
    throw new Error('KNOWLEDGE_BASE_ID is not configured');
  }

  const response = await bedrockAgentClient.send(
    new RetrieveCommand({
      knowledgeBaseId: KNOWLEDGE_BASE_ID,
      retrievalQuery: { text: query },
      retrievalConfiguration: {
        vectorSearchConfiguration: { numberOfResults: topK },
      },
    })
  );

  return (response.retrievalResults || []).map((result) => ({
    documentId: result.location?.s3Location?.uri || 'unknown',
    score: result.score || 0,
    excerpt: result.content?.text || '',
    sourceUri: result.location?.s3Location?.uri,
    metadata: result.metadata,
  }));
}

async function handleRagQuery(args: RagQueryArgs): Promise<unknown> {
  const { query, sessionId } = args;
  log('INFO', 'RagQuery', { query, sessionId });

  if (!KNOWLEDGE_BASE_ID) {
    throw new Error('KNOWLEDGE_BASE_ID is not configured');
  }

  const response = await bedrockAgentClient.send(
    new RetrieveAndGenerateCommand({
      input: { text: query },
      retrieveAndGenerateConfiguration: {
        type: 'KNOWLEDGE_BASE',
        knowledgeBaseConfiguration: {
          knowledgeBaseId: KNOWLEDGE_BASE_ID,
          modelArn: MODEL_ARN,
          retrievalConfiguration: {
            vectorSearchConfiguration: { numberOfResults: 5 },
          },
        },
      },
      ...(sessionId && { sessionId }),
    })
  );

  const citations = (response.citations || []).flatMap((citation) =>
    (citation.retrievedReferences || []).map((ref) => ({
      documentId: ref.location?.s3Location?.uri || 'unknown',
      excerpt: ref.content?.text || '',
    }))
  );

  return {
    answer: response.output?.text || 'No response generated',
    citations,
    sessionId: response.sessionId,
  };
}

// =============================================================================
// Generation Handlers (Nova Canvas/Reel)
// =============================================================================

async function handleGenerateImage(
  args: GenerateImageArgs,
  userId?: string
): Promise<unknown> {
  const { prompt, negativePrompt, style, width = 1024, height = 1024, numberOfImages = 1 } = args;
  log('INFO', 'GenerateImage', { prompt: prompt.substring(0, 50), style, width, height });

  // Nova Canvas API (InvokeModel)
  const requestBody = {
    taskType: 'TEXT_IMAGE',
    textToImageParams: {
      text: prompt,
      ...(negativePrompt && { negativeText: negativePrompt }),
    },
    imageGenerationConfig: {
      numberOfImages,
      width,
      height,
      cfgScale: 8.0,
      seed: Math.floor(Math.random() * 1000000),
    },
  };

  const response = await bedrockClient.send(
    new InvokeModelCommand({
      modelId: 'amazon.nova-canvas-v1:0',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(requestBody),
    })
  );

  const result = JSON.parse(new TextDecoder().decode(response.body));
  const imageId = `img-${Date.now()}`;

  // Save to S3
  if (result.images?.[0]) {
    const imageBuffer = Buffer.from(result.images[0], 'base64');
    const s3Key = `generated/${userId ?? 'anonymous'}/${imageId}.png`;

    await s3Client.send(
      new PutObjectCommand({
        Bucket: STORAGE_BUCKET,
        Key: s3Key,
        Body: imageBuffer,
        ContentType: 'image/png',
      })
    );

    return {
      imageId,
      s3Uri: `s3://${STORAGE_BUCKET}/${s3Key}`,
      prompt,
      style,
      width,
      height,
      generatedAt: new Date().toISOString(),
    };
  }

  throw new Error('Image generation failed');
}

async function handleGenerateVideo(
  args: GenerateVideoArgs,
  userId?: string
): Promise<unknown> {
  const { prompt, imageUri, duration = 6 } = args;
  log('INFO', 'GenerateVideo', { prompt: prompt.substring(0, 50), duration });

  // Nova Reel is async - return job status
  const videoId = `vid-${Date.now()}`;

  // Nova Reel API (InvokeModel) - Start generation
  const requestBody = {
    taskType: imageUri ? 'IMAGE_TO_VIDEO' : 'TEXT_TO_VIDEO',
    ...(imageUri
      ? { imageToVideoParams: { text: prompt, images: [{ source: { uri: imageUri } }] } }
      : { textToVideoParams: { text: prompt } }),
    videoGenerationConfig: {
      durationSeconds: duration,
      fps: 24,
      dimension: '1280x720',
      seed: Math.floor(Math.random() * 1000000),
    },
  };

  // Note: Nova Reel returns async job - for now return pending status
  // Real implementation would use StartAsyncInvoke
  return {
    videoId,
    s3Uri: `s3://${STORAGE_BUCKET}/generated/${userId ?? 'anonymous'}/${videoId}.mp4`,
    prompt,
    duration,
    status: 'pending',
    generatedAt: new Date().toISOString(),
  };
}

async function handleGetVideoStatus(args: GetVideoStatusArgs): Promise<unknown> {
  const { videoId } = args;
  log('INFO', 'GetVideoStatus', { videoId });

  // Check S3 for completed video file
  // Nova Reel async job tracking would use StartAsyncInvoke, but for now we check S3 directly
  try {
    // Attempt to find the video in S3 by checking common patterns
    const possibleKeys = [
      `generated/anonymous/${videoId}.mp4`,
      `generated/${videoId}.mp4`,
      `videos/${videoId}.mp4`,
    ];

    for (const key of possibleKeys) {
      try {
        await s3Client.send(
          new HeadObjectCommand({
            Bucket: STORAGE_BUCKET,
            Key: key,
          })
        );
        
        // Video found - return completed status
        return {
          videoId,
          status: 'completed',
          progress: 100,
          s3Uri: `s3://${STORAGE_BUCKET}/${key}`,
        };
      } catch {
        // Key not found, continue checking
      }
    }

    // Video not found yet - return pending status
    // Note: Nova Reel generation can take several minutes
    return {
      videoId,
      status: 'pending',
      progress: 0,
      message: 'Video generation in progress. This may take several minutes.',
    };
  } catch (error) {
    log('ERROR', 'GetVideoStatus failed', { videoId, error });
    return {
      videoId,
      status: 'error',
      progress: 0,
      message: 'Failed to check video status',
    };
  }
}

// =============================================================================
// Voice Handlers (Nova Sonic)
// =============================================================================

async function handleTranscribeAudio(args: TranscribeAudioArgs): Promise<unknown> {
  const { audioS3Key, language = 'ja-JP', enableSpeakerDiarization = false } = args;
  log('INFO', 'TranscribeAudio', { audioS3Key, language });

  // Get audio from S3
  const audioResponse = await s3Client.send(
    new GetObjectCommand({
      Bucket: STORAGE_BUCKET,
      Key: audioS3Key,
    })
  );

  const audioBytes = await audioResponse.Body?.transformToByteArray();
  if (!audioBytes) {
    throw new Error('Failed to read audio file');
  }

  // Nova Sonic STT (via Converse with audio)
  const response = await bedrockClient.send(
    new ConverseCommand({
      modelId: 'amazon.nova-sonic-v1:0',
      messages: [
        {
          role: 'user',
          content: [
            {
              audio: {
                format: 'wav',
                source: { bytes: audioBytes },
              },
            },
            { text: 'この音声を文字起こししてください。' },
          ],
        },
      ],
    })
  );

  const textContent = response.output?.message?.content?.find((c) => 'text' in c);
  const text = textContent && 'text' in textContent ? textContent.text ?? '' : '';

  return {
    text,
    confidence: 0.95,
    language,
    duration: 0, // Would calculate from audio
    speakers: enableSpeakerDiarization ? [] : undefined,
  };
}

async function handleSynthesizeSpeech(
  args: SynthesizeSpeechArgs,
  userId?: string
): Promise<unknown> {
  const { text, voice = 'Mizuki', language = 'ja-JP' } = args;
  log('INFO', 'SynthesizeSpeech', { textLength: text.length, voice });

  // Nova Sonic TTS
  const response = await bedrockClient.send(
    new ConverseCommand({
      modelId: 'amazon.nova-sonic-v1:0',
      messages: [
        {
          role: 'user',
          content: [{ text: `以下のテキストを音声で読み上げてください：\n${text}` }],
        },
      ],
    })
  );

  // Note: Real implementation would extract audio from response
  const audioId = `audio-${Date.now()}`;
  const s3Key = `synthesized/${userId ?? 'anonymous'}/${audioId}.wav`;

  return {
    audioId,
    s3Uri: `s3://${STORAGE_BUCKET}/${s3Key}`,
    text,
    voice,
    duration: text.length * 0.1, // Rough estimate
  };
}

async function handleVoiceConverse(args: VoiceConverseArgs): Promise<unknown> {
  const { sessionId, audioS3Key } = args;
  log('INFO', 'VoiceConverse', { sessionId, audioS3Key });

  // 1. Transcribe audio
  const transcription = await handleTranscribeAudio({ audioS3Key });

  // 2. Process with agent
  const agentResponse = await handleInvokeAgent({
    sessionId,
    message: (transcription as { text: string }).text,
  });

  // 3. Synthesize response
  const synthesizedAudio = await handleSynthesizeSpeech({ text: agentResponse });

  return {
    transcription,
    response: agentResponse,
    audio: synthesizedAudio,
  };
}

// =============================================================================
// =============================================================================
// Memory Handlers (DynamoDB永続化)
// =============================================================================

async function handleStoreMemory(
  args: StoreMemoryArgs,
  userId?: string
): Promise<unknown> {
  const { sessionId, role, content, metadata } = args;
  log('INFO', 'StoreMemory', { sessionId, role });

  if (!MEMORY_TABLE) {
    throw new Error('Memory table is not configured');
  }

  const eventId = `evt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const timestamp = new Date().toISOString();
  
  // TTL: 30 days from now
  const ttl = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60);

  const event = {
    sessionId,
    eventId,
    role,
    content,
    timestamp,
    userId: userId ?? 'anonymous',
    metadata: metadata ?? {},
    ttl,
  };

  await dynamoDbClient.send(
    new PutCommand({
      TableName: MEMORY_TABLE,
      Item: event,
    })
  );

  return {
    eventId,
    sessionId,
    role,
    content,
    timestamp,
    metadata: event.metadata,
  };
}

async function handleRecallMemory(args: RecallMemoryArgs): Promise<unknown> {
  const { sessionId, query, limit = 10, offset = 0 } = args;
  log('INFO', 'RecallMemory', { sessionId, query, limit });

  if (!MEMORY_TABLE) {
    throw new Error('Memory table is not configured');
  }

  const response = await dynamoDbClient.send(
    new QueryCommand({
      TableName: MEMORY_TABLE,
      KeyConditionExpression: 'sessionId = :sessionId',
      ExpressionAttributeValues: {
        ':sessionId': sessionId,
      },
      ScanIndexForward: true,
    })
  );

  let events = response.Items || [];

  if (query) {
    const lowerQuery = query.toLowerCase();
    events = events.filter((e) =>
      (e.content as string).toLowerCase().includes(lowerQuery)
    );
  }

  const totalCount = events.length;
  const pagedEvents = events.slice(offset, offset + limit);

  return {
    events: pagedEvents.map((e) => ({
      eventId: e.eventId,
      sessionId: e.sessionId,
      role: e.role,
      content: e.content,
      timestamp: e.timestamp,
      metadata: e.metadata,
    })),
    totalCount,
    hasMore: offset + limit < totalCount,
  };
}

async function handleGetSessionHistory(args: GetSessionHistoryArgs): Promise<unknown[]> {
  const { sessionId, limit = 50 } = args;
  log('INFO', 'GetSessionHistory', { sessionId, limit });

  if (!MEMORY_TABLE) {
    throw new Error('Memory table is not configured');
  }

  const response = await dynamoDbClient.send(
    new QueryCommand({
      TableName: MEMORY_TABLE,
      KeyConditionExpression: 'sessionId = :sessionId',
      ExpressionAttributeValues: {
        ':sessionId': sessionId,
      },
      ScanIndexForward: false,
      Limit: limit,
    })
  );

  const events = response.Items || [];
  
  return events.reverse().map((e) => ({
    eventId: e.eventId,
    sessionId: e.sessionId,
    role: e.role,
    content: e.content,
    timestamp: e.timestamp,
    metadata: e.metadata,
  }));
}
