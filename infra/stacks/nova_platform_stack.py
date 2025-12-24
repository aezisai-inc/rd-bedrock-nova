"""
Nova Platform Main Stack

ECS Fargate + Agent Core ベースのメインスタック。
"""
from aws_cdk import (
    Stack,
    CfnOutput,
)
from constructs import Construct

from infra.stacks.network_stack import NetworkStack
from infra.stacks.data_stack import DataStack
from infra.stacks.compute_stack import ComputeStack
from infra.stacks.events_stack import EventsStack


class NovaPlatformStack(Stack):
    """Nova Platform のメインスタック (ECS Fargate)。"""

    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # Network Stack (VPC, Subnets, VPC Endpoints)
        network_stack = NetworkStack(self, 'Network')

        # Data Stack (DynamoDB, S3, Redis)
        data_stack = DataStack(
            self, 'Data',
            vpc=network_stack.vpc,
        )

        # Compute Stack (ECS Fargate Services)
        compute_stack = ComputeStack(
            self, 'Compute',
            vpc=network_stack.vpc,
            event_store_table=data_stack.event_store_table,
            read_model_table=data_stack.read_model_table,
            content_bucket=data_stack.content_bucket,
            redis_cluster=data_stack.redis_cluster,
        )

        # Events Stack (EventBridge)
        events_stack = EventsStack(self, 'Events')

        # Outputs
        CfnOutput(self, 'ALBEndpoint', value=compute_stack.alb_dns_name)
        CfnOutput(self, 'ContentBucketName', value=data_stack.content_bucket.bucket_name)
        CfnOutput(self, 'ECSClusterName', value=compute_stack.cluster.cluster_name)
