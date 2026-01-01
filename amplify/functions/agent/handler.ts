import type { AppSyncResolverHandler } from 'aws-lambda';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { invokeAgent } from './strands-agent';

const s3Client = new S3Client({});
const BUCKET_NAME = process.env.STORAGE_BUCKET_NAME || '';

/**
 * AppSync Resolver ハンドラー
 * 
 * - invokeAgent: Strands Agent を呼び出してAI応答を生成
 * - getUploadUrl: S3 Presigned URL を生成
 */
export const handler: AppSyncResolverHandler<any, any> = async (event) => {
  console.log('Event:', JSON.stringify(event, null, 2));

  const { fieldName } = event.info;
  const identity = event.identity as { sub?: string; username?: string } | null;
  const userId = identity?.sub || identity?.username || 'anonymous';

  switch (fieldName) {
    case 'invokeAgent':
      return handleInvokeAgent(event.arguments, userId);
    case 'getUploadUrl':
      return handleGetUploadUrl(event.arguments, userId);
    default:
      throw new Error(`Unknown field: ${fieldName}`);
  }
};

/**
 * エージェント呼び出し（Strands Agent 統合）
 */
async function handleInvokeAgent(
  args: {
    sessionId: string;
    message: string;
    fileKeys?: string[];
  },
  userId: string
): Promise<string> {
  const { sessionId, message, fileKeys } = args;

  console.log(`[${userId}] Invoking agent for session: ${sessionId}`);

  try {
    const response = await invokeAgent({
      sessionId,
      message,
      fileKeys,
    });

    console.log(`[${userId}] Agent response length: ${response.length}`);
    return response;
  } catch (error) {
    console.error(`[${userId}] Agent error:`, error);
    throw new Error('エージェントの呼び出しに失敗しました');
  }
}

/**
 * Presigned URL 取得（ユーザーごとのパス）
 */
async function handleGetUploadUrl(
  args: {
    fileName: string;
    fileType: string;
  },
  userId: string
): Promise<{ uploadUrl: string; s3Key: string }> {
  const { fileName, fileType } = args;

  if (!BUCKET_NAME) {
    throw new Error('Storage bucket not configured');
  }

  const timestamp = Date.now();
  const s3Key = `uploads/${userId}/${timestamp}-${fileName}`;

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: s3Key,
    ContentType: fileType,
  });

  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

  console.log(`[${userId}] Generated upload URL for: ${s3Key}`);

  return { uploadUrl, s3Key };
}

