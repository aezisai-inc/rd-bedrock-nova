"""
Audio Service - Nova Sonic Integration

ECS Fargate デプロイ
- 音声ファイルのアップロード・管理
- Nova Sonic による文字起こし
- 感情分析・話者識別
- EventBridge へのイベント発行
"""
from fastapi import FastAPI, UploadFile, File, HTTPException, status
from pydantic import BaseModel, Field
from typing import Dict, Any, List, Optional
from datetime import datetime
import logging
import uuid
import os
import json
import base64
import boto3

logger = logging.getLogger(__name__)

# Environment
CONTENT_BUCKET = os.environ.get('CONTENT_BUCKET', 'nova-content-bucket')
EVENT_STORE_TABLE = os.environ.get('EVENT_STORE_TABLE', 'nova-event-store')
EVENT_BUS_NAME = os.environ.get('EVENT_BUS_NAME', 'nova-events')
NOVA_SONIC_MODEL_ID = os.environ.get('NOVA_SONIC_MODEL_ID', 'amazon.nova-sonic-v1')
AWS_REGION = os.environ.get('AWS_REGION', 'ap-northeast-1')

# Clients
s3_client = boto3.client('s3', region_name=AWS_REGION)
bedrock_client = boto3.client('bedrock-runtime', region_name=AWS_REGION)
dynamodb_client = boto3.client('dynamodb', region_name=AWS_REGION)
events_client = boto3.client('events', region_name=AWS_REGION)


app = FastAPI(
    title="Nova Audio Service",
    version="0.1.0",
    description="音声処理サービス - Bedrock Nova Sonic を使用した文字起こし",
)


# === DTOs ===
class AudioUploadResponse(BaseModel):
    """音声アップロードレスポンス"""
    audio_id: str
    s3_url: str
    file_name: str
    content_type: str
    size_bytes: int
    message: str


class TranscribeRequest(BaseModel):
    """文字起こしリクエスト (Agent Core から呼び出される)"""
    audio_url: str = Field(..., description="S3上の音声ファイルURL")
    language: str = Field(default="ja-JP", description="言語コード")
    enable_speaker_diarization: bool = Field(default=True, description="話者識別を有効化")
    enable_sentiment_analysis: bool = Field(default=True, description="感情分析を有効化")


class TranscriptSegment(BaseModel):
    """文字起こしセグメント"""
    start_time: float
    end_time: float
    text: str
    speaker: Optional[str] = None
    confidence: float


class SentimentResult(BaseModel):
    """感情分析結果"""
    sentiment: str  # POSITIVE, NEGATIVE, NEUTRAL, MIXED
    confidence: float
    emotions: Dict[str, float] = {}


class TranscribeResponse(BaseModel):
    """文字起こしレスポンス"""
    transcription: str
    segments: List[TranscriptSegment] = []
    sentiment: Optional[SentimentResult] = None
    duration_seconds: float
    status: str


class AudioDetailResponse(BaseModel):
    """音声詳細レスポンス"""
    audio_id: str
    s3_url: str
    file_name: str
    content_type: str
    size_bytes: int
    duration_seconds: Optional[float] = None
    created_at: str
    transcriptions: List[Dict[str, Any]] = []


# === Event Store Functions ===
async def save_event(event_type: str, aggregate_id: str, data: Dict):
    """イベントをEvent Storeに保存"""
    event_id = str(uuid.uuid4())
    timestamp = datetime.utcnow().isoformat()

    dynamodb_client.put_item(
        TableName=EVENT_STORE_TABLE,
        Item={
            'pk': {'S': f"AUDIO#{aggregate_id}"},
            'sk': {'S': f"EVENT#{timestamp}#{event_id}"},
            'EventType': {'S': event_type},
            'EventData': {'S': json.dumps({
                **data,
                'aggregate_id': aggregate_id,
                'timestamp': timestamp,
            })},
            'gsi1pk': {'S': f"EVENT_TYPE#{event_type}"},
            'gsi1sk': {'S': timestamp},
        }
    )


async def publish_event(detail_type: str, detail: Dict):
    """EventBridge にイベントを発行"""
    events_client.put_events(
        Entries=[{
            'Source': 'nova.audio-service',
            'DetailType': detail_type,
            'Detail': json.dumps(detail),
            'EventBusName': EVENT_BUS_NAME,
        }]
    )


# === S3 Helper Functions ===
def parse_s3_url(s3_url: str) -> tuple:
    """S3 URL をパース"""
    # s3://bucket/key または https://bucket.s3.region.amazonaws.com/key
    if s3_url.startswith('s3://'):
        parts = s3_url[5:].split('/', 1)
        return parts[0], parts[1] if len(parts) > 1 else ''
    raise ValueError(f"Invalid S3 URL format: {s3_url}")


