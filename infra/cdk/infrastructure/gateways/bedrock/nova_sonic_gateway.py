"""Nova Sonic Gateway Implementation"""
from __future__ import annotations

import json
from typing import Any

import boto3
import structlog

from src.application.ports.gateways import ITranscriptionGateway, TranscriptionResult

logger = structlog.get_logger()


class NovaSonicGateway(ITranscriptionGateway):
    """
    Nova Sonic Gateway

    Amazon Bedrock Nova Sonic モデルを使用した音声認識サービス。
    """

    def __init__(
        self,
        region: str = "us-east-1",
        model_id: str = "amazon.nova-sonic-v1:0",
    ):
        self.region = region
        self.model_id = model_id
        self._client = boto3.client("bedrock-runtime", region_name=region)
        self._s3_client = boto3.client("s3", region_name=region)

    async def transcribe(
        self,
        s3_key: str,
        language: str = "ja-JP",
        enable_diarization: bool = False,
    ) -> TranscriptionResult:
        """
        S3上の音声ファイルを文字起こし

        Args:
            s3_key: S3オブジェクトキー
            language: 言語コード
            enable_diarization: 話者分離を有効にするか

        Returns:
            TranscriptionResult: 文字起こし結果
        """
        log = logger.bind(s3_key=s3_key, language=language)
        log.info("transcription_started")

        try:
            # S3から音声データを取得
            bucket = s3_key.split("/")[0] if "/" in s3_key else "nova-content"
            key = "/".join(s3_key.split("/")[1:]) if "/" in s3_key else s3_key

            response = self._s3_client.get_object(Bucket=bucket, Key=key)
            audio_data = response["Body"].read()

            # Nova Sonic リクエストを構築
            request_body = {
                "audio": {
                    "format": self._detect_format(s3_key),
                    "source": {"bytes": audio_data},
                },
                "audioOutputConfig": {
                    "encoding": "pcm",
                    "sampleRateHertz": 16000,
                },
                "inferenceConfig": {
                    "maxTokens": 4096,
                },
                "systemPrompt": {
                    "text": f"Transcribe the audio in {language}. Provide accurate transcription with punctuation."
                },
            }

            if enable_diarization:
                request_body["speakerConfig"] = {
                    "enableSpeakerDiarization": True,
                    "maxSpeakers": 5,
                }

            # Bedrock 呼び出し
            response = self._client.invoke_model(
                modelId=self.model_id,
                body=json.dumps(request_body),
                contentType="application/json",
            )

            result = json.loads(response["body"].read())
            log.info("transcription_completed", confidence=result.get("confidence", 0))

            return self._parse_response(result, language)

        except Exception as e:
            log.error("transcription_failed", error=str(e))
            raise

    async def transcribe_stream(
        self,
        audio_stream: bytes,
        language: str = "ja-JP",
    ) -> TranscriptionResult:
        """
        ストリーミング音声を文字起こし

        Args:
            audio_stream: 音声データ（バイト）
            language: 言語コード

        Returns:
            TranscriptionResult: 文字起こし結果
        """
        log = logger.bind(language=language, audio_size=len(audio_stream))
        log.info("stream_transcription_started")

        try:
            request_body = {
                "audio": {
                    "format": "pcm",
                    "source": {"bytes": audio_stream},
                },
                "audioOutputConfig": {
                    "encoding": "pcm",
                    "sampleRateHertz": 16000,
                },
                "inferenceConfig": {
                    "maxTokens": 4096,
                },
                "systemPrompt": {
                    "text": f"Transcribe the audio in {language}."
                },
            }

            response = self._client.invoke_model(
                modelId=self.model_id,
                body=json.dumps(request_body),
                contentType="application/json",
            )

            result = json.loads(response["body"].read())
            log.info("stream_transcription_completed")

            return self._parse_response(result, language)

        except Exception as e:
            log.error("stream_transcription_failed", error=str(e))
            raise

    def _detect_format(self, s3_key: str) -> str:
        """ファイル拡張子から形式を検出"""
        ext = s3_key.rsplit(".", 1)[-1].lower() if "." in s3_key else "wav"
        format_map = {
            "wav": "wav",
            "mp3": "mp3",
            "flac": "flac",
            "m4a": "m4a",
            "ogg": "ogg",
        }
        return format_map.get(ext, "wav")

    def _parse_response(
        self, result: dict[str, Any], language: str
    ) -> TranscriptionResult:
        """Bedrock レスポンスをパース"""
        # Nova Sonic のレスポンス構造に合わせてパース
        # 実際のレスポンス形式に応じて調整が必要
        text = result.get("transcription", {}).get("text", "")
        confidence = result.get("transcription", {}).get("confidence", 0.0)
        raw_segments = result.get("transcription", {}).get("segments", [])
        speakers = result.get("speakers", [])

        segments = [
            {
                "start_time": seg.get("start_time", 0.0),
                "end_time": seg.get("end_time", 0.0),
                "text": seg.get("text", ""),
                "confidence": seg.get("confidence", 0.0),
                "speaker_id": seg.get("speaker_id"),
            }
            for seg in raw_segments
        ]

        return TranscriptionResult(
            text=text,
            confidence=confidence,
            segments=segments,
            language=language,
            speakers=speakers,
        )

