#!/usr/bin/env python3
"""
Benchmark Runner for rd-bedrock-nova

使用方法:
    python -m src.benchmarks.run_benchmarks --env dev --iterations 10
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
from datetime import datetime
from pathlib import Path

from src.benchmarks.performance_metrics import (
    LambdaBenchmark,
    ServiceType,
    PerformanceMetrics,
    measure_latency,
    calculate_latency_stats,
)
from src.infrastructure.gateways.bedrock import (
    NovaSonicGateway,
    NovaOmniGateway,
    NovaEmbeddingsGateway,
)
from src.infrastructure.gateways.s3 import S3VectorsGateway


async def benchmark_nova_embeddings(
    region: str = "us-east-1",
    iterations: int = 10,
) -> dict:
    """Nova Embeddings ベンチマーク"""
    print("\n🔬 Nova Embeddings Benchmark")
    print("-" * 40)
    
    gateway = NovaEmbeddingsGateway(region=region)
    
    # テキスト埋め込み
    async def text_embedding():
        await gateway.generate_text_embedding(
            text="This is a test sentence for benchmarking Nova Embeddings API performance."
        )
    
    stats, error_rate = await measure_latency(text_embedding, iterations=iterations)
    
    print(f"  Text Embedding:")
    print(f"    Mean: {stats.mean_ms:.2f}ms")
    print(f"    P95:  {stats.p95_ms:.2f}ms")
    print(f"    P99:  {stats.p99_ms:.2f}ms")
    print(f"    Errors: {error_rate * 100:.1f}%")
    
    return {
        "service": "nova_embeddings",
        "operation": "text_embedding",
        "mean_ms": stats.mean_ms,
        "p95_ms": stats.p95_ms,
        "p99_ms": stats.p99_ms,
        "error_rate": error_rate,
    }


async def benchmark_s3_vectors(
    region: str = "us-east-1",
    iterations: int = 10,
) -> dict:
    """S3 Vectors ベンチマーク"""
    print("\n🗄️  S3 Vectors Benchmark")
    print("-" * 40)
    
    gateway = S3VectorsGateway(region=region)
    
    # ダミーベクトルでクエリ計測
    dummy_vector = [0.1] * 1024
    bucket = os.environ.get("CONTENT_BUCKET", "nova-content-bucket")
    index = os.environ.get("VECTOR_INDEX", "nova-vector-index")
    
    async def query_vectors():
        try:
            await gateway.query_vectors(
                bucket_name=bucket,
                index_name=index,
                query_vector=dummy_vector,
                top_k=10,
            )
        except Exception:
            # S3 Vectors未対応の場合はスキップ
            pass
    
    stats, error_rate = await measure_latency(query_vectors, iterations=iterations)
    
    print(f"  Query Vectors:")
    print(f"    Mean: {stats.mean_ms:.2f}ms")
    print(f"    P95:  {stats.p95_ms:.2f}ms")
    print(f"    P99:  {stats.p99_ms:.2f}ms")
    print(f"    Errors: {error_rate * 100:.1f}%")
    
    return {
        "service": "s3_vectors",
        "operation": "query",
        "mean_ms": stats.mean_ms,
        "p95_ms": stats.p95_ms,
        "p99_ms": stats.p99_ms,
        "error_rate": error_rate,
    }


async def benchmark_dynamodb(
    region: str = "us-east-1",
    iterations: int = 10,
) -> dict:
    """DynamoDB ベンチマーク"""
    import boto3
    
    print("\n📊 DynamoDB Benchmark")
    print("-" * 40)
    
    table_name = os.environ.get("EVENT_STORE_TABLE", "nova-event-store")
    dynamodb = boto3.resource("dynamodb", region_name=region)
    table = dynamodb.Table(table_name)
    
    # 読み取り計測
    async def read_item():
        try:
            table.get_item(Key={"pk": "TEST#benchmark", "sk": "test"})
        except Exception:
            pass
    
    stats, error_rate = await measure_latency(read_item, iterations=iterations)
    
    print(f"  Read Item:")
    print(f"    Mean: {stats.mean_ms:.2f}ms")
    print(f"    P95:  {stats.p95_ms:.2f}ms")
    print(f"    P99:  {stats.p99_ms:.2f}ms")
    
    return {
        "service": "dynamodb",
        "operation": "read",
        "mean_ms": stats.mean_ms,
        "p95_ms": stats.p95_ms,
        "p99_ms": stats.p99_ms,
        "error_rate": error_rate,
    }


async def run_all_benchmarks(
    region: str = "us-east-1",
    iterations: int = 10,
    output_dir: str = "benchmark_results",
) -> None:
    """全ベンチマークを実行"""
    print("=" * 50)
    print("🚀 rd-bedrock-nova Performance Benchmark")
    print("=" * 50)
    print(f"Region: {region}")
    print(f"Iterations: {iterations}")
    print(f"Timestamp: {datetime.utcnow().isoformat()}")
    
    results = []
    
    # Nova Embeddings
    try:
        result = await benchmark_nova_embeddings(region, iterations)
        results.append(result)
    except Exception as e:
        print(f"  ⚠️  Nova Embeddings benchmark failed: {e}")
    
    # S3 Vectors
    try:
        result = await benchmark_s3_vectors(region, iterations)
        results.append(result)
    except Exception as e:
        print(f"  ⚠️  S3 Vectors benchmark failed: {e}")
    
    # DynamoDB
    try:
        result = await benchmark_dynamodb(region, iterations)
        results.append(result)
    except Exception as e:
        print(f"  ⚠️  DynamoDB benchmark failed: {e}")
    
    # 結果出力
    print("\n" + "=" * 50)
    print("📈 Summary")
    print("=" * 50)
    
    for r in results:
        print(f"\n{r['service']} - {r['operation']}:")
        print(f"  Latency (mean): {r['mean_ms']:.2f}ms")
        print(f"  Latency (p95):  {r['p95_ms']:.2f}ms")
        print(f"  Error Rate:     {r['error_rate'] * 100:.1f}%")
    
    # JSONファイルに保存
    output_path = Path(output_dir)
    output_path.mkdir(exist_ok=True)
    
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    output_file = output_path / f"benchmark_{timestamp}.json"
    
    with open(output_file, "w") as f:
        json.dump({
            "timestamp": datetime.utcnow().isoformat(),
            "region": region,
            "iterations": iterations,
            "results": results,
        }, f, indent=2)
    
    print(f"\n✅ Results saved to: {output_file}")


def main():
    parser = argparse.ArgumentParser(description="Run performance benchmarks")
    parser.add_argument("--region", default="us-east-1", help="AWS region")
    parser.add_argument("--iterations", type=int, default=10, help="Number of iterations")
    parser.add_argument("--output-dir", default="benchmark_results", help="Output directory")
    
    args = parser.parse_args()
    
    asyncio.run(run_all_benchmarks(
        region=args.region,
        iterations=args.iterations,
        output_dir=args.output_dir,
    ))


if __name__ == "__main__":
    main()

