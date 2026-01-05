import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { storage } from './storage/resource';
import { agentFunction } from './functions/agent/resource';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { RemovalPolicy } from 'aws-cdk-lib';

/**
 * rd-bedrock-nova Backend Definition
 * 
 * Amplify Gen2 + Strands Agents + AgentCore 構成
 * - Auth: Cognito User Pool (Email + MFA)
 * - Data: AppSync GraphQL API with Subscriptions
 * - Storage: S3 for file uploads
 * - Functions: Lambda with AgentCore Runtime + Strands Agent
 */
const backend = defineBackend({
  auth,
  data,
  storage,
  agentFunction,
});

// =============================================================================
// DynamoDB Tables for Memory Storage
// =============================================================================

// Memory Events Table
const memoryTable = new dynamodb.Table(
  backend.createStack('MemoryStack'),
  'MemoryEventsTable',
  {
    tableName: `rd-bedrock-nova-memory-events`,
    partitionKey: { name: 'sessionId', type: dynamodb.AttributeType.STRING },
    sortKey: { name: 'eventId', type: dynamodb.AttributeType.STRING },
    billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    removalPolicy: RemovalPolicy.RETAIN,
    timeToLiveAttribute: 'ttl',
  }
);

// GSI for querying by userId
memoryTable.addGlobalSecondaryIndex({
  indexName: 'byUserId',
  partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING },
});

// Session Table
const sessionTable = new dynamodb.Table(
  backend.createStack('SessionStack'),
  'SessionsTable',
  {
    tableName: `rd-bedrock-nova-sessions`,
    partitionKey: { name: 'sessionId', type: dynamodb.AttributeType.STRING },
    billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    removalPolicy: RemovalPolicy.RETAIN,
  }
);

// =============================================================================
// Lambda Environment Variables
// =============================================================================

// Get storage bucket name from outputs
const storageBucket = backend.storage.resources.bucket;

// Get underlying Lambda function and set environment variables
const underlyingLambda = backend.agentFunction.resources.lambda.node.defaultChild as lambda.CfnFunction;
underlyingLambda.addPropertyOverride('Environment.Variables.MEMORY_TABLE', memoryTable.tableName);
underlyingLambda.addPropertyOverride('Environment.Variables.SESSION_TABLE', sessionTable.tableName);
underlyingLambda.addPropertyOverride('Environment.Variables.STORAGE_BUCKET_NAME', storageBucket.bucketName);

// =============================================================================
// IAM Policies
// =============================================================================

// Bedrock アクセス権限 (スコープを ap-northeast-1 と us-east-1 に限定)
backend.agentFunction.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: [
      'bedrock:InvokeModel',
      'bedrock:InvokeModelWithResponseStream',
    ],
    resources: [
      'arn:aws:bedrock:ap-northeast-1::foundation-model/amazon.nova-*',
      'arn:aws:bedrock:ap-northeast-1::foundation-model/anthropic.claude-*',
      'arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-*',
      'arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-*',
    ],
  })
);

// Bedrock Agent Runtime (Knowledge Bases)
backend.agentFunction.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: [
      'bedrock:Retrieve',
      'bedrock:RetrieveAndGenerate',
    ],
    resources: ['*'], // Knowledge Base ARNs are dynamic
  })
);

// S3 アクセス権限（実際のバケットARNを使用）
backend.agentFunction.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: [
      's3:GetObject',
      's3:PutObject',
      's3:DeleteObject',
    ],
    resources: [`${storageBucket.bucketArn}/*`],
  })
);

// DynamoDB アクセス権限
backend.agentFunction.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: [
      'dynamodb:GetItem',
      'dynamodb:PutItem',
      'dynamodb:UpdateItem',
      'dynamodb:DeleteItem',
      'dynamodb:Query',
      'dynamodb:Scan',
    ],
    resources: [
      memoryTable.tableArn,
      `${memoryTable.tableArn}/index/*`,
      sessionTable.tableArn,
    ],
  })
);

export default backend;
