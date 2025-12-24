"""
Data Stack

DynamoDB, S3, ElastiCache Redis
"""
from aws_cdk import (
    NestedStack,
    RemovalPolicy,
    Duration,
    aws_dynamodb as dynamodb,
    aws_s3 as s3,
    aws_elasticache as elasticache,
    aws_ec2 as ec2,
)
from constructs import Construct


class DataStack(NestedStack):
    """データ層のリソースを管理するスタック。"""

    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        vpc: ec2.IVpc,
        **kwargs
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        self.vpc = vpc

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

        # =================================================================
        # ElastiCache Redis (Agent Core Memory)
        # =================================================================

        # Redis Security Group
        self.redis_security_group = ec2.SecurityGroup(
            self, 'RedisSecurityGroup',
            vpc=vpc,
            description='Security group for Redis cluster',
            allow_all_outbound=True,
        )

        self.redis_security_group.add_ingress_rule(
            ec2.Peer.ipv4(vpc.vpc_cidr_block),
            ec2.Port.tcp(6379),
            'Allow Redis access from VPC',
        )

        # Redis Subnet Group
        redis_subnet_group = elasticache.CfnSubnetGroup(
            self, 'RedisSubnetGroup',
            description='Subnet group for Nova Redis',
            subnet_ids=[s.subnet_id for s in vpc.isolated_subnets],
            cache_subnet_group_name='nova-redis-subnet-group',
        )

        # Redis Replication Group
        self.redis_cluster = elasticache.CfnReplicationGroup(
            self, 'RedisCluster',
            replication_group_description='Nova Agent Core session/memory cache',
            engine='redis',
            engine_version='7.0',
            cache_node_type='cache.t4g.medium',
            num_cache_clusters=2,
            automatic_failover_enabled=True,
            multi_az_enabled=True,
            cache_subnet_group_name=redis_subnet_group.ref,
            security_group_ids=[self.redis_security_group.security_group_id],
            at_rest_encryption_enabled=True,
            transit_encryption_enabled=True,
        )
