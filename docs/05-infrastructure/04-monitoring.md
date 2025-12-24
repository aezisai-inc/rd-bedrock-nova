# 監視・運用設計書

## 1. 監視アーキテクチャ

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MONITORING ARCHITECTURE                              │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                        OBSERVABILITY                                 │    │
│  │                                                                      │    │
│  │   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐    │    │
│  │   │     Metrics     │  │      Logs       │  │     Traces      │    │    │
│  │   │                 │  │                 │  │                 │    │    │
│  │   │ • CloudWatch    │  │ • CloudWatch    │  │ • X-Ray         │    │    │
│  │   │ • EMF           │  │   Logs          │  │                 │    │    │
│  │   │ • Custom        │  │ • Structured    │  │ • Service Map   │    │    │
│  │   └────────┬────────┘  └────────┬────────┘  └────────┬────────┘    │    │
│  │            │                    │                    │             │    │
│  │            └────────────────────┼────────────────────┘             │    │
│  │                                 │                                  │    │
│  │                                 ▼                                  │    │
│  │            ┌─────────────────────────────────────────┐            │    │
│  │            │           CloudWatch Dashboard           │            │    │
│  │            │                                          │            │    │
│  │            │  ┌────────┐ ┌────────┐ ┌────────┐      │            │    │
│  │            │  │Overview│ │Services│ │ Agent  │      │            │    │
│  │            │  └────────┘ └────────┘ └────────┘      │            │    │
│  │            └─────────────────────────────────────────┘            │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                        ALERTING                                      │    │
│  │                                                                      │    │
│  │   ┌─────────────────┐       ┌─────────────────┐                    │    │
│  │   │ CloudWatch      │──────▶│      SNS        │                    │    │
│  │   │ Alarms          │       │                 │                    │    │
│  │   │                 │       │ • Email         │                    │    │
│  │   │ • Error Rate    │       │ • Slack         │                    │    │
│  │   │ • Latency       │       │ • PagerDuty     │                    │    │
│  │   │ • Availability  │       └─────────────────┘                    │    │
│  │   └─────────────────┘                                              │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 2. メトリクス定義

### 2.1 サービスメトリクス

```python
# src/infrastructure/metrics/emf_logger.py
import json
from datetime import datetime
from contextlib import contextmanager
from typing import Dict, Any
import time

class EMFLogger:
    """Embedded Metric Format Logger for CloudWatch"""
    
    def __init__(self, namespace: str, service: str):
        self.namespace = namespace
        self.service = service
        self._dimensions = {"Service": service}
    
    def put_metric(
        self,
        metric_name: str,
        value: float,
        unit: str = "None",
        dimensions: Dict[str, str] = None
    ):
        """メトリクスを出力"""
        dims = {**self._dimensions, **(dimensions or {})}
        
        emf_payload = {
            "_aws": {
                "Timestamp": int(datetime.utcnow().timestamp() * 1000),
                "CloudWatchMetrics": [
                    {
                        "Namespace": self.namespace,
                        "Dimensions": [list(dims.keys())],
                        "Metrics": [
                            {"Name": metric_name, "Unit": unit}
                        ]
                    }
                ]
            },
            metric_name: value,
            **dims
        }
        
        print(json.dumps(emf_payload))
    
    @contextmanager
    def measure_duration(self, operation: str):
        """処理時間を計測"""
        start = time.perf_counter()
        success = True
        try:
            yield
        except Exception:
            success = False
            raise
        finally:
            duration = (time.perf_counter() - start) * 1000
            self.put_metric(
                f"{operation}Duration",
                duration,
                unit="Milliseconds",
                dimensions={"Operation": operation, "Success": str(success)}
            )


# 使用例
logger = EMFLogger("Nova", "AudioService")

async def transcribe_audio(audio_id: str):
    with logger.measure_duration("Transcription"):
        result = await bedrock.invoke_model(...)
    
    logger.put_metric(
        "TranscriptionConfidence",
        result.confidence,
        dimensions={"Language": result.language}
    )
```

### 2.2 カスタムメトリクス

