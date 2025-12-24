# Nova Platform - Production Dockerfile
# Multi-stage build for optimized image size

# ===== BUILD STAGE =====
FROM python:3.12-slim AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY pyproject.toml .
RUN pip install --no-cache-dir build && \
    pip wheel --no-cache-dir --wheel-dir /wheels -e .

# ===== RUNTIME STAGE =====
FROM python:3.12-slim AS runtime

# Security: Run as non-root user
RUN groupadd -r nova && useradd -r -g nova nova

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy wheels and install
COPY --from=builder /wheels /wheels
RUN pip install --no-cache-dir /wheels/*.whl && rm -rf /wheels

# Copy application code
COPY src/ src/

# Change ownership
RUN chown -R nova:nova /app

# Switch to non-root user
USER nova

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Environment variables
ENV PORT=8080
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

EXPOSE 8080

# Run application
CMD ["uvicorn", "src.presentation.main:app", "--host", "0.0.0.0", "--port", "8080"]