# === API Endpoints ===
@app.post("/audio", response_model=AudioUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_audio(
    file: UploadFile = File(..., description="アップロードするオーディオファイル"),
):
    """
    音声ファイルをS3にアップロードします。
    """
    if not file.content_type or not file.content_type.startswith("audio/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file type. Only audio files are allowed."
        )

    audio_id = str(uuid.uuid4())
    file_content = await file.read()
    file_name = file.filename or "untitled_audio"
    s3_key = f"audio/{audio_id}/{file_name}"

    # S3 にアップロード
    s3_client.put_object(
        Bucket=CONTENT_BUCKET,
        Key=s3_key,
        Body=file_content,
        ContentType=file.content_type,
    )

    s3_url = f"s3://{CONTENT_BUCKET}/{s3_key}"

    # Event Store に保存
    await save_event("AudioUploaded", audio_id, {
        "s3_key": s3_key,
        "file_name": file_name,
        "content_type": file.content_type,
        "size_bytes": len(file_content),
    })

    # EventBridge にイベント発行
    await publish_event("AudioUploaded", {
        "audio_id": audio_id,
        "s3_key": s3_key,
        "file_name": file_name,
    })

    logger.info(f"Audio file uploaded: {audio_id} -> {s3_url}")

    return AudioUploadResponse(
        audio_id=audio_id,
        s3_url=s3_url,
        file_name=file_name,
        content_type=file.content_type,
        size_bytes=len(file_content),
        message="Audio uploaded successfully.",
    )


@app.post("/transcribe", response_model=TranscribeResponse)
async def transcribe_audio(request: TranscribeRequest):
    """
    Nova Sonic で音声を文字起こし。
    Agent Core Service から呼び出される。
    """
    transcription_id = str(uuid.uuid4())

    try:
        # S3から音声データをダウンロード
        bucket, key = parse_s3_url(request.audio_url)
        response = s3_client.get_object(Bucket=bucket, Key=key)
        audio_data = response['Body'].read()

        # Nova Sonic で文字起こし
        # 注: 実際のAPIは Nova モデルの仕様に依存
        bedrock_response = bedrock_client.invoke_model(
            modelId=NOVA_SONIC_MODEL_ID,
            contentType='application/json',
            body=json.dumps({
                'audio': base64.b64encode(audio_data).decode('utf-8'),
                'languageCode': request.language,
                'enableSpeakerDiarization': request.enable_speaker_diarization,
                'enableSentimentAnalysis': request.enable_sentiment_analysis,
            }),
        )

        result = json.loads(bedrock_response['body'].read())

        # レスポンスをパース (Nova Sonic の実際の応答形式に合わせる)
        transcription = result.get('transcription', '')
        segments = [
            TranscriptSegment(
                start_time=seg.get('startTime', 0),
                end_time=seg.get('endTime', 0),
                text=seg.get('text', ''),
                speaker=seg.get('speaker'),
                confidence=seg.get('confidence', 0.0),
            )
            for seg in result.get('segments', [])
        ]

        sentiment = None
        if result.get('sentiment'):
            sentiment = SentimentResult(
                sentiment=result['sentiment'].get('label', 'NEUTRAL'),
                confidence=result['sentiment'].get('score', 0.0),
                emotions=result['sentiment'].get('emotions', {}),
            )

        duration_seconds = result.get('durationSeconds', 0.0)

        # Event Store に保存
        audio_id = key.split('/')[1] if '/' in key else transcription_id
        await save_event("AudioTranscribed", audio_id, {
            "transcription_id": transcription_id,
            "audio_url": request.audio_url,
            "transcription": transcription,
            "duration_seconds": duration_seconds,
            "status": "COMPLETED",
        })

        # EventBridge にイベント発行
        await publish_event("TranscriptionCompleted", {
            "audio_url": request.audio_url,
            "transcription_id": transcription_id,
            "transcript": transcription,
        })

        logger.info(f"Transcription completed: {transcription_id}")

        return TranscribeResponse(
            transcription=transcription,
            segments=segments,
            sentiment=sentiment,
            duration_seconds=duration_seconds,
            status="COMPLETED",
        )

    except s3_client.exceptions.NoSuchKey:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Audio file not found: {request.audio_url}",
        )
    except Exception as e:
        logger.error(f"Transcription failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Transcription failed: {str(e)}",
        )


@app.get("/audio/{audio_id}", response_model=AudioDetailResponse)
async def get_audio_detail(audio_id: str):
    """
    音声ファイルの詳細を取得します。
    """
    # Event Store から履歴を取得
    response = dynamodb_client.query(
        TableName=EVENT_STORE_TABLE,
        KeyConditionExpression='pk = :pk',
        ExpressionAttributeValues={
            ':pk': {'S': f"AUDIO#{audio_id}"},
        },
        ScanIndexForward=True,
    )

    events = response.get('Items', [])
    if not events:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Audio file not found: {audio_id}",
        )

    # イベントからステートを再構築
    audio_data = {}
    transcriptions = []

    for item in events:
        event_type = item['EventType']['S']
        event_data = json.loads(item['EventData']['S'])

        if event_type == 'AudioUploaded':
            audio_data = {
                'audio_id': audio_id,
                's3_url': f"s3://{CONTENT_BUCKET}/{event_data['s3_key']}",
                'file_name': event_data['file_name'],
                'content_type': event_data['content_type'],
                'size_bytes': event_data['size_bytes'],
                'created_at': event_data['timestamp'],
            }
        elif event_type == 'AudioTranscribed':
            transcriptions.append({
                'transcription_id': event_data['transcription_id'],
                'transcription': event_data['transcription'],
                'duration_seconds': event_data.get('duration_seconds'),
                'status': event_data['status'],
                'created_at': event_data['timestamp'],
            })

    return AudioDetailResponse(
        **audio_data,
        transcriptions=transcriptions,
    )


@app.get("/audio/{audio_id}/transcript", response_model=Dict[str, Any])
async def get_audio_transcript(audio_id: str):
    """
    最新の文字起こし結果を取得します。
    """
    detail = await get_audio_detail(audio_id)

    if not detail.transcriptions:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No transcription found for this audio.",
        )

    return detail.transcriptions[-1]


@app.get("/health", response_model=Dict[str, str])
async def health_check():
    """
    Audio Service のヘルスチェックエンドポイント。
    """
    return {
        "status": "ok",
        "service": "audio-service",
        "message": "Audio service is healthy",
    }
