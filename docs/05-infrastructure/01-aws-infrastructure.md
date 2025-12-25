# AWS インフラストラクチャ設計書（ECS Fargate + Agent Core）

## 1. 全体アーキテクチャ

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    AGENT CORE + ECS FARGATE ARCHITECTURE                    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                       Internet                                       │    │
│  └────────────────────────────┬────────────────────────────────────────┘    │
│                               │                                              │
│                               ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    CloudFront + WAF                                  │    │
│  └────────────────────────────┬────────────────────────────────────────┘    │
│                               │                                              │
│                               ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    API Gateway (REST)                                │    │
│  └────────────────────────────┬────────────────────────────────────────┘    │
│                               │                                              │
│  ┌────────────────────────────┼────────────────────────────────────────┐    │
│  │                    VPC (10.0.0.0/16)                                 │    │
│  │                            │                                         │    │
│  │  ┌─────────────────────────┴─────────────────────────┐              │    │
│  │  │              Application Load Balancer             │              │    │
│  │  └─────────────────────────┬─────────────────────────┘              │    │
│  │                            │                                         │    │
│  │  ┌─────────────────────────┴─────────────────────────┐              │    │
│  │  │ Private Subnets (ECS Fargate)                      │              │    │
│  │  │                                                    │              │    │
│  │  │  ┌────────────────────────────────────────────┐   │              │    │
│  │  │  │        Agent Core Service (Coordinator)     │   │              │    │
│  │  │  │                                            │   │              │    │
│  │  │  │  • オーケストレーション                      │   │              │    │
│  │  │  │  • ツール呼び出し管理                        │   │              │    │
│  │  │  │  • セッション管理                            │   │              │    │
│  │  │  └────────────────────────────────────────────┘   │              │    │
│  │  │                                                    │              │    │
│  │  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐     │              │    │
│  │  │  │ Audio  │ │ Video  │ │ Search │ │ Event  │     │              │    │
│  │  │  │Service │ │Service │ │Service │ │Projector│    │              │    │
│  │  │  │        │ │        │ │        │ │        │     │              │    │
│  │  │  │ Nova   │ │ Nova   │ │ Nova   │ │ CQRS   │     │              │    │
│  │  │  │ Sonic  │ │ Omni   │ │Embeds  │ │ Read   │     │              │    │
│  │  │  └────────┘ └────────┘ └────────┘ └────────┘     │              │    │
│  │  └────────────────────────────────────────────────────┘              │    │
│  │                                                                      │    │
│  │  ┌────────────────────────────────────────────────────┐              │    │
│  │  │ Data Tier (Isolated Subnets)                       │              │    │
│  │  │                                                    │              │    │
│  │  │  ┌─────────┐  ┌─────────┐                        │              │    │
│  │  │  │ DynamoDB│  │ ElastiCache│                      │              │    │
│  │  │  │ (VPC EP)│  │ (Redis)  │                        │              │    │
│  │  │  └─────────┘  └─────────┘                        │              │    │
│  │  └────────────────────────────────────────────────────┘              │    │
│  │                                                                      │    │
│  └──────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │ AWS Services (via VPC Endpoints)                                     │    │
│  │                                                                      │    │
│  │  • S3              • Bedrock Runtime    • EventBridge               │    │
│  │  • Secrets Manager • KMS                • CloudWatch                │    │
│  │  • ECR             • SSM Parameter Store                            │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 2. Agent Core とは

**Agent Core** は AWS の **Strands Agents Framework** に基づくセルフホスト型エージェントフレームワークです。

### Bedrock Agents (マネージド) との違い

| 観点 | Bedrock Agents (マネージド) | Agent Core (セルフホスト) |
|------|---------------------------|-------------------------|
| **デプロイ** | AWS管理 | ECS/ECR にコンテナデプロイ |
| **カスタマイズ** | 制限あり | 完全なカスタマイズ可能 |
| **スケーリング** | 自動 | ECS Auto Scaling |
| **料金** | API呼び出し課金 | コンピュート課金 |
| **ツール統合** | Lambda経由 | 直接コード統合 |
| **状態管理** | 限定的 | 自由に実装可能 |

