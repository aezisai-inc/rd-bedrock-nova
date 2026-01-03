/**
 * ストレージポート（インターフェース）
 * 
 * Clean Architecture: ファイルストレージの抽象化
 */

export interface UploadProgress {
  loaded: number;
  total: number;
}

export interface UploadResult {
  key: string;
  url: string;
}

export interface FileItem {
  key: string;
  size?: number;
  lastModified?: Date;
}

export interface UploadOptions {
  contentType?: string;
  onProgress?: (progress: UploadProgress) => void;
}

/**
 * ストレージポート
 */
export interface StoragePort {
  /**
   * ファイルをアップロード
   */
  upload(key: string, file: File, options?: UploadOptions): Promise<UploadResult>;

  /**
   * ファイルURLを取得
   */
  getUrl(key: string, expiresIn?: number): Promise<string>;

  /**
   * ファイルを削除
   */
  delete(key: string): Promise<void>;

  /**
   * ファイル一覧を取得
   */
  list(prefix?: string): Promise<FileItem[]>;
}
