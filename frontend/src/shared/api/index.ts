/**
 * API層エクスポート
 * 
 * Clean Architecture: ポート（インターフェース）の公開
 * Feature層はここからインポート
 */

// ポート（インターフェース）
export * from './ports';

// DIコンテナ経由のアクセス
export { container } from '../infrastructure';
