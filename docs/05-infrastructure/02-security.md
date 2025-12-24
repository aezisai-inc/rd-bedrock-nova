# セキュリティ設計書

## 1. セキュリティアーキテクチャ

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SECURITY ARCHITECTURE                                │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                      PERIMETER SECURITY                              │    │
│  │                                                                      │    │
│  │   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐         │    │
│  │   │   AWS WAF    │───▶│  CloudFront  │───▶│  API Gateway │         │    │
│  │   │              │    │              │    │              │         │    │
│  │   │ • Rate Limit │    │ • TLS 1.3    │    │ • Throttling │         │    │
│  │   │ • SQL Inject │    │ • HSTS       │    │ • API Keys   │         │    │
│  │   │ • XSS Filter │    │ • Geo Block  │    │ • Usage Plan │         │    │
│  │   └──────────────┘    └──────────────┘    └──────────────┘         │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    IDENTITY & ACCESS MANAGEMENT                      │    │
│  │                                                                      │    │
│  │   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐         │    │
│  │   │   Cognito    │───▶│  IAM Roles   │───▶│  Policies    │         │    │
│  │   │              │    │              │    │              │         │    │
│  │   │ • User Pool  │    │ • Task Role  │    │ • Least Priv │         │    │
│  │   │ • Identity   │    │ • Exec Role  │    │ • Boundaries │         │    │
│  │   │ • MFA        │    │ • Service    │    │ • Resource   │         │    │
│  │   └──────────────┘    └──────────────┘    └──────────────┘         │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                      DATA PROTECTION                                 │    │
│  │                                                                      │    │
│  │   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐         │    │
│  │   │    KMS       │───▶│ Encryption   │───▶│  Guardrails  │         │    │
│  │   │              │    │              │    │              │         │    │
│  │   │ • CMK       │    │ • At Rest    │    │ • PII Mask   │         │    │
│  │   │ • Rotation   │    │ • In Transit │    │ • Content    │         │    │
│  │   │ • Policies   │    │ • Field Lvl  │    │ • Filtering  │         │    │
│  │   └──────────────┘    └──────────────┘    └──────────────┘         │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    │                                         │
│                                    ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    MONITORING & COMPLIANCE                           │    │
│  │                                                                      │    │
│  │   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐         │    │
│  │   │  CloudTrail  │───▶│   GuardDuty  │───▶│Security Hub  │         │    │
│  │   │              │    │              │    │              │         │    │
│  │   │ • API Logs   │    │ • Threat Det │    │ • Findings   │         │    │
│  │   │ • S3 Access  │    │ • Anomaly    │    │ • Compliance │         │    │
│  │   └──────────────┘    └──────────────┘    └──────────────┘         │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 2. 認証・認可

### 2.1 Cognito 設定

```typescript
// infra/lib/constructs/auth.ts
import * as cognito from 'aws-cdk-lib/aws-cognito';

export class AuthConstruct extends Construct {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.userPool = new cognito.UserPool(this, 'NovaUserPool', {
      userPoolName: 'nova-users',
      selfSignUpEnabled: false,
      signInAliases: {
        email: true,
      },
      autoVerify: {
        email: true,
      },
      standardAttributes: {
        email: { required: true, mutable: false },
        fullname: { required: true, mutable: true },
      },
      customAttributes: {
        'organization': new cognito.StringAttribute({ mutable: true }),
        'role': new cognito.StringAttribute({ mutable: true }),
      },
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
        tempPasswordValidity: cdk.Duration.days(3),
      },
      mfa: cognito.Mfa.REQUIRED,
      mfaSecondFactor: {
        sms: true,
        otp: true,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      advancedSecurityMode: cognito.AdvancedSecurityMode.ENFORCED,
    });

    // グループ定義
    new cognito.CfnUserPoolGroup(this, 'AdminGroup', {
      userPoolId: this.userPool.userPoolId,
      groupName: 'admins',
      description: 'Administrator users',
      precedence: 0,
    });

    new cognito.CfnUserPoolGroup(this, 'OperatorGroup', {
      userPoolId: this.userPool.userPoolId,
      groupName: 'operators',
      description: 'Operator users',
      precedence: 1,
    });

    // Client
    this.userPoolClient = this.userPool.addClient('NovaWebClient', {
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
        },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.PROFILE],
        callbackUrls: ['https://app.nova.example.com/callback'],
        logoutUrls: ['https://app.nova.example.com/logout'],
      },
      authFlows: {
        userSrp: true,
      },
      preventUserExistenceErrors: true,
    });
  }
}
```

### 2.2 IAM ポリシー

