import { Entity } from './entity';
import { ValueObject } from './value-object';
import { DomainEvent } from './domain-event';

/**
 * 集約ルート基底クラス
 * 
 * イベントソーシングパターンを実装
 * - イベントの適用と記録
 * - バージョン管理
 * - イベントからの状態再構築
 */
export abstract class AggregateRoot<TId extends ValueObject<unknown>> extends Entity<TId> {
  private _version: number = 0;
  private _uncommittedEvents: DomainEvent[] = [];

  protected constructor(id: TId) {
    super(id);
  }

  /**
   * 現在のバージョン
   */
  get version(): number {
    return this._version;
  }

  /**
   * 未コミットのイベント一覧
   */
  get uncommittedEvents(): readonly DomainEvent[] {
    return [...this._uncommittedEvents];
  }

  /**
   * イベントを適用して状態を変更
   * 内部的にイベントを記録
   */
  protected apply(event: DomainEvent): void {
    this.when(event);
    this._uncommittedEvents.push(event);
    this._version++;
  }

  /**
   * イベントに基づいて状態を変更
   * 子クラスで実装必須
   */
  protected abstract when(event: DomainEvent): void;

  /**
   * イベント履歴から状態を再構築
   */
  loadFromHistory(events: DomainEvent[]): void {
    for (const event of events) {
      this.when(event);
      this._version++;
    }
  }

  /**
   * 未コミットイベントをクリア
   * リポジトリで保存後に呼び出し
   */
  clearUncommittedEvents(): void {
    this._uncommittedEvents = [];
  }
}
