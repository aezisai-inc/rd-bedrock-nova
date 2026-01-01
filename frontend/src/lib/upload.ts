/**
 * File Upload Utilities
 * 
 * S3 presigned URL を使用したファイルアップロード機能
 */

import { getAgUiEndpoint } from './config'

export interface PresignedUrlResponse {
  uploadUrl: string
  fileUrl: string
  expiresIn: number
}

export interface UploadProgress {
  loaded: number
  total: number
  percentage: number
}

/**
 * S3 presigned URL を取得
 */
export async function getPresignedUrl(
  fileName: string,
  contentType: string,
  fileSize: number,
): Promise<PresignedUrlResponse> {
  const endpoint = getAgUiEndpoint()
  if (!endpoint) {
    throw new Error('エンドポイントが設定されていません。設定画面で Lambda URL を入力してください。')
  }
  
  // Lambda Function URL に presigned URL リクエストを送信
  const response = await fetch(`${endpoint}/presign`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fileName,
      contentType,
      fileSize,
    }),
  })
  
  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Presigned URL 取得失敗: ${error}`)
  }
  
  return response.json()
}

/**
 * ファイルを S3 にアップロード
 */
export async function uploadFileToS3(
  file: File,
  presignedUrl: string,
  onProgress?: (progress: UploadProgress) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress({
          loaded: event.loaded,
          total: event.total,
          percentage: Math.round((event.loaded / event.total) * 100),
        })
      }
    })
    
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve()
      } else {
        reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`))
      }
    })
    
    xhr.addEventListener('error', () => {
      reject(new Error('Network error during upload'))
    })
    
    xhr.addEventListener('abort', () => {
      reject(new Error('Upload aborted'))
    })
    
    xhr.open('PUT', presignedUrl)
    xhr.setRequestHeader('Content-Type', file.type)
    xhr.send(file)
  })
}

/**
 * ファイルをアップロードし、S3 URL を取得
 */
export async function uploadFile(
  file: File,
  onProgress?: (progress: UploadProgress) => void,
): Promise<string> {
  // 1. Presigned URL を取得
  const { uploadUrl, fileUrl } = await getPresignedUrl(
    file.name,
    file.type,
    file.size,
  )
  
  // 2. S3 にアップロード
  await uploadFileToS3(file, uploadUrl, onProgress)
  
  // 3. ファイル URL を返す
  return fileUrl
}

/**
 * ローカルファイルを Data URL として読み込む（プレビュー用）
 */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

/**
 * ファイルサイズを人間が読める形式に変換
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

/**
 * ファイル拡張子からMIMEタイプを推定
 */
export function getMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase()
  
  const mimeTypes: Record<string, string> = {
    // Audio
    wav: 'audio/wav',
    mp3: 'audio/mpeg',
    flac: 'audio/flac',
    m4a: 'audio/mp4',
    ogg: 'audio/ogg',
    // Video
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    avi: 'video/x-msvideo',
    webm: 'video/webm',
    // Image
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    // Document
    pdf: 'application/pdf',
    txt: 'text/plain',
    md: 'text/markdown',
    json: 'application/json',
    csv: 'text/csv',
  }
  
  return mimeTypes[ext || ''] || 'application/octet-stream'
}

