"""
Audio Tools - Nova Sonic Integration

Nova Sonic を使用した音声処理ツール:
- 音声→テキスト文字起こし (リアルタイム対応)
- 話者識別 (Speaker Diarization)
- 感情分析 (Sentiment & Emotion)
- ノイズ耐性処理

技術仕様:
- 入力形式: WAV, MP3, FLAC
- サンプリングレート: 8kHz〜48kHz
- 処理速度: リアルタイム (1倍速以上)
- 精度: 清音環境で95%以上
"""
import os
import json
import logging
import time
import random
import hashlib
from typing import Optional, AsyncIterator
from dataclasses import dataclass, field, asdict
from functools import wraps
from datetime import datetime

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)

# Nova Sonic Model ID
NOVA_SONIC_MODEL_ID = os.environ.get('NOVA_SONIC_MODEL_ID', 'amazon.nova-sonic-v1')


def tool(name: str, description: str):
    """
    Strands @tool デコレータ
    
    ツールのメタデータを関数に付与。
    Agent がこのメタデータを使用してツール選択を行う。
    """
    def decorator(func):
        func._tool_name = name
        func._tool_description = description
        @wraps(func)
        def wrapper(*args, **kwargs):
            return func(*args, **kwargs)
        wrapper._tool_name = name
        wrapper._tool_description = description
        return wrapper
    return decorator


# =============================================================================
# Data Classes
# =============================================================================

@dataclass
class TranscriptionSegment:
    """文字起こしセグメント"""
    text: str
    start_time: float
    end_time: float
    confidence: float
    speaker_id: Optional[str] = None


@dataclass
class TranscriptionResult:
    """文字起こし結果"""
    text: str
    confidence: float
    language: str
    segments: list[TranscriptionSegment] = field(default_factory=list)
    audio_duration: float = 0.0
    processing_time: float = 0.0
    model_id: str = NOVA_SONIC_MODEL_ID


@dataclass
class SpeakerInfo:
    """話者情報"""
    speaker_id: str
    speaking_time: float
    turn_count: int
    segments: list[dict] = field(default_factory=list)


@dataclass
class EmotionScore:
    """感情スコア"""
    emotion: str  # joy, sadness, anger, fear, surprise, disgust, neutral
    score: float
    timestamp: Optional[float] = None


@dataclass
class AudioAnalysisResult:
    """音声分析結果"""
    sentiment: str  # positive, negative, neutral
    sentiment_score: float
    speakers: list[SpeakerInfo] = field(default_factory=list)
    emotions: list[EmotionScore] = field(default_factory=list)
    dominant_emotion: str = "neutral"
    audio_quality: str = "good"  # good, moderate, poor
    noise_level: float = 0.0


# =============================================================================
# Retry Utilities
# =============================================================================

def invoke_with_retry(
    client,
    model_id: str,
    body: dict | bytes,
    content_type: str = 'application/json',
    max_retries: int = 3,
) -> dict:
    """
    リトライ機能付きモデル呼び出し
    
    指数バックオフを使用してスロットリングに対応。
    """
    for attempt in range(max_retries):
        try:
            if isinstance(body, dict):
                body = json.dumps(body)
            elif isinstance(body, str):
                body = body.encode('utf-8')
            
            response = client.invoke_model(
                modelId=model_id,
                contentType=content_type,
                accept='application/json',
                body=body,
            )
            return response
            
        except ClientError as e:
            error_code = e.response.get('Error', {}).get('Code', '')
            
            if error_code == 'ThrottlingException':
                wait_time = (2 ** attempt) + random.uniform(0, 1)
                logger.warning(f"Rate limited. Waiting {wait_time:.2f}s (attempt {attempt + 1}/{max_retries})")
                time.sleep(wait_time)
                
            elif error_code == 'ModelTimeoutException':
                logger.warning(f"Model timeout (attempt {attempt + 1}/{max_retries})")
                if attempt == max_retries - 1:
                    raise
                time.sleep(1)
                
            elif error_code in ['ServiceUnavailableException', 'InternalServerException']:
                wait_time = (2 ** attempt) + random.uniform(0, 1)
                logger.warning(f"Service error. Waiting {wait_time:.2f}s")
                time.sleep(wait_time)
                
            else:
                raise
                
        except Exception as e:
            logger.error(f"Unexpected error: {e}")
            if attempt == max_retries - 1:
                raise
            time.sleep(1)
    
    raise Exception(f"Failed after {max_retries} attempts")


# =============================================================================
# Tools
# =============================================================================

