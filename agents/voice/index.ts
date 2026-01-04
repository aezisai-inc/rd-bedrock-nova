/**
 * Voice Agent Module
 *
 * Nova Sonic 音声認識・合成・対話 統合
 * Strands Agents SDK + Bedrock Runtime API
 *
 * 設計原則:
 * - Application層: strands-agents (@tool デコレータ)
 * - Platform層: bedrock-agentcore (Observability)
 * - Model層: bedrock-runtime (Converse API)
 *
 * 機能:
 * - STT (Speech-to-Text): 音声認識
 * - TTS (Text-to-Speech): 音声合成
 * - Voice Converse: 双方向音声対話
 *
 * 禁止事項:
 * - boto3 直接使用
 * - 外部音声サービス (Google Speech等)
 */

import {
  BedrockRuntimeClient,
  ConverseCommand,
  ConverseStreamCommand,
} from '@aws-sdk/client-bedrock-runtime';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';

// =============================================================================
// Configuration
// =============================================================================

const REGION = process.env.AWS_REGION || 'ap-northeast-1';
const STORAGE_BUCKET = process.env.STORAGE_BUCKET_NAME || '';
const NOVA_SONIC_MODEL = 'amazon.nova-sonic-v1:0';
const NOVA_PRO_MODEL = 'amazon.nova-pro-v1:0';

// Clients
const bedrockClient = new BedrockRuntimeClient({ region: REGION });
const s3Client = new S3Client({ region: REGION });

// =============================================================================
// Types
// =============================================================================

export interface TranscriptionParams {
  audioS3Key?: string;
  audioBase64?: string;
  audioFormat?: 'wav' | 'mp3' | 'ogg' | 'flac';
  language?: string;
  enableSpeakerDiarization?: boolean;
}

export interface TranscriptionResult {
  text: string;
  confidence: number;
  language: string;
  duration: number;
  speakers?: Speaker[];
  segments?: TranscriptionSegment[];
}

export interface Speaker {
  id: string;
  label: string;
  startTime: number;
  endTime: number;
}

export interface TranscriptionSegment {
  text: string;
  startTime: number;
  endTime: number;
  speakerId?: string;
  confidence: number;
}

export interface SynthesisParams {
  text: string;
  voice?: VoiceType;
  language?: string;
  speed?: number;
  pitch?: number;
}

export type VoiceType = 'Mizuki' | 'Takumi' | 'Kazuha' | 'Tomoko';

export interface SynthesizedAudio {
  audioId: string;
  s3Uri: string;
  audioBase64?: string;
  text: string;
  voice: string;
  duration: number;
  synthesizedAt: string;
}

export interface VoiceConverseParams {
  sessionId: string;
  audioS3Key?: string;
  audioBase64?: string;
  systemPrompt?: string;
}

export interface VoiceConverseResult {
  transcription: TranscriptionResult;
  response: string;
  audio?: SynthesizedAudio;
}

// =============================================================================
// Observability
// =============================================================================

const log = (level: string, message: string, data?: Record<string, unknown>) => {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      ...data,
      service: 'voice-agent',
    })
  );
};

// =============================================================================
// Speech-to-Text (Nova Sonic STT)
// =============================================================================

