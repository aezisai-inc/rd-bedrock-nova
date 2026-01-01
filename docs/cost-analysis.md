# コスト分析レポート

## 概要

rd-bedrock-nova サーバレスアーキテクチャのコスト分析と ECS 構成との比較。

## 料金体系 (us-east-1, 2025年時点)

### Lambda

| 項目 | 料金 | 備考 |
|------|------|------|
| リクエスト | $0.20 / 100万回 | 最初100万回/月無料 |
| 実行時間 | $0.0000166667 / GB-秒 | 最初40万GB-秒/月無料 |

### DynamoDB (On-Demand)

| 項目 | 料金 | 備考 |
|------|------|------|
| 書き込み | $1.25 / 100万WRU | Write Request Unit |
| 読み取り | $0.25 / 100万RRU | Read Request Unit |
| ストレージ | $0.25 / GB-月 | |

### S3 Vectors (Preview)

| 項目 | 料金 | 備考 |
|------|------|------|
| ストレージ | $0.024 / 100万ベクトル-月 | 推定値 |
| クエリ | $0.10 / 100万クエリ | 推定値 |
| 書き込み | $0.25 / 100万書き込み | 推定値 |

### Bedrock

| モデル | 料金 | 単位 |
|--------|------|------|
| Nova Embeddings | $0.00002 | /1Kトークン |
| Nova Sonic | $0.006 | /分 |
| Nova Omni | $0.012 | /分 |

### API Gateway (HTTP API)

| 項目 | 料金 | 備考 |
|------|------|------|
| リクエスト | $1.00 / 100万回 | 最初100万回/月無料 |

---

## ワークロード別コスト見積もり

### 小規模 (開発/テスト)

```
想定:
- Lambda: 5万回/月, 256MB, 200ms
- DynamoDB: 1万W + 5万R/月, 0.5GB
- S3 Vectors: 10万ベクトル, 1万クエリ/月
- Bedrock: 100万トークン, 100分音声, 10分映像
- API Gateway: 5万回/月
```

| サービス | 月額コスト |
|---------|-----------|
| Lambda | $0.00 (無料枠内) |
| DynamoDB | $0.15 |
| S3 Vectors | $0.01 |
| Bedrock | $2.72 |
| API Gateway | $0.00 (無料枠内) |
| **合計** | **~$3/月** |

### 中規模 (本番)

```
想定:
- Lambda: 50万回/月, 512MB, 300ms
- DynamoDB: 10万W + 50万R/月, 5GB
- S3 Vectors: 100万ベクトル, 10万クエリ/月
- Bedrock: 1000万トークン, 1000分音声, 100分映像
- API Gateway: 50万回/月
```

| サービス | 月額コスト |
|---------|-----------|
| Lambda | $1.20 |
| DynamoDB | $1.50 |
| S3 Vectors | $0.05 |
| Bedrock | $27.20 |
| API Gateway | $0.00 (無料枠内) |
| **合計** | **~$30/月** |

### 大規模 (エンタープライズ)

```
想定:
- Lambda: 500万回/月, 1024MB, 500ms
- DynamoDB: 100万W + 500万R/月, 50GB
- S3 Vectors: 1000万ベクトル, 100万クエリ/月
- Bedrock: 1億トークン, 10000分音声, 1000分映像
- API Gateway: 500万回/月
```

| サービス | 月額コスト |
|---------|-----------|
| Lambda | $35.00 |
| DynamoDB | $15.00 |
| S3 Vectors | $0.50 |
| Bedrock | $272.00 |
| API Gateway | $4.00 |
| **合計** | **~$330/月** |

---

## ECS構成との比較

### 同等性能のECS構成 (参考)

| 項目 | 月額コスト | 備考 |
|------|-----------|------|
| Fargate (0.5vCPU, 1GB) | $73 | 24時間稼働 |
| ALB | $22 | 基本料金 |
| NAT Gateway | $32 | 1AZ |
| ElastiCache (t3.micro) | $12 | Redis互換 |
| **合計** | **~$139/月** |

### 比較表

| ワークロード | サーバレス | ECS | 削減率 |
|-------------|-----------|-----|--------|
| 小規模 | ~$3 | ~$139 | 98% |
| 中規模 | ~$30 | ~$139 | 78% |
| 大規模 | ~$330 | ~$500* | 34% |

*大規模ECSは複数タスク・AZ冗長化含む

### サーバレスが有利なケース

1. **リクエスト変動が大きい**
   - ピーク時のみスケール
   - 夜間・休日はほぼゼロコスト

2. **開発/テスト環境**
   - 無料枠で運用可能
   - 環境ごとの固定費なし

3. **スパイクトラフィック**
   - 自動スケーリング
   - プロビジョニング不要

### ECSが有利なケース

1. **常時高負荷**
   - 予測可能な負荷
   - Savings Plans適用可能

2. **低レイテンシ要件**
   - コールドスタート回避
   - 常時起動

3. **複雑なステートフル処理**
   - 長時間実行ジョブ
   - 大容量メモリ要件

---

## コスト最適化のポイント

### 1. Bedrock コスト削減

```python
# バッチ処理でトークン効率化
embeddings = await gateway.generate_batch_embeddings(texts[:32])

# キャッシング (24時間TTL)
cached = await dynamodb.get_item(Key={"pk": f"EMBEDDING#{text_hash}"})
if cached:
    return cached["embedding"]
```

### 2. Lambda コスト削減

```yaml
# メモリ最適化 (AWS Lambda Power Tuning)
# https://github.com/alexcasalboni/aws-lambda-power-tuning

# Arm64 で 20% コスト削減
Architecture: arm64

# SnapStart (Java のみ)
SnapStart:
  ApplyOn: PublishedVersions
```

### 3. DynamoDB コスト削減

```yaml
# TTL でストレージ削減
TimeToLiveSpecification:
  AttributeName: ttl
  Enabled: true

# 適切なキー設計でRCU/WCU削減
# 1回のクエリで必要なデータを取得
```

### 4. S3 Vectors コスト削減

```python
# 次元数削減 (1024 → 256)
# 精度とのトレードオフを検証
embedding = await gateway.generate_text_embedding(
    text=text,
    output_dimension=EmbeddingDimension.DIM_256,
)
```

---

## 計算ツール

```bash
# コスト見積もり実行
python -m src.benchmarks.cost_calculator
```

---

## 参考リンク

- [AWS Lambda Pricing](https://aws.amazon.com/lambda/pricing/)
- [Amazon DynamoDB Pricing](https://aws.amazon.com/dynamodb/pricing/)
- [Amazon Bedrock Pricing](https://aws.amazon.com/bedrock/pricing/)
- [AWS Pricing Calculator](https://calculator.aws/)




