/**
 * Amplify GraphQL APIアダプター
 * 
 * Clean Architecture: Infrastructure層
 * ApiPortインターフェースをAmplify GraphQLで実装
 */
import { generateClient } from 'aws-amplify/api';
import type { GraphQLResult } from '@aws-amplify/api-graphql';
import type {
  ApiPort,
  MessageInput,
  ChatSession,
  ChatMessage,
  UploadUrlResult,
  PaginatedResult,
} from '../../api/ports/api-port';

// GraphQL クエリ/ミューテーション
const QUERIES = {
  getUploadUrl: /* GraphQL */ `
    query GetUploadUrl($fileName: String!, $fileType: String!) {
      getUploadUrl(fileName: $fileName, fileType: $fileType) {
        uploadUrl
        s3Key
      }
    }
  `,
  listChatSessions: /* GraphQL */ `
    query ListChatSessions($limit: Int, $nextToken: String) {
      listChatSessions(limit: $limit, nextToken: $nextToken) {
        items {
          id
          title
          lastMessageAt
          messageCount
          status
        }
        nextToken
      }
    }
  `,
  listChatMessages: /* GraphQL */ `
    query ListChatMessages($sessionId: String!, $limit: Int, $nextToken: String) {
      listChatMessages(
        filter: { sessionId: { eq: $sessionId } }
        limit: $limit
        nextToken: $nextToken
      ) {
        items {
          id
          sessionId
          role
          content
          timestamp
          metadata
        }
        nextToken
      }
    }
  `,
};

const MUTATIONS = {
  invokeAgent: /* GraphQL */ `
    mutation InvokeAgent($sessionId: String!, $message: String!, $fileKeys: [String]) {
      invokeAgent(sessionId: $sessionId, message: $message, fileKeys: $fileKeys)
    }
  `,
  createChatSession: /* GraphQL */ `
    mutation CreateChatSession($input: CreateChatSessionInput!) {
      createChatSession(input: $input) {
        id
        title
        status
        createdAt
      }
    }
  `,
};

/**
 * Amplify GraphQL APIアダプター
 */
export class AmplifyGraphQLAdapter implements ApiPort {
  private client = generateClient();

  async invokeAgent(input: MessageInput): Promise<string> {
    const result = await this.client.graphql({
      query: MUTATIONS.invokeAgent,
      variables: {
        sessionId: input.sessionId,
        message: input.message,
        fileKeys: input.fileKeys ?? [],
      },
    }) as GraphQLResult<{ invokeAgent: string }>;

    if (result.errors?.length) {
      throw new Error(result.errors[0].message);
    }

    return result.data?.invokeAgent ?? '';
  }

  async listSessions(limit = 50, nextToken?: string): Promise<PaginatedResult<ChatSession>> {
    const result = await this.client.graphql({
      query: QUERIES.listChatSessions,
      variables: { limit, nextToken },
    }) as GraphQLResult<{
      listChatSessions: {
        items: ChatSession[];
        nextToken?: string;
      };
    }>;

    if (result.errors?.length) {
      throw new Error(result.errors[0].message);
    }

    return {
      items: result.data?.listChatSessions?.items ?? [],
      nextToken: result.data?.listChatSessions?.nextToken,
    };
  }

  async listMessages(sessionId: string, limit = 50, nextToken?: string): Promise<PaginatedResult<ChatMessage>> {
    const result = await this.client.graphql({
      query: QUERIES.listChatMessages,
      variables: { sessionId, limit, nextToken },
    }) as GraphQLResult<{
      listChatMessages: {
        items: ChatMessage[];
        nextToken?: string;
      };
    }>;

    if (result.errors?.length) {
      throw new Error(result.errors[0].message);
    }

    const items = (result.data?.listChatMessages?.items ?? []).map((item) => ({
      ...item,
      timestamp: new Date(item.timestamp),
    }));

    return {
      items,
      nextToken: result.data?.listChatMessages?.nextToken,
    };
  }

  async createSession(title?: string): Promise<ChatSession> {
    const result = await this.client.graphql({
      query: MUTATIONS.createChatSession,
      variables: {
        input: {
          title: title ?? `Chat ${new Date().toLocaleDateString('ja-JP')}`,
          status: 'active',
        },
      },
    }) as GraphQLResult<{ createChatSession: ChatSession }>;

    if (result.errors?.length) {
      throw new Error(result.errors[0].message);
    }

    return result.data!.createChatSession;
  }

  async getUploadUrl(fileName: string, fileType: string): Promise<UploadUrlResult> {
    const result = await this.client.graphql({
      query: QUERIES.getUploadUrl,
      variables: { fileName, fileType },
    }) as GraphQLResult<{ getUploadUrl: UploadUrlResult }>;

    if (result.errors?.length) {
      throw new Error(result.errors[0].message);
    }

    return result.data!.getUploadUrl;
  }
}

// シングルトンインスタンス
let instance: AmplifyGraphQLAdapter | null = null;

export function getApiAdapter(): ApiPort {
  if (!instance) {
    instance = new AmplifyGraphQLAdapter();
  }
  return instance;
}
