"""
Compute Stack

ECS Fargate Services:
- Agent Core (Coordinator)
- Audio Service (Nova Sonic)
- Video Service (Nova Omni)
- Search Service (Nova Embeddings)
"""
from aws_cdk import (
    NestedStack,
    Duration,
    aws_ecs as ecs,
    aws_ecs_patterns as ecs_patterns,
    aws_ecr as ecr,
    aws_iam as iam,
    aws_ec2 as ec2,
    aws_elasticloadbalancingv2 as elbv2,
    aws_servicediscovery as servicediscovery,
    aws_dynamodb as dynamodb,
    aws_s3 as s3,
    aws_elasticache as elasticache,
)
from constructs import Construct


class ComputeStack(NestedStack):
    """ECS Fargate サービスを管理するスタック。"""

    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        vpc: ec2.IVpc,
        event_store_table: dynamodb.Table,
        read_model_table: dynamodb.Table,
        content_bucket: s3.Bucket,
        redis_cluster: elasticache.CfnReplicationGroup,
        **kwargs
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # =================================================================
        # ECS Cluster
        # =================================================================

        self.cluster = ecs.Cluster(
            self, 'NovaCluster',
            vpc=vpc,
            container_insights=True,
            cluster_name='nova-cluster',
        )

        # =================================================================
        # Cloud Map Namespace (Service Discovery)
        # =================================================================

        namespace = servicediscovery.PrivateDnsNamespace(
            self, 'Namespace',
            name='nova.local',
            vpc=vpc,
        )

        # =================================================================
        # ECR Repositories
        # =================================================================

        agent_core_repo = ecr.Repository(
            self, 'AgentCoreRepo',
            repository_name='nova-agent-core',
        )

        audio_service_repo = ecr.Repository(
            self, 'AudioServiceRepo',
            repository_name='nova-audio-service',
        )

        video_service_repo = ecr.Repository(
            self, 'VideoServiceRepo',
            repository_name='nova-video-service',
        )

        search_service_repo = ecr.Repository(
            self, 'SearchServiceRepo',
            repository_name='nova-search-service',
        )

        # =================================================================
        # Bedrock Policy (共通)
        # =================================================================

        bedrock_policy = iam.PolicyStatement(
            actions=[
                'bedrock:InvokeModel',
                'bedrock:InvokeModelWithResponseStream',
            ],
            resources=['arn:aws:bedrock:*:*:model/*'],
        )

        # =================================================================
        # Agent Core Service (Coordinator)
        # =================================================================

        agent_core_task_def = ecs.FargateTaskDefinition(
            self, 'AgentCoreTaskDef',
            memory_limit_mib=2048,
            cpu=1024,
        )

        agent_core_task_def.add_container(
            'AgentCoreContainer',
            image=ecs.ContainerImage.from_ecr_repository(agent_core_repo, 'latest'),
            port_mappings=[ecs.PortMapping(container_port=8000)],
            environment={
                'NOVA_ENVIRONMENT': 'production',
                'REDIS_HOST': redis_cluster.attr_primary_end_point_address,
                'REDIS_PORT': redis_cluster.attr_primary_end_point_port,
                'EVENT_STORE_TABLE': event_store_table.table_name,
                'AUDIO_SERVICE_URL': 'http://audio-service.nova.local:8000',
                'VIDEO_SERVICE_URL': 'http://video-service.nova.local:8000',
                'SEARCH_SERVICE_URL': 'http://search-service.nova.local:8000',
            },
            logging=ecs.LogDrivers.aws_logs(stream_prefix='agent-core'),
        )

        agent_core_task_def.task_role.add_to_principal_policy(bedrock_policy)
        event_store_table.grant_read_write_data(agent_core_task_def.task_role)

        agent_core_service = ecs_patterns.ApplicationLoadBalancedFargateService(
            self, 'AgentCoreService',
            cluster=self.cluster,
            service_name='nova-agent-core',
            task_definition=agent_core_task_def,
            desired_count=2,
            public_load_balancer=True,
            cloud_map_options=ecs.CloudMapOptions(
                name='agent-core',
                cloud_map_namespace=namespace,
            ),
        )

        # Health Check
        agent_core_service.target_group.configure_health_check(
            path='/health',
            healthy_http_codes='200',
        )

        # =================================================================
        # Audio Service (Nova Sonic)
        # =================================================================

        audio_task_def = ecs.FargateTaskDefinition(
            self, 'AudioTaskDef',
            memory_limit_mib=1024,
            cpu=512,
        )

        audio_task_def.add_container(
            'AudioContainer',
            image=ecs.ContainerImage.from_ecr_repository(audio_service_repo, 'latest'),
            port_mappings=[ecs.PortMapping(container_port=8000)],
            environment={
                'EVENT_STORE_TABLE': event_store_table.table_name,
                'CONTENT_BUCKET': content_bucket.bucket_name,
                'NOVA_SONIC_MODEL_ID': 'amazon.nova-sonic-v1',
            },
            logging=ecs.LogDrivers.aws_logs(stream_prefix='audio-service'),
        )

        audio_task_def.task_role.add_to_principal_policy(
            iam.PolicyStatement(
                actions=['bedrock:InvokeModel'],
                resources=['arn:aws:bedrock:*:*:model/amazon.nova-sonic-*'],
            )
        )
        event_store_table.grant_read_write_data(audio_task_def.task_role)
        content_bucket.grant_read_write(audio_task_def.task_role)

        audio_service = ecs.FargateService(
            self, 'AudioService',
            cluster=self.cluster,
            service_name='nova-audio-service',
            task_definition=audio_task_def,
            desired_count=2,
            cloud_map_options=ecs.CloudMapOptions(
                name='audio-service',
                cloud_map_namespace=namespace,
            ),
        )

        # =================================================================
        # Video Service (Nova Omni)
        # =================================================================

        video_task_def = ecs.FargateTaskDefinition(
            self, 'VideoTaskDef',
            memory_limit_mib=2048,
            cpu=1024,
        )

        video_task_def.add_container(
            'VideoContainer',
            image=ecs.ContainerImage.from_ecr_repository(video_service_repo, 'latest'),
            port_mappings=[ecs.PortMapping(container_port=8000)],
            environment={
                'EVENT_STORE_TABLE': event_store_table.table_name,
                'CONTENT_BUCKET': content_bucket.bucket_name,
                'NOVA_OMNI_MODEL_ID': 'amazon.nova-omni-v1',
            },
            logging=ecs.LogDrivers.aws_logs(stream_prefix='video-service'),
        )

        video_task_def.task_role.add_to_principal_policy(
            iam.PolicyStatement(
                actions=['bedrock:InvokeModel'],
                resources=['arn:aws:bedrock:*:*:model/amazon.nova-omni-*'],
            )
        )
        event_store_table.grant_read_write_data(video_task_def.task_role)
        content_bucket.grant_read_write(video_task_def.task_role)

        video_service = ecs.FargateService(
            self, 'VideoService',
            cluster=self.cluster,
            service_name='nova-video-service',
            task_definition=video_task_def,
            desired_count=2,
            cloud_map_options=ecs.CloudMapOptions(
                name='video-service',
                cloud_map_namespace=namespace,
            ),
        )

        # =================================================================
        # Search Service (Nova Embeddings)
        # =================================================================

        search_task_def = ecs.FargateTaskDefinition(
            self, 'SearchTaskDef',
            memory_limit_mib=1024,
            cpu=512,
        )

        search_task_def.add_container(
            'SearchContainer',
            image=ecs.ContainerImage.from_ecr_repository(search_service_repo, 'latest'),
            port_mappings=[ecs.PortMapping(container_port=8000)],
            environment={
                'CONTENT_BUCKET': content_bucket.bucket_name,
                'NOVA_EMBEDDINGS_MODEL_ID': 'amazon.nova-multimodal-embeddings-v1',
                # TODO: OpenSearch Serverless廃止後、代替ベクトルストアを設定
                # 候補: Bedrock Knowledge Bases, PostgreSQL pgvector, etc.
            },
            logging=ecs.LogDrivers.aws_logs(stream_prefix='search-service'),
        )

        search_task_def.task_role.add_to_principal_policy(
            iam.PolicyStatement(
                actions=['bedrock:InvokeModel'],
                resources=['arn:aws:bedrock:*:*:model/amazon.nova-multimodal-embeddings-*'],
            )
        )
        # OpenSearch Serverless廃止: aoss:APIAccessAll ポリシー削除
        content_bucket.grant_read(search_task_def.task_role)

        search_service = ecs.FargateService(
            self, 'SearchService',
            cluster=self.cluster,
            service_name='nova-search-service',
            task_definition=search_task_def,
            desired_count=2,
            cloud_map_options=ecs.CloudMapOptions(
                name='search-service',
                cloud_map_namespace=namespace,
            ),
        )

        # =================================================================
        # Auto Scaling
        # =================================================================

        for service in [agent_core_service.service, audio_service, video_service, search_service]:
            scaling = service.auto_scale_task_count(
                min_capacity=2,
                max_capacity=20,
            )

            scaling.scale_on_cpu_utilization(
                'CpuScaling',
                target_utilization_percent=70,
                scale_in_cooldown=Duration.seconds(60),
                scale_out_cooldown=Duration.seconds(60),
            )

            scaling.scale_on_memory_utilization(
                'MemoryScaling',
                target_utilization_percent=80,
            )

        # =================================================================
        # Outputs
        # =================================================================

        self.alb_dns_name = agent_core_service.load_balancer.load_balancer_dns_name

