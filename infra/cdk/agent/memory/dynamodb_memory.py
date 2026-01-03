"""
DynamoDB Memory Implementation

Redis代替として DynamoDB TTL を使用:
- Session Memory: TTL付き (デフォルト24時間)
- Long-term Memory: Event Store (永続)

コスト効率:
- ElastiCache Redis (~$12/月) → DynamoDB On-Demand (~$1/月以下 for low traffic)
"""
import os
import json
import uuid
import logging
from datetime import datetime, timedelta
from typing import Optional

import boto3
from boto3.dynamodb.conditions import Key

logger = logging.getLogger(__name__)


class DynamoDBSessionMemory:
    """
    短期セッションメモリ (Redis代替)
    
    DynamoDB + TTL でセッション管理:
    - 自動期限切れ (TTL)
    - サーバレス対応
    - コスト効率
    
    単一テーブル設計:
    - PK: SESSION#{session_id}
    - SK: MESSAGE#{timestamp} or META
    """
    
    def __init__(
        self,
        table_name: str = None,
        ttl_hours: int = 24,
    ):
        """
        Args:
            table_name: DynamoDB table name
            ttl_hours: Session TTL in hours
        """
        self.table_name = table_name or os.environ.get('SESSION_TABLE', 'nova-session-memory')
        self.ttl_hours = ttl_hours
        self.dynamodb = boto3.resource('dynamodb')
        self.table = self.dynamodb.Table(self.table_name)
        
    def _get_ttl(self) -> int:
        """TTL timestamp を計算"""
        return int((datetime.utcnow() + timedelta(hours=self.ttl_hours)).timestamp())
    
    async def create_session(self, user_id: Optional[str] = None) -> str:
        """
        新しいセッションを作成
        
        Returns:
            str: session_id
        """
        session_id = str(uuid.uuid4())
        now = datetime.utcnow().isoformat()
        
        self.table.put_item(
            Item={
                'pk': f'SESSION#{session_id}',
                'sk': 'META',
                'session_id': session_id,
                'user_id': user_id or 'anonymous',
                'created_at': now,
                'updated_at': now,
                'ttl': self._get_ttl(),
            }
        )
        
        logger.info(f"Created session: {session_id}")
        return session_id
    
    async def get_session(self, session_id: str) -> Optional[dict]:
        """セッションメタデータを取得"""
        response = self.table.get_item(
            Key={
                'pk': f'SESSION#{session_id}',
                'sk': 'META',
            }
        )
        return response.get('Item')
    
    async def delete_session(self, session_id: str) -> None:
        """セッションを削除"""
        # メタデータ削除
        self.table.delete_item(
            Key={
                'pk': f'SESSION#{session_id}',
                'sk': 'META',
            }
        )
        
        # メッセージも削除 (scan + delete)
        response = self.table.query(
            KeyConditionExpression=Key('pk').eq(f'SESSION#{session_id}')
        )
        
        with self.table.batch_writer() as batch:
            for item in response.get('Items', []):
                batch.delete_item(
                    Key={'pk': item['pk'], 'sk': item['sk']}
                )
        
        logger.info(f"Deleted session: {session_id}")
    
    async def add_message(
        self,
        session_id: str,
        role: str,
        content: str,
    ) -> None:
        """
        セッションにメッセージを追加
        
        Args:
            session_id: セッションID
            role: 'user' or 'assistant'
            content: メッセージ内容
        """
        now = datetime.utcnow()
        timestamp = now.isoformat()
        
        self.table.put_item(
            Item={
                'pk': f'SESSION#{session_id}',
                'sk': f'MESSAGE#{timestamp}',
                'role': role,
                'content': content,
                'timestamp': timestamp,
                'ttl': self._get_ttl(),
            }
        )
        
        # メタデータの updated_at を更新
        self.table.update_item(
            Key={
                'pk': f'SESSION#{session_id}',
                'sk': 'META',
            },
            UpdateExpression='SET updated_at = :now, #ttl = :ttl',
            ExpressionAttributeNames={'#ttl': 'ttl'},
            ExpressionAttributeValues={
                ':now': timestamp,
                ':ttl': self._get_ttl(),
            }
        )
    
    async def get_history(
        self,
        session_id: str,
        limit: int = 50,
    ) -> list:
        """
        セッションの会話履歴を取得
        
        Args:
            session_id: セッションID
            limit: 最大取得件数
            
        Returns:
            list: [{'role': str, 'content': str, 'timestamp': str}, ...]
        """
        response = self.table.query(
            KeyConditionExpression=Key('pk').eq(f'SESSION#{session_id}') & Key('sk').begins_with('MESSAGE#'),
            ScanIndexForward=True,  # 古い順
            Limit=limit,
        )
        
        messages = []
        for item in response.get('Items', []):
            messages.append({
                'role': item['role'],
                'content': item['content'],
                'timestamp': item.get('timestamp'),
            })
        
        return messages


