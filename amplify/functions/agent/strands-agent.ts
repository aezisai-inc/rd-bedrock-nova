/**
 * Strands Agent 統合モジュール
 * 
 * Nova シリーズを活用した AI エージェント
 */

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  InvokeModelWithResponseStreamCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

const bedrockClient = new BedrockRuntimeClient({
  region: process.env.BEDROCK_REGION || 'us-east-1',
});

const s3Client = new S3Client({});

// ツール定義
const TOOLS = [
  {
    name: 'analyze_image',
    description: '画像を分析してキャプションや物体検出を行います',
    inputSchema: {
      type: 'object',
      properties: {
        s3Key: { type: 'string', description: 'S3上の画像ファイルキー' },
        analysisType: {
          type: 'string',
          enum: ['caption', 'objects', 'text', 'all'],
          description: '分析タイプ',
        },
      },
      required: ['s3Key'],
    },
  },
  {
    name: 'transcribe_audio',
    description: '音声ファイルを文字起こしします（話者識別対応）',
    inputSchema: {
      type: 'object',
      properties: {
        s3Key: { type: 'string', description: 'S3上の音声ファイルキー' },
        language: { type: 'string', default: 'ja-JP' },
        enableDiarization: { type: 'boolean', default: true },
      },
      required: ['s3Key'],
    },
  },
  {
    name: 'analyze_video',
    description: '動画を分析してシーン要約や物体追跡を行います',
    inputSchema: {
      type: 'object',
      properties: {
        s3Key: { type: 'string', description: 'S3上の動画ファイルキー' },
        analysisType: {
          type: 'string',
          enum: ['summary', 'scenes', 'objects', 'all'],
        },
      },
      required: ['s3Key'],
    },
  },
  {
    name: 'generate_embeddings',
    description: 'テキストまたは画像のベクトル埋め込みを生成します',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'テキスト（画像の場合は空）' },
        s3Key: { type: 'string', description: '画像ファイルキー（テキストの場合は空）' },
      },
    },
  },
];

/**
 * ストリーミングレスポンス生成
 */
export async function* invokeAgentStream(params: {
  sessionId: string;
  message: string;
  fileKeys?: string[];
  history?: Array<{ role: string; content: string }>;
}): AsyncGenerator<string> {
  const { sessionId, message, fileKeys, history = [] } = params;

  // システムプロンプト
  const systemPrompt = `あなたは Nova シリーズを活用した高度な AI アシスタントです。

## 利用可能なツール
- **analyze_image**: 画像の分析（キャプション生成、物体検出、OCR）
- **transcribe_audio**: 音声の文字起こし（話者識別対応）
- **analyze_video**: 動画の分析（シーン要約、物体追跡）
- **generate_embeddings**: ベクトル埋め込み生成

## 応答ガイドライン
1. ユーザーがファイルをアップロードした場合、適切なツールを使用して分析
2. 分析結果を分かりやすく日本語で説明
3. 追加の質問があれば詳細に回答

セッションID: ${sessionId}`;

  // メッセージ構築
  const messages = [
    ...history.map((h) => ({
      role: h.role,
      content: [{ text: h.content }],
    })),
    {
      role: 'user',
      content: [{ text: message }],
    },
  ];

  // ファイルがある場合はコンテンツに追加
  if (fileKeys && fileKeys.length > 0) {
    for (const key of fileKeys) {
      const fileType = getFileType(key);
      if (fileType === 'image') {
        // 画像の場合は Nova Omni で直接処理
        const imageData = await fetchFileFromS3(key);
        messages[messages.length - 1].content.push({
          image: {
            format: getImageFormat(key),
            source: { bytes: imageData },
          },
        } as any);
      }
    }
  }

  // Bedrock Nova Pro でストリーミング応答
  const response = await bedrockClient.send(
    new InvokeModelWithResponseStreamCommand({
      modelId: 'amazon.nova-pro-v1:0',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        inferenceConfig: {
          max_new_tokens: 4096,
          temperature: 0.7,
          top_p: 0.9,
        },
        system: [{ text: systemPrompt }],
        messages,
        toolConfig: {
          tools: TOOLS.map((t) => ({
            toolSpec: {
              name: t.name,
              description: t.description,
              inputSchema: { json: t.inputSchema },
            },
          })),
        },
      }),
    })
  );

  // ストリーミングレスポンスを処理
  if (response.body) {
    for await (const event of response.body) {
      if (event.chunk?.bytes) {
        const chunk = JSON.parse(new TextDecoder().decode(event.chunk.bytes));

        // テキスト出力
        if (chunk.contentBlockDelta?.delta?.text) {
          yield chunk.contentBlockDelta.delta.text;
        }

        // ツール呼び出し
        if (chunk.contentBlockStart?.start?.toolUse) {
          yield `\n🔧 ツール実行中: ${chunk.contentBlockStart.start.toolUse.name}\n`;
        }
      }
    }
  }
}

/**
 * 非ストリーミング版（AppSync Mutation用）
 */
export async function invokeAgent(params: {
  sessionId: string;
  message: string;
  fileKeys?: string[];
}): Promise<string> {
  const chunks: string[] = [];

  for await (const chunk of invokeAgentStream(params)) {
    chunks.push(chunk);
  }

  return chunks.join('');
}

// ヘルパー関数
function getFileType(key: string): 'image' | 'audio' | 'video' | 'document' {
  const ext = key.split('.').pop()?.toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) return 'image';
  if (['mp3', 'wav', 'flac', 'ogg', 'm4a'].includes(ext || '')) return 'audio';
  if (['mp4', 'mov', 'webm', 'avi'].includes(ext || '')) return 'video';
  return 'document';
}

function getImageFormat(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase();
  if (ext === 'jpg') return 'jpeg';
  return ext || 'png';
}

async function fetchFileFromS3(key: string): Promise<Uint8Array> {
  const response = await s3Client.send(
    new GetObjectCommand({
      Bucket: process.env.STORAGE_BUCKET_NAME,
      Key: key,
    })
  );

  const stream = response.Body as NodeJS.ReadableStream;
  const chunks: Uint8Array[] = [];

  for await (const chunk of stream) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

