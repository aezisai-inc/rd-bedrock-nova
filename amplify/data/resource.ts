import { defineData, a, type ClientSchema } from '@aws-amplify/backend';
import { agentFunction } from '../functions/agent/resource';

/**
 * AppSync GraphQL スキーマ定義
 * 
 * - ChatMessage: チャットメッセージ
 * - ChatSession: セッション管理
 * - AgentResponse: エージェントからのストリーミングレスポンス
 */
const schema = a.schema({
  // チャットメッセージ
  ChatMessage: a
    .model({
      sessionId: a.string().required(),
      role: a.enum(['user', 'assistant', 'system']),
      content: a.string().required(),
      timestamp: a.datetime(),
      metadata: a.json(),
    })
    .authorization((allow) => [allow.owner()]),

  // チャットセッション
  ChatSession: a
    .model({
      title: a.string(),
      lastMessageAt: a.datetime(),
      messageCount: a.integer().default(0),
      status: a.enum(['active', 'archived']),
    })
    .authorization((allow) => [allow.owner()]),

  // ファイルアップロード情報
  UploadedFile: a
    .model({
      sessionId: a.string().required(),
      fileName: a.string().required(),
      fileType: a.string().required(),
      s3Key: a.string().required(),
      size: a.integer(),
      uploadedAt: a.datetime(),
    })
    .authorization((allow) => [allow.owner()]),

  // エージェント呼び出し（カスタムミューテーション）
  invokeAgent: a
    .mutation()
    .arguments({
      sessionId: a.string().required(),
      message: a.string().required(),
      fileKeys: a.string().array(),
    })
    .returns(a.string())
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(agentFunction)),

  // Presigned URL 取得
  getUploadUrl: a
    .query()
    .arguments({
      fileName: a.string().required(),
      fileType: a.string().required(),
    })
    .returns(
      a.customType({
        uploadUrl: a.string(),
        s3Key: a.string(),
      })
    )
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(agentFunction)),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
  },
});

