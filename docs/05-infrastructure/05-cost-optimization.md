# コスト最適化設計書

## 1. コスト構造

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         COST BREAKDOWN                                       │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ MAJOR COST CATEGORIES                                                │    │
│  │                                                                      │    │
│  │  ┌──────────────────────────────────────────────────────────────┐  │    │
│  │  │ 1. Bedrock (40-50%)                                          │  │    │
│  │  │    • Nova Sonic: 音声認識                                     │  │    │
│  │  │    • Nova Omni: 映像解析                                      │  │    │
│  │  │    • Nova Embeddings: ベクトル化                              │  │    │
│  │  │    • Claude: Agent オーケストレーション                       │  │    │
│  │  └──────────────────────────────────────────────────────────────┘  │    │
│  │                                                                      │    │
│  │  ┌──────────────────────────────────────────────────────────────┐  │    │
│  │  │ 2. Compute (20-25%)                                          │  │    │
│  │  │    • ECS Fargate: サービス実行                                │  │    │
│  │  │    • Lambda: イベント処理                                     │  │    │
│  │  └──────────────────────────────────────────────────────────────┘  │    │
│  │                                                                      │    │
│  │  ┌──────────────────────────────────────────────────────────────┐  │    │
│  │  │ 3. Storage (15-20%)                                          │  │    │
│  │  │    • S3: コンテンツ保存                                       │  │    │
│  │  │    • DynamoDB: Event Store / Read Model                      │  │    │
│  │  │    • OpenSearch Serverless: ベクトル検索                      │  │    │
│  │  └──────────────────────────────────────────────────────────────┘  │    │
│  │                                                                      │    │
│  │  ┌──────────────────────────────────────────────────────────────┐  │    │
│  │  │ 4. Network & Other (10-15%)                                  │  │    │
│  │  │    • NAT Gateway                                              │  │    │
│  │  │    • CloudFront                                               │  │    │
│  │  │    • API Gateway                                              │  │    │
│  │  └──────────────────────────────────────────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 2. Bedrock コスト最適化

### 2.1 キャッシング戦略

```python
# src/infrastructure/caching/bedrock_cache.py
import hashlib
import json
from typing import Optional
import redis.asyncio as redis

class BedrockResponseCache:
    """Bedrock レスポンスキャッシュ"""
    
    def __init__(self, redis_client: redis.Redis, ttl_seconds: int = 3600):
        self.redis = redis_client
        self.ttl = ttl_seconds
    
    def _generate_key(self, model_id: str, input_data: dict) -> str:
        """キャッシュキーを生成"""
        content = f"{model_id}:{json.dumps(input_data, sort_keys=True)}"
        return f"bedrock:cache:{hashlib.sha256(content.encode()).hexdigest()}"
    
    async def get(self, model_id: str, input_data: dict) -> Optional[dict]:
        """キャッシュから取得"""
        key = self._generate_key(model_id, input_data)
        cached = await self.redis.get(key)
        if cached:
            return json.loads(cached)
        return None
    
    async def set(self, model_id: str, input_data: dict, response: dict):
        """キャッシュに保存"""
        key = self._generate_key(model_id, input_data)
        await self.redis.setex(key, self.ttl, json.dumps(response))


class CachedBedrockGateway:
    """キャッシュ付き Bedrock Gateway"""
    
    def __init__(self, bedrock_client, cache: BedrockResponseCache):
        self.bedrock = bedrock_client
        self.cache = cache
    
    async def invoke_model(self, model_id: str, body: dict) -> dict:
        # キャッシュチェック
        cached = await self.cache.get(model_id, body)
        if cached:
            logger.info("bedrock_cache_hit", model_id=model_id)
            return cached
        
        # Bedrock 呼び出し
        response = await self.bedrock.invoke_model(
            modelId=model_id,
            body=json.dumps(body)
        )
        
        result = json.loads(response["body"].read())
        
        # キャッシュ保存
        await self.cache.set(model_id, body, result)
        
        return result
```

### 2.2 バッチ処理

