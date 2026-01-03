/**
 * 値オブジェクト基底クラス
 * 
 * 特徴:
 * - 不変（イミュータブル）
 * - 構造的等価性（同じ属性値なら同一）
 * - 副作用なし
 */
export abstract class ValueObject<T extends Record<string, unknown>> {
  protected readonly props: Readonly<T>;

  protected constructor(props: T) {
    this.props = Object.freeze(props);
  }

  /**
   * 構造的等価性の比較
   */
  equals(other: ValueObject<T> | null | undefined): boolean {
    if (other === null || other === undefined) {
      return false;
    }
    if (other.constructor !== this.constructor) {
      return false;
    }
    return JSON.stringify(this.props) === JSON.stringify(other.props);
  }

  /**
   * プロパティのコピーを取得
   */
  protected getProps(): T {
    return { ...this.props };
  }

  /**
   * JSON表現
   */
  toJSON(): T {
    return this.getProps();
  }
}
