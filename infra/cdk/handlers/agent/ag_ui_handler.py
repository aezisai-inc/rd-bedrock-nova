"""
AG-UI Protocol Handler for AgentCore Runtime

AG-UIプロトコル対応のLambda Response Streamingハンドラー。
CopilotKitと統合してリアルタイムUIイベントをストリーミング。

AG-UI Protocol Events:
- RUN_STARTED: エージェント実行開始
- TEXT_MESSAGE_START: アシスタントメッセージ開始
- TEXT_MESSAGE_CONTENT: テキストコンテンツ (delta)
- TEXT_MESSAGE_END: アシスタントメッセージ終了
- TOOL_CALL_START: ツール呼び出し開始
- TOOL_CALL_ARGS: ツール引数
- TOOL_CALL_END: ツール呼び出し終了
- RUN_FINISHED: エージェント実行完了
- RUN_ERROR: エラー発生
"""
import os
import json
import uuid
import asyncio
import logging
from typing import Any, AsyncGenerator, TypedDict
from dataclasses import dataclass, asdict
from enum import Enum

# Agent Core インポート
from src.agent.coordinator import NovaCoordinatorAgent

logger = logging.getLogger(__name__)
logger.setLevel(os.environ.get("LOG_LEVEL", "INFO"))


# =============================================================================
# AG-UI Protocol Types
# =============================================================================

class AgUiEventType(str, Enum):
    """AG-UI Protocol Event Types"""
    RUN_STARTED = "RUN_STARTED"
    RUN_FINISHED = "RUN_FINISHED"
    RUN_ERROR = "RUN_ERROR"
    TEXT_MESSAGE_START = "TEXT_MESSAGE_START"
    TEXT_MESSAGE_CONTENT = "TEXT_MESSAGE_CONTENT"
    TEXT_MESSAGE_END = "TEXT_MESSAGE_END"
    TOOL_CALL_START = "TOOL_CALL_START"
    TOOL_CALL_ARGS = "TOOL_CALL_ARGS"
    TOOL_CALL_END = "TOOL_CALL_END"
    STATE_SNAPSHOT = "STATE_SNAPSHOT"
    STATE_DELTA = "STATE_DELTA"
    MESSAGES_SNAPSHOT = "MESSAGES_SNAPSHOT"


@dataclass
class AgUiEvent:
    """AG-UI Protocol Event"""
    type: AgUiEventType
    
    def to_sse(self) -> str:
        """Convert to Server-Sent Events format"""
        data = asdict(self)
        data['type'] = self.type.value
        return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


@dataclass
class RunStartedEvent(AgUiEvent):
    """RUN_STARTED event"""
    thread_id: str
    run_id: str
    
    def __init__(self, thread_id: str, run_id: str):
        super().__init__(type=AgUiEventType.RUN_STARTED)
        self.thread_id = thread_id
        self.run_id = run_id


@dataclass
class RunFinishedEvent(AgUiEvent):
    """RUN_FINISHED event"""
    thread_id: str
    run_id: str
    
    def __init__(self, thread_id: str, run_id: str):
        super().__init__(type=AgUiEventType.RUN_FINISHED)
        self.thread_id = thread_id
        self.run_id = run_id


@dataclass
class RunErrorEvent(AgUiEvent):
    """RUN_ERROR event"""
    error: str
    
    def __init__(self, error: str):
        super().__init__(type=AgUiEventType.RUN_ERROR)
        self.error = error


@dataclass
class TextMessageStartEvent(AgUiEvent):
    """TEXT_MESSAGE_START event"""
    message_id: str
    role: str
    
    def __init__(self, message_id: str, role: str = "assistant"):
        super().__init__(type=AgUiEventType.TEXT_MESSAGE_START)
        self.message_id = message_id
        self.role = role


@dataclass
class TextMessageContentEvent(AgUiEvent):
    """TEXT_MESSAGE_CONTENT event"""
    message_id: str
    delta: str
    
    def __init__(self, message_id: str, delta: str):
        super().__init__(type=AgUiEventType.TEXT_MESSAGE_CONTENT)
        self.message_id = message_id
        self.delta = delta


@dataclass
class TextMessageEndEvent(AgUiEvent):
    """TEXT_MESSAGE_END event"""
    message_id: str
    
    def __init__(self, message_id: str):
        super().__init__(type=AgUiEventType.TEXT_MESSAGE_END)
        self.message_id = message_id


@dataclass 
class ToolCallStartEvent(AgUiEvent):
    """TOOL_CALL_START event"""
    tool_call_id: str
    tool_name: str
    parent_message_id: str
    
    def __init__(self, tool_call_id: str, tool_name: str, parent_message_id: str):
        super().__init__(type=AgUiEventType.TOOL_CALL_START)
        self.tool_call_id = tool_call_id
        self.tool_name = tool_name
        self.parent_message_id = parent_message_id


