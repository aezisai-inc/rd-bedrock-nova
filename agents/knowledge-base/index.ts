/**
 * Knowledge Base Agent Module
 *
 * Bedrock Knowledge Bases との統合を提供
 * Strands Agents SDK + BedrockAgentRuntime API
 *
 * 設計原則:
 * - Application層: strands-agents (@tool デコレータ)
 * - Platform層: bedrock-agentcore (Runtime/Memory/Observability)
 * - Model層: bedrock-runtime (Converse API)
 *
 * 禁止事項:
 * - boto3 直接使用
 * - AWS CLI / シェルスクリプト
 * - LangChain (Strands で実現可能な機能)
 */

import {
  BedrockAgentRuntimeClient,
  RetrieveCommand,
  RetrieveAndGenerateCommand,
  type RetrieveCommandInput,
  type RetrieveAndGenerateCommandInput,
  type KnowledgeBaseRetrievalResult,
} from '@aws-sdk/client-bedrock-agent-runtime';

// Environment Configuration
const REGION = process.env.AWS_REGION || 'ap-northeast-1';
const KNOWLEDGE_BASE_ID = process.env.KNOWLEDGE_BASE_ID || '';
const MODEL_ARN = process.env.MODEL_ARN || 'arn:aws:bedrock:ap-northeast-1::foundation-model/anthropic.claude-3-haiku-20240307-v1:0';

// Bedrock Agent Runtime Client
const bedrockAgentClient = new BedrockAgentRuntimeClient({ region: REGION });

// =============================================================================
// Types (Domain Layer aligned)
// =============================================================================

export interface SearchFilters {
  sourceType?: 'pdf' | 'text' | 'html' | 'all';
  dateRange?: {
    from?: string;
    to?: string;
  };
  metadata?: Record<string, string>;
}

export interface SearchResult {
  documentId: string;
  score: number;
  excerpt: string;
  sourceUri?: string;
  metadata?: Record<string, unknown>;
}

export interface RagResponse {
  answer: string;
  citations: Citation[];
  sessionId?: string;
}

export interface Citation {
  documentId: string;
  excerpt: string;
  pageNumber?: number;
}

export interface IngestResult {
  jobId: string;
  status: 'STARTED' | 'IN_PROGRESS' | 'COMPLETE' | 'FAILED';
  documentCount?: number;
}

// =============================================================================
// Observability (AgentCore Observability pattern)
// =============================================================================

const log = (level: string, message: string, data?: Record<string, unknown>) => {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      ...data,
      service: 'knowledge-base-agent',
      knowledgeBaseId: KNOWLEDGE_BASE_ID,
    })
  );
};

// =============================================================================
// Tool Functions (Strands @tool pattern)
// =============================================================================

/**
 * Knowledge Base 検索 (ベクトル検索のみ)
 *
 * @tool("knowledge_search")
 */
export async function searchKnowledge(
  query: string,
  filters?: SearchFilters,
  topK: number = 5
): Promise<SearchResult[]> {
  log('INFO', 'Knowledge search started', { query, filters, topK });

  if (!KNOWLEDGE_BASE_ID) {
    throw new Error('KNOWLEDGE_BASE_ID environment variable is not set');
  }

  const input: RetrieveCommandInput = {
    knowledgeBaseId: KNOWLEDGE_BASE_ID,
    retrievalQuery: {
      text: query,
    },
    retrievalConfiguration: {
      vectorSearchConfiguration: {
        numberOfResults: topK,
        // Filter configuration would go here if supported
      },
    },
  };

  try {
    const command = new RetrieveCommand(input);
    const response = await bedrockAgentClient.send(command);

    const results: SearchResult[] = (response.retrievalResults || []).map(
      (result: KnowledgeBaseRetrievalResult) => ({
        documentId: result.location?.s3Location?.uri || 'unknown',
        score: result.score || 0,
        excerpt: result.content?.text || '',
        sourceUri: result.location?.s3Location?.uri,
        metadata: result.metadata,
      })
    );

    log('INFO', 'Knowledge search completed', {
      query,
      resultCount: results.length,
    });

    return results;
  } catch (error) {
    log('ERROR', 'Knowledge search failed', {
      query,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * RAG クエリ (検索 + 応答生成)
 *
 * @tool("knowledge_rag")
 */
export async function ragQuery(
  query: string,
  sessionId?: string
): Promise<RagResponse> {
  log('INFO', 'RAG query started', { query, sessionId });

  if (!KNOWLEDGE_BASE_ID) {
    throw new Error('KNOWLEDGE_BASE_ID environment variable is not set');
  }

  const input: RetrieveAndGenerateCommandInput = {
    input: {
      text: query,
    },
    retrieveAndGenerateConfiguration: {
      type: 'KNOWLEDGE_BASE',
      knowledgeBaseConfiguration: {
        knowledgeBaseId: KNOWLEDGE_BASE_ID,
        modelArn: MODEL_ARN,
        retrievalConfiguration: {
          vectorSearchConfiguration: {
            numberOfResults: 5,
          },
        },
      },
    },
    ...(sessionId && { sessionId }),
  };

  try {
    const command = new RetrieveAndGenerateCommand(input);
    const response = await bedrockAgentClient.send(command);

    const citations: Citation[] = (response.citations || []).flatMap(
      (citation) =>
        (citation.retrievedReferences || []).map((ref) => ({
          documentId: ref.location?.s3Location?.uri || 'unknown',
          excerpt: ref.content?.text || '',
          pageNumber: undefined, // Would need metadata parsing
        }))
    );

    const result: RagResponse = {
      answer: response.output?.text || 'No response generated',
      citations,
      sessionId: response.sessionId,
    };

    log('INFO', 'RAG query completed', {
      query,
      answerLength: result.answer.length,
      citationCount: citations.length,
    });

    return result;
  } catch (error) {
    log('ERROR', 'RAG query failed', {
      query,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Knowledge Base ツールの取得 (Strands Agent 統合用)
 */
export function getKnowledgeTools() {
  return {
    knowledge_search: {
      description: 'Search documents in the knowledge base using semantic search',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query in natural language',
          },
          topK: {
            type: 'number',
            description: 'Number of results to return (default: 5)',
          },
        },
        required: ['query'],
      },
      handler: async (params: { query: string; topK?: number }) => {
        return searchKnowledge(params.query, undefined, params.topK);
      },
    },
    knowledge_rag: {
      description: 'Query the knowledge base and generate an answer using RAG',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The question to answer using knowledge base',
          },
          sessionId: {
            type: 'string',
            description: 'Optional session ID for conversation continuity',
          },
        },
        required: ['query'],
      },
      handler: async (params: { query: string; sessionId?: string }) => {
        return ragQuery(params.query, params.sessionId);
      },
    },
  };
}

export default {
  searchKnowledge,
  ragQuery,
  getKnowledgeTools,
};
