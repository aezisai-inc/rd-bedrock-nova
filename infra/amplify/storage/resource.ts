import { defineStorage } from '@aws-amplify/backend';

/**
 * Amplify Storage 設定
 * 
 * ファイルアップロード用 S3 バケット
 * - uploads/: ユーザーアップロードファイル（認証済みユーザーは自由に書き込み可能）
 * - processed/: 処理済みファイル
 * - shared/: 共有ファイル
 */
export const storage = defineStorage({
  name: 'rdBedrockNovaStorage',
  access: (allow) => ({
    // ユーザーアップロード - 認証済みユーザーは書き込み可能
    // フロントエンドは uploads/${sessionId}/ パスを使用
    'uploads/*': [
      allow.authenticated.to(['read', 'write', 'delete']),
    ],
    // ユーザーごとのプライベートアップロード（Identity IDベース）
    'private/{entity_id}/*': [
      allow.entity('identity').to(['read', 'write', 'delete']),
    ],
    // 処理済みファイル（読み取り専用）
    'processed/*': [
      allow.authenticated.to(['read']),
    ],
    // 共有ファイル（認証済みユーザーは読み取り可能）
    'shared/*': [
      allow.authenticated.to(['read']),
    ],
  }),
});

