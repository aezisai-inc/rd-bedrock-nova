# Amplify Gen2 サンドボックステストガイド

## 概要

このガイドでは、Amplify Gen2 サンドボックス環境を使用して Nova AI Platform の E2E テストを実行する手順を説明します。

## 前提条件

### 必須ツール

```bash
# Node.js 20.x 以上
node --version  # v20.x.x

# AWS CLI（認証設定済み）
aws sts get-caller-identity

# Amplify CLI
npm install -g @aws-amplify/cli
```

### AWS 権限

以下の権限を持つ IAM ユーザー/ロールが必要です：

- CloudFormation（スタック作成/更新/削除）
- Cognito（ユーザープール作成）
- AppSync（API作成）
- Lambda（関数作成）
- S3（バケット作成）
- IAM（ロール作成）
- Bedrock（モデル呼び出し）

---

## サンドボックス起動

### 1. バックエンドのサンドボックス起動

```bash
cd amplify
npm install

# サンドボックス起動（個人開発環境をAWSにデプロイ）
npx ampx sandbox
```

**出力例:**

```
✔ Deployed amplify backend stack
  auth: UserPool created
  data: AppSync API created
  storage: S3 bucket created
  agentFunction: Lambda function created

amplify_outputs.json has been generated
```

### 2. フロントエンドの起動

別ターミナルで実行：

```bash
cd frontend
npm install
npm run dev
```

ブラウザで http://localhost:3000 にアクセス。

---

## テストシナリオ

### シナリオ 1: 認証フロー

1. **サインアップ**
   - メールアドレスを入力
   - パスワード設定（8文字以上、大小英字+数字）
   - 確認コード入力

2. **サインイン**
   - 登録したメールアドレスでログイン

3. **サインアウト**
   - ヘッダーの「サインアウト」ボタンをクリック

### シナリオ 2: テキストチャット

1. サインイン後、チャット画面が表示される
2. テキストを入力して送信
3. AI からの応答を確認

**テスト入力例:**

```
こんにちは。あなたは何ができますか？
```

**期待される応答:**
- Nova AI Platform の機能説明
- 画像/動画/音声解析の説明

### シナリオ 3: 画像アップロード + 解析

1. 📎 ボタンをクリック
2. 画像ファイルを選択（PNG, JPEG, GIF, WEBP）
3. メッセージを入力: 「この画像を説明してください」
4. 送信

**期待される応答:**
- 画像の内容説明
- 物体、色、シーンの認識結果

### シナリオ 4: 音声ファイル + 文字起こし

1. 📎 ボタンをクリック
2. 音声ファイルを選択（MP3, WAV, M4A）
3. メッセージを入力: 「この音声を文字起こしして」
4. 送信

**期待される応答:**
- 音声のテキスト化結果
- 話者識別（複数人の場合）

### シナリオ 5: 動画ファイル + 要約

1. 📎 ボタンをクリック
2. 動画ファイルを選択（MP4, MOV, WEBM）
3. メッセージを入力: 「この動画の内容を要約して」
4. 送信

**期待される応答:**
- 動画のシーン要約
- 主要なイベントの時系列説明

---

## トラブルシューティング

### 問題: サンドボックスが起動しない

**解決策:**

```bash
# AWS認証を確認
aws sts get-caller-identity

# Amplify キャッシュをクリア
rm -rf .amplify
npx ampx sandbox
```

### 問題: 「Unauthorized」エラー

**解決策:**
- Cognito ユーザープールの設定を確認
- amplify_outputs.json が最新か確認
- ブラウザをリロード

### 問題: Lambda タイムアウト

**解決策:**
- CloudWatch Logs でエラー詳細を確認
- Bedrock モデルへのアクセス権限を確認

```bash
# Bedrock モデルアクセス確認
aws bedrock list-foundation-models --region us-east-1
```

### 問題: ファイルアップロード失敗

**解決策:**
- S3 バケットの CORS 設定を確認
- ファイルサイズが 10MB 以下か確認
- 対応フォーマットか確認

---

## サンドボックス削除

テスト完了後、リソースを削除：

```bash
cd amplify
npx ampx sandbox delete
```

**注意:** すべてのデータ（ユーザー、アップロードファイル）が削除されます。

---

## 本番デプロイ

サンドボックステストが成功したら、本番環境にデプロイ：

```bash
# GitHub にプッシュ → Amplify Hosting で自動デプロイ
git push origin main

# または手動デプロイ
npx ampx pipeline-deploy --branch main --app-id YOUR_APP_ID
```

---

## テスト結果記録

| テストID | シナリオ | 入力 | 期待結果 | 実際の結果 | 合否 |
|---------|---------|------|---------|-----------|------|
| E2E-01 | サインアップ | メール/パスワード | ユーザー作成 | | |
| E2E-02 | サインイン | 認証情報 | ダッシュボード表示 | | |
| E2E-03 | テキストチャット | 挨拶テキスト | AI応答 | | |
| E2E-04 | 画像解析 | サンプル画像 | 画像説明 | | |
| E2E-05 | 音声文字起こし | 音声ファイル | テキスト出力 | | |
| E2E-06 | 動画要約 | 動画ファイル | シーン要約 | | |
| E2E-07 | サインアウト | ボタンクリック | 認証画面に戻る | | |