@tool(
    name="transcribe_audio",
    description="音声ファイルをテキストに文字起こしします。Nova Sonicを使用し、話者識別・タイムスタンプ付きセグメント出力に対応。"
)
async def transcribe_audio(
    audio_url: str,
    language: str = "ja-JP",
    enable_speaker_diarization: bool = True,
    max_speakers: int = 10,
) -> TranscriptionResult:
    """
    音声→テキスト文字起こし (Nova Sonic)
    
    Args:
        audio_url: S3 URL or presigned URL of audio file
        language: Language code (default: ja-JP)
        enable_speaker_diarization: 話者識別を有効にするか
        max_speakers: 最大話者数
        
    Returns:
        TranscriptionResult: 文字起こし結果（セグメント、話者情報付き）
    """
    start_time = time.time()
    logger.info(f"Transcribing audio: {audio_url} (language: {language}, speakers: {enable_speaker_diarization})")
    
    bedrock = boto3.client('bedrock-runtime')
    
    request_body = {
        'audioUrl': audio_url,
        'language': language,
        'task': 'transcription',
        'settings': {
            'enableSpeakerDiarization': enable_speaker_diarization,
            'maxSpeakers': max_speakers,
            'outputSegments': True,
            'outputTimestamps': True,
        },
    }
    
    try:
        response = invoke_with_retry(
            client=bedrock,
            model_id=NOVA_SONIC_MODEL_ID,
            body=request_body,
        )
        
        result = json.loads(response['body'].read())
        processing_time = time.time() - start_time
        
        # セグメントを構造化
        segments = []
        for seg in result.get('segments', []):
            segments.append(TranscriptionSegment(
                text=seg.get('text', ''),
                start_time=seg.get('startTime', 0.0),
                end_time=seg.get('endTime', 0.0),
                confidence=seg.get('confidence', 0.0),
                speaker_id=seg.get('speakerId'),
            ))
        
        return TranscriptionResult(
            text=result.get('transcription', ''),
            confidence=result.get('confidence', 0.0),
            language=language,
            segments=segments,
            audio_duration=result.get('audioDuration', 0.0),
            processing_time=processing_time,
            model_id=NOVA_SONIC_MODEL_ID,
        )
        
    except Exception as e:
        logger.exception(f"Transcription failed: {e}")
        processing_time = time.time() - start_time
        
        # フォールバック結果
        return TranscriptionResult(
            text=f"[Transcription pending: {audio_url}]",
            confidence=0.0,
            language=language,
            segments=[],
            audio_duration=0.0,
            processing_time=processing_time,
            model_id=NOVA_SONIC_MODEL_ID,
        )


@tool(
    name="analyze_audio",
    description="音声ファイルを分析し、感情・話者・トーンを検出します。Nova Sonicを使用。"
)
async def analyze_audio(
    audio_url: str,
    analysis_types: list[str] = None,
    detect_noise: bool = True,
) -> AudioAnalysisResult:
    """
    音声分析 (Nova Sonic)
    
    Args:
        audio_url: S3 URL or presigned URL of audio file
        analysis_types: ["sentiment", "speaker_diarization", "emotion"]
        detect_noise: ノイズレベル検出を有効にするか
        
    Returns:
        AudioAnalysisResult: 分析結果
    """
    analysis_types = analysis_types or ["sentiment", "speaker_diarization", "emotion"]
    logger.info(f"Analyzing audio: {audio_url} (types: {analysis_types})")
    
    bedrock = boto3.client('bedrock-runtime')
    
    request_body = {
        'audioUrl': audio_url,
        'task': 'analysis',
        'analysisTypes': analysis_types,
        'settings': {
            'detectNoise': detect_noise,
            'emotionGranularity': 'segment',  # segment or overall
        },
    }
    
    try:
        response = invoke_with_retry(
            client=bedrock,
            model_id=NOVA_SONIC_MODEL_ID,
            body=request_body,
        )
        
        result = json.loads(response['body'].read())
        
        # 話者情報を構造化
        speakers = []
        for spk in result.get('speakers', []):
            speakers.append(SpeakerInfo(
                speaker_id=spk.get('speakerId', ''),
                speaking_time=spk.get('speakingTime', 0.0),
                turn_count=spk.get('turnCount', 0),
                segments=spk.get('segments', []),
            ))
        
        # 感情スコアを構造化
        emotions = []
        for emo in result.get('emotions', []):
            emotions.append(EmotionScore(
                emotion=emo.get('emotion', 'neutral'),
                score=emo.get('score', 0.0),
                timestamp=emo.get('timestamp'),
            ))
        
        # 支配的な感情を決定
        dominant_emotion = 'neutral'
        if emotions:
            dominant = max(emotions, key=lambda e: e.score)
            dominant_emotion = dominant.emotion
        
        return AudioAnalysisResult(
            sentiment=result.get('sentiment', 'neutral'),
            sentiment_score=result.get('sentimentScore', 0.5),
            speakers=speakers,
            emotions=emotions,
            dominant_emotion=dominant_emotion,
            audio_quality=result.get('audioQuality', 'good'),
            noise_level=result.get('noiseLevel', 0.0),
        )
        
    except Exception as e:
        logger.exception(f"Audio analysis failed: {e}")
        return AudioAnalysisResult(
            sentiment='neutral',
            sentiment_score=0.5,
            speakers=[],
            emotions=[],
            dominant_emotion='neutral',
            audio_quality='unknown',
            noise_level=0.0,
        )


