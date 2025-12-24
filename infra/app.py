#!/usr/bin/env python3
"""
CDK Application Entry Point

Nova Platform - ECS Fargate + Agent Core ベースのマイクロサービスをデプロイ。
"""
import os
import aws_cdk as cdk

from infra.stacks.nova_platform_stack import NovaPlatformStack

app = cdk.App()

# 環境設定
env = cdk.Environment(
    account=os.environ.get('CDK_DEFAULT_ACCOUNT'),
    region=os.environ.get('CDK_DEFAULT_REGION', 'ap-northeast-1'),
)

# メインスタック (ECS Fargate + Agent Core)
NovaPlatformStack(
    app,
    'NovaPlatformStack',
    env=env,
    description='Nova Platform - ECS Fargate + Agent Core Multimodal AI System',
)

app.synth()

