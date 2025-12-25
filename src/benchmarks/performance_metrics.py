"""Performance Metrics Collection and Analysis"""
from __future__ import annotations

import asyncio
import json
import statistics
import time
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Callable, Optional

import boto3
import structlog

logger = structlog.get_logger()


class ServiceType(str, Enum):
    """サービスタイプ"""
    NOVA_SONIC = "nova_sonic"
    NOVA_OMNI = "nova_omni"
    NOVA_EMBEDDINGS = "nova_embeddings"
    S3_VECTORS = "s3_vectors"
    AGENT_CORE = "agent_core"
    DYNAMODB = "dynamodb"


@dataclass
class LatencyStats:
    """レイテンシ統計"""
    min_ms: float
    max_ms: float
    mean_ms: float
    median_ms: float
    p95_ms: float
    p99_ms: float
    std_dev_ms: float
    sample_count: int


@dataclass
class BenchmarkResult:
    """ベンチマーク結果"""
    service: ServiceType
    operation: str
    latency_stats: LatencyStats
    throughput_rps: float
    cold_start_ms: Optional[float]
    error_rate: float
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    metadata: dict = field(default_factory=dict)


@dataclass
class PerformanceMetrics:
    """パフォーマンスメトリクス収集"""
    
    results: list[BenchmarkResult] = field(default_factory=list)
    
    def add_result(self, result: BenchmarkResult) -> None:
        """結果を追加"""
        self.results.append(result)
    
    def get_summary(self) -> dict[str, Any]:
        """サマリーを取得"""
        if not self.results:
            return {"message": "No results"}
        
        summary = {}
        for result in self.results:
            key = f"{result.service.value}_{result.operation}"
            summary[key] = {
                "latency_mean_ms": result.latency_stats.mean_ms,
                "latency_p95_ms": result.latency_stats.p95_ms,
                "throughput_rps": result.throughput_rps,
                "cold_start_ms": result.cold_start_ms,
                "error_rate": result.error_rate,
            }
        
        return summary
    
    def to_json(self) -> str:
        """JSON形式で出力"""
        return json.dumps([
            {
                "service": r.service.value,
                "operation": r.operation,
                "latency_stats": {
                    "min_ms": r.latency_stats.min_ms,
                    "max_ms": r.latency_stats.max_ms,
                    "mean_ms": r.latency_stats.mean_ms,
                    "median_ms": r.latency_stats.median_ms,
                    "p95_ms": r.latency_stats.p95_ms,
                    "p99_ms": r.latency_stats.p99_ms,
                    "std_dev_ms": r.latency_stats.std_dev_ms,
                    "sample_count": r.latency_stats.sample_count,
                },
                "throughput_rps": r.throughput_rps,
                "cold_start_ms": r.cold_start_ms,
                "error_rate": r.error_rate,
                "timestamp": r.timestamp,
                "metadata": r.metadata,
            }
            for r in self.results
        ], indent=2)


def calculate_latency_stats(latencies_ms: list[float]) -> LatencyStats:
    """レイテンシ統計を計算"""
    if not latencies_ms:
        return LatencyStats(
            min_ms=0, max_ms=0, mean_ms=0, median_ms=0,
            p95_ms=0, p99_ms=0, std_dev_ms=0, sample_count=0
        )
    
    sorted_latencies = sorted(latencies_ms)
    n = len(sorted_latencies)
    
    p95_idx = int(n * 0.95)
    p99_idx = int(n * 0.99)
    
    return LatencyStats(
        min_ms=min(sorted_latencies),
        max_ms=max(sorted_latencies),
        mean_ms=statistics.mean(sorted_latencies),
        median_ms=statistics.median(sorted_latencies),
        p95_ms=sorted_latencies[min(p95_idx, n - 1)],
        p99_ms=sorted_latencies[min(p99_idx, n - 1)],
        std_dev_ms=statistics.stdev(sorted_latencies) if n > 1 else 0,
        sample_count=n,
    )