class DynamoDBLongTermMemory:
    """
    長期メモリ / Event Store (Event Sourcing)
    
    Event Sourcing パターンで永続化:
    - 全イベントを保存
    - 時系列クエリ対応
    - ユーザー別の履歴取得
    
    単一テーブル設計:
    - PK: AGGREGATE#{aggregate_id}
    - SK: EVENT#{timestamp}#{event_type}
    - GSI1: gsi1pk=USER#{user_id}, gsi1sk=EVENT#{timestamp}
    """
    
    def __init__(
        self,
        table_name: str = None,
    ):
        """
        Args:
            table_name: DynamoDB Event Store table name
        """
        self.table_name = table_name or os.environ.get('EVENT_STORE_TABLE', 'nova-event-store')
        self.dynamodb = boto3.resource('dynamodb')
        self.table = self.dynamodb.Table(self.table_name)
    
    async def store_event(
        self,
        aggregate_id: str,
        event_type: str,
        data: dict,
        user_id: Optional[str] = None,
    ) -> str:
        """
        イベントを保存
        
        Args:
            aggregate_id: 集約ID (session_id等)
            event_type: イベントタイプ
            data: イベントデータ
            user_id: ユーザーID (optional)
            
        Returns:
            str: event_id
        """
        event_id = str(uuid.uuid4())
        now = datetime.utcnow().isoformat()
        
        item = {
            'pk': f'AGGREGATE#{aggregate_id}',
            'sk': f'EVENT#{now}#{event_type}',
            'event_id': event_id,
            'aggregate_id': aggregate_id,
            'event_type': event_type,
            'data': json.dumps(data, ensure_ascii=False),
            'timestamp': now,
            'version': 1,
        }
        
        # GSI for user queries
        if user_id:
            item['gsi1pk'] = f'USER#{user_id}'
            item['gsi1sk'] = f'EVENT#{now}'
        
        self.table.put_item(Item=item)
        
        logger.debug(f"Stored event: {event_type} for aggregate: {aggregate_id}")
        return event_id
    
    async def get_events(
        self,
        aggregate_id: str,
        event_type: Optional[str] = None,
        limit: int = 100,
    ) -> list:
        """
        集約のイベント履歴を取得
        
        Args:
            aggregate_id: 集約ID
            event_type: フィルタするイベントタイプ (optional)
            limit: 最大取得件数
            
        Returns:
            list: イベントのリスト
        """
        key_condition = Key('pk').eq(f'AGGREGATE#{aggregate_id}')
        
        if event_type:
            key_condition = key_condition & Key('sk').begins_with(f'EVENT#')
        else:
            key_condition = key_condition & Key('sk').begins_with('EVENT#')
        
        response = self.table.query(
            KeyConditionExpression=key_condition,
            ScanIndexForward=False,  # 新しい順
            Limit=limit,
        )
        
        events = []
        for item in response.get('Items', []):
            event = {
                'event_id': item['event_id'],
                'aggregate_id': item['aggregate_id'],
                'event_type': item['event_type'],
                'data': json.loads(item['data']),
                'timestamp': item['timestamp'],
            }
            events.append(event)
        
        return events
    
    async def get_recent_events(
        self,
        user_id: str,
        limit: int = 10,
    ) -> list:
        """
        ユーザーの最近のイベントを取得 (GSI1使用)
        
        Args:
            user_id: ユーザーID
            limit: 最大取得件数
            
        Returns:
            list: イベントのリスト
        """
        try:
            response = self.table.query(
                IndexName='gsi1',
                KeyConditionExpression=Key('gsi1pk').eq(f'USER#{user_id}'),
                ScanIndexForward=False,  # 新しい順
                Limit=limit,
            )
            
            events = []
            for item in response.get('Items', []):
                event = {
                    'event_id': item.get('event_id'),
                    'aggregate_id': item.get('aggregate_id'),
                    'event_type': item.get('event_type'),
                    'data': json.loads(item.get('data', '{}')),
                    'timestamp': item.get('timestamp'),
                }
                events.append(event)
            
            return events
            
        except Exception as e:
            logger.warning(f"Failed to get recent events for user {user_id}: {e}")
            return []

