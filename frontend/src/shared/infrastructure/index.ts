/**
 * Infrastructure層エクスポート
 * 
 * Clean Architecture: 外部依存のカプセル化
 */

// DIコンテナ
export { container } from './container';

// Amplify設定（初期化用）
export { initializeAmplify, isAmplifyConfigured } from './amplify-config';

// アダプター（直接使用は非推奨、container経由で使用）
export { getAuthAdapter } from './auth/amplify-auth-adapter';
export { getApiAdapter } from './api/amplify-graphql-adapter';
export { getStorageAdapter } from './storage/amplify-storage-adapter';
