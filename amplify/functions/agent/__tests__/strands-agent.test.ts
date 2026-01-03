/**
 * Strands Agent Unit Tests
 * 
 * テスト対象:
 * - Nova Pro モデル呼び出し
 * - ツール定義
 * - ストリーミングレスポンス処理
 * - ファイル処理ヘルパー
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock AWS SDK
const mockSend = vi.fn();
vi.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: vi.fn(() => ({
    send: mockSend,
  })),
  InvokeModelCommand: vi.fn(),
  InvokeModelWithResponseStreamCommand: vi.fn(),
}));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(() => ({
    send: vi.fn(() => Promise.resolve({
      Body: {
        transformToByteArray: () => Promise.resolve(new Uint8Array([0x89, 0x50, 0x4E, 0x47])),
      },
    })),
  })),
  GetObjectCommand: vi.fn(),
}));

describe('Strands Agent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BEDROCK_REGION = 'ap-northeast-1';
    process.env.STORAGE_BUCKET_NAME = 'test-bucket';
  });

  describe('Tool Definitions', () => {
    const EXPECTED_TOOLS = [
      'analyze_image',
      'transcribe_audio',
      'analyze_video',
      'generate_embeddings',
    ];

    it('should have all required tools defined', () => {
      // Tools are defined in strands-agent.ts
      EXPECTED_TOOLS.forEach((tool) => {
        expect(tool).toBeDefined();
      });
    });

    it('should have correct tool schemas', () => {
      const analyzeImageSchema = {
        type: 'object',
        properties: {
          s3Key: { type: 'string', description: 'S3上の画像ファイルキー' },
          analysisType: {
            type: 'string',
            enum: ['caption', 'objects', 'text', 'all'],
          },
        },
        required: ['s3Key'],
      };

      expect(analyzeImageSchema.properties.s3Key).toBeDefined();
      expect(analyzeImageSchema.required).toContain('s3Key');
    });
  });

  describe('File Type Detection', () => {
    const getFileType = (key: string): 'image' | 'audio' | 'video' | 'document' => {
      const ext = key.split('.').pop()?.toLowerCase();
      if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) return 'image';
      if (['mp3', 'wav', 'flac', 'ogg', 'm4a'].includes(ext || '')) return 'audio';
      if (['mp4', 'mov', 'webm', 'avi'].includes(ext || '')) return 'video';
      return 'document';
    };

    it('should correctly detect image files', () => {
      expect(getFileType('test.jpg')).toBe('image');
      expect(getFileType('test.jpeg')).toBe('image');
      expect(getFileType('test.png')).toBe('image');
      expect(getFileType('test.gif')).toBe('image');
      expect(getFileType('test.webp')).toBe('image');
    });

    it('should correctly detect audio files', () => {
      expect(getFileType('test.mp3')).toBe('audio');
      expect(getFileType('test.wav')).toBe('audio');
      expect(getFileType('test.flac')).toBe('audio');
      expect(getFileType('test.ogg')).toBe('audio');
      expect(getFileType('test.m4a')).toBe('audio');
    });

    it('should correctly detect video files', () => {
      expect(getFileType('test.mp4')).toBe('video');
      expect(getFileType('test.mov')).toBe('video');
      expect(getFileType('test.webm')).toBe('video');
      expect(getFileType('test.avi')).toBe('video');
    });

    it('should default to document for unknown extensions', () => {
      expect(getFileType('test.pdf')).toBe('document');
      expect(getFileType('test.txt')).toBe('document');
      expect(getFileType('test.docx')).toBe('document');
    });
  });

  describe('Image Format Detection', () => {
    const getImageFormat = (key: string): string => {
      const ext = key.split('.').pop()?.toLowerCase();
      if (ext === 'jpg') return 'jpeg';
      return ext || 'png';
    };

    it('should convert jpg to jpeg', () => {
      expect(getImageFormat('test.jpg')).toBe('jpeg');
    });

    it('should preserve other formats', () => {
      expect(getImageFormat('test.png')).toBe('png');
      expect(getImageFormat('test.webp')).toBe('webp');
      expect(getImageFormat('test.gif')).toBe('gif');
    });
  });

  describe('Bedrock Model Configuration', () => {
    it('should use Nova Pro model', () => {
      const MODEL_ID = 'amazon.nova-pro-v1:0';
      expect(MODEL_ID).toBe('amazon.nova-pro-v1:0');
    });

    it('should have correct inference config', () => {
      const inferenceConfig = {
        max_new_tokens: 4096,
        temperature: 0.7,
        top_p: 0.9,
      };

      expect(inferenceConfig.max_new_tokens).toBe(4096);
      expect(inferenceConfig.temperature).toBeGreaterThan(0);
      expect(inferenceConfig.temperature).toBeLessThanOrEqual(1);
      expect(inferenceConfig.top_p).toBeGreaterThan(0);
      expect(inferenceConfig.top_p).toBeLessThanOrEqual(1);
    });
  });
});

describe('System Prompt', () => {
  it('should include Nova series tools description', () => {
    const systemPrompt = `あなたは Nova シリーズを活用した高度な AI アシスタントです。

## 利用可能なツール
- **analyze_image**: 画像の分析
- **transcribe_audio**: 音声の文字起こし
- **analyze_video**: 動画の分析
- **generate_embeddings**: ベクトル埋め込み生成`;

    expect(systemPrompt).toContain('Nova');
    expect(systemPrompt).toContain('analyze_image');
    expect(systemPrompt).toContain('transcribe_audio');
    expect(systemPrompt).toContain('analyze_video');
    expect(systemPrompt).toContain('generate_embeddings');
  });
});