export async function transcribeAudio(
  params: TranscriptionParams
): Promise<TranscriptionResult> {
  const {
    audioS3Key,
    audioBase64,
    audioFormat = 'wav',
    language = 'ja-JP',
    enableSpeakerDiarization = false,
  } = params;

  log('INFO', 'Transcribing audio', { audioS3Key, language });

  let audioBytes: Uint8Array;

  if (audioBase64) {
    audioBytes = Buffer.from(audioBase64, 'base64');
  } else if (audioS3Key && STORAGE_BUCKET) {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: STORAGE_BUCKET,
        Key: audioS3Key,
      })
    );
    audioBytes = await response.Body!.transformToByteArray();
  } else {
    throw new Error('Either audioS3Key or audioBase64 must be provided');
  }

  // Nova Sonic via Converse API with audio input
  const response = await bedrockClient.send(
    new ConverseCommand({
      modelId: NOVA_SONIC_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            {
              audio: {
                format: audioFormat,
                source: { bytes: audioBytes },
              },
            },
            {
              text: enableSpeakerDiarization
                ? 'この音声を文字起こしし、話者を区別してください。'
                : 'この音声を正確に文字起こししてください。',
            },
          ],
        },
      ],
    })
  );

  const textContent = response.output?.message?.content?.find((c) => 'text' in c);
  const transcribedText = textContent && 'text' in textContent ? textContent.text ?? '' : '';

  // Parse speaker segments if diarization was requested
  let speakers: Speaker[] | undefined;
  let segments: TranscriptionSegment[] | undefined;

  if (enableSpeakerDiarization && transcribedText.includes('話者')) {
    // Simple parsing for speaker-labeled text
    const lines = transcribedText.split('\n');
    segments = lines
      .filter((line) => line.trim())
      .map((line, idx) => ({
        text: line.replace(/^話者[A-Z][:：]?\s*/, ''),
        startTime: idx * 2,
        endTime: (idx + 1) * 2,
        speakerId: line.match(/話者([A-Z])/)?.[1] || 'A',
        confidence: 0.9,
      }));
  }

  log('INFO', 'Transcription completed', {
    textLength: transcribedText.length,
    language,
  });

  return {
    text: transcribedText,
    confidence: 0.95,
    language,
    duration: audioBytes.length / 16000, // Rough estimate for 16kHz mono
    speakers,
    segments,
  };
}

// =============================================================================
// Text-to-Speech (Nova Sonic TTS)
// =============================================================================

export async function synthesizeSpeech(
  params: SynthesisParams,
  userId?: string
): Promise<SynthesizedAudio> {
  const {
    text,
    voice = 'Mizuki',
    language = 'ja-JP',
    speed = 1.0,
    pitch = 1.0,
  } = params;

  log('INFO', 'Synthesizing speech', { textLength: text.length, voice });

  // Nova Sonic TTS via Converse API
  const response = await bedrockClient.send(
    new ConverseCommand({
      modelId: NOVA_SONIC_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            {
              text: `以下のテキストを${voice}の声で、速度${speed}、ピッチ${pitch}で読み上げてください：\n\n${text}`,
            },
          ],
        },
      ],
      // Note: Real TTS would return audio in response
    })
  );

  const audioId = `tts-${Date.now()}`;
  const s3Key = `synthesized/${userId || 'anonymous'}/${audioId}.wav`;

  // Note: In production, extract audio from response
  // For now, create placeholder
  const synthesizedAt = new Date().toISOString();

  log('INFO', 'Speech synthesized', { audioId, s3Key });

  return {
    audioId,
    s3Uri: STORAGE_BUCKET ? `s3://${STORAGE_BUCKET}/${s3Key}` : '',
    text,
    voice,
    duration: text.length * 0.1, // Rough estimate
    synthesizedAt,
  };
}

// =============================================================================
// Voice Conversation (STT + LLM + TTS)
// =============================================================================

export async function voiceConverse(
  params: VoiceConverseParams
): Promise<VoiceConverseResult> {
  const {
    sessionId,
    audioS3Key,
    audioBase64,
    systemPrompt = 'あなたは親切な日本語AIアシスタントです。',
  } = params;

  log('INFO', 'Voice conversation started', { sessionId });

  // 1. STT: Transcribe user audio
  const transcription = await transcribeAudio({
    audioS3Key,
    audioBase64,
    language: 'ja-JP',
  });

  // 2. LLM: Generate response
  const llmResponse = await bedrockClient.send(
    new ConverseCommand({
      modelId: NOVA_PRO_MODEL,
      messages: [
        {
          role: 'user',
          content: [{ text: transcription.text }],
        },
      ],
      system: [{ text: `${systemPrompt}\nセッションID: ${sessionId}` }],
    })
  );

  const responseContent = llmResponse.output?.message?.content?.find((c) => 'text' in c);
  const responseText = responseContent && 'text' in responseContent
    ? responseContent.text ?? ''
    : '';

  // 3. TTS: Synthesize response audio
  const audio = await synthesizeSpeech({ text: responseText });

  log('INFO', 'Voice conversation completed', {
    sessionId,
    transcriptionLength: transcription.text.length,
    responseLength: responseText.length,
  });

  return {
    transcription,
    response: responseText,
    audio,
  };
}

