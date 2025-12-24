"""FastAPI Application Entry Point"""
from contextlib import asynccontextmanager
from typing import AsyncIterator

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.infrastructure.config import get_settings
from src.presentation.api.routes import audio_routes, health_routes
from src.presentation.middleware.logging import LoggingMiddleware
from src.presentation.middleware.error_handler import error_handlers

logger = structlog.get_logger()


def configure_logging() -> None:
    """構造化ログを設定"""
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(20),  # INFO
        logger_factory=structlog.PrintLoggerFactory(),
    )


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """アプリケーションのライフサイクル管理"""
    settings = get_settings()
    logger.info(
        "application_starting",
        service=settings.service_name,
        environment=settings.environment,
    )
    yield
    logger.info("application_shutting_down")


def create_app() -> FastAPI:
    """FastAPI アプリケーションを作成"""
    configure_logging()
    settings = get_settings()

    app = FastAPI(
        title="Nova Platform API",
        description="Multimodal AI Platform powered by Amazon Bedrock",
        version="1.0.0",
        lifespan=lifespan,
        docs_url="/docs" if settings.is_development else None,
        redoc_url="/redoc" if settings.is_development else None,
    )

    # Middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"] if settings.is_development else [],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(LoggingMiddleware)

    # Error Handlers
    for exception_class, handler in error_handlers.items():
        app.add_exception_handler(exception_class, handler)

    # Routes
    app.include_router(health_routes.router, tags=["Health"])
    app.include_router(audio_routes.router, prefix="/api/v1/audio", tags=["Audio"])

    return app


app = create_app()

