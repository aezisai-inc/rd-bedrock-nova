"""Logging Middleware"""
from __future__ import annotations

import time
from uuid import uuid4

import structlog
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

logger = structlog.get_logger()


class LoggingMiddleware(BaseHTTPMiddleware):
    """
    リクエスト/レスポンス ログミドルウェア

    12-Factor App の Logs 原則に従い、
    構造化されたログをイベントストリームとして出力する。
    """

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        # リクエストIDを生成
        request_id = request.headers.get("X-Request-ID", str(uuid4()))

        # コンテキストにリクエストIDを設定
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=request_id)

        # リクエスト開始ログ
        start_time = time.perf_counter()
        logger.info(
            "request_started",
            method=request.method,
            path=request.url.path,
            client_ip=request.client.host if request.client else None,
        )

        # リクエスト処理
        response = await call_next(request)

        # 処理時間計算
        duration_ms = (time.perf_counter() - start_time) * 1000

        # レスポンスログ
        logger.info(
            "request_completed",
            method=request.method,
            path=request.url.path,
            status_code=response.status_code,
            duration_ms=round(duration_ms, 2),
        )

        # レスポンスヘッダーにリクエストIDを追加
        response.headers["X-Request-ID"] = request_id

        return response

