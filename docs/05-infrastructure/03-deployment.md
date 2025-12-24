# デプロイメント設計書

## 1. CI/CD パイプライン

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CI/CD PIPELINE                                       │
│                                                                              │
│  ┌────────┐    ┌────────┐    ┌────────┐    ┌────────┐    ┌────────┐       │
│  │  Push  │───▶│  Test  │───▶│ Build  │───▶│ Deploy │───▶│Verify  │       │
│  │        │    │        │    │        │    │        │    │        │       │
│  └────────┘    └────────┘    └────────┘    └────────┘    └────────┘       │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ STAGES                                                               │    │
│  │                                                                      │    │
│  │ ┌──────────────────┐                                                │    │
│  │ │ 1. Source        │ • GitHub Push / PR                             │    │
│  │ │                  │ • Branch: main, develop, feature/*             │    │
│  │ └────────┬─────────┘                                                │    │
│  │          │                                                           │    │
│  │          ▼                                                           │    │
│  │ ┌──────────────────┐                                                │    │
│  │ │ 2. Test          │ • Unit Tests (pytest)                          │    │
│  │ │                  │ • Lint (ruff, mypy)                            │    │
│  │ │                  │ • Security Scan (trivy, bandit)                │    │
│  │ └────────┬─────────┘                                                │    │
│  │          │                                                           │    │
│  │          ▼                                                           │    │
│  │ ┌──────────────────┐                                                │    │
│  │ │ 3. Build         │ • Docker Build                                 │    │
│  │ │                  │ • Push to ECR                                  │    │
│  │ │                  │ • CDK Synth                                    │    │
│  │ └────────┬─────────┘                                                │    │
│  │          │                                                           │    │
│  │          ▼                                                           │    │
│  │ ┌──────────────────┐                                                │    │
│  │ │ 4. Deploy Dev    │ • CDK Deploy (dev)                             │    │
│  │ │                  │ • Integration Tests                            │    │
│  │ └────────┬─────────┘                                                │    │
│  │          │                                                           │    │
│  │          ▼ (main branch only)                                        │    │
│  │ ┌──────────────────┐                                                │    │
│  │ │ 5. Deploy Staging│ • CDK Deploy (staging)                         │    │
│  │ │                  │ • E2E Tests                                    │    │
│  │ │                  │ • Manual Approval                              │    │
│  │ └────────┬─────────┘                                                │    │
│  │          │                                                           │    │
│  │          ▼                                                           │    │
│  │ ┌──────────────────┐                                                │    │
│  │ │ 6. Deploy Prod   │ • CDK Deploy (prod)                            │    │
│  │ │                  │ • Canary Deployment                            │    │
│  │ │                  │ • Health Check                                 │    │
│  │ └──────────────────┘                                                │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 2. GitHub Actions Workflow

```yaml
# .github/workflows/deploy.yml
name: Deploy Nova Platform

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  AWS_REGION: us-east-1
  ECR_REGISTRY: ${{ secrets.ECR_REGISTRY }}

jobs:
  # ===== TEST STAGE =====
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.12'
          cache: 'pip'
      
      - name: Install dependencies
        run: |
          pip install -e ".[dev]"
      
      - name: Lint
        run: |
          ruff check .
          mypy src/
      
      - name: Unit Tests
        run: |
          pytest tests/unit -v --cov=src --cov-report=xml
      
      - name: Security Scan
        run: |
          pip install bandit safety
          bandit -r src/
          safety check
      
      - name: Upload Coverage
        uses: codecov/codecov-action@v4
        with:
          files: coverage.xml

  # ===== BUILD STAGE =====
  build:
    needs: test
    runs-on: ubuntu-latest
    outputs:
      image_tag: ${{ steps.meta.outputs.tags }}
    
    strategy:
      matrix:
        service: [audio-service, video-service, agent-service, search-service]
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ env.AWS_REGION }}
      
      - name: Login to ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2
      
      - name: Docker meta
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.ECR_REGISTRY }}/${{ matrix.service }}
          tags: |
            type=sha,prefix=
            type=ref,event=branch
      
      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: services/${{ matrix.service }}
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  # ===== CDK SYNTH =====
  cdk-synth:
    needs: test
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: infra/package-lock.json
      
      - name: Install CDK
        run: |
          cd infra
          npm ci
      
      - name: CDK Synth
        run: |
          cd infra
          npm run cdk synth
      
      - name: Upload CDK Assembly
        uses: actions/upload-artifact@v4
        with:
          name: cdk-out
          path: infra/cdk.out

  # ===== DEPLOY DEV =====
  deploy-dev:
    needs: [build, cdk-synth]
    runs-on: ubuntu-latest
    environment: development
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Download CDK Assembly
        uses: actions/download-artifact@v4
        with:
          name: cdk-out
          path: infra/cdk.out
      
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.DEV_DEPLOY_ROLE }}
          aws-region: ${{ env.AWS_REGION }}
      
      - name: CDK Deploy
        run: |
          cd infra
          npm ci
          npm run cdk deploy -- --all \
            --context environment=dev \
            --context imageTag=${{ github.sha }} \
            --require-approval never

  # ===== INTEGRATION TESTS =====
  integration-test:
    needs: deploy-dev
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Run Integration Tests
        run: |
          pytest tests/integration -v -m integration
        env:
          API_BASE_URL: ${{ secrets.DEV_API_URL }}

  # ===== DEPLOY STAGING =====
  deploy-staging:
    if: github.ref == 'refs/heads/main'
    needs: integration-test
    runs-on: ubuntu-latest
    environment: staging
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.STAGING_DEPLOY_ROLE }}
          aws-region: ${{ env.AWS_REGION }}
      
      - name: CDK Deploy
        run: |
          cd infra
          npm ci
          npm run cdk deploy -- --all \
            --context environment=staging \
            --context imageTag=${{ github.sha }} \
            --require-approval never

  # ===== E2E TESTS =====
  e2e-test:
    needs: deploy-staging
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Install Playwright
        run: npx playwright install --with-deps
      
      - name: Run E2E Tests
        run: npx playwright test
        env:
          BASE_URL: ${{ secrets.STAGING_URL }}

  # ===== DEPLOY PRODUCTION =====
  deploy-prod:
    if: github.ref == 'refs/heads/main'
    needs: e2e-test
    runs-on: ubuntu-latest
    environment: production
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.PROD_DEPLOY_ROLE }}
          aws-region: ${{ env.AWS_REGION }}
      
      - name: CDK Deploy with Canary
        run: |
          cd infra
          npm ci
          npm run cdk deploy -- --all \
            --context environment=prod \
            --context imageTag=${{ github.sha }} \
            --context canaryPercentage=10 \
            --require-approval never
      
      - name: Wait for Canary
        run: sleep 300  # 5分間のカナリア期間
      
      - name: Check Canary Health
        run: |
          # CloudWatch アラームをチェック
          aws cloudwatch describe-alarms \
            --alarm-names nova-canary-errors \
            --query 'MetricAlarms[0].StateValue' \
            --output text | grep -q "OK"
      
      - name: Full Rollout
        run: |
          cd infra
          npm run cdk deploy -- --all \
            --context environment=prod \
            --context imageTag=${{ github.sha }} \
            --context canaryPercentage=100 \
            --require-approval never
```

## 3. Dockerfile

```dockerfile
# services/audio-service/Dockerfile
# ===== BUILD STAGE =====
FROM python:3.12-slim AS builder

WORKDIR /app

# 依存関係インストール
COPY pyproject.toml .
RUN pip install build && python -m build --wheel

# ===== RUNTIME STAGE =====
FROM python:3.12-slim AS runtime

# セキュリティ: 非rootユーザー
RUN groupadd -r nova && useradd -r -g nova nova

WORKDIR /app

# 依存関係のみインストール
COPY --from=builder /app/dist/*.whl .
RUN pip install --no-cache-dir *.whl && rm *.whl

# アプリケーションコード
COPY src/ src/

# 非rootユーザーに切り替え
USER nova

# ヘルスチェック
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

# 環境変数
ENV PORT=8080
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

EXPOSE 8080

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8080"]
```

## 4. CDK パイプライン

```typescript
// infra/lib/pipeline-stack.ts
import * as cdk from 'aws-cdk-lib';
import * as pipelines from 'aws-cdk-lib/pipelines';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';

export class NovaPipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const pipeline = new pipelines.CodePipeline(this, 'NovaPipeline', {
      pipelineName: 'nova-platform',
      synth: new pipelines.ShellStep('Synth', {
        input: pipelines.CodePipelineSource.gitHub('org/nova-platform', 'main', {
          authentication: cdk.SecretValue.secretsManager('github-token'),
        }),
        commands: [
          'cd infra',
          'npm ci',
          'npm run build',
          'npm run cdk synth',
        ],
        primaryOutputDirectory: 'infra/cdk.out',
      }),
      codeBuildDefaults: {
        buildEnvironment: {
          buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
          privileged: true, // Docker build用
        },
      },
    });

    // Development Stage
    const devStage = pipeline.addStage(new NovaStage(this, 'Dev', {
      environment: 'dev',
    }));

    devStage.addPost(
      new pipelines.ShellStep('IntegrationTests', {
        commands: [
          'pip install pytest',
          'pytest tests/integration -v',
        ],
      })
    );

    // Staging Stage
    const stagingStage = pipeline.addStage(new NovaStage(this, 'Staging', {
      environment: 'staging',
    }));

    stagingStage.addPost(
      new pipelines.ShellStep('E2ETests', {
        commands: [
          'npx playwright install --with-deps',
          'npx playwright test',
        ],
      })
    );

    // Production Stage (with approval)
    const prodStage = pipeline.addStage(new NovaStage(this, 'Prod', {
      environment: 'prod',
    }), {
      pre: [
        new pipelines.ManualApprovalStep('ApproveProduction'),
      ],
    });
  }
}

class NovaStage extends cdk.Stage {
  constructor(scope: Construct, id: string, props: NovaStageProps) {
    super(scope, id, props);

    new NovaPlatformStack(this, 'NovaPlatform', {
      environment: props.environment,
    });
  }
}
```

## 5. ロールバック戦略

```typescript
// infra/lib/constructs/deployment-config.ts
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';

export class DeploymentConfigConstruct extends Construct {
  constructor(scope: Construct, id: string, props: DeploymentConfigProps) {
    super(scope, id);

    // ECS Service with Circuit Breaker
    const service = new ecs.FargateService(this, 'Service', {
      cluster: props.cluster,
      taskDefinition: props.taskDefinition,
      desiredCount: props.desiredCount,
      deploymentController: {
        type: ecs.DeploymentControllerType.ECS,
      },
      circuitBreaker: {
        rollback: true, // 自動ロールバック有効
      },
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
    });

    // Deployment Alarm
    const errorAlarm = new cloudwatch.Alarm(this, 'DeploymentErrorAlarm', {
      metric: service.metricCpuUtilization({
        period: cdk.Duration.minutes(1),
      }),
      threshold: 90,
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });

    // CloudWatch Alarm Action for rollback
    errorAlarm.addAlarmAction(
      new cloudwatchActions.SnsAction(props.alertTopic)
    );
  }
}
```

```yaml
# Manual rollback script
# scripts/rollback.sh
#!/bin/bash
set -e

ENVIRONMENT=$1
PREVIOUS_VERSION=$2

if [ -z "$ENVIRONMENT" ] || [ -z "$PREVIOUS_VERSION" ]; then
  echo "Usage: ./rollback.sh <environment> <previous-version>"
  exit 1
fi

echo "Rolling back to version: $PREVIOUS_VERSION in $ENVIRONMENT"

cd infra

# 前のバージョンにロールバック
npm run cdk deploy -- --all \
  --context environment=$ENVIRONMENT \
  --context imageTag=$PREVIOUS_VERSION \
  --require-approval never

echo "Rollback complete!"
```

