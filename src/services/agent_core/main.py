"""
Agent Core Service - Nova Platform Coordinator

セルフホスト型エージェントフレームワーク (ECS Fargate デプロイ)
- セッション管理 (Redis)
- オーケストレーション (Claude 3.5 Sonnet via Bedrock)
- ツール呼び出し管理 (Audio/Video/Search Services)
- Event Store への永続化 (DynamoDB)
"""
from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel, Field
from typing import Dict, Any, List, Optional
from datetime import datetime
import logging
import uuid
import os
import json
import httpx
import boto3
import redis.asyncio as redis

logger = logging.getLogger(__name__)

# Environment
REDIS_HOST = os.environ.get('REDIS_HOST', 'localhost')
REDIS_PORT = int(os.environ.get('REDIS_PORT', 6379))
EVENT_STORE_TABLE = os.environ.get('EVENT_STORE_TABLE', 'nova-event-store')
AWS_REGION = os.environ.get('AWS_REGION', 'ap-northeast-1')

# Service URLs (Cloud Map)
AUDIO_SERVICE_URL = os.environ.get('AUDIO_SERVICE_URL', 'http://audio-service.nova.local:8000')
VIDEO_SERVICE_URL = os.environ.get('VIDEO_SERVICE_URL', 'http://video-service.nova.local:8000')
SEARCH_SERVICE_URL = os.environ.get('SEARCH_SERVICE_URL', 'http://search-service.nova.local:8000')

# Clients
bedrock_client = boto3.client('bedrock-runtime', region_name=AWS_REGION)
dynamodb_client = boto3.client('dynamodb', region_name=AWS_REGION)


app = FastAPI(
    title="Nova Agent Core Service",
    version="0.1.0",
    description="セルフホスト型エージェントフレームワーク - ECS Fargate デプロイ",
)


# === Tool Definitions ===
TOOLS = [
    {
        "name": "transcribe_audio",
        "description": "音声ファイルをテキストに変換します。Nova Sonic を使用して高精度な文字起こしを行います。",
        "service_url": f"{AUDIO_SERVICE_URL}/transcribe",
        "input_schema": {
            "type": "object",
            "properties": {
                "audio_url": {"type": "string", "description": "S3上の音声ファイルURL"},
                "language": {"type": "string", "description": "言語コード (例: ja-JP)", "default": "ja-JP"},
            },
            "required": ["audio_url"],
        },
    },
    {
        "name": "analyze_video",
        "description": "映像を解析して異常やアクションを検出します。Nova Omni を使用したマルチモーダル解析を行います。",
        "service_url": f"{VIDEO_SERVICE_URL}/analyze",
        "input_schema": {
            "type": "object",
            "properties": {
                "video_url": {"type": "string", "description": "S3上の映像ファイルURL"},
                "analysis_type": {
                    "type": "string",
                    "description": "解析タイプ (anomaly: 異常検知, action: アクション認識, quality: 品質検査)",
                    "default": "anomaly",
                },
            },
            "required": ["video_url"],
        },
    },
    {
        "name": "search_similar",
        "description": "マルチモーダル類似検索を実行します。テキストや画像で関連コンテンツを検索します。",
        "service_url": f"{SEARCH_SERVICE_URL}/search",
        "input_schema": {
            "type": "object",
            "properties": {
                "text": {"type": "string", "description": "検索クエリテキスト"},
                "image_url": {"type": "string", "description": "検索に使用する画像URL"},
                "limit": {"type": "integer", "description": "取得件数", "default": 10},
            },
        },
    },
]


# === DTOs ===
class SessionCreateRequest(BaseModel):
    """セッション作成リクエスト"""
    user_id: Optional[str] = None
    context: Optional[Dict[str, Any]] = None


class SessionResponse(BaseModel):
    """セッションレスポンス"""
    session_id: str
    created_at: str
    status: str


class ChatRequest(BaseModel):
    """チャットリクエスト"""
    message: str = Field(..., description="ユーザーメッセージ")
    context: Optional[Dict[str, Any]] = Field(default=None, description="追加コンテキスト")


class ChatResponse(BaseModel):
    """チャットレスポンス"""
    session_id: str
    response: str
    tools_used: List[str] = []
    tool_results: Optional[Dict[str, Any]] = None
    timestamp: str


class ToolCall(BaseModel):
    """ツール呼び出し"""
    name: str
    input: Dict[str, Any]


# === Redis Helper Functions ===
async def get_redis_connection():
    """Redis接続を取得"""
    return await redis.from_url(f"redis://{REDIS_HOST}:{REDIS_PORT}", decode_responses=True)


