import type { AppSyncResolverHandler } from 'aws-lambda';
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  InvokeModelWithResponseStreamCommand,
} from '@aws-sdk/client-bedrock-runtime';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const bedrockClient = new BedrockRuntimeClient({
  region: process.env.BEDROCK_REGION || 'us-east-1',
});

const s3Client = new S3Client({});
const BUCKET_NAME = process.env.STORAGE_BUCKET_NAME || 'rd-bedrock-nova-uploads';

/**
 * エージェント呼び出しハンドラー
 */
export const handler: AppSyncResolverHandler<any, any> = async (event) => {
  console.log('Event:', JSON.stringify(event, null, 2));

  const { fieldName } = event.info;

  switch (fieldName) {
    case 'invokeAgent':
      return handleInvokeAgent(event.arguments);
    case 'getUploadUrl':
      return handleGetUploadUrl(event.arguments);
    default:
      throw new Error(`Unknown field: ${fieldName}`);
  }
};

/**
 * エージェント呼び出し
 */
async function handleInvokeAgent(args: {
  sessionId: string;
  message: string;
  fileKeys?: string[];
}): Promise<string> {
  const { sessionId, message, fileKeys } = args;

  // システムプロンプト
  const systemPrompt = `あなたは Nova シリーズのAIアシスタントです。
以下の機能を提供します：
- 画像解析（Nova Omni Vision）
- 動画解析（Nova Omni Video）
- 音声文字起こし・感情分析（Nova Sonic）
- ベクトル検索（Nova Embeddings）

ユーザーの質問に親切かつ正確に回答してください。`;

  // メッセージ構築
  const messages = [
    { role: 'user', content: message },
  ];

  // ファイルがある場合はマルチモーダル処理
  if (fileKeys && fileKeys.length > 0) {
    // TODO: ファイルを読み込んでマルチモーダル処理
    console.log('Processing files:', fileKeys);
  }

  // Bedrock Nova Pro で応答生成
  const response = await bedrockClient.send(
    new InvokeModelCommand({
      modelId: 'amazon.nova-pro-v1:0',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        inferenceConfig: {
          max_new_tokens: 2048,
          temperature: 0.7,
          top_p: 0.9,
        },
        system: [{ text: systemPrompt }],
        messages: messages.map((m) => ({
          role: m.role,
          content: [{ text: m.content }],
        })),
      }),
    })
  );

  const responseBody = JSON.parse(new TextDecoder().decode(response.body));
  const assistantMessage =
    responseBody.output?.message?.content?.[0]?.text || 'No response';

  return assistantMessage;
}

/**
 * Presigned URL 取得
 */
async function handleGetUploadUrl(args: {
  fileName: string;
  fileType: string;
}): Promise<{ uploadUrl: string; s3Key: string }> {
  const { fileName, fileType } = args;

  const timestamp = Date.now();
  const s3Key = `uploads/${timestamp}-${fileName}`;

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: s3Key,
    ContentType: fileType,
  });

  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

  return { uploadUrl, s3Key };
}

