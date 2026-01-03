/**
 * Agent Lambda Handler
 * 
 * Infra層: Amplify Lambda → Agents層への橋渡し
 * 
 * 責務:
 * - AppSync Resolver として動作
 * - agents/ 層の ChatService/AgentService を呼び出し
 * - リクエスト/レスポンス変換
 */
import type { AppSyncResolverHandler } from 'aws-lambda';

// agents層からインポート（ビルド時にバンドル）
// Note: 本番ではnpm workspaceで解決
// import { ChatService } from '@rd-bedrock-nova/agents/chat';
// import { AgentService } from '@rd-bedrock-nova/agents/strands';

// 一時的にインライン実装（ビルド設定後に置き換え）
import {
  BedrockRuntimeClient,
  ConverseCommand,
} from '@aws-sdk/client-bedrock-runtime';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Clients
const bedrockClient = new BedrockRuntimeClient({
  region: process.env.BEDROCK_REGION || 'ap-northeast-1',
});
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'ap-northeast-1',
});

// Types
interface InvokeAgentArgs {
  sessionId: string;
  message: string;
  fileKeys?: string[];
}

interface GetUploadUrlArgs {
  fileName: string;
  fileType: string;
}

type ResolverEvent =
  | { fieldName: 'invokeAgent'; arguments: InvokeAgentArgs; identity?: { sub?: string } }
  | { fieldName: 'getUploadUrl'; arguments: GetUploadUrlArgs; identity?: { sub?: string } };

/**
 * AppSync Resolver Handler
 */
export const handler: AppSyncResolverHandler<unknown, unknown> = async (event) => {
  const resolverEvent = event as unknown as ResolverEvent;
  console.log('[Agent Handler] Event:', JSON.stringify({ 
    fieldName: resolverEvent.fieldName,
    identity: resolverEvent.identity?.sub 
  }));

  try {
    switch (resolverEvent.fieldName) {
      case 'invokeAgent':
        return await handleInvokeAgent(resolverEvent.arguments);
      case 'getUploadUrl':
        return await handleGetUploadUrl(
          resolverEvent.arguments,
          resolverEvent.identity?.sub
        );
      default:
        throw new Error(`Unknown field: ${(resolverEvent as { fieldName: string }).fieldName}`);
    }
  } catch (error) {
    console.error('[Agent Handler] Error:', error);
    throw error;
  }
};

/**
 * Agent呼び出し
 * 
 * TODO: agents/strands/AgentService に移行
 */
async function handleInvokeAgent(args: InvokeAgentArgs): Promise<string> {
  const { sessionId, message, fileKeys } = args;
  console.log('[InvokeAgent] SessionId:', sessionId, 'FileKeys:', fileKeys?.length ?? 0);

  // ファイル処理
  let processedMessage = message;
  if (fileKeys && fileKeys.length > 0) {
    processedMessage = `[Files attached: ${fileKeys.join(', ')}]\n\n${message}`;
  }

  // Bedrock Converse API
  const response = await bedrockClient.send(
    new ConverseCommand({
      modelId: process.env.MODEL_ID || 'amazon.nova-micro-v1:0',
      messages: [
        {
          role: 'user',
          content: [{ text: processedMessage }],
        },
      ],
      system: [
        {
          text: `あなたは親切なAIアシスタントです。
セッションID: ${sessionId}
日本語で簡潔に回答してください。`,
        },
      ],
    })
  );

  const textContent = response.output?.message?.content?.find((c) => 'text' in c);
  return textContent && 'text' in textContent ? textContent.text ?? '' : '';
}

/**
 * アップロードURL生成
 * 
 * TODO: agents/file/FileService に移行
 */
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
      Bucket: process.env.STORAGE_BUCKET_NAME,
      Key: s3Key,
      ContentType: fileType,
    }),
    { expiresIn: 3600 }
  );

  return { uploadUrl, s3Key };
}
