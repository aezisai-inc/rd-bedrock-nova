"""
Lambda Stack (Serverless Compute)

Lambda Functions:
- Agent Core (Container Image from ECR)
- AG-UI Handler (AG-UI Protocol + Response Streaming)
- Audio Handler (Nova Sonic)
- Video Handler (Nova Omni)
- Search Handler (Nova Embeddings)
- Event Projector (DynamoDB Stream)
"""
from aws_cdk import (
    NestedStack,
    Duration,
    CfnOutput,
    aws_lambda as lambda_,
    aws_ecr as ecr,
    aws_iam as iam,
    aws_dynamodb as dynamodb,
    aws_s3 as s3,
    aws_logs as logs,
    aws_lambda_event_sources as event_sources,
)
from constructs import Construct


class ComputeStack(NestedStack):
    """Lambda ベースのサーバレスコンピュートスタック。"""

    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        event_store_table: dynamodb.Table,
        read_model_table: dynamodb.Table,
        session_table: dynamodb.Table,
        content_bucket: s3.Bucket,
        **kwargs
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # =================================================================
        # ECR Repository (Agent Core Container Image)
        # =================================================================

        self.agent_core_repo = ecr.Repository(
            self, 'AgentCoreRepo',
            repository_name='nova-agent-core',
        )

        # =================================================================
        # Shared IAM Policies
        # =================================================================

        bedrock_policy = iam.PolicyStatement(
            actions=[
                'bedrock:InvokeModel',
                'bedrock:InvokeModelWithResponseStream',
            ],
            resources=['arn:aws:bedrock:*:*:model/*'],
        )

        # =================================================================
        # Agent Core Lambda (Container Image)
        # =================================================================

        self.agent_core_fn = lambda_.DockerImageFunction(
            self, 'AgentCoreFn',
            function_name='nova-agent-core',
            code=lambda_.DockerImageCode.from_ecr(
                repository=self.agent_core_repo,
                tag_or_digest='latest',
            ),
            memory_size=1024,
            timeout=Duration.seconds(300),
            environment={
                'NOVA_ENVIRONMENT': 'production',
                'EVENT_STORE_TABLE': event_store_table.table_name,
                'SESSION_TABLE': session_table.table_name,
                'CONTENT_BUCKET': content_bucket.bucket_name,
            },
            log_retention=logs.RetentionDays.ONE_WEEK,
        )

        self.agent_core_fn.add_to_role_policy(bedrock_policy)
        event_store_table.grant_read_write_data(self.agent_core_fn)
        session_table.grant_read_write_data(self.agent_core_fn)
        content_bucket.grant_read(self.agent_core_fn)

        # =================================================================
        # AG-UI Handler Lambda (AG-UI Protocol + Response Streaming)
        # =================================================================
        # CopilotKit からの AG-UI プロトコルリクエストを処理
        # Lambda Function URL でレスポンスストリーミングを有効化

        self.ag_ui_fn = lambda_.DockerImageFunction(
            self, 'AgUiFn',
            function_name='nova-ag-ui-handler',
            code=lambda_.DockerImageCode.from_ecr(
                repository=self.agent_core_repo,
                tag_or_digest='latest',
            ),
            memory_size=1024,
            timeout=Duration.seconds(300),
            environment={
                'NOVA_ENVIRONMENT': 'production',
                'EVENT_STORE_TABLE': event_store_table.table_name,
                'SESSION_TABLE': session_table.table_name,
                'CONTENT_BUCKET': content_bucket.bucket_name,
                'AG_UI_MODE': 'true',
            },
            log_retention=logs.RetentionDays.ONE_WEEK,
        )

        # Lambda Function URL (Response Streaming for SSE)
        self.ag_ui_url = self.ag_ui_fn.add_function_url(
            auth_type=lambda_.FunctionUrlAuthType.NONE,
            cors=lambda_.FunctionUrlCorsOptions(
                allowed_origins=['*'],
                allowed_methods=[lambda_.HttpMethod.POST, lambda_.HttpMethod.OPTIONS],
                allowed_headers=['Content-Type', 'Authorization'],
            ),
            invoke_mode=lambda_.InvokeMode.RESPONSE_STREAM,
        )

        self.ag_ui_fn.add_to_role_policy(bedrock_policy)
        event_store_table.grant_read_write_data(self.ag_ui_fn)
        session_table.grant_read_write_data(self.ag_ui_fn)
        content_bucket.grant_read(self.ag_ui_fn)

        # AG-UI Endpoint URL Output
        CfnOutput(
            self, 'AgUiEndpointUrl',
            value=self.ag_ui_url.url,
            description='AG-UI Protocol Endpoint (for CopilotKit)',
            export_name='NovaAgUiEndpointUrl',
        )

        # =================================================================
        # Audio Handler Lambda (Nova Sonic)
        # =================================================================

        self.audio_fn = lambda_.Function(
            self, 'AudioFn',
            function_name='nova-audio-handler',
            runtime=lambda_.Runtime.PYTHON_3_12,
            handler='handler.lambda_handler',
            code=lambda_.Code.from_asset('src/handlers/audio'),
            memory_size=256,
            timeout=Duration.seconds(300),
            environment={
                'EVENT_STORE_TABLE': event_store_table.table_name,
                'CONTENT_BUCKET': content_bucket.bucket_name,
                'NOVA_SONIC_MODEL_ID': 'amazon.nova-sonic-v1',
            },
            log_retention=logs.RetentionDays.ONE_WEEK,
        )

        self.audio_fn.add_to_role_policy(
            iam.PolicyStatement(
                actions=['bedrock:InvokeModel'],
                resources=['arn:aws:bedrock:*:*:model/amazon.nova-sonic-*'],
            )
        )
        event_store_table.grant_read_write_data(self.audio_fn)
        content_bucket.grant_read_write(self.audio_fn)

        # =================================================================
        # Video Handler Lambda (Nova Omni)
        # =================================================================

        self.video_fn = lambda_.Function(
            self, 'VideoFn',
            function_name='nova-video-handler',
            runtime=lambda_.Runtime.PYTHON_3_12,
            handler='handler.lambda_handler',
            code=lambda_.Code.from_asset('src/handlers/video'),
            memory_size=512,
            timeout=Duration.seconds(300),
            environment={
                'EVENT_STORE_TABLE': event_store_table.table_name,
                'CONTENT_BUCKET': content_bucket.bucket_name,
                'NOVA_OMNI_MODEL_ID': 'amazon.nova-omni-v1',
            },
            log_retention=logs.RetentionDays.ONE_WEEK,
        )

        self.video_fn.add_to_role_policy(
            iam.PolicyStatement(
                actions=['bedrock:InvokeModel'],
                resources=['arn:aws:bedrock:*:*:model/amazon.nova-omni-*'],
            )
        )
        event_store_table.grant_read_write_data(self.video_fn)
        content_bucket.grant_read_write(self.video_fn)

        # =================================================================
        # Search Handler Lambda (Nova Embeddings + S3 Vectors)
        # =================================================================

        self.search_fn = lambda_.Function(
            self, 'SearchFn',
            function_name='nova-search-handler',
            runtime=lambda_.Runtime.PYTHON_3_12,
            handler='handler.lambda_handler',
            code=lambda_.Code.from_asset('src/handlers/search'),
            memory_size=256,
            timeout=Duration.seconds(60),
            environment={
                'CONTENT_BUCKET': content_bucket.bucket_name,
                'NOVA_EMBEDDINGS_MODEL_ID': 'amazon.nova-multimodal-embeddings-v1',
            },
            log_retention=logs.RetentionDays.ONE_WEEK,
        )

        self.search_fn.add_to_role_policy(
            iam.PolicyStatement(
                actions=['bedrock:InvokeModel'],
                resources=['arn:aws:bedrock:*:*:model/amazon.nova-multimodal-embeddings-*'],
            )
        )
        # S3 Vectors API (Preview)
        self.search_fn.add_to_role_policy(
            iam.PolicyStatement(
                actions=['s3vectors:*'],
                resources=['*'],
            )
        )
        content_bucket.grant_read(self.search_fn)

        # =================================================================
        # Event Projector Lambda (DynamoDB Stream → Read Model)
        # =================================================================

        self.projector_fn = lambda_.Function(
            self, 'ProjectorFn',
            function_name='nova-event-projector',
            runtime=lambda_.Runtime.PYTHON_3_12,
            handler='handler.lambda_handler',
            code=lambda_.Code.from_asset('src/handlers/projector'),
            memory_size=256,
            timeout=Duration.seconds(60),
            environment={
                'READ_MODEL_TABLE': read_model_table.table_name,
            },
            log_retention=logs.RetentionDays.ONE_WEEK,
        )

        read_model_table.grant_read_write_data(self.projector_fn)

        # DynamoDB Stream Trigger
        self.projector_fn.add_event_source(
            event_sources.DynamoEventSource(
                event_store_table,
                starting_position=lambda_.StartingPosition.LATEST,
                batch_size=100,
                retry_attempts=3,
            )
        )
