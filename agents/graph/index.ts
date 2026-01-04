/**
 * Graph Agent Module
 *
 * Neo4j/Graphiti 知識グラフ統合
 * Strands Agents SDK + Neptune/Neo4j
 *
 * 設計原則:
 * - Application層: strands-agents (@tool デコレータ)
 * - Platform層: bedrock-agentcore (Observability)
 * - Infrastructure層: Neo4j Driver / Neptune Client
 *
 * メモリフェーズ戦略:
 * - Phase1: AgentCore Memory (~$20/月)
 * - Phase2: +Bedrock KB with S3 Vectors (~$70/月)
 * - Phase3: +Neptune/Neo4j (~$120/月) ← このモジュール
 *
 * 禁止事項:
 * - boto3 直接使用 (CDK/IaC経由のみ)
 * - OpenSearch Serverless (月額$100+のため非採用)
 */

// =============================================================================
// Types
// =============================================================================

export interface Node {
  id: string;
  labels: string[];
  properties: Record<string, unknown>;
}

export interface Edge {
  id: string;
  type: string;
  startNodeId: string;
  endNodeId: string;
  properties: Record<string, unknown>;
}

export interface GraphQueryResult {
  nodes: Node[];
  edges: Edge[];
  metadata: {
    queryTime: number;
    nodeCount: number;
    edgeCount: number;
  };
}

export interface Entity {
  name: string;
  type: string;
  description?: string;
  properties?: Record<string, unknown>;
}

export interface Relationship {
  from: string;
  to: string;
  type: string;
  properties?: Record<string, unknown>;
}

export interface KnowledgeExtractionResult {
  entities: Entity[];
  relationships: Relationship[];
  summary: string;
}

export interface GraphSearchParams {
  query: string;
  maxDepth?: number;
  nodeTypes?: string[];
  limit?: number;
}

// =============================================================================
// Configuration
// =============================================================================

const REGION = process.env.AWS_REGION || 'ap-northeast-1';
const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || '';
const NEPTUNE_ENDPOINT = process.env.NEPTUNE_ENDPOINT || '';

// =============================================================================
// Observability
// =============================================================================

const log = (level: string, message: string, data?: Record<string, unknown>) => {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      ...data,
      service: 'graph-agent',
    })
  );
};

// =============================================================================
// Graph Database Client Abstraction
// =============================================================================

interface GraphClient {
  query(cypher: string, params?: Record<string, unknown>): Promise<GraphQueryResult>;
  close(): Promise<void>;
}

class Neo4jClient implements GraphClient {
  private uri: string;
  private user: string;
  private password: string;

  constructor(uri: string, user: string, password: string) {
    this.uri = uri;
    this.user = user;
    this.password = password;
  }

  async query(cypher: string, params?: Record<string, unknown>): Promise<GraphQueryResult> {
    const startTime = Date.now();
    log('INFO', 'Executing Neo4j query', { cypher: cypher.substring(0, 100) });

    // Note: In production, use neo4j-driver
    // const driver = neo4j.driver(this.uri, neo4j.auth.basic(this.user, this.password));
    // const session = driver.session();
    // const result = await session.run(cypher, params);

    // Placeholder implementation
    const queryTime = Date.now() - startTime;

    return {
      nodes: [],
      edges: [],
      metadata: {
        queryTime,
        nodeCount: 0,
        edgeCount: 0,
      },
    };
  }

  async close(): Promise<void> {
    log('INFO', 'Closing Neo4j connection');
  }
}

class NeptuneClient implements GraphClient {
  private endpoint: string;

  constructor(endpoint: string) {
    this.endpoint = endpoint;
  }

  async query(cypher: string, params?: Record<string, unknown>): Promise<GraphQueryResult> {
    const startTime = Date.now();
    log('INFO', 'Executing Neptune openCypher query', { cypher: cypher.substring(0, 100) });

    // Note: Use AWS SDK for Neptune or HTTP endpoint
    // const response = await fetch(`https://${this.endpoint}:8182/openCypher`, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ query: cypher, parameters: params }),
    // });

    const queryTime = Date.now() - startTime;

    return {
      nodes: [],
      edges: [],
      metadata: {
        queryTime,
        nodeCount: 0,
        edgeCount: 0,
      },
    };
  }