async def get_session_history(session_id: str) -> List[Dict]:
    """セッション履歴を取得"""
    r = await get_redis_connection()
    try:
        data = await r.get(f"session:{session_id}:history")
        if data:
            return json.loads(data)
        return []
    finally:
        await r.aclose()


async def update_session_history(
    session_id: str, 
    user_message: str, 
    assistant_response: str, 
    tools_used: List[str]
):
    """セッション履歴を更新"""
    r = await get_redis_connection()
    try:
        history = await get_session_history(session_id)
        history.append({"role": "user", "content": user_message})
        history.append({
            "role": "assistant",
            "content": assistant_response,
            "tools_used": tools_used,
        })
        await r.setex(
            f"session:{session_id}:history",
            3600,  # 1時間
            json.dumps(history),
        )
    finally:
        await r.aclose()


async def create_session(session_id: str, user_id: Optional[str], context: Optional[Dict]):
    """セッションを作成"""
    r = await get_redis_connection()
    try:
        session_data = {
            "session_id": session_id,
            "user_id": user_id,
            "context": context or {},
            "created_at": datetime.utcnow().isoformat(),
        }
        await r.setex(
            f"session:{session_id}:metadata",
            3600,
            json.dumps(session_data),
        )
    finally:
        await r.aclose()


# === Bedrock Claude Functions ===
async def call_claude_with_tools(
    message: str, 
    history: List[Dict], 
    tools: List[Dict]
) -> Dict:
    """Claude 3.5 Sonnet をツール使用モードで呼び出し"""

    # ツール定義を Claude 形式に変換
    claude_tools = [
        {
            "name": t["name"],
            "description": t["description"],
            "input_schema": t["input_schema"],
        }
        for t in tools
    ]

    # メッセージ履歴を整形
    messages = []
    for h in history:
        messages.append({"role": h["role"], "content": h["content"]})
    messages.append({"role": "user", "content": message})

    request_body = {
        "anthropic_version": "bedrock-2023-05-31",
        "messages": messages,
        "tools": claude_tools,
        "max_tokens": 4096,
        "system": """あなたは Nova Platform のコーディネーターエージェントです。
ユーザーの要求を理解し、適切なツールを使って処理してください。

利用可能なツール:
- transcribe_audio: 音声を文字起こし (Nova Sonic)
- analyze_video: 映像を解析 (Nova Omni)
- search_similar: マルチモーダル検索 (Nova Embeddings)

日本語で丁寧に対応してください。ツールの結果は分かりやすく要約して伝えてください。""",
    }

    response = bedrock_client.invoke_model(
        modelId='anthropic.claude-3-5-sonnet-20241022-v2:0',
        body=json.dumps(request_body),
    )

    return json.loads(response['body'].read())


async def call_claude_with_tool_results(
    message: str,
    history: List[Dict],
    tool_results: Dict[str, Any],
) -> str:
    """ツール結果を含めて Claude に問い合わせ"""

    # ツール結果をコンテキストに追加
    tool_context = "\n".join([
        f"【{name}の結果】\n{json.dumps(result, ensure_ascii=False, indent=2)}"
        for name, result in tool_results.items()
    ])

    messages = []
    for h in history:
        messages.append({"role": h["role"], "content": h["content"]})
    messages.append({"role": "user", "content": message})
    messages.append({
        "role": "assistant",
        "content": f"ツールを使用して情報を取得しました。\n\n{tool_context}",
    })
    messages.append({
        "role": "user",
        "content": "上記の結果をもとに、元の質問に対して分かりやすく回答してください。",
    })

    request_body = {
        "anthropic_version": "bedrock-2023-05-31",
        "messages": messages,
        "max_tokens": 4096,
        "system": """あなたは Nova Platform のコーディネーターエージェントです。
ツールの実行結果を分かりやすく要約し、ユーザーの質問に回答してください。
日本語で丁寧に対応してください。""",
    }

    response = bedrock_client.invoke_model(
        modelId='anthropic.claude-3-5-sonnet-20241022-v2:0',
        body=json.dumps(request_body),
    )

    result = json.loads(response['body'].read())
    return result['content'][0]['text']


# === Tool Execution ===
async def execute_tool(tool_name: str, tool_input: Dict) -> Dict:
    """ツール（マイクロサービス）を呼び出し"""
    tool_config = next((t for t in TOOLS if t['name'] == tool_name), None)
    if not tool_config:
        raise ValueError(f"Unknown tool: {tool_name}")

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            tool_config['service_url'],
            json=tool_input,
        )
        response.raise_for_status()
        return response.json()


