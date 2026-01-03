/**
 * Command 基底クラス
 * 
 * CQRS: 書き込み操作の抽象化
 */

export interface CommandMetadata {
  correlationId: string;
  causationId?: string;
  userId?: string;
  timestamp: Date;
  traceId?: string;  // AgentCore Observability連携
}

export abstract class Command<TPayload = unknown> {
  public readonly commandId: string;
  public readonly commandType: string;
  public readonly payload: TPayload;
  public readonly metadata: CommandMetadata;

  constructor(
    payload: TPayload,
    metadata?: Partial<CommandMetadata>
  ) {
    this.commandId = crypto.randomUUID();
    this.commandType = this.constructor.name;
    this.payload = payload;
    this.metadata = {
      correlationId: metadata?.correlationId ?? this.commandId,
      causationId: metadata?.causationId,
      userId: metadata?.userId,
      timestamp: metadata?.timestamp ?? new Date(),
      traceId: metadata?.traceId,
    };
  }
}

/**
 * Command Handler インターフェース
 */
export interface CommandHandler<TCommand extends Command, TResult = void> {
  execute(command: TCommand): Promise<TResult>;
}

/**
 * Command Bus インターフェース
 */
export interface CommandBus {
  dispatch<TResult>(command: Command): Promise<TResult>;
  register<TCommand extends Command>(
    commandType: string,
    handler: CommandHandler<TCommand>
  ): void;
}