async def measure_latency(
    func: Callable,
    iterations: int = 10,
    warmup: int = 2,
    *args,
    **kwargs,
) -> tuple[LatencyStats, float]:
    """
    関数のレイテンシを計測
    
    Args:
        func: 計測対象の関数（async or sync）
        iterations: 計測回数
        warmup: ウォームアップ回数
        *args: 関数の引数
        **kwargs: 関数のキーワード引数
        
    Returns:
        tuple[LatencyStats, float]: (レイテンシ統計, エラー率)
    """
    latencies = []
    errors = 0
    
    # Warmup
    for _ in range(warmup):
        try:
            if asyncio.iscoroutinefunction(func):
                await func(*args, **kwargs)
            else:
                func(*args, **kwargs)
        except Exception:
            pass
    
    # Measurement
    for _ in range(iterations):
        start = time.perf_counter()
        try:
            if asyncio.iscoroutinefunction(func):
                await func(*args, **kwargs)
            else:
                func(*args, **kwargs)
            elapsed_ms = (time.perf_counter() - start) * 1000
            latencies.append(elapsed_ms)
        except Exception as e:
            logger.warning("benchmark_error", error=str(e))
            errors += 1
    
    error_rate = errors / iterations if iterations > 0 else 0
    stats = calculate_latency_stats(latencies)
    
    return stats, error_rate


async def measure_cold_start(
    lambda_client: Any,
    function_name: str,
    payload: dict,
    force_cold_start: bool = True,
) -> float:
    """
    Lambda関数のコールドスタート時間を計測
    
    Args:
        lambda_client: boto3 Lambda client
        function_name: Lambda関数名
        payload: 呼び出しペイロード
        force_cold_start: コールドスタートを強制するか
        
    Returns:
        float: コールドスタート時間（ms）
    """
    log = logger.bind(function_name=function_name)
    
    try:
        if force_cold_start:
            # 環境変数を更新してコールドスタートを強制
            lambda_client.update_function_configuration(
                FunctionName=function_name,
                Environment={
                    'Variables': {
                        'FORCE_COLD_START': str(time.time()),
                    }
                }
            )
            # 設定更新を待機
            await asyncio.sleep(2)
        
        # 計測実行
        start = time.perf_counter()
        
        response = lambda_client.invoke(
            FunctionName=function_name,
            InvocationType='RequestResponse',
            Payload=json.dumps(payload),
        )
        
        elapsed_ms = (time.perf_counter() - start) * 1000
        
        # CloudWatch Logsからinit durationを取得する方法もあるが、
        # ここでは全体の呼び出し時間で近似
        
        log.info("cold_start_measured", elapsed_ms=elapsed_ms)
        return elapsed_ms
        
    except Exception as e:
        log.error("cold_start_measurement_failed", error=str(e))
        raise


async def measure_throughput(
    func: Callable,
    duration_seconds: float = 10,
    concurrency: int = 10,
    *args,
    **kwargs,
) -> float:
    """
    スループット（RPS）を計測
    
    Args:
        func: 計測対象の関数
        duration_seconds: 計測時間（秒）
        concurrency: 同時実行数
        *args: 関数の引数
        **kwargs: 関数のキーワード引数
        
    Returns:
        float: リクエスト/秒
    """
    completed = 0
    errors = 0
    running = True
    
    async def worker():
        nonlocal completed, errors
        while running:
            try:
                if asyncio.iscoroutinefunction(func):
                    await func(*args, **kwargs)
                else:
                    await asyncio.get_event_loop().run_in_executor(
                        None, lambda: func(*args, **kwargs)
                    )
                completed += 1
            except Exception:
                errors += 1
    
    # ワーカー起動
    tasks = [asyncio.create_task(worker()) for _ in range(concurrency)]
    
    # 計測時間待機
    start = time.perf_counter()
    await asyncio.sleep(duration_seconds)
    running = False
    
    # ワーカー終了待機
    for task in tasks:
        task.cancel()
    
    elapsed = time.perf_counter() - start
    rps = completed / elapsed if elapsed > 0 else 0
    
    logger.info("throughput_measured", 
                rps=rps, completed=completed, errors=errors, duration=elapsed)
    
    return rps


