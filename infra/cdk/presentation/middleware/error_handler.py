"""Error Handler Middleware"""
from __future__ import annotations

import structlog
from fastapi import Request
from fastapi.responses import JSONResponse

from src.application.use_cases.audio.get_audio import AudioNotFoundError
from src.application.use_cases.audio.transcribe_audio import TranscriptionError
from src.application.use_cases.audio.upload_audio import AudioUploadError
from src.infrastructure.event_store.dynamodb_event_store import ConcurrencyError

logger = structlog.get_logger()


async def audio_not_found_handler(request: Request, exc: AudioNotFoundError) -> JSONResponse:
    """音声ファイルが見つからないエラーハンドラ"""
    logger.warning("audio_not_found", error=str(exc))
    return JSONResponse(
        status_code=404,
        content={
            "error": "AudioNotFound",
            "message": str(exc),
            "code": "AUDIO_NOT_FOUND",
        },
    )


async def transcription_error_handler(
    request: Request, exc: TranscriptionError
) -> JSONResponse:
    """文字起こしエラーハンドラ"""
    logger.error("transcription_error", error=str(exc))
    return JSONResponse(
        status_code=500,
        content={
            "error": "TranscriptionError",
            "message": str(exc),
            "code": "TRANSCRIPTION_FAILED",
        },
    )


async def upload_error_handler(request: Request, exc: AudioUploadError) -> JSONResponse:
    """アップロードエラーハンドラ"""
    logger.error("upload_error", error=str(exc))
    return JSONResponse(
        status_code=500,
        content={
            "error": "UploadError",
            "message": str(exc),
            "code": "UPLOAD_FAILED",
        },
    )


async def concurrency_error_handler(
    request: Request, exc: ConcurrencyError
) -> JSONResponse:
    """楽観的ロック違反エラーハンドラ"""
    logger.warning("concurrency_error", error=str(exc))
    return JSONResponse(
        status_code=409,
        content={
            "error": "ConcurrencyError",
            "message": str(exc),
            "code": "CONCURRENCY_CONFLICT",
        },
    )


async def generic_error_handler(request: Request, exc: Exception) -> JSONResponse:
    """汎用エラーハンドラ"""
    logger.error("unhandled_error", error=str(exc), exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "error": "InternalServerError",
            "message": "An unexpected error occurred",
            "code": "INTERNAL_ERROR",
        },
    )


# エラーハンドラのマッピング
error_handlers = {
    AudioNotFoundError: audio_not_found_handler,
    TranscriptionError: transcription_error_handler,
    AudioUploadError: upload_error_handler,
    ConcurrencyError: concurrency_error_handler,
    Exception: generic_error_handler,
}

