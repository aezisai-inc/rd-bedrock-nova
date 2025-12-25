"""
Nova Platform Main Stack (Serverless)

Lambda + API Gateway ベースのサーバレスメインスタック。
VPC不要でコスト最適化。
"""
from aws_cdk import (
    Stack,
    CfnOutput,
)
from constructs import Construct

from infra.stacks.data_stack import DataStack
from infra.stacks.compute_stack import ComputeStack
from infra.stacks.api_stack import ApiStack
from infra.stacks.events_stack import EventsStack


class NovaPlatformStack(Stack):
    """Nova Platform のメインスタック (Serverless)。"""

    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # Data Stack (DynamoDB, S3) - VPC不要
        data_stack = DataStack(self, 'Data')

        # Compute Stack (Lambda Functions)
        compute_stack = ComputeStack(
            self, 'Compute',
            event_store_table=data_stack.event_store_table,
            read_model_table=data_stack.read_model_table,
            session_table=data_stack.session_table,
            content_bucket=data_stack.content_bucket,
        )

        # API Stack (API Gateway)
        api_stack = ApiStack(
            self, 'Api',
            agent_core_fn=compute_stack.agent_core_fn,
            audio_fn=compute_stack.audio_fn,
            video_fn=compute_stack.video_fn,
            search_fn=compute_stack.search_fn,
        )

        # Events Stack (EventBridge)
        events_stack = EventsStack(self, 'Events')

        # Outputs
        CfnOutput(self, 'ApiEndpoint', value=api_stack.api_url)
        CfnOutput(self, 'ContentBucketName', value=data_stack.content_bucket.bucket_name)
        CfnOutput(self, 'AgentCoreECRRepo', value=compute_stack.agent_core_repo.repository_uri)
