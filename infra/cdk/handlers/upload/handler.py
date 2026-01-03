"""
S3 Presigned URL Handler

ファイルアップロード用の S3 presigned URL を生成する Lambda ハンドラ。
フロントエンドから直接 S3 にアップロードするためのセキュアな URL を提供。

機能:
- PUT 用 presigned URL 生成 (アップロード)
- GET 用 presigned URL 生成 (ダウンロード)
- ファイルタイプ・サイズ検証
- CORS 対応
"""
import os
import json
import uuid
import logging
from datetime import datetime
from typing import Any
from urllib.parse import quote

import boto3
from botocore.exceptions import ClientError
from botocore.config import Config

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# 環境変数
CONTENT_BUCKET = os.environ.get('CONTENT_BUCKET', 'nova-content-bucket')
URL_EXPIRATION = int(os.environ.get('PRESIGNED_URL_EXPIRATION', '3600'))  # 1時間
MAX_FILE_SIZE = int(os.environ.get('MAX_FILE_SIZE_MB', '100')) * 1024 * 1024  # MB to bytes

# 許可されるファイルタイプ
ALLOWED_CONTENT_TYPES = {
    # Audio
    'audio/wav': '.wav',
    'audio/mpeg': '.mp3',
    'audio/flac': '.flac',
    'audio/mp4': '.m4a',
    'audio/ogg': '.ogg',
    'audio/x-wav': '.wav',
    # Video
    'video/mp4': '.mp4',
    'video/quicktime': '.mov',
    'video/x-msvideo': '.avi',
    'video/webm': '.webm',
    # Image
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
    # Document
    'application/pdf': '.pdf',
    'text/plain': '.txt',
    'text/markdown': '.md',
    'application/json': '.json',
    'text/csv': '.csv',
}

# S3 クライアント設定
s3_config = Config(
    signature_version='s3v4',
    s3={'addressing_style': 'path'},
)
s3_client = boto3.client('s3', config=s3_config)


def create_response(status_code: int, body: dict, headers: dict = None) -> dict:
    """Lambda レスポンスを作成"""
    default_headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    }
    if headers:
        default_headers.update(headers)
    
    return {
        'statusCode': status_code,
        'headers': default_headers,
        'body': json.dumps(body, ensure_ascii=False),
    }


def validate_request(body: dict) -> tuple[bool, str]:
    """リクエストを検証"""
    # 必須フィールド
    if 'fileName' not in body:
        return False, 'fileName is required'
    if 'contentType' not in body:
        return False, 'contentType is required'
    
    # コンテンツタイプ検証
    content_type = body['contentType'].lower()
    if content_type not in ALLOWED_CONTENT_TYPES:
        return False, f'Unsupported content type: {content_type}'
    
    # ファイルサイズ検証
    file_size = body.get('fileSize', 0)
    if file_size > MAX_FILE_SIZE:
        return False, f'File size exceeds maximum ({MAX_FILE_SIZE // (1024 * 1024)}MB)'
    
    return True, ''


def generate_s3_key(file_name: str, content_type: str) -> str:
    """S3 キーを生成"""
    # ファイルタイプに基づくプレフィックス
    type_prefix = 'misc'
    if content_type.startswith('audio/'):
        type_prefix = 'audio'
    elif content_type.startswith('video/'):
        type_prefix = 'video'
    elif content_type.startswith('image/'):
        type_prefix = 'image'
    elif content_type in ['application/pdf', 'text/plain', 'text/markdown', 'application/json', 'text/csv']:
        type_prefix = 'documents'
    
    # 日付ベースのパーティション
    date_prefix = datetime.utcnow().strftime('%Y/%m/%d')
    
    # ユニークなファイル名を生成
    unique_id = str(uuid.uuid4())[:8]
    safe_name = quote(file_name, safe='')
    
    return f'uploads/{type_prefix}/{date_prefix}/{unique_id}_{safe_name}'


