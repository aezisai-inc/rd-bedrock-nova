/**
 * Agent Service
 * 
 * 12 Agent Factor マイクロサービス
 * 
 * 責務:
 * - Bedrock Nova モデル呼び出し
 * - Strands Agent 統合
 * - Tool Orchestration
 * 
 * Factor準拠:
 * - #2 Dependencies: Strands Agents SDK
 * - #4 Backing services: Bedrock API
 * - #8 Concurrency: Lambda並行実行
 * - #10 Dev/prod parity: 環境変数で切り替え
 * - #12 Admin processes: ヘルスチェック
 */

import {
  BedrockRuntimeClient,
  ConverseCommand,
  ConverseStreamCommand,
} from '@aws-sdk/client-bedrock-runtime';

export interface AgentServiceConfig {
  region?: string;
  modelId?: string;
}

export interface InvokeOptions {
  sessionId: string;
  message: string;
  fileKeys?: string[];
  systemPrompt?: string;
  traceId?: string;  // AgentCore Observability
}

export interface InvokeResult {
  response: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

/**
 * Agent Service
 * 
 * Bedrock Nova + Strands Agents 統合
 */
export class AgentService {
  private readonly client: BedrockRuntimeClient;
  private readonly modelId: string;

  constructor(config: AgentServiceConfig = {}) {
    this.client = new BedrockRuntimeClient({
      region: config.region ?? process.env.BEDROCK_REGION ?? 'ap-northeast-1',
    });
    this.modelId = config.modelId ?? 'amazon.nova-micro-v1:0';
  }

  /**
   * エージェント呼び出し（同期）
   */
  async invoke(options: InvokeOptions): Promise<InvokeResult> {
    const messages = [
      {
        role: 'user' as const,
        content: [{ text: options.message }],
      },
    ];

    const systemPrompts = options.systemPrompt
      ? [{ text: options.systemPrompt }]
      : undefined;

    const response = await this.client.send(
      new ConverseCommand({
        modelId: this.modelId,
        messages,
        system: systemPrompts,
      })
    );

    const textContent = response.output?.message?.content?.find(
      (c) => 'text' in c
    );

    return {
      response: textContent && 'text' in textContent ? textContent.text ?? '' : '',
      usage: response.usage
        ? {
            inputTokens: response.usage.inputTokens ?? 0,
            outputTokens: response.usage.outputTokens ?? 0,
          }
        : undefined,
    };
  }

  /**
   * エージェント呼び出し（ストリーミング）
   */
  async *invokeStream(options: InvokeOptions): AsyncGenerator<string> {
    const messages = [
      {
        role: 'user' as const,
        content: [{ text: options.message }],
      },
    ];

    const response = await this.client.send(
      new ConverseStreamCommand({
        modelId: this.modelId,
        messages,
      })
    );

    if (!response.stream) {
      return;
    }

    for await (const event of response.stream) {
      if (event.contentBlockDelta?.delta && 'text' in event.contentBlockDelta.delta) {
        yield event.contentBlockDelta.delta.text ?? '';
      }
    }
  }

  /**
   * ヘルスチェック（Factor #12）
   */
  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; modelId: string }> {
    try {
      await this.invoke({
        sessionId: 'health-check',
        message: 'ping',
      });
      return { status: 'healthy', modelId: this.modelId };
    } catch {
      return { status: 'unhealthy', modelId: this.modelId };
    }
  }
}