```typescript
// infra/lib/constructs/iam-policies.ts
import * as iam from 'aws-cdk-lib/aws-iam';

export class IamPoliciesConstruct extends Construct {
  public readonly audioServiceRole: iam.Role;
  public readonly agentServiceRole: iam.Role;

  constructor(scope: Construct, id: string, props: IamPoliciesProps) {
    super(scope, id);

    // Audio Service Task Role
    this.audioServiceRole = new iam.Role(this, 'AudioServiceRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });

    // 最小権限の原則に基づくポリシー
    this.audioServiceRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'dynamodb:GetItem',
        'dynamodb:PutItem',
        'dynamodb:UpdateItem',
        'dynamodb:Query',
      ],
      resources: [
        props.eventStoreTable.tableArn,
        `${props.eventStoreTable.tableArn}/index/*`,
      ],
      conditions: {
        'ForAllValues:StringEquals': {
          'dynamodb:LeadingKeys': ['AudioFile#*'],
        },
      },
    }));

    this.audioServiceRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        's3:GetObject',
        's3:PutObject',
      ],
      resources: [
        `${props.contentBucket.bucketArn}/audio/*`,
      ],
    }));

    this.audioServiceRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:InvokeModel',
      ],
      resources: [
        'arn:aws:bedrock:*:*:model/amazon.nova-sonic-*',
      ],
    }));

    // Permission Boundary
    const permissionBoundary = new iam.ManagedPolicy(this, 'ServiceBoundary', {
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.DENY,
          actions: [
            'iam:*',
            'organizations:*',
            'account:*',
          ],
          resources: ['*'],
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.DENY,
          actions: ['*'],
          resources: ['*'],
          conditions: {
            'StringNotEquals': {
              'aws:RequestedRegion': ['us-east-1', 'ap-northeast-1'],
            },
          },
        }),
      ],
    });

    iam.PermissionsBoundary.of(this.audioServiceRole).apply(permissionBoundary);
  }
}
```

## 3. 暗号化

### 3.1 KMS 設定

```typescript
// infra/lib/constructs/encryption.ts
import * as kms from 'aws-cdk-lib/aws-kms';

export class EncryptionConstruct extends Construct {
  public readonly dataKey: kms.Key;
  public readonly contentKey: kms.Key;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    // データ暗号化キー
    this.dataKey = new kms.Key(this, 'DataEncryptionKey', {
      alias: 'nova/data',
      description: 'Key for encrypting Nova data at rest',
      enableKeyRotation: true,
      rotationPeriod: cdk.Duration.days(90),
      pendingWindow: cdk.Duration.days(7),
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Key Policy
    this.dataKey.addToResourcePolicy(new iam.PolicyStatement({
      actions: [
        'kms:Encrypt',
        'kms:Decrypt',
        'kms:ReEncrypt*',
        'kms:GenerateDataKey*',
      ],
      principals: [
        new iam.ServicePrincipal('dynamodb.amazonaws.com'),
        new iam.ServicePrincipal('s3.amazonaws.com'),
      ],
      resources: ['*'],
      conditions: {
        'StringEquals': {
          'kms:CallerAccount': cdk.Aws.ACCOUNT_ID,
        },
      },
    }));

    // コンテンツ暗号化キー（S3用）
    this.contentKey = new kms.Key(this, 'ContentEncryptionKey', {
      alias: 'nova/content',
      description: 'Key for encrypting audio/video content',
      enableKeyRotation: true,
    });
  }
}
```

## 4. WAF ルール

```typescript
// infra/lib/constructs/waf.ts
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';

export class WafConstruct extends Construct {
  public readonly webAcl: wafv2.CfnWebACL;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.webAcl = new wafv2.CfnWebACL(this, 'NovaWAF', {
      name: 'nova-waf',
      scope: 'REGIONAL',
      defaultAction: { allow: {} },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: 'NovaWAF',
        sampledRequestsEnabled: true,
      },
      rules: [
        // Rate Limiting
        {
          name: 'RateLimitRule',
          priority: 1,
          action: { block: {} },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'RateLimitRule',
            sampledRequestsEnabled: true,
          },
          statement: {
            rateBasedStatement: {
              limit: 2000,
              aggregateKeyType: 'IP',
            },
          },
        },
        // AWS Managed Rules - Common
        {
          name: 'AWSManagedRulesCommonRuleSet',
          priority: 2,
          overrideAction: { none: {} },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'CommonRuleSet',
            sampledRequestsEnabled: true,
          },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesCommonRuleSet',
            },
          },
        },
        // AWS Managed Rules - SQL Injection
        {
          name: 'AWSManagedRulesSQLiRuleSet',
          priority: 3,
          overrideAction: { none: {} },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'SQLiRuleSet',
            sampledRequestsEnabled: true,
          },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesSQLiRuleSet',
            },
          },
        },
        // Geo Blocking (example: block specific countries)
        {
          name: 'GeoBlockRule',
          priority: 4,
          action: { block: {} },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'GeoBlockRule',
            sampledRequestsEnabled: true,
          },
          statement: {
            geoMatchStatement: {
              countryCodes: ['XX'], // Replace with actual country codes
            },
          },
        },
      ],
    });
  }
}
```

## 5. Bedrock Guardrails

```typescript
// infra/lib/constructs/guardrails.ts
import * as bedrock from 'aws-cdk-lib/aws-bedrock';

export class GuardrailsConstruct extends Construct {
  public readonly guardrail: bedrock.CfnGuardrail;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.guardrail = new bedrock.CfnGuardrail(this, 'NovaGuardrail', {
      name: 'nova-content-guardrail',
      description: 'Content safety guardrail for Nova AI responses',
      blockedInputMessaging: 'このリクエストは処理できません。',
      blockedOutputsMessaging: 'この回答は提供できません。',
      
      // コンテンツフィルタリング
      contentPolicyConfig: {
        filtersConfig: [
          {
            type: 'SEXUAL',
            inputStrength: 'HIGH',
            outputStrength: 'HIGH',
          },
          {
            type: 'VIOLENCE',
            inputStrength: 'HIGH',
            outputStrength: 'HIGH',
          },
          {
            type: 'HATE',
            inputStrength: 'HIGH',
            outputStrength: 'HIGH',
          },
          {
            type: 'INSULTS',
            inputStrength: 'MEDIUM',
            outputStrength: 'MEDIUM',
          },
          {
            type: 'MISCONDUCT',
            inputStrength: 'HIGH',
            outputStrength: 'HIGH',
          },
          {
            type: 'PROMPT_ATTACK',
            inputStrength: 'HIGH',
            outputStrength: 'NONE',
          },
        ],
      },
      
      // PII 保護
      sensitiveInformationPolicyConfig: {
        piiEntitiesConfig: [
          { type: 'EMAIL', action: 'ANONYMIZE' },
          { type: 'PHONE', action: 'ANONYMIZE' },
          { type: 'NAME', action: 'ANONYMIZE' },
          { type: 'ADDRESS', action: 'ANONYMIZE' },
          { type: 'CREDIT_DEBIT_CARD_NUMBER', action: 'BLOCK' },
          { type: 'AWS_ACCESS_KEY', action: 'BLOCK' },
          { type: 'AWS_SECRET_KEY', action: 'BLOCK' },
        ],
        regexesConfig: [
          {
            name: 'JapanesePhoneNumber',
            pattern: '\\d{2,4}-\\d{2,4}-\\d{4}',
            action: 'ANONYMIZE',
          },
          {
            name: 'MyNumber',
            pattern: '\\d{4}\\s*\\d{4}\\s*\\d{4}',
            action: 'BLOCK',
          },
        ],
      },
      
      // トピック制限
      topicPolicyConfig: {
        topicsConfig: [
          {
            name: 'CompetitorInformation',
            definition: 'Information about competitor products or services',
            examples: ['Tell me about competitor X', 'How does competitor Y compare'],
            type: 'DENY',
          },
          {
            name: 'InternalPolicies',
            definition: 'Internal company policies and confidential information',
            examples: ['What are the internal HR policies', 'Share confidential data'],
            type: 'DENY',
          },
        ],
      },
      
      // 単語フィルタ
      wordPolicyConfig: {
        wordsConfig: [
          { text: '機密' },
          { text: '社外秘' },
        ],
        managedWordListsConfig: [
          { type: 'PROFANITY' },
        ],
      },
    });
  }
}
```

## 6. 監査ログ

```typescript
// infra/lib/constructs/audit.ts
import * as cloudtrail from 'aws-cdk-lib/aws-cloudtrail';
import * as logs from 'aws-cdk-lib/aws-logs';

export class AuditConstruct extends Construct {
  constructor(scope: Construct, id: string, props: AuditProps) {
    super(scope, id);

    // CloudTrail
    const trail = new cloudtrail.Trail(this, 'NovaAuditTrail', {
      trailName: 'nova-audit-trail',
      bucket: props.auditBucket,
      s3KeyPrefix: 'cloudtrail',
      sendToCloudWatchLogs: true,
      cloudWatchLogGroup: new logs.LogGroup(this, 'TrailLogGroup', {
        logGroupName: '/nova/audit/cloudtrail',
        retention: logs.RetentionDays.ONE_YEAR,
      }),
      enableFileValidation: true,
      includeGlobalServiceEvents: true,
      isMultiRegionTrail: true,
    });

    // Data Events for S3
    trail.addS3EventSelector([{
      bucket: props.contentBucket,
    }], {
      readWriteType: cloudtrail.ReadWriteType.ALL,
      includeManagementEvents: false,
    });

    // Data Events for DynamoDB
    trail.addEventSelector(cloudtrail.DataResourceType.DYNAMODB_TABLE, [
      props.eventStoreTable.tableArn,
    ]);
  }
}
```