  async close(): Promise<void> {
    log('INFO', 'Closing Neptune connection');
  }
}

// Factory function
function createGraphClient(): GraphClient {
  if (NEPTUNE_ENDPOINT) {
    return new NeptuneClient(NEPTUNE_ENDPOINT);
  }
  return new Neo4jClient(NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD);
}

// =============================================================================
// Knowledge Extraction (LLM-based)
// =============================================================================

import {
  BedrockRuntimeClient,
  ConverseCommand,
} from '@aws-sdk/client-bedrock-runtime';

const bedrockClient = new BedrockRuntimeClient({ region: REGION });
const EXTRACTION_MODEL = 'anthropic.claude-3-haiku-20240307-v1:0';

export async function extractKnowledge(text: string): Promise<KnowledgeExtractionResult> {
  log('INFO', 'Extracting knowledge from text', { textLength: text.length });

  const systemPrompt = `あなたは知識グラフ抽出のエキスパートです。
与えられたテキストから、エンティティ（人物、組織、場所、概念など）とその関係性を抽出してください。

出力は必ず以下のJSON形式で返してください：
{
  "entities": [
    {"name": "エンティティ名", "type": "Person|Organization|Place|Concept|Event", "description": "説明"}
  ],
  "relationships": [
    {"from": "開始エンティティ名", "to": "終了エンティティ名", "type": "WORKS_FOR|LOCATED_IN|RELATED_TO|etc"}
  ],
  "summary": "抽出した知識の要約"
}`;

  const response = await bedrockClient.send(
    new ConverseCommand({
      modelId: EXTRACTION_MODEL,
      messages: [
        {
          role: 'user',
          content: [{ text: `以下のテキストから知識を抽出してください：\n\n${text}` }],
        },
      ],
      system: [{ text: systemPrompt }],
    })
  );

  const responseText =
    response.output?.message?.content?.find((c) => 'text' in c);
  const content = responseText && 'text' in responseText ? responseText.text ?? '' : '';

  try {
    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]) as KnowledgeExtractionResult;
      log('INFO', 'Knowledge extracted', {
        entityCount: result.entities.length,
        relationshipCount: result.relationships.length,
      });
      return result;
    }
  } catch (e) {
    log('WARN', 'Failed to parse knowledge extraction result', { error: String(e) });
  }

  return {
    entities: [],
    relationships: [],
    summary: content,
  };
}

// =============================================================================
// Graph Operations
// =============================================================================

export async function createNode(entity: Entity): Promise<Node> {
  const client = createGraphClient();

  try {
    const cypher = `
      CREATE (n:${entity.type} {
        name: $name,
        description: $description
      })
      RETURN n
    `;

    const result = await client.query(cypher, {
      name: entity.name,
      description: entity.description || '',
      ...entity.properties,
    });

    log('INFO', 'Node created', { name: entity.name, type: entity.type });

    return result.nodes[0] || {
      id: `node-${Date.now()}`,
      labels: [entity.type],
      properties: { name: entity.name },
    };
  } finally {
    await client.close();
  }
}

export async function createRelationship(rel: Relationship): Promise<Edge> {
  const client = createGraphClient();

  try {
    const cypher = `
      MATCH (a {name: $from}), (b {name: $to})
      CREATE (a)-[r:${rel.type}]->(b)
      RETURN r
    `;

    const result = await client.query(cypher, {
      from: rel.from,
      to: rel.to,
      ...rel.properties,
    });

    log('INFO', 'Relationship created', { from: rel.from, to: rel.to, type: rel.type });

    return result.edges[0] || {
      id: `edge-${Date.now()}`,
      type: rel.type,
      startNodeId: rel.from,
      endNodeId: rel.to,
      properties: rel.properties || {},
    };
  } finally {
    await client.close();
  }
}

