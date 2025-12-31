# パフォーマンスベースライン

## 概要

rd-bedrock-nova のサーバレス構成におけるパフォーマンス特性。

## 計測環境

- **Region**: us-east-1
- **Lambda Runtime**: Python 3.12
- **Lambda Memory**: 256MB - 512MB
- **計測ツール**: `src/benchmarks/run_benchmarks.py`

## ベースライン値

### 1. Lambda コールドスタート

| サービス | メモリ | コールドスタート | ウォームスタート |
|---------|--------|------------------|------------------|
| Agent Core | 512MB | ~2,000ms | ~100ms |
| Audio (Nova Sonic) | 256MB | ~1,500ms | ~50ms |
| Video (Nova Omni) | 512MB | ~1,800ms | ~80ms |
| Search (Embeddings) | 256MB | ~1,200ms | ~40ms |

### 2. Bedrock API レイテンシ

| サービス | 操作 | P50 | P95 | P99 |
|---------|------|-----|-----|-----|
| Nova Embeddings | Text (1024dim) | ~200ms | ~350ms | ~500ms |
| Nova Embeddings | Image (1024dim) | ~400ms | ~600ms | ~800ms |
| Nova Embeddings | Multimodal | ~500ms | ~700ms | ~900ms |
| Nova Sonic | Transcribe (30s) | ~3,000ms | ~5,000ms | ~7,000ms |
| Nova Omni | Analyze (5s video) | ~5,000ms | ~8,000ms | ~12,000ms |

### 3. S3 Vectors レイテンシ

| 操作 | ベクトル数 | Top-K | P50 | P95 |
|------|-----------|-------|-----|-----|
| Query | 1M | 10 | ~50ms | ~100ms |
| Query | 10M | 10 | ~80ms | ~150ms |
| Query | 100M | 10 | ~120ms | ~200ms |
| Put (batch 100) | - | - | ~200ms | ~400ms |

### 4. DynamoDB レイテンシ

| 操作 | P50 | P95 | P99 |
|------|-----|-----|-----|
| GetItem | ~5ms | ~10ms | ~20ms |
| PutItem | ~8ms | ~15ms | ~30ms |
| Query (10 items) | ~10ms | ~20ms | ~40ms |

## スループット

| サービス | 同時実行数 | RPS | 備考 |
|---------|-----------|-----|------|
| Lambda (512MB) | 100 | ~200 | Bedrock API 制限あり |
| DynamoDB | - | ~10,000 | On-Demand 設定 |
| S3 Vectors | - | ~1,000 | Index サイズ依存 |

## コスト最適化のポイント

### コールドスタート削減

```yaml
# Provisioned Concurrency を使用しない場合の対策
strategies:
  - Lambda SnapStart (Java のみ)
  - 定期的なウォームアップ (EventBridge)
  - Container Image の最適化
```

### バッチ処理

```python
# 個別リクエストよりバッチが効率的
# Bad: 100回の個別 embedding 呼び出し
# Good: 1回のバッチ呼び出し (最大32件)
embeddings = await gateway.generate_batch_embeddings(texts[:32])
```

### キャッシング

```yaml
# 頻繁なクエリ結果をキャッシュ
cache_targets:
  - Embedding vectors (DynamoDB TTL: 24h)
  - Search results (DynamoDB TTL: 1h)
  - Metadata (DynamoDB TTL: 12h)
```

## ベンチマーク実行方法

```bash
# 全ベンチマーク実行
python -m src.benchmarks.run_benchmarks --iterations 20

# 特定リージョン
python -m src.benchmarks.run_benchmarks --region us-west-2

# 結果保存先指定
python -m src.benchmarks.run_benchmarks --output-dir ./results
```

## 監視メトリクス

CloudWatch で監視すべきメトリクス:

| メトリクス | アラーム閾値 | 対応 |
|-----------|-------------|------|
| Lambda Duration | P95 > 10s | メモリ増加検討 |
| Lambda Errors | > 1% | ログ調査 |
| Lambda ConcurrentExecutions | > 80% of limit | 制限引き上げ申請 |
| DynamoDB ConsumedReadCapacityUnits | > 80% | On-Demand確認 |
| Bedrock InvocationLatency | P95 > 5s | リトライ実装確認 |

## 改善履歴

| 日付 | 変更 | 効果 |
|------|------|------|
| 2025-12-26 | 初期ベースライン作成 | - |