```python
# src/infrastructure/batch/bedrock_batch.py
import asyncio
from typing import List
from dataclasses import dataclass

@dataclass
class BatchRequest:
    request_id: str
    model_id: str
    body: dict

@dataclass
class BatchResult:
    request_id: str
    response: dict
    error: Optional[str] = None

class BedrockBatchProcessor:
    """バッチ処理でコスト削減"""
    
    def __init__(
        self,
        bedrock_client,
        batch_size: int = 10,
        max_wait_seconds: float = 1.0
    ):
        self.bedrock = bedrock_client
        self.batch_size = batch_size
        self.max_wait = max_wait_seconds
        self._queue: asyncio.Queue = asyncio.Queue()
        self._results: dict = {}
    
    async def submit(self, request: BatchRequest) -> BatchResult:
        """リクエストをキューに追加"""
        future = asyncio.Future()
        await self._queue.put((request, future))
        return await future
    
    async def process_batch(self):
        """バッチを処理"""
        batch: List[tuple] = []
        
        # バッチサイズまで収集、または待機時間超過
        try:
            while len(batch) < self.batch_size:
                item = await asyncio.wait_for(
                    self._queue.get(),
                    timeout=self.max_wait
                )
                batch.append(item)
        except asyncio.TimeoutError:
            pass
        
        if not batch:
            return
        
        # バッチ処理
        for request, future in batch:
            try:
                response = await self.bedrock.invoke_model(
                    modelId=request.model_id,
                    body=json.dumps(request.body)
                )
                result = BatchResult(
                    request_id=request.request_id,
                    response=json.loads(response["body"].read())
                )
            except Exception as e:
                result = BatchResult(
                    request_id=request.request_id,
                    response={},
                    error=str(e)
                )
            
            future.set_result(result)
```

## 3. Compute コスト最適化

### 3.1 Auto Scaling 設定

```typescript
// infra/lib/constructs/auto-scaling.ts
import * as appautoscaling from 'aws-cdk-lib/aws-applicationautoscaling';

export class OptimizedAutoScaling extends Construct {
  constructor(scope: Construct, id: string, props: AutoScalingProps) {
    super(scope, id);

    const scaling = props.service.autoScaleTaskCount({
      minCapacity: 2,
      maxCapacity: 50,
    });

    // CPU ベース（メイン）
    scaling.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 70,
      scaleInCooldown: cdk.Duration.minutes(5),
      scaleOutCooldown: cdk.Duration.minutes(1),
    });

    // メモリベース
    scaling.scaleOnMemoryUtilization('MemoryScaling', {
      targetUtilizationPercent: 75,
      scaleInCooldown: cdk.Duration.minutes(5),
      scaleOutCooldown: cdk.Duration.minutes(1),
    });

    // スケジュールベース（ピーク時間に事前スケール）
    scaling.scaleOnSchedule('ScaleUpMorning', {
      schedule: appautoscaling.Schedule.cron({ hour: '8', minute: '30' }),
      minCapacity: 5,
    });

    scaling.scaleOnSchedule('ScaleDownNight', {
      schedule: appautoscaling.Schedule.cron({ hour: '22', minute: '0' }),
      minCapacity: 2,
    });
  }
}
```

### 3.2 Fargate Spot

```typescript
// infra/lib/constructs/fargate-spot.ts
import * as ecs from 'aws-cdk-lib/aws-ecs';

export class CostOptimizedFargateService extends Construct {
  constructor(scope: Construct, id: string, props: ServiceProps) {
    super(scope, id);

    const service = new ecs.FargateService(this, 'Service', {
      cluster: props.cluster,
      taskDefinition: props.taskDefinition,
      capacityProviderStrategies: [
        {
          // 80% を Spot で実行
          capacityProvider: 'FARGATE_SPOT',
          weight: 4,
          base: 0,
        },
        {
          // 20% を On-Demand で安定性確保
          capacityProvider: 'FARGATE',
          weight: 1,
          base: 2, // 最低2タスクは On-Demand
        },
      ],
    });

    // Spot 中断対策
    service.taskDefinition.addContainer('app', {
      // グレースフルシャットダウン
      stopTimeout: cdk.Duration.seconds(120),
    });
  }
}
```

## 4. Storage コスト最適化

### 4.1 S3 ライフサイクル

