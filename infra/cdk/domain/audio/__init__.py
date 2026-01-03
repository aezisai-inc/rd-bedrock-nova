"""Audio Domain Module"""
from .entities.audio_file import AudioFile
from .entities.transcription import Transcription
from .value_objects.audio_metadata import AudioMetadata
from .value_objects.sentiment_score import SentimentScore
from .value_objects.transcript_segment import TranscriptSegment
from .events.audio_events import (
    AudioCreated,
    AudioProcessingStarted,
    TranscriptionCompleted,
    SentimentAnalyzed,
    AudioProcessingCompleted,
    AudioProcessingFailed,
)

__all__ = [
    "AudioFile",
    "Transcription",
    "AudioMetadata",
    "SentimentScore",
    "TranscriptSegment",
    "AudioCreated",
    "AudioProcessingStarted",
    "TranscriptionCompleted",
    "SentimentAnalyzed",
    "AudioProcessingCompleted",
    "AudioProcessingFailed",
]

