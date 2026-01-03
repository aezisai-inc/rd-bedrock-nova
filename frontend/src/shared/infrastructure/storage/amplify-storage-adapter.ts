/**
 * Amplify Storageアダプター
 * 
 * Clean Architecture: Infrastructure層
 * StoragePortインターフェースをAmplify Storageで実装
 */
import { uploadData, getUrl, remove, list } from 'aws-amplify/storage';
import type {
  StoragePort,
  UploadResult,
  FileItem,
  UploadOptions,
} from '../../api/ports/storage-port';

/**
 * Amplify Storageアダプター
 */
export class AmplifyStorageAdapter implements StoragePort {
  async upload(key: string, file: File, options?: UploadOptions): Promise<UploadResult> {
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

    const urlResult = await getUrl({ key: result.key });

    return {
      key: result.key,
      url: urlResult.url.toString(),
    };
  }

  async getUrl(key: string, expiresIn = 3600): Promise<string> {
    const result = await getUrl({
      key,
      options: { expiresIn },
    });
    return result.url.toString();
  }

  async delete(key: string): Promise<void> {
    await remove({ key });
  }

  async list(prefix?: string): Promise<FileItem[]> {
    const result = await list({
      prefix: prefix ?? '',
      options: { listAll: true },
    });

    return result.items.map((item) => ({
      key: item.key,
      size: item.size,
      lastModified: item.lastModified,
    }));
  }
}

// シングルトンインスタンス
let instance: AmplifyStorageAdapter | null = null;

export function getStorageAdapter(): StoragePort {
  if (!instance) {
    instance = new AmplifyStorageAdapter();
  }
  return instance;
}
