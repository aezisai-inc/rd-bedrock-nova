import { defineAuth } from '@aws-amplify/backend';

/**
 * Amplify Auth 設定
 * 
 * - Email サインイン
 * - パスワードポリシー: 8文字以上
 * - MFA: オプション（TOTP）
 */
export const auth = defineAuth({
  loginWith: {
    email: {
      verificationEmailStyle: 'CODE',
      verificationEmailSubject: 'rd-bedrock-nova: 認証コード',
      verificationEmailBody: (code) => 
        `認証コード: ${code}\n\nこのコードは10分間有効です。`,
    },
  },
  userAttributes: {
    preferredUsername: {
      required: false,
      mutable: true,
    },
  },
  passwordPolicy: {
    minLength: 8,
    requireLowercase: true,
    requireUppercase: true,
    requireNumbers: true,
    requireSymbols: false,
  },
  multifactor: {
    mode: 'OPTIONAL',
    totp: true,
  },
  accountRecovery: 'EMAIL_ONLY',
});

