/**
 * Amplify 設定
 * 
 * フロントエンド専用のAmplify統合レイヤー
 * - 認証設定
 * - API設定
 * - Storage設定
 */
import { Amplify, ResourcesConfig } from 'aws-amplify';

// 環境変数または静的設定から読み込み
let amplifyConfig: ResourcesConfig | null = null;

/**
 * Amplify設定を初期化
 */
export function initializeAmplify(): void {
  if (amplifyConfig) {
    return; // 既に初期化済み
  }

  try {
    // amplify_outputs.json から設定を読み込み
    // ビルド時にコピーされる
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const outputs = require('../../amplify_outputs.json');
    amplifyConfig = outputs;
    Amplify.configure(outputs);
    console.log('[Amplify] Configuration loaded successfully');
  } catch (error) {
    console.error('[Amplify] Failed to load configuration:', error);
    // フォールバック: 環境変数から設定
    const fallbackConfig: ResourcesConfig = {
      Auth: {
        Cognito: {
          userPoolId: process.env.NEXT_PUBLIC_USER_POOL_ID || '',
          userPoolClientId: process.env.NEXT_PUBLIC_USER_POOL_CLIENT_ID || '',
          identityPoolId: process.env.NEXT_PUBLIC_IDENTITY_POOL_ID || '',
        },
      },
    };
    
    if (fallbackConfig.Auth?.Cognito?.userPoolId) {
      amplifyConfig = fallbackConfig;
      Amplify.configure(fallbackConfig);
      console.log('[Amplify] Using fallback configuration from environment variables');
    }
  }
}

/**
 * 現在のAmplify設定を取得
 */
export function getAmplifyConfig(): ResourcesConfig | null {
  return amplifyConfig;
}

/**
 * Amplifyが設定済みかチェック
 */
export function isAmplifyConfigured(): boolean {
  return amplifyConfig !== null;
}
