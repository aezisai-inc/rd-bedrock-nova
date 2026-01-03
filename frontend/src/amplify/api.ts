/**
 * Amplify GraphQL API
 * 
 * AppSync APIとの通信レイヤー
 */
import { generateClient } from 'aws-amplify/api';
import type { GraphQLResult } from '@aws-amplify/api-graphql';

// GraphQL クライアント
const client = generateClient();

/**
 * GraphQL クエリ実行
 */
export async function executeQuery<T>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const result = await client.graphql({
    query,
    variables,
  }) as GraphQLResult<T>;

  if (result.errors && result.errors.length > 0) {
    throw new GraphQLError(result.errors[0].message);
  }

  return result.data as T;
}

/**
 * GraphQL ミューテーション実行
 */
export async function executeMutation<T>(
  mutation: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const result = await client.graphql({
    query: mutation,
    variables,
  }) as GraphQLResult<T>;

  if (result.errors && result.errors.length > 0) {
    throw new GraphQLError(result.errors[0].message);
  }

  return result.data as T;
}

// GraphQL クエリ定義
export const queries = {
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

export const mutations = {
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

  createChatMessage: /* GraphQL */ `
    mutation CreateChatMessage($input: CreateChatMessageInput!) {
      createChatMessage(input: $input) {
        id
        sessionId
        role
        content
        timestamp
      }
    }
  `,
};

export class GraphQLError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GraphQLError';
  }
}
