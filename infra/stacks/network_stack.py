"""
Network Stack

VPC, Subnets, VPC Endpoints
"""
from aws_cdk import (
    NestedStack,
    aws_ec2 as ec2,
)
from constructs import Construct


class NetworkStack(NestedStack):
    """ネットワークリソースを管理するスタック。"""

    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # VPC
        self.vpc = ec2.Vpc(
            self, 'NovaVpc',
            ip_addresses=ec2.IpAddresses.cidr('10.0.0.0/16'),
            max_azs=3,
            nat_gateways=2,
            subnet_configuration=[
                ec2.SubnetConfiguration(
                    name='Public',
                    subnet_type=ec2.SubnetType.PUBLIC,
                    cidr_mask=24,
                ),
                ec2.SubnetConfiguration(
                    name='Private',
                    subnet_type=ec2.SubnetType.PRIVATE_WITH_EGRESS,
                    cidr_mask=24,
                ),
                ec2.SubnetConfiguration(
                    name='Isolated',
                    subnet_type=ec2.SubnetType.PRIVATE_ISOLATED,
                    cidr_mask=24,
                ),
            ],
        )

        # VPC Endpoints

        # S3 Gateway Endpoint
        self.vpc.add_gateway_endpoint(
            'S3Endpoint',
            service=ec2.GatewayVpcEndpointAwsService.S3,
        )

        # DynamoDB Gateway Endpoint
        self.vpc.add_gateway_endpoint(
            'DynamoDBEndpoint',
            service=ec2.GatewayVpcEndpointAwsService.DYNAMODB,
        )

        # Bedrock Runtime Interface Endpoint
        self.vpc.add_interface_endpoint(
            'BedrockEndpoint',
            service=ec2.InterfaceVpcEndpointAwsService.BEDROCK_RUNTIME,
            private_dns_enabled=True,
        )

        # ECR Interface Endpoints
        self.vpc.add_interface_endpoint(
            'ECREndpoint',
            service=ec2.InterfaceVpcEndpointAwsService.ECR,
            private_dns_enabled=True,
        )

        self.vpc.add_interface_endpoint(
            'ECRDockerEndpoint',
            service=ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER,
            private_dns_enabled=True,
        )

        # Secrets Manager Interface Endpoint
        self.vpc.add_interface_endpoint(
            'SecretsManagerEndpoint',
            service=ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
            private_dns_enabled=True,
        )

        # CloudWatch Logs Interface Endpoint
        self.vpc.add_interface_endpoint(
            'CloudWatchLogsEndpoint',
            service=ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
            private_dns_enabled=True,
        )

