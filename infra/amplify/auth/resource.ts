import { defineAuth } from '@aws-amplify/backend';

/**
 * Amplify Auth 設定
 * 
 * - Email サインイン
 * - MFA: オプション（TOTP）
 */
export const auth = defineAuth({
  loginWith: {
    email: {
      verificationEmailStyle: 'CODE',
      verificationEmailSubject: 'rd-bedrock-nova: 認証コード',
      verificationEmailBody: (createCode) => 
        `認証コード: ${createCode()}\n\nこのコードは10分間有効です。`,
    },
  },
  userAttributes: {
    preferredUsername: {
      required: false,
      mutable: true,
    },
  },
  multifactor: {
    mode: 'OPTIONAL',
    totp: true,
  },
  accountRecovery: 'EMAIL_ONLY',
});