class LambdaBenchmark:
    """Lambda関数のベンチマーク"""
    
    def __init__(self, region: str = "us-east-1"):
        self.region = region
        self._lambda_client = boto3.client("lambda", region_name=region)
        self._cloudwatch_client = boto3.client("cloudwatch", region_name=region)
        self.metrics = PerformanceMetrics()
    
    async def benchmark_function(
        self,
        function_name: str,
        payload: dict,
        service_type: ServiceType,
        operation: str,
        iterations: int = 10,
        measure_cold: bool = True,
    ) -> BenchmarkResult:
        """
        Lambda関数をベンチマーク
        
        Args:
            function_name: Lambda関数名
            payload: テストペイロード
            service_type: サービスタイプ
            operation: 操作名
            iterations: 計測回数
            measure_cold: コールドスタートを計測するか
            
        Returns:
            BenchmarkResult: ベンチマーク結果
        """
        log = logger.bind(function_name=function_name, operation=operation)
        log.info("benchmark_started")
        
        # レイテンシ計測
        async def invoke():
            self._lambda_client.invoke(
                FunctionName=function_name,
                InvocationType='RequestResponse',
                Payload=json.dumps(payload),
            )
        
        latency_stats, error_rate = await measure_latency(
            invoke, iterations=iterations, warmup=2
        )
        
        # コールドスタート計測
        cold_start_ms = None
        if measure_cold:
            try:
                cold_start_ms = await measure_cold_start(
                    self._lambda_client,
                    function_name,
                    payload,
                )
            except Exception as e:
                log.warning("cold_start_skipped", error=str(e))
        
        # スループット計測（短時間）
        throughput = await measure_throughput(
            invoke, duration_seconds=5, concurrency=5
        )
        
        result = BenchmarkResult(
            service=service_type,
            operation=operation,
            latency_stats=latency_stats,
            throughput_rps=throughput,
            cold_start_ms=cold_start_ms,
            error_rate=error_rate,
            metadata={
                "function_name": function_name,
                "region": self.region,
                "iterations": iterations,
            },
        )
        
        self.metrics.add_result(result)
        log.info("benchmark_completed", mean_latency=latency_stats.mean_ms)
        
        return result
    
    def get_cloudwatch_metrics(
        self,
        function_name: str,
        period_minutes: int = 60,
    ) -> dict[str, Any]:
        """
        CloudWatchからLambdaメトリクスを取得
        
        Args:
            function_name: Lambda関数名
            period_minutes: 取得期間（分）
            
        Returns:
            dict: CloudWatchメトリクス
        """
        from datetime import timedelta
        
        end_time = datetime.utcnow()
        start_time = end_time - timedelta(minutes=period_minutes)
        
        metrics = {}
        metric_names = ['Duration', 'Invocations', 'Errors', 'ConcurrentExecutions']
        
        for metric_name in metric_names:
            try:
                response = self._cloudwatch_client.get_metric_statistics(
                    Namespace='AWS/Lambda',
                    MetricName=metric_name,
                    Dimensions=[
                        {'Name': 'FunctionName', 'Value': function_name},
                    ],
                    StartTime=start_time,
                    EndTime=end_time,
                    Period=300,  # 5分
                    Statistics=['Average', 'Maximum', 'Minimum', 'Sum'],
                )
                
                if response.get('Datapoints'):
                    datapoints = sorted(response['Datapoints'], key=lambda x: x['Timestamp'])
                    latest = datapoints[-1]
                    metrics[metric_name] = {
                        'average': latest.get('Average'),
                        'maximum': latest.get('Maximum'),
                        'minimum': latest.get('Minimum'),
                        'sum': latest.get('Sum'),
                    }
            except Exception as e:
                logger.warning("cloudwatch_metric_error", metric=metric_name, error=str(e))
        
        return metrics

