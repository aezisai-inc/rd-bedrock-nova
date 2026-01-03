/**
 * DIコンテナ
 * 
 * Clean Architecture: 依存性注入
 * 
 * アプリケーション起動時にアダプターを登録
 * Feature層はポート経由でアクセス
 */
import type { AuthPort } from '../api/ports/auth-port';
import type { ApiPort } from '../api/ports/api-port';
import type { StoragePort } from '../api/ports/storage-port';

// Amplifyアダプター（遅延ロード）
import { getAuthAdapter } from './auth/amplify-auth-adapter';
import { getApiAdapter } from './api/amplify-graphql-adapter';
import { getStorageAdapter } from './storage/amplify-storage-adapter';

/**
 * サービスコンテナ
 * 
 * Feature層はこのコンテナ経由でインフラ層にアクセス
 * テスト時はモックに差し替え可能
 */
class Container {
  private _authAdapter: AuthPort | null = null;
  private _apiAdapter: ApiPort | null = null;
  private _storageAdapter: StoragePort | null = null;

  /**
   * 認証アダプター
   */
  get auth(): AuthPort {
    if (!this._authAdapter) {
      this._authAdapter = getAuthAdapter();
    }
    return this._authAdapter;
  }

  /**
   * APIアダプター
   */
  get api(): ApiPort {
    if (!this._apiAdapter) {
      this._apiAdapter = getApiAdapter();
    }
    return this._apiAdapter;
  }

  /**
   * ストレージアダプター
   */
  get storage(): StoragePort {
    if (!this._storageAdapter) {
      this._storageAdapter = getStorageAdapter();
    }
    return this._storageAdapter;
  }

  /**
   * テスト用: 認証アダプターを差し替え
   */
  setAuthAdapter(adapter: AuthPort): void {
    this._authAdapter = adapter;
  }

  /**
   * テスト用: APIアダプターを差し替え
   */
  setApiAdapter(adapter: ApiPort): void {
    this._apiAdapter = adapter;
  }

  /**
   * テスト用: ストレージアダプターを差し替え
   */
  setStorageAdapter(adapter: StoragePort): void {
    this._storageAdapter = adapter;
  }

  /**
   * テスト用: リセット
   */
  reset(): void {
    this._authAdapter = null;
    this._apiAdapter = null;
    this._storageAdapter = null;
  }
}

// グローバルコンテナインスタンス
export const container = new Container();