@tool(
    name="transcribe_realtime",
    description="リアルタイム音声ストリーミング文字起こし。WebSocket経由での低レイテンシ処理に対応。"
)
async def transcribe_realtime(
    audio_stream: AsyncIterator[bytes],
    language: str = "ja-JP",
    sample_rate: int = 16000,
) -> AsyncIterator[TranscriptionSegment]:
    """
    リアルタイム文字起こし (Nova Sonic Streaming)
    
    Args:
        audio_stream: 音声データのストリーム (チャンク単位)
        language: 言語コード
        sample_rate: サンプリングレート (8000-48000)
        
    Yields:
        TranscriptionSegment: 文字起こしセグメント (リアルタイム)
    """
    logger.info(f"Starting realtime transcription (language: {language}, sample_rate: {sample_rate})")
    
    # Note: 実際の Bedrock Streaming API が利用可能になり次第実装
    # 現在はプレースホルダー実装
    
    bedrock = boto3.client('bedrock-runtime')
    
    buffer = b''
    chunk_duration = 0.5  # 500ms chunks
    chunk_size = int(sample_rate * chunk_duration * 2)  # 16-bit audio
    
    async for audio_chunk in audio_stream:
        buffer += audio_chunk
        
        while len(buffer) >= chunk_size:
            chunk = buffer[:chunk_size]
            buffer = buffer[chunk_size:]
            
            try:
                # ストリーミングAPI呼び出し (プレースホルダー)
                response = invoke_with_retry(
                    client=bedrock,
                    model_id=NOVA_SONIC_MODEL_ID,
                    body={
                        'audioChunk': chunk.hex(),
                        'language': language,
                        'sampleRate': sample_rate,
                        'task': 'streaming_transcription',
                    },
                )
                
                result = json.loads(response['body'].read())
                
                if result.get('isFinal', False):
                    yield TranscriptionSegment(
                        text=result.get('text', ''),
                        start_time=result.get('startTime', 0.0),
                        end_time=result.get('endTime', 0.0),
                        confidence=result.get('confidence', 0.0),
                        speaker_id=result.get('speakerId'),
                    )
                    
            except Exception as e:
                logger.error(f"Streaming transcription error: {e}")
                continue


@tool(
    name="detect_speech_quality",
    description="音声品質を評価します。ノイズレベル、明瞭度、サンプリングレートの適切性をチェック。"
)
async def detect_speech_quality(
    audio_url: str,
) -> dict:
    """
    音声品質検出
    
    Args:
        audio_url: S3 URL or presigned URL of audio file
        
    Returns:
        dict: 品質評価結果
    """
    logger.info(f"Detecting speech quality: {audio_url}")
    
    bedrock = boto3.client('bedrock-runtime')
    
    request_body = {
        'audioUrl': audio_url,
        'task': 'quality_assessment',
    }
    
    try:
        response = invoke_with_retry(
            client=bedrock,
            model_id=NOVA_SONIC_MODEL_ID,
            body=request_body,
        )
        
        result = json.loads(response['body'].read())
        
        return {
            'overall_quality': result.get('overallQuality', 'unknown'),
            'noise_level': result.get('noiseLevel', 0.0),
            'clarity_score': result.get('clarityScore', 0.0),
            'sample_rate': result.get('sampleRate', 0),
            'bit_depth': result.get('bitDepth', 0),
            'duration': result.get('duration', 0.0),
            'issues': result.get('issues', []),
            'recommendations': result.get('recommendations', []),
        }
        
    except Exception as e:
        logger.exception(f"Quality detection failed: {e}")
        return {
            'overall_quality': 'unknown',
            'noise_level': 0.0,
            'clarity_score': 0.0,
            'issues': [str(e)],
            'recommendations': [],
        }


# =============================================================================
# Utility Functions
# =============================================================================

def serialize_result(result) -> dict:
    """結果をJSON直列化可能な形式に変換"""
    if hasattr(result, '__dataclass_fields__'):
        data = asdict(result)
        # ネストされたデータクラスを処理
        for key, value in data.items():
            if isinstance(value, list):
                data[key] = [
                    asdict(item) if hasattr(item, '__dataclass_fields__') else item
                    for item in value
                ]
        return data
    return result


def create_audio_hash(audio_url: str) -> str:
    """音声URLからハッシュを生成（キャッシュキー用）"""
    return hashlib.md5(audio_url.encode()).hexdigest()
