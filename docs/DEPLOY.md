# rd-bedrock-nova デプロイガイド

> **Amplify Gen2 本番デプロイ手順**

---

## 📋 前提条件

### 必須ツール

```bash
# Node.js 20.x 以上
node --version  # v20.x.x

# npm
npm --version   # v10.x.x

# AWS CLI v2
aws --version

# Git
git --version
```

### AWS 認証

```bash
# AWS プロファイル設定確認
aws sts get-caller-identity

# 必要な権限
# - CloudFormation
# - Cognito
# - AppSync
# - Lambda
# - S3
# - IAM
# - Bedrock
```

---

## 🚀 デプロイ方式

### 方式 1: サンドボックス (開発環境)

個人開発環境を AWS にデプロイします。

```bash
cd amplify
npm install
npx ampx sandbox
```

**特徴:**
- 開発者ごとに独立した環境
- ホットリロード対応
- `amplify_outputs.json` 自動生成

### 方式 2: Amplify Hosting (本番環境)

#### Step 1: GitHub リポジトリ接続

1. AWS Console → Amplify → 新しいアプリを作成
2. GitHub を選択
3. リポジトリ `rd-bedrock-nova` を選択
4. ブランチ `main` を選択

#### Step 2: ビルド設定

`amplify.yml` が自動的に使用されます。

```yaml
version: 1
applications:
  - appRoot: .
    frontend:
      phases:
        preBuild:
          commands:
            - cd frontend
            - npm ci --legacy-peer-deps
        build:
          commands:
            - npm run build
      artifacts:
        baseDirectory: frontend/.next
        files:
          - '**/*'
    backend:
      phases:
        preBuild:
          commands:
            - cd amplify
            - npm ci
        build:
          commands:
            - npx ampx pipeline-deploy --branch $AWS_BRANCH --app-id $AWS_APP_ID
```

#### Step 3: 環境変数設定

Amplify Console → アプリ → 環境変数:

| 変数名 | 値 |
|--------|-----|
| `BEDROCK_REGION` | `us-east-1` |
| `LOG_LEVEL` | `INFO` |

#### Step 4: デプロイ実行

```bash
git push origin main
# → Amplify Hosting で自動デプロイ
```

### 方式 3: 手動デプロイ (CI/CD外)

```bash
cd amplify
npm install

# 本番ブランチにデプロイ
npx ampx pipeline-deploy --branch main --app-id YOUR_APP_ID
```

---

## 📊 デプロイ後の確認

### 1. Amplify Console で確認

- デプロイステータス: **Succeed**
- フロントエンド URL: `https://main.xxxxx.amplifyapp.com`
- Backend リソース: Cognito, AppSync, Lambda, S3

### 2. 動作確認

```bash
# フロントエンドにアクセス
open https://main.xxxxx.amplifyapp.com

# 1. サインアップ (Email + パスワード)
# 2. 確認コード入力
# 3. チャット画面でテスト
```

### 3. ログ確認

```bash
# Lambda ログ
aws logs tail /aws/lambda/amplify-xxx-agent-handler --follow

# CloudWatch メトリクス
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Invocations \
  --dimensions Name=FunctionName,Value=amplify-xxx-agent-handler \
  --start-time $(date -u -v-1H +%Y-%m-%dT%H:%M:%SZ) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
  --period 300 \
  --statistics Sum
```

---

## 💰 コスト見積もり

### サンドボックス (開発)

| リソース | 月額コスト |
|----------|-----------|
| Cognito | 無料 (50,000 MAU まで) |
| AppSync | ~$4/月 (100万リクエスト) |
| Lambda | ~$0 (無料枠内) |
| S3 | ~$0.50 |
| **合計** | **~$5/月** |

### 本番 (軽負荷)

| リソース | 月額コスト |
|----------|-----------|
| Cognito | 無料 |
| AppSync | ~$10/月 |
| Lambda | ~$5/月 |
| S3 | ~$2/月 |
| Bedrock | ~$20/月 |
| Amplify Hosting | ~$5/月 |
| **合計** | **~$40/月** |

---

## 🔧 トラブルシューティング

### ビルドエラー: npm install 失敗

```bash
# legacy-peer-deps オプションを追加
npm ci --legacy-peer-deps
```

### Lambda タイムアウト

1. Amplify Console → Functions → agent-handler
2. タイムアウト: 300秒に変更

### Bedrock アクセスエラー

```bash
# Bedrock モデルアクセス確認
aws bedrock list-foundation-models --region us-east-1

# モデルアクセスリクエスト (Console)
# Bedrock → Model access → Nova Pro, Nova Sonic, Nova Omni を有効化
```

### Cognito 確認コードが届かない

1. SES (Simple Email Service) の設定確認
2. サンドボックス解除リクエスト (本番用)

---

## 🧹 クリーンアップ

### サンドボックス削除

```bash
cd amplify
npx ampx sandbox delete
```

### 本番環境削除

1. Amplify Console → アプリ → 削除
2. CloudFormation スタックが残っている場合:

```bash
aws cloudformation delete-stack --stack-name amplify-xxx-main
```

### S3 バケット削除

```bash
# バケット内容を削除
aws s3 rm s3://amplify-xxx-storage --recursive

# バケットを削除
aws s3 rb s3://amplify-xxx-storage
```

---

## 📚 関連ドキュメント

- [README.md](./README.md) - プロジェクト概要
- [docs/architecture.md](./docs/architecture.md) - アーキテクチャ設計
- [docs/AMPLIFY_SANDBOX_GUIDE.md](./docs/AMPLIFY_SANDBOX_GUIDE.md) - サンドボックスガイド
- [docs/E2E_TESTING.md](./docs/E2E_TESTING.md) - E2Eテストガイド

---

*Last Updated: 2025-01-01*
*Architecture: Amplify Gen2 + Strands Agent + Bedrock Nova*