### Agent Core の特徴

```python
# Agent Core の基本構造
from agent_core import Agent, Tool, Memory

class NovaCoordinatorAgent(Agent):
    """Nova Platform のコーディネーターエージェント"""
    
    def __init__(self):
        super().__init__(
            model="anthropic.claude-3-5-sonnet",
            tools=[
                AudioTranscriptionTool(),
                VideoAnalysisTool(),
                MultimodalSearchTool(),
            ],
            memory=RedisMemory(),  # 短期記憶
            long_term_memory=DynamoDBMemory(),  # 長期記憶
        )
    
    async def process(self, user_input: str, context: dict) -> str:
        # エージェントのオーケストレーションロジック
        return await self.run(user_input, context)
```

## 3. CDK スタック構成

```typescript
// infra/lib/nova-platform-stack.ts
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class NovaPlatformStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Nested Stacks (ECS Fargate)
    const networkStack = new NetworkStack(this, 'Network');
    const dataStack = new DataStack(this, 'Data', {
      vpc: networkStack.vpc,
    });
    const computeStack = new ComputeStack(this, 'Compute', {
      vpc: networkStack.vpc,
      eventStore: dataStack.eventStoreTable,
      contentBucket: dataStack.contentBucket,
      redisCluster: dataStack.redisCluster,
    });
    const apiStack = new ApiStack(this, 'Api', {
      alb: computeStack.alb,
    });
  }
}
```

### 3.1 Network Stack

```typescript
// infra/lib/stacks/network-stack.ts
import * as ec2 from 'aws-cdk-lib/aws-ec2';

export class NetworkStack extends cdk.NestedStack {
  public readonly vpc: ec2.Vpc;

  constructor(scope: Construct, id: string, props?: cdk.NestedStackProps) {
    super(scope, id, props);

    this.vpc = new ec2.Vpc(this, 'NovaVpc', {
      ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
      maxAzs: 3,
      natGateways: 2,
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
        {
          name: 'Isolated',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
    });

    // VPC Endpoints
    this.vpc.addGatewayEndpoint('S3Endpoint', {
      service: ec2.GatewayVpcEndpointAwsService.S3,
    });

    this.vpc.addGatewayEndpoint('DynamoDBEndpoint', {
      service: ec2.GatewayVpcEndpointAwsService.DYNAMODB,
    });

    this.vpc.addInterfaceEndpoint('BedrockEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.BEDROCK_RUNTIME,
      privateDnsEnabled: true,
    });

    this.vpc.addInterfaceEndpoint('ECREndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.ECR,
      privateDnsEnabled: true,
    });

    this.vpc.addInterfaceEndpoint('ECRDockerEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER,
      privateDnsEnabled: true,
    });

    this.vpc.addInterfaceEndpoint('SecretsManagerEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
      privateDnsEnabled: true,
    });
  }
}
```

### 3.2 Data Stack

