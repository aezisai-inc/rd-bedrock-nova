import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { agentFunction } from './functions/agent/resource';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';

/**
 * rd-bedrock-nova Backend Definition
 * 
 * Amplify Gen2 + Strands Agents + AgentCore 構成
 * - Auth: Cognito User Pool (Email + Google OAuth)
 * - Data: AppSync GraphQL API with Subscriptions
 * - Functions: Lambda with AgentCore Runtime
 */
const backend = defineBackend({
  auth,
  data,
  agentFunction,
});

// Bedrock アクセス権限を Lambda に付与
backend.agentFunction.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: [
      'bedrock:InvokeModel',
      'bedrock:InvokeModelWithResponseStream',
    ],
    resources: [
      'arn:aws:bedrock:*::foundation-model/amazon.nova-*',
      'arn:aws:bedrock:*::foundation-model/anthropic.claude-*',
    ],
  })
);

// S3 アクセス権限（ファイルアップロード用）
backend.agentFunction.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: [
      's3:GetObject',
      's3:PutObject',
      's3:DeleteObject',
    ],
    resources: ['arn:aws:s3:::rd-bedrock-nova-*/*'],
  })
);

export default backend;

