/**
 * Amplify モジュール（後方互換用）
 * 
 * ⚠️ 非推奨: 新規コードは shared/api からインポートしてください
 * 
 * Clean Architecture:
 * - ポート: shared/api/ports/
 * - アダプター: shared/infrastructure/
 */

// 初期化
export { initializeAmplify, isAmplifyConfigured } from '../shared/infrastructure';

// DIコンテナ経由のアクセス（推奨）
export { container } from '../shared/infrastructure';

// 型定義の再エクスポート
export type { AuthUser, AuthSession, AuthPort } from '../shared/api/ports/auth-port';
export type { ApiPort, ChatSession, ChatMessage } from '../shared/api/ports/api-port';
export type { StoragePort, UploadResult, FileItem } from '../shared/api/ports/storage-port';