```typescript
// infra/lib/stacks/data-stack.ts
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import * as s3 from 'aws-cdk-lib/aws-s3';
// Note: OpenSearch Serverless 廃止 - 代替としてDynamoDB+Bedrockナレッジベース検討中

export class DataStack extends cdk.NestedStack {
  public readonly eventStoreTable: dynamodb.Table;
  public readonly readModelTable: dynamodb.Table;
  public readonly contentBucket: s3.Bucket;
  public readonly redisCluster: elasticache.CfnReplicationGroup;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);

    // Event Store Table (Event Sourcing)
    this.eventStoreTable = new dynamodb.Table(this, 'EventStore', {
      tableName: 'nova-event-store',
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      stream: dynamodb.StreamViewType.NEW_IMAGE,
      pointInTimeRecovery: true,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    this.eventStoreTable.addGlobalSecondaryIndex({
      indexName: 'gsi1',
      partitionKey: { name: 'gsi1pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'gsi1sk', type: dynamodb.AttributeType.STRING },
    });

    // Read Model Table (CQRS)
    this.readModelTable = new dynamodb.Table(this, 'ReadModel', {
      tableName: 'nova-read-model',
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    // Note: OpenSearch Serverless 廃止
    // ベクトル検索は以下の代替案を検討:
    // - Bedrock Knowledge Bases (マネージド)
    // - PostgreSQL + pgvector (RDS)
    // - DynamoDB + アプリレベルでの類似検索

    // S3 Bucket for content
    this.contentBucket = new s3.Bucket(this, 'ContentBucket', {
      bucketName: `nova-content-${cdk.Aws.ACCOUNT_ID}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      lifecycleRules: [
        {
          transitions: [
            {
              storageClass: s3.StorageClass.INTELLIGENT_TIERING,
              transitionAfter: cdk.Duration.days(30),
            },
          ],
        },
      ],
    });

    // ElastiCache Redis (Agent Core 短期記憶)
    const redisSubnetGroup = new elasticache.CfnSubnetGroup(this, 'RedisSubnetGroup', {
      description: 'Subnet group for Nova Redis',
      subnetIds: props.vpc.isolatedSubnets.map(s => s.subnetId),
    });

    const redisSecurityGroup = new ec2.SecurityGroup(this, 'RedisSecurityGroup', {
      vpc: props.vpc,
      description: 'Security group for Redis cluster',
    });
    redisSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(props.vpc.vpcCidrBlock),
      ec2.Port.tcp(6379),
      'Allow Redis access from VPC'
    );

    this.redisCluster = new elasticache.CfnReplicationGroup(this, 'RedisCluster', {
      replicationGroupDescription: 'Nova Agent Core session/memory cache',
      engine: 'redis',
      engineVersion: '7.0',
      cacheNodeType: 'cache.t4g.medium',
      numCacheClusters: 2,
      automaticFailoverEnabled: true,
      multiAzEnabled: true,
      cacheSubnetGroupName: redisSubnetGroup.ref,
      securityGroupIds: [redisSecurityGroup.securityGroupId],
      atRestEncryptionEnabled: true,
      transitEncryptionEnabled: true,
    });
  }
}
```

### 3.3 Compute Stack (ECS Fargate)

```typescript
// infra/lib/stacks/compute-stack.ts
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecsPatterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ecr from 'aws-cdk-lib/aws-ecr';

export class ComputeStack extends cdk.NestedStack {
  public readonly alb: elbv2.ApplicationLoadBalancer;
  public readonly cluster: ecs.Cluster;

  constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id, props);

    // ECS Cluster
    this.cluster = new ecs.Cluster(this, 'NovaCluster', {
      vpc: props.vpc,
      containerInsights: true,
      clusterName: 'nova-cluster',
    });

    // ECR Repositories
    const agentCoreRepo = new ecr.Repository(this, 'AgentCoreRepo', {
      repositoryName: 'nova-agent-core',
    });

    const audioServiceRepo = new ecr.Repository(this, 'AudioServiceRepo', {
      repositoryName: 'nova-audio-service',
    });

    const videoServiceRepo = new ecr.Repository(this, 'VideoServiceRepo', {
      repositoryName: 'nova-video-service',
    });

    const searchServiceRepo = new ecr.Repository(this, 'SearchServiceRepo', {
      repositoryName: 'nova-search-service',
    });

    // =================================================================
    // Agent Core Service (Coordinator)
    // =================================================================
    const agentCoreService = new ecsPatterns.ApplicationLoadBalancedFargateService(
      this, 'AgentCoreService', {
        cluster: this.cluster,
        serviceName: 'nova-agent-core',
        taskImageOptions: {
          image: ecs.ContainerImage.fromEcrRepository(agentCoreRepo, 'latest'),
          containerPort: 8000,
          environment: {
            NOVA_ENVIRONMENT: 'production',
            REDIS_HOST: props.redisCluster.attrPrimaryEndPointAddress,
            REDIS_PORT: props.redisCluster.attrPrimaryEndPointPort,
            EVENT_STORE_TABLE: props.eventStore.tableName,
            AUDIO_SERVICE_URL: 'http://nova-audio-service.nova.local:8000',
            VIDEO_SERVICE_URL: 'http://nova-video-service.nova.local:8000',
            SEARCH_SERVICE_URL: 'http://nova-search-service.nova.local:8000',
          },
        },
        desiredCount: 2,
        cpu: 1024,
        memoryLimitMiB: 2048,
        publicLoadBalancer: false,
        cloudMapOptions: {
          name: 'agent-core',
          cloudMapNamespace: this.createNamespace(props.vpc),
        },
      }
    );

    // Bedrock 権限
    agentCoreService.taskDefinition.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: [
          'bedrock:InvokeModel',
          'bedrock:InvokeModelWithResponseStream',
        ],
        resources: ['arn:aws:bedrock:*:*:model/*'],
      })
    );

    props.eventStore.grantReadWriteData(agentCoreService.taskDefinition.taskRole);

    // =================================================================
    // Audio Service (Nova Sonic)
    // =================================================================
    const audioService = new ecsPatterns.ApplicationLoadBalancedFargateService(
      this, 'AudioService', {
        cluster: this.cluster,
        serviceName: 'nova-audio-service',
        taskImageOptions: {
          image: ecs.ContainerImage.fromEcrRepository(audioServiceRepo, 'latest'),
          containerPort: 8000,
          environment: {
            EVENT_STORE_TABLE: props.eventStore.tableName,
            CONTENT_BUCKET: props.contentBucket.bucketName,
            NOVA_SONIC_MODEL_ID: 'amazon.nova-sonic-v1',
          },
        },
        desiredCount: 2,
        cpu: 512,
        memoryLimitMiB: 1024,
        publicLoadBalancer: false,
        cloudMapOptions: {
          name: 'audio-service',
        },
      }
    );

    audioService.taskDefinition.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['bedrock:InvokeModel'],
        resources: ['arn:aws:bedrock:*:*:model/amazon.nova-sonic-*'],
      })
    );
    props.eventStore.grantReadWriteData(audioService.taskDefinition.taskRole);
    props.contentBucket.grantReadWrite(audioService.taskDefinition.taskRole);

    // =================================================================
    // Video Service (Nova Omni)
    // =================================================================
    const videoService = new ecsPatterns.ApplicationLoadBalancedFargateService(
      this, 'VideoService', {
        cluster: this.cluster,
        serviceName: 'nova-video-service',
        taskImageOptions: {
          image: ecs.ContainerImage.fromEcrRepository(videoServiceRepo, 'latest'),
          containerPort: 8000,
          environment: {
            EVENT_STORE_TABLE: props.eventStore.tableName,
            CONTENT_BUCKET: props.contentBucket.bucketName,
            NOVA_OMNI_MODEL_ID: 'amazon.nova-omni-v1',
          },
        },
        desiredCount: 2,
        cpu: 1024,
        memoryLimitMiB: 2048,
        publicLoadBalancer: false,
        cloudMapOptions: {
          name: 'video-service',
        },
      }
    );

    videoService.taskDefinition.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['bedrock:InvokeModel'],
        resources: ['arn:aws:bedrock:*:*:model/amazon.nova-omni-*'],
      })
    );
    props.eventStore.grantReadWriteData(videoService.taskDefinition.taskRole);
    props.contentBucket.grantReadWrite(videoService.taskDefinition.taskRole);

    // =================================================================
    // Search Service (Nova Embeddings)
    // Note: OpenSearch Serverless 廃止 - DynamoDB + Bedrock で代替検討
    // =================================================================
    const searchService = new ecsPatterns.ApplicationLoadBalancedFargateService(
      this, 'SearchService', {
        cluster: this.cluster,
        serviceName: 'nova-search-service',
        taskImageOptions: {
          image: ecs.ContainerImage.fromEcrRepository(searchServiceRepo, 'latest'),
          containerPort: 8000,
          environment: {
            CONTENT_BUCKET: props.contentBucket.bucketName,
            NOVA_EMBEDDINGS_MODEL_ID: 'amazon.nova-multimodal-embeddings-v1',
            // TODO: 代替ベクトルストア設定
          },
        },
        desiredCount: 2,
        cpu: 512,
        memoryLimitMiB: 1024,
        publicLoadBalancer: false,
        cloudMapOptions: {
          name: 'search-service',
        },
      }
    );

    searchService.taskDefinition.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['bedrock:InvokeModel'],
        resources: ['arn:aws:bedrock:*:*:model/amazon.nova-multimodal-embeddings-*'],
      })
    );
    props.contentBucket.grantRead(searchService.taskDefinition.taskRole);

    // =================================================================
    // Auto Scaling
    // =================================================================
    [agentCoreService, audioService, videoService, searchService].forEach(service => {
      const scaling = service.service.autoScaleTaskCount({
        minCapacity: 2,
        maxCapacity: 20,
      });

      scaling.scaleOnCpuUtilization('CpuScaling', {
        targetUtilizationPercent: 70,
        scaleInCooldown: cdk.Duration.seconds(60),
        scaleOutCooldown: cdk.Duration.seconds(60),
      });

      scaling.scaleOnMemoryUtilization('MemoryScaling', {
        targetUtilizationPercent: 80,
      });
    });

    this.alb = agentCoreService.loadBalancer;
  }

  private createNamespace(vpc: ec2.IVpc): servicediscovery.PrivateDnsNamespace {
    return new servicediscovery.PrivateDnsNamespace(this, 'Namespace', {
      name: 'nova.local',
      vpc,
    });
  }
}
```

## 4. EventBridge 設定

```typescript
// infra/lib/constructs/event-bus.ts
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';

