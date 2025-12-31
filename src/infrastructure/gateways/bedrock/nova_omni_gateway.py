"""Nova Omni Gateway Implementation"""
from __future__ import annotations

import base64
import json
from dataclasses import dataclass
from enum import Enum
from typing import Any

import boto3
import structlog

logger = structlog.get_logger()


class VideoAnalysisType(str, Enum):
    """映像解析タイプ"""
    SCENE_UNDERSTANDING = "scene_understanding"
    OBJECT_DETECTION = "object_detection"
    ACTION_RECOGNITION = "action_recognition"
    TEMPORAL_ANALYSIS = "temporal_analysis"
    ANOMALY_DETECTION = "anomaly_detection"


@dataclass
class VideoFrame:
    """映像フレーム情報"""
    timestamp_ms: int
    description: str
    objects: list[dict[str, Any]]
    confidence: float


@dataclass
class VideoAnalysisResult:
    """映像解析結果"""
    summary: str
    frames: list[VideoFrame]
    temporal_events: list[dict[str, Any]]
    anomalies: list[dict[str, Any]]
    metadata: dict[str, Any]


class NovaOmniGateway:
    """
    Nova Omni Gateway
    
    Amazon Bedrock Nova Omniモデルを使用した映像理解サービス。
    
    機能:
    - 映像シーン理解
    - オブジェクト検出・追跡
    - 行動認識
    - 時系列分析
    - 異常検知
    """

    def __init__(
        self,
        region: str = "us-east-1",
        model_id: str = "amazon.nova-pro-v1:0",  # Nova Pro for vision
    ):
        self.region = region
        self.model_id = model_id
        self._client = boto3.client("bedrock-runtime", region_name=region)
        self._s3_client = boto3.client("s3", region_name=region)

    async def analyze_video(
        self,
        s3_key: str,
        analysis_types: list[VideoAnalysisType] | None = None,
        sample_interval_ms: int = 1000,
        max_frames: int = 20,
    ) -> VideoAnalysisResult:
        """
        S3上の映像ファイルを解析
        
        Args:
            s3_key: S3オブジェクトキー (bucket/key形式)
            analysis_types: 解析タイプのリスト
            sample_interval_ms: フレームサンプリング間隔（ミリ秒）
            max_frames: 最大フレーム数
            
        Returns:
            VideoAnalysisResult: 映像解析結果
        """
        log = logger.bind(s3_key=s3_key, analysis_types=analysis_types)
        log.info("video_analysis_started")

        if analysis_types is None:
            analysis_types = [VideoAnalysisType.SCENE_UNDERSTANDING]

        try:
            # S3から映像データを取得
            bucket = s3_key.split("/")[0] if "/" in s3_key else "nova-content"
            key = "/".join(s3_key.split("/")[1:]) if "/" in s3_key else s3_key

            # S3 presigned URLを生成してBedrockに渡す
            presigned_url = self._s3_client.generate_presigned_url(
                "get_object",
                Params={"Bucket": bucket, "Key": key},
                ExpiresIn=3600,
            )

            # Nova Omni リクエストを構築
            system_prompt = self._build_system_prompt(analysis_types)
            
            request_body = {
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "video": {
                                    "format": self._detect_format(key),
                                    "source": {"s3Location": {"uri": f"s3://{bucket}/{key}"}},
                                },
                            },
                            {
                                "text": self._build_analysis_prompt(analysis_types),
                            },
                        ],
                    }
                ],
                "system": [{"text": system_prompt}],
                "inferenceConfig": {
                    "maxTokens": 4096,
                    "temperature": 0.1,
                },
            }

            # Bedrock 呼び出し
            response = self._client.invoke_model(
                modelId=self.model_id,
                body=json.dumps(request_body),
                contentType="application/json",
            )

            result = json.loads(response["body"].read())
            log.info("video_analysis_completed")

            return self._parse_response(result, analysis_types)

        except Exception as e:
            log.error("video_analysis_failed", error=str(e))
            raise

    async def analyze_frames(
        self,
        frames: list[bytes],
        analysis_types: list[VideoAnalysisType] | None = None,
    ) -> VideoAnalysisResult:
        """
        フレーム画像リストを解析
        
        Args:
            frames: フレーム画像のバイトデータリスト
            analysis_types: 解析タイプのリスト
            
        Returns:
            VideoAnalysisResult: 映像解析結果
        """
        log = logger.bind(frame_count=len(frames))
        log.info("frame_analysis_started")

        if analysis_types is None:
            analysis_types = [VideoAnalysisType.SCENE_UNDERSTANDING]

        try:
            # フレームをbase64エンコード
            encoded_frames = [base64.b64encode(f).decode("utf-8") for f in frames]

            # Nova Omni リクエストを構築（複数画像）
            content = []
            for i, encoded in enumerate(encoded_frames):
                content.append({
                    "image": {
                        "format": "jpeg",
                        "source": {"bytes": encoded},
                    },
                })
            
            content.append({
                "text": self._build_analysis_prompt(analysis_types) + 
                        f"\n\nAnalyze these {len(frames)} frames as a temporal sequence."
            })

            request_body = {
                "messages": [{"role": "user", "content": content}],
                "system": [{"text": self._build_system_prompt(analysis_types)}],
                "inferenceConfig": {
                    "maxTokens": 4096,
                    "temperature": 0.1,
                },
            }

            response = self._client.invoke_model(
                modelId=self.model_id,
                body=json.dumps(request_body),
                contentType="application/json",
            )

            result = json.loads(response["body"].read())
            log.info("frame_analysis_completed")

            return self._parse_response(result, analysis_types)

        except Exception as e:
            log.error("frame_analysis_failed", error=str(e))
            raise

    async def detect_anomalies(
        self,
        s3_key: str,
        baseline_description: str | None = None,
        sensitivity: float = 0.7,
    ) -> list[dict[str, Any]]:
        """
        映像内の異常を検出
        
        Args:
            s3_key: S3オブジェクトキー
            baseline_description: 正常状態の説明（オプション）
            sensitivity: 検出感度 (0.0-1.0)
            
        Returns:
            異常検出結果のリスト
        """
        log = logger.bind(s3_key=s3_key, sensitivity=sensitivity)
        log.info("anomaly_detection_started")

        try:
            bucket = s3_key.split("/")[0] if "/" in s3_key else "nova-content"
            key = "/".join(s3_key.split("/")[1:]) if "/" in s3_key else s3_key

            baseline_context = ""
            if baseline_description:
                baseline_context = f"\n\nBaseline (normal) state: {baseline_description}"

            request_body = {
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "video": {
                                    "format": self._detect_format(key),
                                    "source": {"s3Location": {"uri": f"s3://{bucket}/{key}"}},
                                },
                            },
                            {
                                "text": f"""Analyze this video for anomalies and unusual events.
                                
Detection sensitivity: {sensitivity} (0=low, 1=high)
{baseline_context}

For each anomaly detected, provide:
1. Timestamp (approximate)
2. Description of the anomaly
3. Severity (low/medium/high)
4. Confidence score

Output as JSON array.""",
                            },
                        ],
                    }
                ],
                "system": [{"text": "You are a video anomaly detection system. Analyze videos for unusual events, safety concerns, and deviations from normal patterns."}],
                "inferenceConfig": {
                    "maxTokens": 2048,
                    "temperature": 0.1,
                },
            }

            response = self._client.invoke_model(
                modelId=self.model_id,
                body=json.dumps(request_body),
                contentType="application/json",
            )

            result = json.loads(response["body"].read())
            
            # レスポンスから異常リストを抽出
            content = result.get("output", {}).get("message", {}).get("content", [])
            text = content[0].get("text", "[]") if content else "[]"
            
            # JSONパースを試みる
            try:
                anomalies = json.loads(text)
            except json.JSONDecodeError:
                anomalies = [{"raw_response": text}]

            log.info("anomaly_detection_completed", count=len(anomalies))
            return anomalies

        except Exception as e:
            log.error("anomaly_detection_failed", error=str(e))
            raise

    def _detect_format(self, key: str) -> str:
        """ファイル拡張子から形式を検出"""
        ext = key.rsplit(".", 1)[-1].lower() if "." in key else "mp4"
        format_map = {
            "mp4": "mp4",
            "mov": "mov",
            "avi": "avi",
            "mkv": "mkv",
            "webm": "webm",
        }
        return format_map.get(ext, "mp4")

    def _build_system_prompt(self, analysis_types: list[VideoAnalysisType]) -> str:
        """システムプロンプトを構築"""
        prompts = {
            VideoAnalysisType.SCENE_UNDERSTANDING: "Understand and describe scenes in detail.",
            VideoAnalysisType.OBJECT_DETECTION: "Detect and track objects with bounding boxes.",
            VideoAnalysisType.ACTION_RECOGNITION: "Recognize human actions and activities.",
            VideoAnalysisType.TEMPORAL_ANALYSIS: "Analyze temporal sequences and transitions.",
            VideoAnalysisType.ANOMALY_DETECTION: "Detect anomalies and unusual events.",
        }
        
        capabilities = [prompts.get(t, "") for t in analysis_types]
        return f"""You are an advanced video analysis system with the following capabilities:
{chr(10).join(f'- {c}' for c in capabilities if c)}

Provide structured, detailed analysis in JSON format."""

    def _build_analysis_prompt(self, analysis_types: list[VideoAnalysisType]) -> str:
        """解析プロンプトを構築"""
        tasks = []
        
        if VideoAnalysisType.SCENE_UNDERSTANDING in analysis_types:
            tasks.append("1. Describe the overall scene and setting")
        if VideoAnalysisType.OBJECT_DETECTION in analysis_types:
            tasks.append("2. List all detected objects with their positions")
        if VideoAnalysisType.ACTION_RECOGNITION in analysis_types:
            tasks.append("3. Identify actions and activities being performed")
        if VideoAnalysisType.TEMPORAL_ANALYSIS in analysis_types:
            tasks.append("4. Analyze temporal changes and event sequences")
        if VideoAnalysisType.ANOMALY_DETECTION in analysis_types:
            tasks.append("5. Flag any anomalies or unusual occurrences")

        return f"""Analyze this video and provide:

{chr(10).join(tasks)}

Output your analysis as a structured JSON object with keys: summary, frames, temporal_events, anomalies."""

    def _parse_response(
        self, result: dict[str, Any], analysis_types: list[VideoAnalysisType]
    ) -> VideoAnalysisResult:
        """Bedrock レスポンスをパース"""
        # Nova Omni のレスポンス構造に合わせてパース
        content = result.get("output", {}).get("message", {}).get("content", [])
        text = content[0].get("text", "{}") if content else "{}"

        # JSONパースを試みる
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            parsed = {"summary": text, "frames": [], "temporal_events": [], "anomalies": []}

        frames = [
            VideoFrame(
                timestamp_ms=f.get("timestamp_ms", 0),
                description=f.get("description", ""),
                objects=f.get("objects", []),
                confidence=f.get("confidence", 0.0),
            )
            for f in parsed.get("frames", [])
        ]

        return VideoAnalysisResult(
            summary=parsed.get("summary", ""),
            frames=frames,
            temporal_events=parsed.get("temporal_events", []),
            anomalies=parsed.get("anomalies", []),
            metadata={
                "model_id": self.model_id,
                "analysis_types": [t.value for t in analysis_types],
            },
        )