# === Event Store Functions ===
async def save_event(event_type: str, aggregate_id: str, data: Dict):
    """イベントをEvent Storeに保存"""
    event_id = str(uuid.uuid4())
    timestamp = datetime.utcnow().isoformat()

    dynamodb_client.put_item(
        TableName=EVENT_STORE_TABLE,
        Item={
            'pk': {'S': f"AGENT#{aggregate_id}"},
            'sk': {'S': f"EVENT#{timestamp}#{event_id}"},
            'EventType': {'S': event_type},
            'EventData': {'S': json.dumps({
                **data,
                'aggregate_id': aggregate_id,
                'timestamp': timestamp,
            })},
            'gsi1pk': {'S': f"EVENT_TYPE#{event_type}"},
            'gsi1sk': {'S': timestamp},
        }
    )


# === API Endpoints ===
@app.post("/sessions", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
async def create_new_session(request: SessionCreateRequest):
    """新しいセッションを開始"""
    session_id = str(uuid.uuid4())
    created_at = datetime.utcnow().isoformat()

    await create_session(session_id, request.user_id, request.context)

    # イベント保存
    await save_event("SessionCreated", session_id, {
        "user_id": request.user_id,
        "context": request.context,
    })

    logger.info(f"Session created: {session_id}")

    return SessionResponse(
        session_id=session_id,
        created_at=created_at,
        status="active",
    )


@app.post("/sessions/{session_id}/chat", response_model=ChatResponse)
async def chat(session_id: str, request: ChatRequest):
    """
    Agent Core のメインチャットエンドポイント。
    
    1. セッション履歴を取得 (Redis)
    2. Bedrock Claude でツール選択・実行を決定
    3. ツール呼び出しが必要な場合は実行
    4. セッション履歴を更新 (Redis)
    5. イベントを Event Store に保存
    """
    # 1. セッション履歴を取得
    history = await get_session_history(session_id)

    # 2. Claude でツール選択・実行を決定
    tools_used = []
    tool_results = {}

    try:
        response = await call_claude_with_tools(
            message=request.message,
            history=history,
            tools=TOOLS,
        )

        # 3. ツール呼び出しが必要な場合は実行
        content = response.get('content', [])
        for block in content:
            if block.get('type') == 'tool_use':
                tool_name = block['name']
                tool_input = block['input']

                logger.info(f"Executing tool: {tool_name} with input: {tool_input}")

                result = await execute_tool(tool_name, tool_input)
                tool_results[tool_name] = result
                tools_used.append(tool_name)

        # ツール結果を含めて最終応答を生成
        if tool_results:
            final_response = await call_claude_with_tool_results(
                message=request.message,
                history=history,
                tool_results=tool_results,
            )
        else:
            # ツールを使用しない場合は直接応答
            final_response = content[0]['text'] if content else "応答を生成できませんでした。"

    except Exception as e:
        logger.error(f"Error processing chat: {e}")
        final_response = f"申し訳ありません。処理中にエラーが発生しました: {str(e)}"

    # 4. セッション履歴を更新
    await update_session_history(session_id, request.message, final_response, tools_used)

    # 5. イベント保存
    await save_event("ChatCompleted", session_id, {
        "user_message": request.message,
        "assistant_response": final_response,
        "tools_used": tools_used,
    })

    timestamp = datetime.utcnow().isoformat()

    return ChatResponse(
        session_id=session_id,
        response=final_response,
        tools_used=tools_used,
        tool_results=tool_results if tool_results else None,
        timestamp=timestamp,
    )


@app.get("/sessions/{session_id}", response_model=Dict[str, Any])
async def get_session(session_id: str):
    """セッション情報を取得"""
    r = await get_redis_connection()
    try:
        metadata = await r.get(f"session:{session_id}:metadata")
        history = await r.get(f"session:{session_id}:history")

        if not metadata:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Session {session_id} not found",
            )

        return {
            "metadata": json.loads(metadata),
            "history": json.loads(history) if history else [],
        }
    finally:
        await r.aclose()


@app.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(session_id: str):
    """セッションを終了"""
    r = await get_redis_connection()
    try:
        await r.delete(f"session:{session_id}:metadata")
        await r.delete(f"session:{session_id}:history")

        # イベント保存
        await save_event("SessionEnded", session_id, {})

        logger.info(f"Session ended: {session_id}")
    finally:
        await r.aclose()


@app.get("/tools", response_model=List[Dict[str, Any]])
async def list_tools():
    """利用可能なツール一覧を取得"""
    return [
        {
            "name": t["name"],
            "description": t["description"],
            "input_schema": t["input_schema"],
        }
        for t in TOOLS
    ]


@app.get("/health", response_model=Dict[str, str])
async def health_check():
    """Agent Core サービスのヘルスチェック"""
    return {
        "status": "ok",
        "service": "agent-core",
        "message": "Agent Core service is healthy",
    }
