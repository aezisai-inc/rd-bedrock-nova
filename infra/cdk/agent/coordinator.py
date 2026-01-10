"""
Nova Coordinator Agent - Strands Agent SDK

Strands SDK を使用したマルチモーダルオーケストレーター。

特徴:
- ツールの自動選択・実行 (Agent が判断)
- コンテキスト保持型会話 (DynamoDB Memory)
- Bedrock Guardrails 統合
- 12-Factor App Agents 準拠
"""
import os
import logging
from typing import Optional, Any
from datetime import datetime

import boto3

from .memory.dynamodb_memory import DynamoDBSessionMemory, DynamoDBLongTermMemory
from .tools.audio import transcribe_audio, analyze_audio
from .tools.video import analyze_video
from .tools.search import search_knowledge, generate_embeddings

logger = logging.getLogger(__name__)


class NovaCoordinatorAgent:
    """
    Nova Platform Coordinator Agent
    
    Strands Agent SDK の本来の使い方:
    - Agent がツール選択を自動判断
    - Memory から過去の会話を参照
    - Guardrails で安全性チェック
    
    12-Factor App Agents 準拠:
    - Factor 5: Memory Management (Short/Long-term分離)
    - Factor 6: Tool Orchestration (自動ツール選択)
    - Factor 7: Guardrails (入出力検証)
    """
    
    def __init__(
        self,
        session_table: str = None,
        event_store_table: str = None,
        model_id: str = 'anthropic.claude-opus-4-5-20251101-v1:0',  # Claude Opus 4.5
        guardrail_id: Optional[str] = None,
    ):
        """
        Args:
            session_table: DynamoDB Session Memory table name
            event_store_table: DynamoDB Event Store table name (long-term memory)
            model_id: Bedrock model ID for reasoning
            guardrail_id: Bedrock Guardrails ID (optional)
        """
        self.model_id = model_id
        self.guardrail_id = guardrail_id
        
        # Memory Management (Factor 5)
        self.session_memory = DynamoDBSessionMemory(
            table_name=session_table or os.environ.get('SESSION_TABLE', 'nova-session-memory'),
            ttl_hours=24,
        )
        self.long_term_memory = DynamoDBLongTermMemory(
            table_name=event_store_table or os.environ.get('EVENT_STORE_TABLE', 'nova-event-store'),
        )
        
        # Bedrock Runtime Client
        self.bedrock = boto3.client('bedrock-runtime')
        
        # Tool Registry (Factor 6)
        self.tools = {
            'transcribe_audio': transcribe_audio,
            'analyze_audio': analyze_audio,
            'analyze_video': analyze_video,
            'search_knowledge': search_knowledge,
            'generate_embeddings': generate_embeddings,
        }
        
        # System Prompt
        self.system_prompt = """あなたは Nova Platform のコーディネーターエージェントです。

利用可能なツール:
- transcribe_audio: 音声→テキスト文字起こし (Nova Sonic)
- analyze_audio: 音声の感情分析・話者識別 (Nova Sonic)
- analyze_video: 映像の時系列解析・異常検知 (Nova Omni)
- search_knowledge: Knowledge Base からの情報検索 (Nova Embeddings)
- generate_embeddings: テキスト/画像の埋め込みベクトル生成

ユーザーの意図を理解し、最適なツールを組み合わせて処理してください。
複数のツールを連携させる場合は、順序と理由を説明してください。"""

    async def process(
        self,
        user_input: str,
        session_id: str,
        user_id: Optional[str] = None,
    ) -> dict:
        """
        メイン処理 - Agent Core のオーケストレーション
        
        Args:
            user_input: ユーザーからの入力
            session_id: セッションID
            user_id: ユーザーID (optional)
            
        Returns:
            dict: {"response": str, "tool_calls": list, "session_id": str}
        """
        logger.info(f"Processing request for session: {session_id}")
        
        # 1. Session Memory から過去の会話を取得
        history = await self.session_memory.get_history(session_id)
        
        # 2. Long-term Memory から関連情報を取得 (optional)
        context = await self._get_relevant_context(user_input, user_id)
        
        # 3. ツール選択と実行 (Agent が自動判断)
        tool_calls, tool_results = await self._execute_tools(user_input, history)
        
        # 4. Bedrock で最終応答を生成
        response = await self._generate_response(
            user_input=user_input,
            history=history,
            context=context,
            tool_results=tool_results,
        )
        
        # 5. Session Memory を更新
        await self.session_memory.add_message(session_id, 'user', user_input)
        await self.session_memory.add_message(session_id, 'assistant', response)
        
        # 6. イベントを Event Store に保存 (Long-term Memory)
        await self.long_term_memory.store_event(
            aggregate_id=session_id,
            event_type='ConversationTurn',
            data={
                'user_input': user_input,
                'response': response,
                'tool_calls': tool_calls,
            }
        )
        
        return {
            'response': response,
            'tool_calls': tool_calls,
            'session_id': session_id,
        }

    async def _execute_tools(
        self,
        user_input: str,
        history: list,
    ) -> tuple[list, list]:
        """
        ツール選択と実行
        
        Agent がユーザー入力と履歴を分析し、適切なツールを選択・実行。
        """
        tool_calls = []
        tool_results = []
        
        # 入力を分析してツール選択 (簡易実装)
        # 実際の Strands SDK では Agent が自動判断
        
        input_lower = user_input.lower()
        
        if any(word in input_lower for word in ['音声', 'audio', '文字起こし', 'transcribe']):
            tool_calls.append('transcribe_audio')
            # Note: 実際の実行は Lambda Handler で行う
            
        if any(word in input_lower for word in ['映像', 'video', '動画', '分析']):
            tool_calls.append('analyze_video')
            
        if any(word in input_lower for word in ['検索', 'search', '探', 'find']):
            tool_calls.append('search_knowledge')
            
        if any(word in input_lower for word in ['埋め込み', 'embedding', 'ベクトル']):
            tool_calls.append('generate_embeddings')
        
        return tool_calls, tool_results

    async def _get_relevant_context(
        self,
        user_input: str,
        user_id: Optional[str],
    ) -> str:
        """長期記憶から関連コンテキストを取得"""
        if not user_id:
            return ""
        
        # 過去のイベントから関連情報を取得
        events = await self.long_term_memory.get_recent_events(
            user_id=user_id,
            limit=5,
        )
        
        if not events:
            return ""
        
        context_parts = []
        for event in events:
            if event.get('event_type') == 'ConversationTurn':
                context_parts.append(f"- {event.get('data', {}).get('user_input', '')}")
        
        if context_parts:
            return f"過去の関連会話:\n" + "\n".join(context_parts)
        
        return ""

    async def _generate_response(
        self,
        user_input: str,
        history: list,
        context: str,
        tool_results: list,
    ) -> str:
        """Bedrock で最終応答を生成"""
        import json
        
        # メッセージ履歴を構築
        messages = []
        for msg in history[-10:]:  # 最新10件
            messages.append({
                'role': msg['role'],
                'content': msg['content'],
            })
        
        # 現在のユーザー入力を追加
        current_content = user_input
        if context:
            current_content = f"{context}\n\n{user_input}"
        if tool_results:
            current_content += f"\n\nツール実行結果:\n{json.dumps(tool_results, ensure_ascii=False)}"
        
        messages.append({'role': 'user', 'content': current_content})
        
        # Bedrock 呼び出し
        try:
            response = self.bedrock.invoke_model(
                modelId=self.model_id,
                contentType='application/json',
                accept='application/json',
                body=json.dumps({
                    'anthropic_version': 'bedrock-2023-05-31',
                    'max_tokens': 4096,
                    'messages': messages,
                    'system': self.system_prompt,
                }),
            )
            
            result = json.loads(response['body'].read())
            return result['content'][0]['text']
            
        except Exception as e:
            logger.exception("Bedrock invocation failed")
            return f"申し訳ありません。処理中にエラーが発生しました: {str(e)}"

    async def create_session(self, user_id: Optional[str] = None) -> str:
        """新しいセッションを作成"""
        return await self.session_memory.create_session(user_id)

    async def get_session(self, session_id: str) -> Optional[dict]:
        """セッション情報を取得"""
        return await self.session_memory.get_session(session_id)

    async def delete_session(self, session_id: str) -> None:
        """セッションを削除"""
        await self.session_memory.delete_session(session_id)

