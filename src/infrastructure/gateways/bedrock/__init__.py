"""Bedrock Gateway implementations"""
from src.infrastructure.gateways.bedrock.nova_sonic_gateway import NovaSonicGateway
from src.infrastructure.gateways.bedrock.nova_omni_gateway import (
    NovaOmniGateway,
    VideoAnalysisType,
    VideoAnalysisResult,
    VideoFrame,
)

__all__ = [
    "NovaSonicGateway",
    "NovaOmniGateway",
    "VideoAnalysisType",
    "VideoAnalysisResult",
    "VideoFrame",
]