```typescript
// infra/lib/constructs/custom-metrics.ts
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';

export class CustomMetrics {
  static readonly namespace = 'Nova';
  
  // Audio Service Metrics
  static transcriptionDuration(service: ecs.FargateService) {
    return new cloudwatch.Metric({
      namespace: this.namespace,
      metricName: 'TranscriptionDuration',
      dimensionsMap: { Service: 'AudioService' },
      statistic: 'p99',
      period: cdk.Duration.minutes(1),
    });
  }
  
  static transcriptionConfidence() {
    return new cloudwatch.Metric({
      namespace: this.namespace,
      metricName: 'TranscriptionConfidence',
      dimensionsMap: { Service: 'AudioService' },
      statistic: 'Average',
      period: cdk.Duration.minutes(5),
    });
  }
  
  // Agent Service Metrics
  static agentResponseTime() {
    return new cloudwatch.Metric({
      namespace: this.namespace,
      metricName: 'AgentResponseTime',
      dimensionsMap: { Service: 'AgentService' },
      statistic: 'p99',
      period: cdk.Duration.minutes(1),
    });
  }
  
  static toolExecutionCount() {
    return new cloudwatch.Metric({
      namespace: this.namespace,
      metricName: 'ToolExecutionCount',
      dimensionsMap: { Service: 'AgentService' },
      statistic: 'Sum',
      period: cdk.Duration.minutes(5),
    });
  }
  
  // Bedrock Metrics
  static bedrockTokensConsumed() {
    return new cloudwatch.Metric({
      namespace: this.namespace,
      metricName: 'BedrockTokensConsumed',
      statistic: 'Sum',
      period: cdk.Duration.hours(1),
    });
  }
}
```

## 3. ダッシュボード

```typescript
// infra/lib/constructs/dashboard.ts
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';

export class NovaDashboard extends Construct {
  constructor(scope: Construct, id: string, props: DashboardProps) {
    super(scope, id);

    const dashboard = new cloudwatch.Dashboard(this, 'NovaDashboard', {
      dashboardName: 'Nova-Platform',
    });

    // Overview Row
    dashboard.addWidgets(
      new cloudwatch.TextWidget({
        markdown: '# Nova Platform - Overview',
        width: 24,
        height: 1,
      })
    );

    // Key Metrics Row
    dashboard.addWidgets(
      new cloudwatch.SingleValueWidget({
        title: 'Total Requests (1h)',
        metrics: [props.apiGateway.metricCount()],
        width: 6,
      }),
      new cloudwatch.SingleValueWidget({
        title: 'Error Rate',
        metrics: [props.apiGateway.metric5XXError()],
        width: 6,
      }),
      new cloudwatch.SingleValueWidget({
        title: 'P99 Latency',
        metrics: [props.apiGateway.metricLatency({ statistic: 'p99' })],
        width: 6,
      }),
      new cloudwatch.SingleValueWidget({
        title: 'Active Sessions',
        metrics: [CustomMetrics.activeSessions()],
        width: 6,
      })
    );

    // Service Health Row
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Service CPU Utilization',
        left: [
          props.audioService.metricCpuUtilization(),
          props.videoService.metricCpuUtilization(),
          props.agentService.metricCpuUtilization(),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'Service Memory Utilization',
        left: [
          props.audioService.metricMemoryUtilization(),
          props.videoService.metricMemoryUtilization(),
          props.agentService.metricMemoryUtilization(),
        ],
        width: 12,
      })
    );

    // AI Processing Row
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Transcription Performance',
        left: [CustomMetrics.transcriptionDuration()],
        right: [CustomMetrics.transcriptionConfidence()],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'Agent Response Time',
        left: [CustomMetrics.agentResponseTime()],
        right: [CustomMetrics.toolExecutionCount()],
        width: 12,
      })
    );

    // Bedrock Usage Row
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Bedrock Token Usage',
        left: [CustomMetrics.bedrockTokensConsumed()],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'Bedrock Invocation Latency',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/Bedrock',
            metricName: 'InvocationLatency',
            dimensionsMap: { ModelId: 'amazon.nova-sonic-v1' },
            statistic: 'p99',
          }),
        ],
        width: 12,
      })
    );
  }
}
```

## 4. アラート設定

