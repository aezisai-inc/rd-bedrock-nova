import { defineFunction, secret } from '@aws-amplify/backend';

/**
 * AgentCore Lambda Function
 * 
 * Strands Agents SDK を使用した AI エージェント
 * - Nova Sonic: 音声処理
 * - Nova Omni: 画像/動画解析
 * - Nova Embeddings: ベクトル検索
 */
export const agentFunction = defineFunction({
  name: 'agent-handler',
  entry: './handler.ts',
  timeoutSeconds: 300, // 5分（長時間の音声/動画処理用）
  memoryMB: 1024,
  environment: {
    BEDROCK_REGION: 'us-east-1',
    LOG_LEVEL: 'INFO',
    // STORAGE_BUCKET_NAME は Amplify が自動的に設定
  },
  runtime: 20, // Node.js 20.x
  bundling: {
    // 依存関係をバンドル
    externalModules: ['@aws-sdk/*'],
  },
});