@dataclass
class ToolCallArgsEvent(AgUiEvent):
    """TOOL_CALL_ARGS event"""
    tool_call_id: str
    delta: str
    
    def __init__(self, tool_call_id: str, delta: str):
        super().__init__(type=AgUiEventType.TOOL_CALL_ARGS)
        self.tool_call_id = tool_call_id
        self.delta = delta


@dataclass
class ToolCallEndEvent(AgUiEvent):
    """TOOL_CALL_END event"""
    tool_call_id: str
    result: str | None = None
    
    def __init__(self, tool_call_id: str, result: str | None = None):
        super().__init__(type=AgUiEventType.TOOL_CALL_END)
        self.tool_call_id = tool_call_id
        self.result = result


# =============================================================================
# AG-UI Protocol Handler
# =============================================================================

class AgUiProtocolHandler:
    """
    AG-UI Protocol message handler.
    
    Translates between AG-UI protocol format and NovaCoordinatorAgent.
    """
    
    def __init__(self, agent: NovaCoordinatorAgent):
        self._agent = agent
    
    async def handle_request(
        self,
        messages: list[dict[str, Any]],
        thread_id: str,
        run_id: str | None = None,
    ) -> AsyncGenerator[str, None]:
        """
        Handle AG-UI protocol request.
        
        Args:
            messages: List of messages in AG-UI format
                [{"role": "user", "content": "..."}]
            thread_id: Thread/session identifier
            run_id: Optional run identifier
        
        Yields:
            SSE formatted strings
        """
        # Generate IDs
        if not run_id:
            run_id = f"run-{uuid.uuid4().hex[:8]}"
        message_id = f"msg-{uuid.uuid4().hex[:8]}"
        
        # Extract latest user message
        user_message = self._extract_user_message(messages)
        
        if not user_message:
            yield RunErrorEvent(error="No user message found").to_sse()
            return
        
        logger.info(
            "AG-UI request started",
            extra={
                "thread_id": thread_id,
                "run_id": run_id,
                "message_preview": user_message[:50],
            }
        )
        
        # Emit RUN_STARTED
        yield RunStartedEvent(thread_id=thread_id, run_id=run_id).to_sse()
        
        # Emit TEXT_MESSAGE_START
        yield TextMessageStartEvent(message_id=message_id, role="assistant").to_sse()
        
        try:
            # Process with Agent
            result = await self._agent.process(
                user_input=user_message,
                session_id=thread_id,
            )
            
            # Extract response
            response_text = self._extract_response(result)
            
            # Check for tool executions
            if result.get("tool_executions"):
                for tool_exec in result["tool_executions"]:
                    tool_call_id = f"tool-{uuid.uuid4().hex[:8]}"
                    
                    # Tool call start
                    yield ToolCallStartEvent(
                        tool_call_id=tool_call_id,
                        tool_name=tool_exec.get("tool_name", "unknown"),
                        parent_message_id=message_id,
                    ).to_sse()
                    
                    # Tool call args
                    if tool_exec.get("arguments"):
                        yield ToolCallArgsEvent(
                            tool_call_id=tool_call_id,
                            delta=json.dumps(tool_exec["arguments"], ensure_ascii=False),
                        ).to_sse()
                    
                    # Tool call end
                    yield ToolCallEndEvent(
                        tool_call_id=tool_call_id,
                        result=json.dumps(tool_exec.get("result"), ensure_ascii=False) if tool_exec.get("result") else None,
                    ).to_sse()
            
            # Emit TEXT_MESSAGE_CONTENT
            # For now, emit as single chunk (non-streaming from agent)
            # Future: Support actual streaming from Bedrock
            yield TextMessageContentEvent(
                message_id=message_id,
                delta=response_text,
            ).to_sse()
            
            # Emit TEXT_MESSAGE_END
            yield TextMessageEndEvent(message_id=message_id).to_sse()
            
            # Emit RUN_FINISHED
            yield RunFinishedEvent(thread_id=thread_id, run_id=run_id).to_sse()
            
            logger.info(
                "AG-UI request completed",
                extra={
                    "thread_id": thread_id,
                    "run_id": run_id,
                    "response_length": len(response_text),
                }
            )
            
        except Exception as e:
            logger.exception(f"AG-UI request error: {e}")
            yield RunErrorEvent(error=str(e)).to_sse()
    
    def _extract_user_message(self, messages: list[dict[str, Any]]) -> str:
        """Extract the latest user message from AG-UI format messages."""
        for msg in reversed(messages):
            if msg.get("role") == "user":
                content = msg.get("content", "")
                if isinstance(content, str):
                    return content
                elif isinstance(content, list):
                    # Handle content array format (multimodal)
                    parts = []
                    for item in content:
                        if isinstance(item, dict):
                            if item.get("type") == "text":
                                parts.append(item.get("text", ""))
                            elif "text" in item:
                                parts.append(item["text"])
                    return " ".join(parts)
        return ""
    
    def _extract_response(self, result: dict[str, Any]) -> str:
        """Extract response text from agent result."""
        if isinstance(result, dict):
            # Check common response keys
            if "response" in result:
                return str(result["response"])
            if "message" in result:
                return str(result["message"])
            if "content" in result:
                return str(result["content"])
            if "text" in result:
                return str(result["text"])
        return str(result)