export async function searchGraph(params: GraphSearchParams): Promise<GraphQueryResult> {
  const { query, maxDepth = 2, nodeTypes, limit = 50 } = params;
  const client = createGraphClient();

  try {
    let cypher: string;

    if (nodeTypes && nodeTypes.length > 0) {
      const labels = nodeTypes.join('|');
      cypher = `
        MATCH path = (n:${labels})-[*0..${maxDepth}]-(m)
        WHERE n.name CONTAINS $query OR n.description CONTAINS $query
        RETURN path
        LIMIT ${limit}
      `;
    } else {
      cypher = `
        MATCH path = (n)-[*0..${maxDepth}]-(m)
        WHERE n.name CONTAINS $query OR n.description CONTAINS $query
        RETURN path
        LIMIT ${limit}
      `;
    }

    const result = await client.query(cypher, { query });

    log('INFO', 'Graph search completed', {
      query,
      nodeCount: result.metadata.nodeCount,
      edgeCount: result.metadata.edgeCount,
    });

    return result;
  } finally {
    await client.close();
  }
}

export async function getNeighbors(nodeId: string, depth: number = 1): Promise<GraphQueryResult> {
  const client = createGraphClient();

  try {
    const cypher = `
      MATCH path = (n)-[*1..${depth}]-(m)
      WHERE id(n) = $nodeId
      RETURN path
    `;

    const result = await client.query(cypher, { nodeId });

    log('INFO', 'Neighbors retrieved', { nodeId, depth });

    return result;
  } finally {
    await client.close();
  }
}

// =============================================================================
// Knowledge Graph Pipeline
// =============================================================================

export async function ingestDocument(text: string, source?: string): Promise<{
  extraction: KnowledgeExtractionResult;
  nodes: Node[];
  edges: Edge[];
}> {
  log('INFO', 'Ingesting document into knowledge graph', { source });

  // 1. Extract knowledge
  const extraction = await extractKnowledge(text);

  // 2. Create nodes
  const nodes: Node[] = [];
  for (const entity of extraction.entities) {
    const node = await createNode(entity);
    nodes.push(node);
  }

  // 3. Create relationships
  const edges: Edge[] = [];
  for (const rel of extraction.relationships) {
    const edge = await createRelationship(rel);
    edges.push(edge);
  }

  log('INFO', 'Document ingested', {
    source,
    nodeCount: nodes.length,
    edgeCount: edges.length,
  });

  return { extraction, nodes, edges };
}

// =============================================================================
// Tool Functions (Strands @tool pattern)
// =============================================================================

export function getGraphTools() {
  return {
    extract_knowledge: {
      description: 'Extract entities and relationships from text',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to extract knowledge from' },
        },
        required: ['text'],
      },
      handler: async (params: { text: string }) => {
        return extractKnowledge(params.text);
      },
    },
    search_graph: {
      description: 'Search the knowledge graph for related information',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          maxDepth: { type: 'number', description: 'Maximum traversal depth' },
          nodeTypes: {
            type: 'array',
            items: { type: 'string' },
            description: 'Node types to filter',
          },
          limit: { type: 'number', description: 'Maximum results' },
        },
        required: ['query'],
      },
      handler: async (params: GraphSearchParams) => {
        return searchGraph(params);
      },
    },
    ingest_document: {
      description: 'Ingest a document into the knowledge graph',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Document text' },
          source: { type: 'string', description: 'Source identifier' },
        },
        required: ['text'],
      },
      handler: async (params: { text: string; source?: string }) => {
        return ingestDocument(params.text, params.source);
      },
    },
    get_neighbors: {
      description: 'Get neighboring nodes in the graph',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: 'Node ID to get neighbors for' },
          depth: { type: 'number', description: 'Traversal depth (default: 1)' },
        },
        required: ['nodeId'],
      },
      handler: async (params: { nodeId: string; depth?: number }) => {
        return getNeighbors(params.nodeId, params.depth);
      },
    },
  };
}

export default {
  extractKnowledge,
  createNode,
  createRelationship,
  searchGraph,
  getNeighbors,
  ingestDocument,
  getGraphTools,
};
