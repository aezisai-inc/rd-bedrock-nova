"""
API Stack

API Gateway (REST) for serverless Lambda functions.
"""
from aws_cdk import (
    NestedStack,
    aws_apigateway as apigw,
    aws_lambda as lambda_,
    aws_logs as logs,
)
from constructs import Construct


class ApiStack(NestedStack):
    """API Gateway スタック。"""

    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        agent_core_fn: lambda_.IFunction,
        audio_fn: lambda_.IFunction,
        video_fn: lambda_.IFunction,
        search_fn: lambda_.IFunction,
        **kwargs
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # =================================================================
        # REST API
        # =================================================================

        self.api = apigw.RestApi(
            self, 'NovaApi',
            rest_api_name='nova-platform-api',
            description='Nova Platform REST API (Serverless)',
            deploy_options=apigw.StageOptions(
                stage_name='v1',
                logging_level=apigw.MethodLoggingLevel.INFO,
                data_trace_enabled=True,
                metrics_enabled=True,
                throttling_rate_limit=1000,
                throttling_burst_limit=500,
            ),
            default_cors_preflight_options=apigw.CorsOptions(
                allow_origins=apigw.Cors.ALL_ORIGINS,
                allow_methods=apigw.Cors.ALL_METHODS,
                allow_headers=['Content-Type', 'Authorization', 'X-Api-Key'],
            ),
        )

        # =================================================================
        # Agent Core Endpoints
        # =================================================================

        agent_resource = self.api.root.add_resource('agent')

        # POST /agent/chat - Main conversation endpoint
        agent_chat = agent_resource.add_resource('chat')
        agent_chat.add_method(
            'POST',
            apigw.LambdaIntegration(
                agent_core_fn,
                timeout=apigw.Duration.seconds(29),
            ),
        )

        # POST /agent/sessions - Create new session
        agent_sessions = agent_resource.add_resource('sessions')
        agent_sessions.add_method(
            'POST',
            apigw.LambdaIntegration(agent_core_fn),
        )

        # GET /agent/sessions/{sessionId} - Get session
        agent_session = agent_sessions.add_resource('{sessionId}')
        agent_session.add_method(
            'GET',
            apigw.LambdaIntegration(agent_core_fn),
        )

        # DELETE /agent/sessions/{sessionId} - Delete session
        agent_session.add_method(
            'DELETE',
            apigw.LambdaIntegration(agent_core_fn),
        )

        # =================================================================
        # Audio Endpoints
        # =================================================================

        audio_resource = self.api.root.add_resource('audio')

        # POST /audio/transcribe - Transcribe audio
        audio_transcribe = audio_resource.add_resource('transcribe')
        audio_transcribe.add_method(
            'POST',
            apigw.LambdaIntegration(
                audio_fn,
                timeout=apigw.Duration.seconds(29),
            ),
        )

        # POST /audio/analyze - Analyze audio (sentiment, etc.)
        audio_analyze = audio_resource.add_resource('analyze')
        audio_analyze.add_method(
            'POST',
            apigw.LambdaIntegration(audio_fn),
        )

        # =================================================================
        # Video Endpoints
        # =================================================================

        video_resource = self.api.root.add_resource('video')

        # POST /video/analyze - Analyze video
        video_analyze = video_resource.add_resource('analyze')
        video_analyze.add_method(
            'POST',
            apigw.LambdaIntegration(
                video_fn,
                timeout=apigw.Duration.seconds(29),
            ),
        )

        # =================================================================
        # Search Endpoints
        # =================================================================

        search_resource = self.api.root.add_resource('search')

        # POST /search - Semantic search
        search_resource.add_method(
            'POST',
            apigw.LambdaIntegration(search_fn),
        )

        # POST /search/index - Index document
        search_index = search_resource.add_resource('index')
        search_index.add_method(
            'POST',
            apigw.LambdaIntegration(search_fn),
        )

        # POST /search/embeddings - Generate embeddings
        search_embeddings = search_resource.add_resource('embeddings')
        search_embeddings.add_method(
            'POST',
            apigw.LambdaIntegration(search_fn),
        )

        # =================================================================
        # Health Check
        # =================================================================

        health_resource = self.api.root.add_resource('health')
        health_resource.add_method(
            'GET',
            apigw.MockIntegration(
                integration_responses=[
                    apigw.IntegrationResponse(
                        status_code='200',
                        response_templates={
                            'application/json': '{"status": "healthy", "service": "nova-platform"}'
                        },
                    )
                ],
                request_templates={
                    'application/json': '{"statusCode": 200}'
                },
            ),
            method_responses=[
                apigw.MethodResponse(status_code='200')
            ],
        )

        # =================================================================
        # Outputs
        # =================================================================

        self.api_url = self.api.url