# =============================================================================
# Global Handler Instance
# =============================================================================

_handler_instance: AgUiProtocolHandler | None = None
_agent_instance: NovaCoordinatorAgent | None = None


def get_handler() -> AgUiProtocolHandler:
    """Get AG-UI handler instance (singleton)."""
    global _handler_instance, _agent_instance
    
    if _handler_instance is None:
        if _agent_instance is None:
            logger.info("Initializing Agent Core for AG-UI...")
            _agent_instance = NovaCoordinatorAgent(
                session_table=os.environ.get('SESSION_TABLE'),
                event_store_table=os.environ.get('EVENT_STORE_TABLE'),
                model_id=os.environ.get('MODEL_ID', 'anthropic.claude-3-5-sonnet-20240620-v1:0'),
                guardrail_id=os.environ.get('GUARDRAIL_ID'),
            )
        _handler_instance = AgUiProtocolHandler(_agent_instance)
        logger.info("AG-UI Protocol Handler initialized")
    
    return _handler_instance


# =============================================================================
# Lambda Handler (Response Streaming)
# =============================================================================

async def ag_ui_stream_generator(
    messages: list[dict[str, Any]],
    thread_id: str,
    run_id: str | None = None,
) -> AsyncGenerator[bytes, None]:
    """
    Generator for Lambda Response Streaming.
    
    Yields SSE formatted bytes for streaming response.
    """
    handler = get_handler()
    
    async for event_str in handler.handle_request(messages, thread_id, run_id):
        yield event_str.encode('utf-8')


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """
    Lambda Handler for AG-UI Protocol
    
    Supports both:
    1. Standard invocation (returns accumulated response)
    2. Response Streaming (via Lambda URLs with streaming)
    
    Request body format (AG-UI Protocol):
    {
        "messages": [{"role": "user", "content": "..."}],
        "threadId": "session-123",
        "runId": "run-456"  // optional
    }
    """
    logger.info(f"AG-UI Lambda received event: {json.dumps(event)[:500]}")
    
    try:
        # Parse body
        body = {}
        if event.get('body'):
            body = json.loads(event['body']) if isinstance(event['body'], str) else event['body']
        
        messages = body.get('messages', [])
        thread_id = body.get('threadId', f"thread-{uuid.uuid4().hex[:8]}")
        run_id = body.get('runId')
        
        # Collect all events (non-streaming fallback)
        async def collect_events():
            events = []
            async for event_bytes in ag_ui_stream_generator(messages, thread_id, run_id):
                events.append(event_bytes.decode('utf-8'))
            return events
        
        events = asyncio.get_event_loop().run_until_complete(collect_events())
        
        # Return as SSE response
        sse_body = "".join(events)
        
        return {
            'statusCode': 200,
            'body': sse_body,
            'headers': {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
            },
        }
        
    except Exception as e:
        logger.exception(f"AG-UI Lambda error: {e}")
        error_event = RunErrorEvent(error=str(e)).to_sse()
        
        return {
            'statusCode': 500,
            'body': error_event,
            'headers': {
                'Content-Type': 'text/event-stream',
                'Access-Control-Allow-Origin': '*',
            },
        }


def lambda_handler_streaming(event: dict[str, Any], context: Any):
    """
    Lambda Handler with Response Streaming support.
    
    Use with Lambda Function URL with response streaming enabled.
    This handler yields SSE events as they are generated.
    
    Note: Requires Lambda runtime that supports response streaming
    (e.g., Python 3.12 with awslambdaric supporting streaming)
    """
    # For Lambda Response Streaming, return an async generator
    # The Lambda runtime will handle streaming automatically
    
    body = {}
    if event.get('body'):
        body = json.loads(event['body']) if isinstance(event['body'], str) else event['body']
    
    messages = body.get('messages', [])
    thread_id = body.get('threadId', f"thread-{uuid.uuid4().hex[:8]}")
    run_id = body.get('runId')
    
    return ag_ui_stream_generator(messages, thread_id, run_id)




