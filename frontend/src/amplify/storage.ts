/**
 * Amplify Storage
 * 
 * S3ファイルストレージとの通信レイヤー
 */
import { uploadData, getUrl, remove, list } from 'aws-amplify/storage';

export interface UploadResult {
  key: string;
  url: string;
}

export interface FileItem {
  key: string;
  size?: number;
  lastModified?: Date;
}

/**
 * ファイルをアップロード
 */
export async function uploadFile(
  key: string,
  file: File,
  options?: {
    contentType?: string;
    onProgress?: (progress: { loaded: number; total: number }) => void;
  }
): Promise<UploadResult> {
  const result = await uploadData({
    key,
    data: file,
    options: {
      contentType: options?.contentType ?? file.type,
      onProgress: options?.onProgress
        ? ({ transferredBytes, totalBytes }) => {
            options.onProgress!({
              loaded: transferredBytes,
              total: totalBytes ?? file.size,
            });
          }
        : undefined,
    },
  }).result;

  // アップロード後のURLを取得
  const urlResult = await getUrl({ key: result.key });
  
  return {
    key: result.key,
    url: urlResult.url.toString(),
  };
}

/**
 * ファイルURLを取得
 */
export async function getFileUrl(key: string, expiresIn?: number): Promise<string> {
  const result = await getUrl({
    key,
    options: {
      expiresIn: expiresIn ?? 3600, // デフォルト1時間
    },
  });
  return result.url.toString();
}

/**
 * ファイルを削除
 */
export async function deleteFile(key: string): Promise<void> {
  await remove({ key });
}

/**
 * ファイル一覧を取得
 */
export async function listFiles(prefix?: string): Promise<FileItem[]> {
  const result = await list({
    prefix: prefix ?? '',
    options: {
      listAll: true,
    },
  });

  return result.items.map((item) => ({
    key: item.key,
    size: item.size,
    lastModified: item.lastModified,
  }));
}

/**
 * アップロード用のユニークキーを生成
 */
export function generateUploadKey(fileName: string, prefix?: string): string {
  const timestamp = Date.now();
  const sanitizedName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
  const baseKey = `${timestamp}-${sanitizedName}`;
  
  return prefix ? `${prefix}/${baseKey}` : baseKey;
}
