# Nova Platform Makefile
# ECS Fargate + Agent Core ベースのマイクロサービスビルド・デプロイ

.PHONY: help install dev-install lint test build push deploy local clean

# Variables
AWS_REGION ?= ap-northeast-1
AWS_ACCOUNT_ID ?= $(shell aws sts get-caller-identity --query Account --output text)
ECR_REGISTRY ?= $(AWS_ACCOUNT_ID).dkr.ecr.$(AWS_REGION).amazonaws.com

# Services
SERVICES := agent-core audio-service video-service search-service

# Default target
help:
	@echo "Nova Platform - ECS Fargate + Agent Core"
	@echo ""
	@echo "Usage:"
	@echo "  make install        - Install dependencies"
	@echo "  make dev-install    - Install with dev dependencies"
	@echo "  make lint           - Run linters"
	@echo "  make test           - Run tests"
	@echo "  make build          - Build all Docker images"
	@echo "  make push           - Push images to ECR"
	@echo "  make deploy         - Deploy with CDK"
	@echo "  make local          - Start local development environment"
	@echo "  make clean          - Clean up"
	@echo ""
	@echo "Individual service builds:"
	@echo "  make build-agent-core"
	@echo "  make build-audio-service"
	@echo "  make build-video-service"
	@echo "  make build-search-service"

# =================================================================
# Development Setup
# =================================================================

install:
	pip install -e .

dev-install:
	pip install -e ".[dev,cdk]"

lint:
	ruff check src tests
	mypy src

test:
	pytest tests/unit -v

test-integration:
	pytest tests/integration -v

test-all:
	pytest tests -v --cov

# =================================================================
# Docker Build
# =================================================================

build: $(addprefix build-,$(SERVICES))

build-agent-core:
	docker build -t nova-agent-core:latest -f docker/Dockerfile.agent-core .

build-audio-service:
	docker build -t nova-audio-service:latest -f docker/Dockerfile.audio-service .

build-video-service:
	docker build -t nova-video-service:latest -f docker/Dockerfile.video-service .

build-search-service:
	docker build -t nova-search-service:latest -f docker/Dockerfile.search-service .

# =================================================================
# ECR Push
# =================================================================

ecr-login:
	aws ecr get-login-password --region $(AWS_REGION) | docker login --username AWS --password-stdin $(ECR_REGISTRY)

push: ecr-login $(addprefix push-,$(SERVICES))

push-agent-core:
	docker tag nova-agent-core:latest $(ECR_REGISTRY)/nova-agent-core:latest
	docker push $(ECR_REGISTRY)/nova-agent-core:latest

push-audio-service:
	docker tag nova-audio-service:latest $(ECR_REGISTRY)/nova-audio-service:latest
	docker push $(ECR_REGISTRY)/nova-audio-service:latest

push-video-service:
	docker tag nova-video-service:latest $(ECR_REGISTRY)/nova-video-service:latest
	docker push $(ECR_REGISTRY)/nova-video-service:latest

push-search-service:
	docker tag nova-search-service:latest $(ECR_REGISTRY)/nova-search-service:latest
	docker push $(ECR_REGISTRY)/nova-search-service:latest

# =================================================================
# CDK Deploy
# =================================================================

cdk-synth:
	cd infra && cdk synth

cdk-diff:
	cd infra && cdk diff

deploy:
	cd infra && cdk deploy --all --require-approval never

deploy-network:
	cd infra && cdk deploy NovaPlatform/Network

deploy-data:
	cd infra && cdk deploy NovaPlatform/Data

deploy-compute:
	cd infra && cdk deploy NovaPlatform/Compute

destroy:
	cd infra && cdk destroy --all

# =================================================================
# Local Development
# =================================================================

local:
	docker-compose up --build

local-down:
	docker-compose down -v

local-logs:
	docker-compose logs -f

# Individual services for local development
run-agent-core:
	cd src/services/agent_core && uvicorn main:app --reload --host 0.0.0.0 --port 8000

run-audio-service:
	cd src/services/audio && uvicorn main:app --reload --host 0.0.0.0 --port 8001

run-video-service:
	cd src/services/video && uvicorn main:app --reload --host 0.0.0.0 --port 8002

run-search-service:
	cd src/services/search && uvicorn main:app --reload --host 0.0.0.0 --port 8003

# =================================================================
# Clean
# =================================================================

clean:
	rm -rf dist build *.egg-info
	rm -rf .pytest_cache .mypy_cache .ruff_cache
	rm -rf infra/cdk.out
	find . -type d -name "__pycache__" -exec rm -rf {} +
	find . -type f -name "*.pyc" -delete

clean-docker:
	docker rmi nova-agent-core:latest nova-audio-service:latest nova-video-service:latest nova-search-service:latest 2>/dev/null || true
	docker system prune -f
