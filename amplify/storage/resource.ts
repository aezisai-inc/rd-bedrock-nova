import { defineStorage } from '@aws-amplify/backend';

/**
 * Amplify Storage 設定
 * 
 * ファイルアップロード用 S3 バケット
 * - uploads/: ユーザーアップロードファイル
 * - processed/: 処理済みファイル
 */
export const storage = defineStorage({
  name: 'rdBedrockNovaStorage',
  access: (allow) => ({
    // ユーザーごとのプライベートアップロード
    'uploads/{entity_id}/*': [
      allow.entity('identity').to(['read', 'write', 'delete']),
    ],
    // 処理済みファイル（読み取り専用）
    'processed/{entity_id}/*': [
      allow.entity('identity').to(['read']),
    ],
    // 共有ファイル（管理者のみ書き込み可能）
    'shared/*': [
      allow.authenticated.to(['read']),
      allow.groups(['admin']).to(['read', 'write', 'delete']),
    ],
  }),
});

