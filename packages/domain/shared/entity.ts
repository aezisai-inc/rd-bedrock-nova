import { ValueObject } from './value-object';

/**
 * エンティティ基底クラス
 * 
 * 特徴:
 * - 一意の識別子（ID）を持つ
 * - 同一性はIDで判定
 * - ライフサイクルを持つ
 */
export abstract class Entity<TId extends ValueObject<unknown>> {
  protected readonly _id: TId;

  protected constructor(id: TId) {
    this._id = id;
  }

  get id(): TId {
    return this._id;
  }

  /**
   * 同一性の比較（IDベース）
   */
  equals(other: Entity<TId> | null | undefined): boolean {
    if (other === null || other === undefined) {
      return false;
    }
    if (other.constructor !== this.constructor) {
      return false;
    }
    return this._id.equals(other._id);
  }
}