def generate_presigned_url_for_upload(
    file_name: str,
    content_type: str,
    file_size: int = 0,
) -> dict:
    """アップロード用 presigned URL を生成"""
    s3_key = generate_s3_key(file_name, content_type)
    
    try:
        # PUT 用 presigned URL
        upload_url = s3_client.generate_presigned_url(
            'put_object',
            Params={
                'Bucket': CONTENT_BUCKET,
                'Key': s3_key,
                'ContentType': content_type,
            },
            ExpiresIn=URL_EXPIRATION,
        )
        
        # ファイル URL (アップロード後のアクセス用)
        file_url = f's3://{CONTENT_BUCKET}/{s3_key}'
        
        return {
            'uploadUrl': upload_url,
            'fileUrl': file_url,
            's3Key': s3_key,
            'bucket': CONTENT_BUCKET,
            'expiresIn': URL_EXPIRATION,
        }
        
    except ClientError as e:
        logger.exception(f'Failed to generate presigned URL: {e}')
        raise


def generate_presigned_url_for_download(s3_key: str) -> str:
    """ダウンロード用 presigned URL を生成"""
    try:
        download_url = s3_client.generate_presigned_url(
            'get_object',
            Params={
                'Bucket': CONTENT_BUCKET,
                'Key': s3_key,
            },
            ExpiresIn=URL_EXPIRATION,
        )
        return download_url
        
    except ClientError as e:
        logger.exception(f'Failed to generate download URL: {e}')
        raise


def lambda_handler(event: dict, context: Any) -> dict:
    """
    Lambda ハンドラ
    
    POST /presign - アップロード用 presigned URL を生成
    GET /presign/{s3Key} - ダウンロード用 presigned URL を生成
    """
    logger.info(f'Received event: {json.dumps(event)}')
    
    # HTTP メソッドを取得
    http_method = event.get('httpMethod') or event.get('requestContext', {}).get('http', {}).get('method', 'POST')
    path = event.get('path') or event.get('rawPath', '/presign')
    
    # CORS preflight
    if http_method == 'OPTIONS':
        return create_response(200, {'message': 'OK'})
    
    try:
        if http_method == 'POST':
            # リクエストボディを解析
            body = event.get('body', '{}')
            if isinstance(body, str):
                body = json.loads(body)
            
            # バリデーション
            is_valid, error_message = validate_request(body)
            if not is_valid:
                return create_response(400, {'error': error_message})
            
            # Presigned URL 生成
            result = generate_presigned_url_for_upload(
                file_name=body['fileName'],
                content_type=body['contentType'],
                file_size=body.get('fileSize', 0),
            )
            
            logger.info(f'Generated presigned URL for: {body["fileName"]}')
            return create_response(200, result)
            
        elif http_method == 'GET':
            # S3 キーをパスから取得
            s3_key = path.replace('/presign/', '').replace('/download/', '')
            
            if not s3_key:
                return create_response(400, {'error': 's3Key is required'})
            
            download_url = generate_presigned_url_for_download(s3_key)
            
            return create_response(200, {
                'downloadUrl': download_url,
                'expiresIn': URL_EXPIRATION,
            })
            
        else:
            return create_response(405, {'error': f'Method not allowed: {http_method}'})
            
    except json.JSONDecodeError as e:
        logger.error(f'Invalid JSON: {e}')
        return create_response(400, {'error': 'Invalid JSON body'})
        
    except Exception as e:
        logger.exception(f'Internal error: {e}')
        return create_response(500, {'error': 'Internal server error'})


# ローカルテスト用
if __name__ == '__main__':
    # テストイベント
    test_event = {
        'httpMethod': 'POST',
        'body': json.dumps({
            'fileName': 'test_audio.wav',
            'contentType': 'audio/wav',
            'fileSize': 1024 * 1024,  # 1MB
        }),
    }
    
    result = lambda_handler(test_event, None)
    print(json.dumps(result, indent=2))

