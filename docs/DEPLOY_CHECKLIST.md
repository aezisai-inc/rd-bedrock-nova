# デプロイ準備チェックリスト

> **Amplify Gen2 本番デプロイ前の最終確認**

---

## ✅ コード準備

- [x] アーキテクチャ設計書 (`docs/architecture.md`) 最新化
- [x] デプロイガイド (`DEPLOY.md`) 整備
- [x] amplify.yml CI/CD設定
- [x] フロントエンド (`frontend/`) Amplify UI対応
- [x] バックエンド (`amplify/`) Strands Agent統合
- [x] E2Eテストガイド (`docs/E2E_TESTING.md`)
- [x] サンドボックスガイド (`docs/AMPLIFY_SANDBOX_GUIDE.md`)

---

## ⚠️ デプロイ前の確認事項

### 1. AWS アカウント設定

```bash
# AWS CLI 認証確認
aws sts get-caller-identity
```

**必要な権限:**
- CloudFormation: FullAccess
- Cognito: FullAccess
- AppSync: FullAccess
- Lambda: FullAccess
- S3: FullAccess
- IAM: PassRole
- Bedrock: InvokeModel

### 2. Bedrock モデルアクセス

AWS Console → Bedrock → Model access で以下を有効化:

| モデル | 用途 |
|--------|------|
| Amazon Nova Pro | LLM (チャット、推論) |
| Amazon Nova Sonic | 音声認識・話者識別 |
| Amazon Nova Omni | 画像/動画解析 |
| Amazon Nova Embeddings | ベクトル埋め込み |

### 3. リージョン確認

| 項目 | 推奨リージョン |
|------|---------------|
| Bedrock | `us-east-1` (Nova対応) |
| Amplify | `us-east-1` または `ap-northeast-1` |

### 4. 予想コスト確認

| 環境 | 月額コスト |
|------|-----------|
| サンドボックス (開発) | ~$5/月 |
| 本番 (軽負荷) | ~$40/月 |

---

## 🚀 デプロイ手順

### オプション A: サンドボックス (推奨: まずこちらで検証)

```bash
cd amplify
npm install
npx ampx sandbox
```

### オプション B: Amplify Hosting (本番)

1. AWS Console → Amplify
2. 「新しいアプリを作成」
3. GitHub → `aezisai-inc/rd-bedrock-nova` → `main`
4. ビルド設定は `amplify.yml` を自動使用
5. デプロイ実行

### オプション C: CLI手動デプロイ

```bash
cd amplify
npm install
npx ampx pipeline-deploy --branch main --app-id YOUR_APP_ID
```

---

## 📋 デプロイ後の確認

### 1. リソース確認

```bash
# Cognito User Pool
aws cognito-idp list-user-pools --max-results 10

# AppSync API
aws appsync list-graphql-apis

# Lambda Functions
aws lambda list-functions --query 'Functions[?starts_with(FunctionName, `amplify-`)]'

# S3 Buckets
aws s3 ls | grep amplify
```

### 2. 動作確認

1. フロントエンド URL にアクセス
2. サインアップ（Email + パスワード）
3. 確認コード入力
4. チャットでテスト: 「こんにちは」
5. ファイルアップロードテスト

### 3. ログ確認

```bash
# Lambda ログ
aws logs tail /aws/lambda/amplify-xxx-agent-handler --follow
```

---

## 🎯 デプロイ完了基準

- [ ] Amplify Console でデプロイステータス: **Succeed**
- [ ] フロントエンド URL でサインアップ可能
- [ ] チャットでAI応答を確認
- [ ] ファイルアップロードでS3に保存確認
- [ ] CloudWatch Logs でエラーなし

---

## 📞 次のアクション

**このチェックリストを確認後、以下のコマンドでデプロイを実行:**

```bash
# 開発環境 (サンドボックス)
cd amplify && npx ampx sandbox

# または本番環境 (Amplify Console から)
# AWS Console → Amplify → 新しいアプリを作成
```

---

*Created: 2025-01-01*
*Status: Ready for Deployment*

