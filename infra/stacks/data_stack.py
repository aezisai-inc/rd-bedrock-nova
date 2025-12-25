"""
Data Stack (Serverless)

DynamoDB (On-Demand), S3
- Event Store (Event Sourcing)
- Read Model (CQRS)
- Session Memory (TTL-based, Redis代替)
- Content Bucket (メディアファイル)
"""
from aws_cdk import (
    NestedStack,
    RemovalPolicy,
    Duration,
    aws_dynamodb as dynamodb,
    aws_s3 as s3,
)
from constructs import Construct


class DataStack(NestedStack):
    """サーバレスデータ層のリソースを管理するスタック。"""

    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        **kwargs
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # =================================================================
        # DynamoDB Tables
        # =================================================================

        # Event Store Table (Event Sourcing)
        self.event_store_table = dynamodb.Table(
            self, 'EventStore',
            table_name='nova-event-store',
            partition_key=dynamodb.Attribute(
                name='pk',
                type=dynamodb.AttributeType.STRING
            ),
            sort_key=dynamodb.Attribute(
                name='sk',
                type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            stream=dynamodb.StreamViewType.NEW_IMAGE,
            point_in_time_recovery=True,
            encryption=dynamodb.TableEncryption.AWS_MANAGED,
            removal_policy=RemovalPolicy.RETAIN,
        )

        # GSI for event type queries
        self.event_store_table.add_global_secondary_index(
            index_name='gsi1',
            partition_key=dynamodb.Attribute(
                name='gsi1pk',
                type=dynamodb.AttributeType.STRING
            ),
            sort_key=dynamodb.Attribute(
                name='gsi1sk',
                type=dynamodb.AttributeType.STRING
            ),
        )

        # Read Model Table (CQRS)
        self.read_model_table = dynamodb.Table(
            self, 'ReadModel',
            table_name='nova-read-model',
            partition_key=dynamodb.Attribute(
                name='pk',
                type=dynamodb.AttributeType.STRING
            ),
            sort_key=dynamodb.Attribute(
                name='sk',
                type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.DESTROY,
        )

        # Session Memory Table (Redis代替 - TTL付きDynamoDB)
        # Agent Core の短期メモリ管理
        self.session_table = dynamodb.Table(
            self, 'SessionMemory',
            table_name='nova-session-memory',
            partition_key=dynamodb.Attribute(
                name='session_id',
                type=dynamodb.AttributeType.STRING
            ),
            sort_key=dynamodb.Attribute(
                name='sk',
                type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            time_to_live_attribute='ttl',  # TTL for automatic expiration
            removal_policy=RemovalPolicy.DESTROY,
        )

        # GSI for user-based queries
        self.session_table.add_global_secondary_index(
            index_name='user-index',
            partition_key=dynamodb.Attribute(
                name='user_id',
                type=dynamodb.AttributeType.STRING
            ),
            sort_key=dynamodb.Attribute(
                name='created_at',
                type=dynamodb.AttributeType.STRING
            ),
        )

        # =================================================================
        # S3 Bucket
        # =================================================================

        self.content_bucket = s3.Bucket(
            self, 'ContentBucket',
            encryption=s3.BucketEncryption.S3_MANAGED,
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            enforce_ssl=True,
            versioned=True,
            lifecycle_rules=[
                s3.LifecycleRule(
                    id='TransitionToIntelligentTiering',
                    transitions=[
                        s3.Transition(
                            storage_class=s3.StorageClass.INTELLIGENT_TIERING,
                            transition_after=Duration.days(30),
                        )
                    ]
                ),
            ],
            cors=[
                s3.CorsRule(
                    allowed_methods=[
                        s3.HttpMethods.GET,
                        s3.HttpMethods.PUT,
                        s3.HttpMethods.POST,
                    ],
                    allowed_origins=['*'],
                    allowed_headers=['*'],
                    max_age=3000,
                )
            ],
            removal_policy=RemovalPolicy.RETAIN,
        )