```typescript
// infra/lib/constructs/alerts.ts
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';

export class AlertsConstruct extends Construct {
  constructor(scope: Construct, id: string, props: AlertsProps) {
    super(scope, id);

    // Alert Topic
    const alertTopic = new sns.Topic(this, 'AlertTopic', {
      topicName: 'nova-alerts',
    });

    // P1: Critical Alerts (5分以内対応)
    const p1Alarm = new cloudwatch.Alarm(this, 'P1ServiceDown', {
      alarmName: 'Nova-P1-ServiceDown',
      metric: props.alb.metricHealthyHostCount({
        period: cdk.Duration.minutes(1),
      }),
      threshold: 1,
      evaluationPeriods: 2,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING,
    });
    p1Alarm.addAlarmAction(new actions.SnsAction(alertTopic));

    // P2: High Priority (30分以内対応)
    const p2ErrorRate = new cloudwatch.Alarm(this, 'P2HighErrorRate', {
      alarmName: 'Nova-P2-HighErrorRate',
      metric: new cloudwatch.MathExpression({
        expression: 'errors / requests * 100',
        usingMetrics: {
          errors: props.apiGateway.metric5XXError(),
          requests: props.apiGateway.metricCount(),
        },
        period: cdk.Duration.minutes(5),
      }),
      threshold: 5, // 5%
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });
    p2ErrorRate.addAlarmAction(new actions.SnsAction(alertTopic));

    // P2: High Latency
    const p2Latency = new cloudwatch.Alarm(this, 'P2HighLatency', {
      alarmName: 'Nova-P2-HighLatency',
      metric: props.apiGateway.metricLatency({ statistic: 'p99' }),
      threshold: 5000, // 5秒
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });
    p2Latency.addAlarmAction(new actions.SnsAction(alertTopic));

    // P3: Warning (営業時間内対応)
    const p3CpuHigh = new cloudwatch.Alarm(this, 'P3HighCPU', {
      alarmName: 'Nova-P3-HighCPU',
      metric: props.audioService.metricCpuUtilization(),
      threshold: 80,
      evaluationPeriods: 5,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });

    // Anomaly Detection
    const anomalyAlarm = new cloudwatch.Alarm(this, 'RequestAnomalyAlarm', {
      alarmName: 'Nova-RequestAnomaly',
      metric: props.apiGateway.metricCount(),
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_LOWER_OR_GREATER_THAN_UPPER_THRESHOLD,
      threshold: 2, // Standard deviations
      evaluationPeriods: 3,
    });
  }
}
```

## 5. SLI/SLO 定義

```yaml
# SLI/SLO 定義
service_level_objectives:
  availability:
    description: "サービス可用性"
    target: 99.9%
    measurement_window: 30_days
    sli:
      good_events: "successful_requests"
      total_events: "total_requests"
    alerts:
      - threshold: 99.5%
        severity: P2
      - threshold: 99.0%
        severity: P1

  latency:
    description: "API レスポンス時間"
    target: 95%_requests_under_3s
    measurement_window: 30_days
    sli:
      good_events: "requests_under_3s"
      total_events: "total_requests"
    alerts:
      - threshold: 90%
        severity: P2
      - threshold: 85%
        severity: P1

  transcription_accuracy:
    description: "文字起こし精度"
    target: 90%_confidence_above_0.85
    measurement_window: 7_days
    sli:
      good_events: "transcriptions_with_confidence_gt_0.85"
      total_events: "total_transcriptions"

  agent_response_quality:
    description: "Agent 応答品質"
    target: 95%_without_guardrail_intervention
    measurement_window: 7_days
    sli:
      good_events: "responses_without_intervention"
      total_events: "total_responses"
```

## 6. 構造化ログ

```python
# src/infrastructure/logging/structured_logger.py
import structlog
import json
from typing import Any
from contextvars import ContextVar

# Request context
request_id_var: ContextVar[str] = ContextVar('request_id', default='')
user_id_var: ContextVar[str] = ContextVar('user_id', default='')

def configure_logging():
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            add_aws_context,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
        logger_factory=structlog.PrintLoggerFactory(),
    )

def add_aws_context(_, __, event_dict: dict) -> dict:
    """AWS コンテキストを追加"""
    event_dict["request_id"] = request_id_var.get()
    event_dict["user_id"] = user_id_var.get()
    event_dict["service"] = "nova-audio-service"
    event_dict["environment"] = os.getenv("NOVA_ENVIRONMENT", "dev")
    return event_dict

# 使用例
logger = structlog.get_logger()

@app.middleware("http")
async def logging_middleware(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID", str(uuid4()))
    request_id_var.set(request_id)
    
    logger.info(
        "request_started",
        method=request.method,
        path=request.url.path,
    )
    
    response = await call_next(request)
    
    logger.info(
        "request_completed",
        status_code=response.status_code,
    )
    
    return response
```