```typescript
// infra/lib/constructs/s3-lifecycle.ts
import * as s3 from 'aws-cdk-lib/aws-s3';

export class OptimizedS3Bucket extends Construct {
  public readonly bucket: s3.Bucket;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.bucket = new s3.Bucket(this, 'ContentBucket', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      intelligentTieringConfigurations: [
        {
          name: 'auto-tier',
          archiveAccessTierTime: cdk.Duration.days(90),
          deepArchiveAccessTierTime: cdk.Duration.days(180),
        },
      ],
      lifecycleRules: [
        // 処理済み音声ファイル
        {
          id: 'ProcessedAudioTierDown',
          prefix: 'audio/processed/',
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(30),
            },
            {
              storageClass: s3.StorageClass.GLACIER,
              transitionAfter: cdk.Duration.days(90),
            },
          ],
        },
        // 一時ファイル削除
        {
          id: 'DeleteTempFiles',
          prefix: 'temp/',
          expiration: cdk.Duration.days(1),
        },
        // 不完全なマルチパートアップロード
        {
          id: 'AbortIncompleteMultipartUpload',
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(7),
        },
      ],
    });
  }
}
```

### 4.2 DynamoDB On-Demand

```typescript
// infra/lib/constructs/dynamodb-optimized.ts
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

export class OptimizedDynamoDB extends Construct {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    // On-Demand モード（予測不能なワークロード向け）
    const eventStore = new dynamodb.Table(this, 'EventStore', {
      tableName: 'nova-event-store',
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      // TTL で古いデータを自動削除
      timeToLiveAttribute: 'ttl',
    });

    // Read Model は Provisioned（予測可能）
    const readModel = new dynamodb.Table(this, 'ReadModel', {
      tableName: 'nova-read-model',
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PROVISIONED,
      readCapacity: 10,
      writeCapacity: 10,
    });

    // Auto Scaling
    readModel.autoScaleReadCapacity({
      minCapacity: 5,
      maxCapacity: 100,
    }).scaleOnUtilization({
      targetUtilizationPercent: 70,
    });
  }
}
```

## 5. コスト監視

```typescript
// infra/lib/constructs/cost-monitoring.ts
import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';

export class CostMonitoring extends Construct {
  constructor(scope: Construct, id: string, props: CostMonitoringProps) {
    super(scope, id);

    // 月次予算
    new budgets.CfnBudget(this, 'MonthlyBudget', {
      budget: {
        budgetName: 'nova-monthly-budget',
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
        budgetLimit: {
          amount: 10000,
          unit: 'USD',
        },
      },
      notificationsWithSubscribers: [
        {
          notification: {
            notificationType: 'ACTUAL',
            comparisonOperator: 'GREATER_THAN',
            threshold: 80,
            thresholdType: 'PERCENTAGE',
          },
          subscribers: [
            {
              subscriptionType: 'EMAIL',
              address: props.alertEmail,
            },
          ],
        },
        {
          notification: {
            notificationType: 'FORECASTED',
            comparisonOperator: 'GREATER_THAN',
            threshold: 100,
            thresholdType: 'PERCENTAGE',
          },
          subscribers: [
            {
              subscriptionType: 'EMAIL',
              address: props.alertEmail,
            },
          ],
        },
      ],
    });

    // サービス別コストダッシュボード
    const costDashboard = new cloudwatch.Dashboard(this, 'CostDashboard', {
      dashboardName: 'Nova-Cost-Analysis',
    });

    costDashboard.addWidgets(
      new cloudwatch.SingleValueWidget({
        title: 'Bedrock Cost (MTD)',
        metrics: [
          new cloudwatch.Metric({
            namespace: 'AWS/Billing',
            metricName: 'EstimatedCharges',
            dimensionsMap: { ServiceName: 'Amazon Bedrock' },
            statistic: 'Maximum',
          }),
        ],
        width: 6,
      }),
      new cloudwatch.SingleValueWidget({
        title: 'ECS Cost (MTD)',
        metrics: [
          new cloudwatch.Metric({
            namespace: 'AWS/Billing',
            metricName: 'EstimatedCharges',
            dimensionsMap: { ServiceName: 'Amazon ECS' },
            statistic: 'Maximum',
          }),
        ],
        width: 6,
      })
    );
  }
}
```

## 6. コスト最適化チェックリスト

| カテゴリ | 最適化策 | 想定削減率 |
|---------|---------|-----------|
| **Bedrock** | レスポンスキャッシング | 20-30% |
| | バッチ処理 | 10-15% |
| | モデル選択最適化 | 10-20% |
| **Compute** | Fargate Spot 活用 | 50-70% |
| | 適切な Auto Scaling | 20-30% |
| | Right-sizing | 10-20% |
| **Storage** | S3 Intelligent-Tiering | 20-40% |
| | DynamoDB TTL | 10-20% |
| | 不要データ削除 | 10-15% |
| **Network** | VPC Endpoint 活用 | 5-10% |
| | CloudFront キャッシュ | 10-20% |