export class NovaEventBusConstruct extends Construct {
  public readonly eventBus: events.EventBus;

  constructor(scope: Construct, id: string, props: EventBusProps) {
    super(scope, id);

    this.eventBus = new events.EventBus(this, 'NovaEventBus', {
      eventBusName: 'nova-events',
    });

    // ECS Task への配信 (SQS経由)
    new events.Rule(this, 'TranscriptionToSearchRule', {
      eventBus: this.eventBus,
      eventPattern: {
        source: ['nova.audio-service'],
        detailType: ['TranscriptionCompleted'],
      },
      targets: [
        new targets.SqsQueue(props.searchIndexerQueue),
      ],
    });

    // Archive for replay
    new events.Archive(this, 'NovaEventArchive', {
      sourceEventBus: this.eventBus,
      archiveName: 'nova-events-archive',
      retention: cdk.Duration.days(90),
    });
  }
}
```

## 5. サービス間通信

```
┌────────────────────────────────────────────────────────────────────────────┐
│                    SERVICE MESH (Cloud Map)                                 │
│                                                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                    agent-core.nova.local                             │  │
│  │                         (Coordinator)                                │  │
│  └───────────────────────────────┬─────────────────────────────────────┘  │
│                                  │                                         │
│            ┌─────────────────────┼─────────────────────┐                  │
│            │                     │                     │                  │
│            ▼                     ▼                     ▼                  │
│  ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐        │
│  │audio-service    │   │video-service    │   │search-service   │        │
│  │.nova.local      │   │.nova.local      │   │.nova.local      │        │
│  └─────────────────┘   └─────────────────┘   └─────────────────┘        │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

## 6. デプロイフロー

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CI/CD PIPELINE                                       │
│                                                                              │
│  1. Code Push (GitHub)                                                      │
│        │                                                                     │
│        ▼                                                                     │
│  2. Build & Test (GitHub Actions / CodeBuild)                               │
│        │                                                                     │
│        ▼                                                                     │
│  3. Docker Build                                                            │
│        │                                                                     │
│        ├── nova-agent-core:latest                                           │
│        ├── nova-audio-service:latest                                        │
│        ├── nova-video-service:latest                                        │
│        └── nova-search-service:latest                                       │
│        │                                                                     │
│        ▼                                                                     │
│  4. Push to ECR                                                             │
│        │                                                                     │
│        ▼                                                                     │
│  5. ECS Rolling Update                                                      │
│        │                                                                     │
│        └── Fargate Tasks (Blue/Green or Rolling)                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```