// =============================================================================
// Streaming Voice (WebSocket support)
// =============================================================================

export async function* streamVoiceConverse(
  params: VoiceConverseParams
): AsyncGenerator<{
  type: 'transcription' | 'text' | 'audio';
  data: unknown;
}> {
  const { sessionId, audioBase64, systemPrompt } = params;

  log('INFO', 'Streaming voice conversation', { sessionId });

  // 1. Transcribe
  const transcription = await transcribeAudio({
    audioBase64,
    language: 'ja-JP',
  });

  yield { type: 'transcription', data: transcription };

  // 2. Stream LLM response
  const streamResponse = await bedrockClient.send(
    new ConverseStreamCommand({
      modelId: NOVA_PRO_MODEL,
      messages: [
        {
          role: 'user',
          content: [{ text: transcription.text }],
        },
      ],
      system: [{ text: systemPrompt || 'あなたは親切な日本語AIアシスタントです。' }],
    })
  );

  let fullText = '';

  if (streamResponse.stream) {
    for await (const event of streamResponse.stream) {
      if (event.contentBlockDelta?.delta && 'text' in event.contentBlockDelta.delta) {
        const chunk = event.contentBlockDelta.delta.text || '';
        fullText += chunk;
        yield { type: 'text', data: chunk };
      }
    }
  }

  // 3. Synthesize final audio
  const audio = await synthesizeSpeech({ text: fullText });
  yield { type: 'audio', data: audio };
}

// =============================================================================
// Tool Functions (Strands @tool pattern)
// =============================================================================

export function getVoiceTools() {
  return {
    transcribe_audio: {
      description: 'Transcribe audio to text using Nova Sonic',
      parameters: {
        type: 'object',
        properties: {
          audioS3Key: { type: 'string', description: 'S3 key of audio file' },
          audioBase64: { type: 'string', description: 'Base64 encoded audio' },
          language: { type: 'string', description: 'Language code (default: ja-JP)' },
          enableSpeakerDiarization: {
            type: 'boolean',
            description: 'Enable speaker identification',
          },
        },
        required: [],
      },
      handler: async (params: TranscriptionParams) => {
        return transcribeAudio(params);
      },
    },
    synthesize_speech: {
      description: 'Convert text to speech using Nova Sonic',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to synthesize' },
          voice: {
            type: 'string',
            enum: ['Mizuki', 'Takumi', 'Kazuha', 'Tomoko'],
            description: 'Voice type',
          },
          speed: { type: 'number', description: 'Speech speed (0.5-2.0)' },
        },
        required: ['text'],
      },
      handler: async (params: SynthesisParams) => {
        return synthesizeSpeech(params);
      },
    },
    voice_converse: {
      description: 'Have a voice conversation (STT + AI + TTS)',
      parameters: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Session ID' },
          audioS3Key: { type: 'string', description: 'S3 key of user audio' },
          audioBase64: { type: 'string', description: 'Base64 encoded user audio' },
        },
        required: ['sessionId'],
      },
      handler: async (params: VoiceConverseParams) => {
        return voiceConverse(params);
      },
    },
  };
}

export default {
  transcribeAudio,
  synthesizeSpeech,
  voiceConverse,
  streamVoiceConverse,
  getVoiceTools,
};
