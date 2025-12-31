"""Cost Calculator for rd-bedrock-nova Serverless Architecture"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional


class ServiceType(str, Enum):
    """AWSサービスタイプ"""
    LAMBDA = "lambda"
    DYNAMODB = "dynamodb"
    S3 = "s3"
    S3_VECTORS = "s3_vectors"
    BEDROCK = "bedrock"
    API_GATEWAY = "api_gateway"
    CLOUDWATCH = "cloudwatch"


@dataclass
class LambdaCost:
    """Lambda コスト計算"""
    
    # 料金 (us-east-1, 2025年時点)
    PRICE_PER_GB_SECOND: float = 0.0000166667
    PRICE_PER_REQUEST: float = 0.0000002
    FREE_TIER_GB_SECONDS: int = 400_000
    FREE_TIER_REQUESTS: int = 1_000_000
    
    memory_mb: int = 256
    avg_duration_ms: int = 200
    monthly_invocations: int = 100_000
    
    def calculate(self) -> dict[str, float]:
        """月額コストを計算"""
        # GB-秒の計算
        gb_seconds = (self.memory_mb / 1024) * (self.avg_duration_ms / 1000) * self.monthly_invocations
        billable_gb_seconds = max(0, gb_seconds - self.FREE_TIER_GB_SECONDS)
        
        # リクエスト数
        billable_requests = max(0, self.monthly_invocations - self.FREE_TIER_REQUESTS)
        
        # コスト計算
        compute_cost = billable_gb_seconds * self.PRICE_PER_GB_SECOND
        request_cost = billable_requests * self.PRICE_PER_REQUEST
        
        return {
            "compute_cost": round(compute_cost, 2),
            "request_cost": round(request_cost, 2),
            "total_cost": round(compute_cost + request_cost, 2),
            "gb_seconds": round(gb_seconds, 2),
            "free_tier_savings": round(
                min(gb_seconds, self.FREE_TIER_GB_SECONDS) * self.PRICE_PER_GB_SECOND +
                min(self.monthly_invocations, self.FREE_TIER_REQUESTS) * self.PRICE_PER_REQUEST, 2
            ),
        }


@dataclass
class DynamoDBCost:
    """DynamoDB コスト計算 (On-Demand)"""
    
    # 料金 (us-east-1, 2025年時点)
    PRICE_PER_WRU: float = 0.00000125  # Write Request Unit
    PRICE_PER_RRU: float = 0.00000025  # Read Request Unit
    PRICE_PER_GB_STORAGE: float = 0.25
    
    monthly_write_requests: int = 100_000
    monthly_read_requests: int = 500_000
    storage_gb: float = 1.0
    
    def calculate(self) -> dict[str, float]:
        """月額コストを計算"""
        write_cost = self.monthly_write_requests * self.PRICE_PER_WRU
        read_cost = self.monthly_read_requests * self.PRICE_PER_RRU
        storage_cost = self.storage_gb * self.PRICE_PER_GB_STORAGE
        
        return {
            "write_cost": round(write_cost, 2),
            "read_cost": round(read_cost, 2),
            "storage_cost": round(storage_cost, 2),
            "total_cost": round(write_cost + read_cost + storage_cost, 2),
        }


@dataclass
class S3VectorsCost:
    """S3 Vectors コスト計算"""
    
    # 料金 (us-east-1, 2025年時点の見積もり)
    PRICE_PER_MILLION_VECTORS_STORED: float = 0.024  # /月
    PRICE_PER_MILLION_QUERIES: float = 0.10
    PRICE_PER_MILLION_WRITES: float = 0.25
    
    vectors_stored_millions: float = 1.0
    monthly_queries_millions: float = 0.1
    monthly_writes_millions: float = 0.01
    
    def calculate(self) -> dict[str, float]:
        """月額コストを計算"""
        storage_cost = self.vectors_stored_millions * self.PRICE_PER_MILLION_VECTORS_STORED
        query_cost = self.monthly_queries_millions * self.PRICE_PER_MILLION_QUERIES
        write_cost = self.monthly_writes_millions * self.PRICE_PER_MILLION_WRITES
        
        return {
            "storage_cost": round(storage_cost, 2),
            "query_cost": round(query_cost, 2),
            "write_cost": round(write_cost, 2),
            "total_cost": round(storage_cost + query_cost + write_cost, 2),
        }


@dataclass
class BedrockCost:
    """Bedrock コスト計算"""
    
    # 料金 (us-east-1, 2025年時点)
    # Nova Embeddings
    NOVA_EMBEDDINGS_PER_1K_INPUT_TOKENS: float = 0.00002
    
    # Nova Sonic (音声)
    NOVA_SONIC_PER_MINUTE: float = 0.006
    
    # Nova Omni (映像)
    NOVA_OMNI_PER_MINUTE: float = 0.012
    
    # Claude (比較用)
    CLAUDE_SONNET_INPUT_1K: float = 0.003
    CLAUDE_SONNET_OUTPUT_1K: float = 0.015
    
    monthly_embedding_tokens_millions: float = 10.0
    monthly_audio_minutes: float = 1000
    monthly_video_minutes: float = 100
    
    def calculate(self) -> dict[str, float]:
        """月額コストを計算"""
        embedding_cost = (self.monthly_embedding_tokens_millions * 1_000_000 / 1000) * self.NOVA_EMBEDDINGS_PER_1K_INPUT_TOKENS
        audio_cost = self.monthly_audio_minutes * self.NOVA_SONIC_PER_MINUTE
        video_cost = self.monthly_video_minutes * self.NOVA_OMNI_PER_MINUTE
        
        return {
            "embedding_cost": round(embedding_cost, 2),
            "audio_cost": round(audio_cost, 2),
            "video_cost": round(video_cost, 2),
            "total_cost": round(embedding_cost + audio_cost + video_cost, 2),
        }


@dataclass
class APIGatewayCost:
    """API Gateway コスト計算 (HTTP API)"""
    
    # 料金 (us-east-1, 2025年時点)
    PRICE_PER_MILLION_REQUESTS: float = 1.00
    FREE_TIER_REQUESTS: int = 1_000_000
    
    monthly_requests: int = 1_000_000
    
    def calculate(self) -> dict[str, float]:
        """月額コストを計算"""
        billable_requests = max(0, self.monthly_requests - self.FREE_TIER_REQUESTS)
        cost = (billable_requests / 1_000_000) * self.PRICE_PER_MILLION_REQUESTS
        
        return {
            "request_cost": round(cost, 2),
            "free_tier_savings": round(
                min(self.monthly_requests, self.FREE_TIER_REQUESTS) / 1_000_000 * self.PRICE_PER_MILLION_REQUESTS, 2
            ),
            "total_cost": round(cost, 2),
        }


@dataclass
class TotalCostEstimate:
    """総合コスト見積もり"""
    
    lambda_config: LambdaCost = field(default_factory=LambdaCost)
    dynamodb_config: DynamoDBCost = field(default_factory=DynamoDBCost)
    s3_vectors_config: S3VectorsCost = field(default_factory=S3VectorsCost)
    bedrock_config: BedrockCost = field(default_factory=BedrockCost)
    api_gateway_config: APIGatewayCost = field(default_factory=APIGatewayCost)
    
    def calculate(self) -> dict[str, Any]:
        """全サービスの月額コストを計算"""
        lambda_costs = self.lambda_config.calculate()
        dynamodb_costs = self.dynamodb_config.calculate()
        s3_vectors_costs = self.s3_vectors_config.calculate()
        bedrock_costs = self.bedrock_config.calculate()
        api_gateway_costs = self.api_gateway_config.calculate()
        
        total = (
            lambda_costs["total_cost"] +
            dynamodb_costs["total_cost"] +
            s3_vectors_costs["total_cost"] +
            bedrock_costs["total_cost"] +
            api_gateway_costs["total_cost"]
        )
        
        return {
            "lambda": lambda_costs,
            "dynamodb": dynamodb_costs,
            "s3_vectors": s3_vectors_costs,
            "bedrock": bedrock_costs,
            "api_gateway": api_gateway_costs,
            "total_monthly_cost": round(total, 2),
        }
    
    def compare_with_ecs(self) -> dict[str, Any]:
        """ECS構成との比較"""
        serverless_cost = self.calculate()["total_monthly_cost"]
        
        # ECS Fargate 比較 (同等性能想定)
        ecs_estimate = {
            "fargate_task_cost": 73.00,  # 0.5vCPU, 1GB RAM, 24h
            "alb_cost": 22.00,
            "nat_gateway_cost": 32.00,
            "elasticache_cost": 12.00,  # cache.t3.micro
            "total": 139.00,
        }
        
        return {
            "serverless_monthly": serverless_cost,
            "ecs_monthly_estimate": ecs_estimate["total"],
            "savings_percent": round(
                (1 - serverless_cost / ecs_estimate["total"]) * 100, 1
            ) if ecs_estimate["total"] > 0 else 0,
            "ecs_breakdown": ecs_estimate,
            "recommendation": "serverless" if serverless_cost < ecs_estimate["total"] else "ecs",
        }


# ========== プリセット構成 ==========

def small_workload() -> TotalCostEstimate:
    """小規模ワークロード (開発/テスト)"""
    return TotalCostEstimate(
        lambda_config=LambdaCost(
            memory_mb=256,
            avg_duration_ms=200,
            monthly_invocations=50_000,
        ),
        dynamodb_config=DynamoDBCost(
            monthly_write_requests=10_000,
            monthly_read_requests=50_000,
            storage_gb=0.5,
        ),
        s3_vectors_config=S3VectorsCost(
            vectors_stored_millions=0.1,
            monthly_queries_millions=0.01,
            monthly_writes_millions=0.001,
        ),
        bedrock_config=BedrockCost(
            monthly_embedding_tokens_millions=1.0,
            monthly_audio_minutes=100,
            monthly_video_minutes=10,
        ),
        api_gateway_config=APIGatewayCost(
            monthly_requests=50_000,
        ),
    )


def medium_workload() -> TotalCostEstimate:
    """中規模ワークロード (本番)"""
    return TotalCostEstimate(
        lambda_config=LambdaCost(
            memory_mb=512,
            avg_duration_ms=300,
            monthly_invocations=500_000,
        ),
        dynamodb_config=DynamoDBCost(
            monthly_write_requests=100_000,
            monthly_read_requests=500_000,
            storage_gb=5.0,
        ),
        s3_vectors_config=S3VectorsCost(
            vectors_stored_millions=1.0,
            monthly_queries_millions=0.1,
            monthly_writes_millions=0.01,
        ),
        bedrock_config=BedrockCost(
            monthly_embedding_tokens_millions=10.0,
            monthly_audio_minutes=1000,
            monthly_video_minutes=100,
        ),
        api_gateway_config=APIGatewayCost(
            monthly_requests=500_000,
        ),
    )


def large_workload() -> TotalCostEstimate:
    """大規模ワークロード (エンタープライズ)"""
    return TotalCostEstimate(
        lambda_config=LambdaCost(
            memory_mb=1024,
            avg_duration_ms=500,
            monthly_invocations=5_000_000,
        ),
        dynamodb_config=DynamoDBCost(
            monthly_write_requests=1_000_000,
            monthly_read_requests=5_000_000,
            storage_gb=50.0,
        ),
        s3_vectors_config=S3VectorsCost(
            vectors_stored_millions=10.0,
            monthly_queries_millions=1.0,
            monthly_writes_millions=0.1,
        ),
        bedrock_config=BedrockCost(
            monthly_embedding_tokens_millions=100.0,
            monthly_audio_minutes=10_000,
            monthly_video_minutes=1_000,
        ),
        api_gateway_config=APIGatewayCost(
            monthly_requests=5_000_000,
        ),
    )


def print_cost_report(estimate: TotalCostEstimate, title: str = "Cost Report") -> None:
    """コストレポートを出力"""
    print("=" * 60)
    print(f"📊 {title}")
    print("=" * 60)
    
    costs = estimate.calculate()
    
    print("\n💰 Service Breakdown:")
    print("-" * 40)
    
    for service, details in costs.items():
        if service == "total_monthly_cost":
            continue
        print(f"\n{service.upper()}:")
        if isinstance(details, dict):
            for key, value in details.items():
                print(f"  {key}: ${value}")
    
    print("\n" + "=" * 40)
    print(f"📈 TOTAL MONTHLY COST: ${costs['total_monthly_cost']}")
    print("=" * 40)
    
    # ECS比較
    comparison = estimate.compare_with_ecs()
    print(f"\n🔄 ECS Comparison:")
    print(f"  Serverless: ${comparison['serverless_monthly']}/month")
    print(f"  ECS (est.): ${comparison['ecs_monthly_estimate']}/month")
    print(f"  Savings:    {comparison['savings_percent']}%")
    print(f"  Recommendation: {comparison['recommendation'].upper()}")


if __name__ == "__main__":
    print("\n" + "=" * 60)
    print("🏷️  SMALL WORKLOAD (Dev/Test)")
    print("=" * 60)
    print_cost_report(small_workload(), "Small Workload")
    
    print("\n" + "=" * 60)
    print("🏢 MEDIUM WORKLOAD (Production)")
    print("=" * 60)
    print_cost_report(medium_workload(), "Medium Workload")
    
    print("\n" + "=" * 60)
    print("🏭 LARGE WORKLOAD (Enterprise)")
    print("=" * 60)
    print_cost_report(large_workload(), "Large Workload")



