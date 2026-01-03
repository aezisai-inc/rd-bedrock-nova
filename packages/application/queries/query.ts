/**
 * Query 基底クラス
 * 
 * CQRS: 読み取り操作の抽象化
 */

export abstract class Query<TResult> {
  public readonly queryId: string;
  public readonly queryType: string;

  constructor() {
    this.queryId = crypto.randomUUID();
    this.queryType = this.constructor.name;
  }

  // TypeScript用の型ヒント
  readonly _resultType!: TResult;
}

/**
 * Query Handler インターフェース
 */
export interface QueryHandler<TQuery extends Query<TResult>, TResult> {
  execute(query: TQuery): Promise<TResult>;
}

/**
 * Query Bus インターフェース
 */
export interface QueryBus {
  execute<TResult>(query: Query<TResult>): Promise<TResult>;
  register<TQuery extends Query<TResult>, TResult>(
    queryType: string,
    handler: QueryHandler<TQuery, TResult>
  ): void;
}
