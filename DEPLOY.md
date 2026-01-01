# rd-bedrock-nova デプロイガイド

> **AWS サーバレスアーキテクチャのデプロイ手順**

---

## 📋 前提条件

### 必須ツール

```bash
# AWS CLI v2
aws --version

# AWS CDK CLI
cdk --version

# Docker (コンテナイメージビルド用)
docker --version

# Node.js (フロントエンド用)
node --version
npm --version

# Python 3.12+
python --version
```

### AWS 認証

```bash
# AWS プロファイル設定
aws configure

# または環境変数
export AWS_ACCESS_KEY_ID=your_access_key
export AWS_SECRET_ACCESS_KEY=your_secret_key
export AWS_DEFAULT_REGION=ap-northeast-1
```

---

## 🚀 デプロイ手順

### 1. 依存関係インストール

```bash
cd rd-bedrock-nova

# Python 依存関係
pip install -r requirements.txt

# CDK 依存関係
pip install aws-cdk-lib constructs
```

### 2. CDK ブートストラップ (初回のみ)

```bash
# CDK ブートストラップ (リージョンごとに1回)
cdk bootstrap aws://ACCOUNT_ID/ap-northeast-1
```

### 3. コンテナイメージビルド

```bash
# Agent Core イメージビルド
docker build -t nova-agent-core -f Dockerfile.agent-core .

# ECR にプッシュ (CDK デプロイ後)
# ECR リポジトリは CDK で自動作成されます
```

### 4. CDK デプロイ

```bash
# CDK synth (CloudFormation テンプレート生成)
cdk synth

# CDK デプロイ (全スタック)
cdk deploy --all --require-approval never

# または個別デプロイ
cdk deploy NovaPlatformStack
```

### 5. デプロイ結果確認

```bash
# CloudFormation 出力を確認
aws cloudformation describe-stacks \
  --stack-name NovaPlatformStack \
  --query 'Stacks[0].Outputs'
```

**出力例:**

| OutputKey | 説明 |
|-----------|------|
| `NovaAgUiEndpointUrl` | AG-UI Lambda Function URL |
| `NovaUploadEndpointUrl` | Upload Lambda Function URL |
| `ApiGatewayUrl` | REST API Gateway URL |

---

## 🖥️ フロントエンドセットアップ

### 1. 依存関係インストール

```bash
cd frontend
npm install
```

### 2. 開発サーバー起動

```bash
npm run dev
```

### 3. Lambda URL 設定

1. ブラウザで `http://localhost:3000/settings/` にアクセス
2. デプロイ結果の `NovaAgUiEndpointUrl` を入力
3. 保存

### 4. AI Agent を試す

1. `http://localhost:3000/copilot/` にアクセス
2. ファイルをアップロード
3. 「この音声を文字起こしして」などのメッセージを送信

---

## 📊 リソース一覧

### Lambda Functions

| 関数名 | 説明 | メモリ |
|--------|------|--------|
| `nova-agent-core` | Strands Agent Core | 1024MB |
| `nova-ag-ui-handler` | AG-UI Protocol | 1024MB |
| `nova-audio-handler` | Nova Sonic | 256MB |
| `nova-video-handler` | Nova Omni | 512MB |
| `nova-search-handler` | Nova Embeddings | 256MB |
| `nova-upload-handler` | S3 Presigned URL | 256MB |
| `nova-event-projector` | DynamoDB Stream | 256MB |

### DynamoDB Tables

| テーブル名 | 用途 |
|-----------|------|
| `nova-event-store` | Event Sourcing |
| `nova-read-model` | CQRS Read Model |
| `nova-session-memory` | Session Memory (TTL) |

### S3 Buckets

| バケット | 用途 |
|----------|------|
| `nova-content-*` | メディアファイル・ベクトルデータ |

---

## 💰 コスト

### アイドル時

| リソース | 月額 |
|----------|------|
| Lambda | $0 |
| DynamoDB (On-Demand) | $0 |
| S3 | ~$0.02 |
| **合計** | **~$0/月** |

### 軽負荷時 (1,000リクエスト/日)

| リソース | 月額 |
|----------|------|
| Lambda | ~$2 |
| DynamoDB | ~$1 |
| Bedrock API | ~$5 |
| **合計** | **~$10/月** |

---

## 🔧 トラブルシューティング

### CDK デプロイエラー

```bash
# スタック状態確認
aws cloudformation describe-stacks --stack-name NovaPlatformStack

# ロールバック
cdk destroy --all
```

### Lambda エラー

```bash
# ログ確認
aws logs tail /aws/lambda/nova-agent-core --follow
```

### ECR プッシュエラー

```bash
# ECR ログイン
aws ecr get-login-password --region ap-northeast-1 | \
  docker login --username AWS --password-stdin ACCOUNT_ID.dkr.ecr.ap-northeast-1.amazonaws.com

# イメージプッシュ
docker tag nova-agent-core:latest ACCOUNT_ID.dkr.ecr.ap-northeast-1.amazonaws.com/nova-agent-core:latest
docker push ACCOUNT_ID.dkr.ecr.ap-northeast-1.amazonaws.com/nova-agent-core:latest
```

---

## 🧹 クリーンアップ

```bash
# 全リソース削除
cdk destroy --all

# S3 バケットは手動削除が必要な場合あり
aws s3 rb s3://nova-content-bucket --force
```

---

*Last Updated: 2025-01-01*

