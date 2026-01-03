"""
Video Tools - Nova Omni Integration

Nova Omni を使用した映像処理ツール:
- 映像理解・シーン分析
- 時系列イベント検出
- 異常検知
"""
import os
import logging
from typing import Optional

from .audio import tool
from src.infrastructure.gateways.bedrock import (
    NovaOmniGateway,
    VideoAnalysisType,
    VideoAnalysisResult as GatewayResult,
)

logger = logging.getLogger(__name__)


# Nova Omni Gateway シングルトン
_gateway: Optional[NovaOmniGateway] = None


def get_gateway() -> NovaOmniGateway:
    """Nova Omni Gateway インスタンスを取得"""
    global _gateway
    if _gateway is None:
        _gateway = NovaOmniGateway(
            region=os.environ.get("AWS_REGION", "us-east-1"),
            model_id=os.environ.get("NOVA_OMNI_MODEL_ID", "amazon.nova-pro-v1:0"),
        )
    return _gateway


@tool(
    name="analyze_video",
    description="映像を分析し、シーン・オブジェクト・イベント・異常を検出します。Nova Omniを使用。"
)
async def analyze_video(
    video_url: str,
    analysis_types: list = None,
    temporal_analysis: bool = True,
) -> dict:
    """
    映像分析 (Nova Omni)
    
    Args:
        video_url: S3 URL (s3://bucket/key) or S3 key (bucket/key)
        analysis_types: ["scene", "object", "event", "anomaly"]
        temporal_analysis: 時系列分析を有効にするか
        
    Returns:
        dict: 分析結果
    """
    analysis_types = analysis_types or ["scene", "object", "event", "anomaly"]
    logger.info(f"Analyzing video: {video_url} (types: {analysis_types})")
    
    gateway = get_gateway()
    
    # 解析タイプをマッピング
    type_mapping = {
        "scene": VideoAnalysisType.SCENE_UNDERSTANDING,
        "object": VideoAnalysisType.OBJECT_DETECTION,
        "action": VideoAnalysisType.ACTION_RECOGNITION,
        "event": VideoAnalysisType.TEMPORAL_ANALYSIS,
        "anomaly": VideoAnalysisType.ANOMALY_DETECTION,
    }
    
    mapped_types = [
        type_mapping.get(t, VideoAnalysisType.SCENE_UNDERSTANDING)
        for t in analysis_types
        if t in type_mapping
    ]
    
    # temporal_analysisが有効なら時系列分析を追加
    if temporal_analysis and VideoAnalysisType.TEMPORAL_ANALYSIS not in mapped_types:
        mapped_types.append(VideoAnalysisType.TEMPORAL_ANALYSIS)
    
    # S3 URLからキーを抽出
    s3_key = video_url.replace("s3://", "") if video_url.startswith("s3://") else video_url
    
    try:
        result: GatewayResult = await gateway.analyze_video(
            s3_key=s3_key,
            analysis_types=mapped_types,
        )
        
        return {
            "summary": result.summary,
            "scenes": [
                {
                    "timestamp_ms": f.timestamp_ms,
                    "description": f.description,
                    "objects": f.objects,
                    "confidence": f.confidence,
                }
                for f in result.frames
            ],
            "detected_objects": _extract_objects(result.frames),
            "events": result.temporal_events,
            "anomalies": result.anomalies,
            "metadata": result.metadata,
        }
        
    except Exception as e:
        logger.exception(f"Video analysis failed: {e}")
        return {
            "summary": f"[Analysis failed: {str(e)}]",
            "scenes": [],
            "detected_objects": [],
            "events": [],
            "anomalies": [],
            "error": str(e),
        }


@tool(
    name="detect_video_anomalies",
    description="映像内の異常（安全上の問題、予期しないイベント）を検出します。"
)
async def detect_video_anomalies(
    video_url: str,
    baseline_description: str = None,
    sensitivity: float = 0.7,
) -> dict:
    """
    映像異常検知 (Nova Omni)
    
    Args:
        video_url: S3 URL or S3 key
        baseline_description: 正常状態の説明
        sensitivity: 検出感度 (0.0-1.0)
        
    Returns:
        dict: 異常検出結果
    """
    logger.info(f"Detecting anomalies in video: {video_url}")
    
    gateway = get_gateway()
    s3_key = video_url.replace("s3://", "") if video_url.startswith("s3://") else video_url
    
    try:
        anomalies = await gateway.detect_anomalies(
            s3_key=s3_key,
            baseline_description=baseline_description,
            sensitivity=sensitivity,
        )
        
        return {
            "anomaly_count": len(anomalies),
            "anomalies": anomalies,
            "sensitivity": sensitivity,
        }
        
    except Exception as e:
        logger.exception(f"Anomaly detection failed: {e}")
        return {
            "anomaly_count": 0,
            "anomalies": [],
            "error": str(e),
        }


@tool(
    name="analyze_video_frames",
    description="複数のフレーム画像を時系列として分析します。"
)
async def analyze_video_frames(
    frames_base64: list,
    analysis_types: list = None,
) -> dict:
    """
    フレーム画像分析 (Nova Omni)
    
    Args:
        frames_base64: Base64エンコードされたフレーム画像リスト
        analysis_types: ["scene", "object", "action", "event", "anomaly"]
        
    Returns:
        dict: 分析結果
    """
    import base64
    
    analysis_types = analysis_types or ["scene", "object"]
    logger.info(f"Analyzing {len(frames_base64)} frames")
    
    gateway = get_gateway()
    
    type_mapping = {
        "scene": VideoAnalysisType.SCENE_UNDERSTANDING,
        "object": VideoAnalysisType.OBJECT_DETECTION,
        "action": VideoAnalysisType.ACTION_RECOGNITION,
        "event": VideoAnalysisType.TEMPORAL_ANALYSIS,
        "anomaly": VideoAnalysisType.ANOMALY_DETECTION,
    }
    
    mapped_types = [
        type_mapping.get(t, VideoAnalysisType.SCENE_UNDERSTANDING)
        for t in analysis_types
        if t in type_mapping
    ]
    
    # Base64デコード
    frames_bytes = [base64.b64decode(f) for f in frames_base64]
    
    try:
        result: GatewayResult = await gateway.analyze_frames(
            frames=frames_bytes,
            analysis_types=mapped_types,
        )
        
        return {
            "summary": result.summary,
            "frame_analysis": [
                {
                    "timestamp_ms": f.timestamp_ms,
                    "description": f.description,
                    "objects": f.objects,
                    "confidence": f.confidence,
                }
                for f in result.frames
            ],
            "temporal_events": result.temporal_events,
            "anomalies": result.anomalies,
        }
        
    except Exception as e:
        logger.exception(f"Frame analysis failed: {e}")
        return {
            "summary": f"[Analysis failed: {str(e)}]",
            "frame_analysis": [],
            "temporal_events": [],
            "anomalies": [],
            "error": str(e),
        }


def _extract_objects(frames: list) -> list:
    """フレームからユニークなオブジェクトを抽出"""
    all_objects = {}
    
    for frame in frames:
        for obj in frame.objects:
            obj_name = obj.get("name", obj.get("label", "unknown"))
            if obj_name not in all_objects:
                all_objects[obj_name] = {
                    "name": obj_name,
                    "first_seen_ms": frame.timestamp_ms,
                    "confidence": obj.get("confidence", 0.0),
                    "count": 1,
                }
            else:
                all_objects[obj_name]["count"] += 1
                all_objects[obj_name]["confidence"] = max(
                    all_objects[obj_name]["confidence"],
                    obj.get("confidence", 0.0)
                )
    
    return list(all_objects.values())
