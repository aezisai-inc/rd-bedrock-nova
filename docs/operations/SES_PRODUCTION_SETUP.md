# AWS SES 本番設定ガイド

## 概要

Amazon SES (Simple Email Service) はデフォルトでサンドボックスモードで起動します。  
本番環境でCognito認証メール（パスワードリセット、確認メール等）を送信するには、プロダクションアクセスの申請が必要です。

## 現在の状況

| 項目 | 状態 |
|------|------|
| SESモード | サンドボックス |
| 送信制限 | 検証済みメールアドレスのみ |
| Cognito連携 | 動作するが、未検証ユーザーには送信不可 |

## プロダクションアクセス申請手順

### 1. AWS Console からの申請

1. [AWS SES Console](https://console.aws.amazon.com/ses/) にアクセス
2. リージョンを `ap-northeast-1` (東京) に設定
3. 左メニューの「Account dashboard」をクリック
4. 「Request production access」ボタンをクリック

### 2. 申請フォームの入力

| 項目 | 入力例 |
|------|--------|
| Mail type | Transactional |
| Website URL | https://main.d1rojnqtubey1r.amplifyapp.com |
| Use case description | 以下参照 |

**Use case description（例）**:
```
We are building an AI platform that uses Amazon Cognito for user authentication.
SES is required to send:
- Email verification codes during user registration
- Password reset emails
- Multi-factor authentication codes

Expected sending volume: ~100 emails/day
We will implement proper bounce and complaint handling.
All emails are transactional and user-requested.
```

### 3. 申請後の待機

- 通常24時間以内に審査完了
- AWSからの追加質問に迅速に回答すること
- 承認後、送信クォータが引き上げられる

## 代替手段: メールアドレス検証

プロダクションアクセス申請中の一時的な対処として、特定のメールアドレスを検証することで送信可能にできます。

### 送信元メールアドレスの検証

```bash
# 検証メール送信
aws ses verify-email-identity \
  --email-address noreply@aezisai.com \
  --region ap-northeast-1
```

### 受信者メールアドレスの検証（サンドボックス時のみ必要）

```bash
# テスト用メールアドレスを検証
aws ses verify-email-identity \
  --email-address test-user@example.com \
  --region ap-northeast-1
```

## Cognito との連携設定

Cognito User Pool のメール設定を確認・更新:

```bash
# 現在の設定確認
aws cognito-idp describe-user-pool \
  --user-pool-id ap-northeast-1_XXXXXXXXX \
  --query 'UserPool.EmailConfiguration' \
  --region ap-northeast-1

# SES経由での送信設定（推奨）
aws cognito-idp update-user-pool \
  --user-pool-id ap-northeast-1_XXXXXXXXX \
  --email-configuration \
    SourceArn=arn:aws:ses:ap-northeast-1:226484346947:identity/noreply@aezisai.com,\
    EmailSendingAccount=DEVELOPER \
  --region ap-northeast-1
```

## 本番運用チェックリスト

- [ ] SESプロダクションアクセス申請完了
- [ ] 送信元メールアドレス (From) の検証
- [ ] SPF/DKIM/DMARC の設定（ドメイン使用時）
- [ ] バウンス・苦情通知の設定
- [ ] 送信クォータの監視設定

## 関連ドキュメント

- [AWS SES プロダクションアクセス申請](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html)
- [Cognito メール設定](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-email.html)
- [SES ベストプラクティス](https://docs.aws.amazon.com/ses/latest/dg/best-practices.html)

## 問い合わせ先

SES申請に関する問題は AWS Support に問い合わせてください。
