/**
 * File Service
 * 
 * 12 Agent Factor マイクロサービス
 * 
 * 責務:
 * - ファイルアップロード
 * - Presigned URL生成
 * - ファイルメタデータ管理
 * 
 * Factor準拠:
 * - #4 Backing services: S3
 * - #7 Port binding: HTTP API
 * - #9 Disposability: 高速起動/停止
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface FileServiceConfig {
  bucketName: string;
  region?: string;
  uploadUrlExpiry?: number;  // 秒
  downloadUrlExpiry?: number;
}

export interface UploadUrlResult {
  uploadUrl: string;
  s3Key: string;
  expiresAt: Date;
}

export interface DownloadUrlResult {
  downloadUrl: string;
  expiresAt: Date;
}

/**
 * File Service
 */
export class FileService {
  private readonly client: S3Client;
  private readonly bucketName: string;
  private readonly uploadUrlExpiry: number;
  private readonly downloadUrlExpiry: number;

  constructor(config: FileServiceConfig) {
    this.bucketName = config.bucketName;
    this.uploadUrlExpiry = config.uploadUrlExpiry ?? 3600; // 1時間
    this.downloadUrlExpiry = config.downloadUrlExpiry ?? 3600;
    
    this.client = new S3Client({
      region: config.region ?? process.env.AWS_REGION ?? 'ap-northeast-1',
    });
  }

  /**
   * アップロードURL生成
   */
  async generateUploadUrl(
    fileName: string,
    contentType: string,
    userId: string
  ): Promise<UploadUrlResult> {
    const timestamp = Date.now();
    const s3Key = `uploads/${userId}/${timestamp}-${fileName}`;

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: s3Key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(this.client, command, {
      expiresIn: this.uploadUrlExpiry,
    });

    return {
      uploadUrl,
      s3Key,
      expiresAt: new Date(Date.now() + this.uploadUrlExpiry * 1000),
    };
  }

  /**
   * ダウンロードURL生成
   */
  async generateDownloadUrl(s3Key: string): Promise<DownloadUrlResult> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: s3Key,
    });

    const downloadUrl = await getSignedUrl(this.client, command, {
      expiresIn: this.downloadUrlExpiry,
    });

    return {
      downloadUrl,
      expiresAt: new Date(Date.now() + this.downloadUrlExpiry * 1000),
    };
  }

  /**
   * ファイル削除
   */
  async deleteFile(s3Key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
      })
    );
  }

  /**
   * ファイル取得（バイナリ）
   */
  async getFileContent(s3Key: string): Promise<Uint8Array> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
      })
    );

    if (!response.Body) {
      throw new Error(`File not found: ${s3Key}`);
    }

    // @ts-expect-error SDK streaming type
    return response.Body.transformToByteArray();
  }
}
