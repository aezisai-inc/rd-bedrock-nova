# イベントソーシング + CQRS 設計書

## 1. アーキテクチャ概要

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CQRS + EVENT SOURCING                                │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                          CLIENT                                      │    │
│  └────────────────────────────┬────────────────────────────────────────┘    │
│                               │                                              │
│              ┌────────────────┴────────────────┐                            │
│              │                                 │                             │
│              ▼                                 ▼                             │
│  ┌─────────────────────────┐      ┌─────────────────────────┐              │
│  │     COMMAND SIDE        │      │      QUERY SIDE         │              │
│  │                         │      │                         │              │
│  │  ┌───────────────────┐  │      │  ┌───────────────────┐  │              │
│  │  │   API Gateway     │  │      │  │   API Gateway     │  │              │
│  │  │   /commands/*     │  │      │  │   /queries/*      │  │              │
│  │  └─────────┬─────────┘  │      │  └─────────┬─────────┘  │              │
│  │            │            │      │            │            │              │
│  │            ▼            │      │            ▼            │              │
│  │  ┌───────────────────┐  │      │  ┌───────────────────┐  │              │
│  │  │  Command Handler  │  │      │  │   Query Handler   │  │              │
│  │  │                   │  │      │  │                   │  │              │
│  │  │ • Validation      │  │      │  │ • Direct Read     │  │              │
│  │  │ • Business Rules  │  │      │  │ • Optimized View  │  │              │
│  │  └─────────┬─────────┘  │      │  └─────────┬─────────┘  │              │
│  │            │            │      │            │            │              │
│  │            ▼            │      │            ▼            │              │
│  │  ┌───────────────────┐  │      │  ┌───────────────────┐  │              │
│  │  │    Aggregate      │  │      │  │    Read Model     │  │              │
│  │  │                   │  │      │  │    (Projection)   │  │              │
│  │  │ Domain Events     │  │      │  │                   │  │              │
│  │  └─────────┬─────────┘  │      │  │ • DynamoDB        │  │              │
│  │            │            │      │  │ • OpenSearch      │  │              │
│  │            ▼            │      │  │ • ElastiCache     │  │              │
│  │  ┌───────────────────┐  │      │  └───────────────────┘  │              │
│  │  │   Event Store     │  │      │            ▲            │              │
│  │  │                   │  │      │            │            │              │
│  │  │ • DynamoDB        │  │      │            │            │              │
│  │  │ • Streams         │  │      │            │            │              │
│  │  └─────────┬─────────┘  │      └────────────┼────────────┘              │
│  │            │            │                   │                            │
│  └────────────┼────────────┘                   │                            │
│               │                                │                            │
│               │         ┌──────────────────────┘                            │
│               │         │                                                   │
│               ▼         │                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                      EVENT BUS (EventBridge)                         │    │
│  └───────────────────────────────┬─────────────────────────────────────┘    │
│                                  │                                          │
│               ┌──────────────────┼──────────────────┐                       │
│               │                  │                  │                       │
│               ▼                  ▼                  ▼                       │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │   Projector     │  │   Projector     │  │  Event Handler  │             │
│  │   (Read Model)  │  │   (Search)      │  │  (Integration)  │             │
│  │                 │  │                 │  │                 │             │
│  │ Update DynamoDB │  │ Update OpenSearch│ │ Notify External │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 2. Event Store 実装

### 2.1 イベントスキーマ

```python
# src/infrastructure/event_store/schema.py
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict
from uuid import UUID, uuid4
import json

@dataclass
class StoredEvent:
    """永続化されるイベント"""
    event_id: UUID = field(default_factory=uuid4)
    aggregate_type: str = ""
    aggregate_id: UUID = None
    event_type: str = ""
    event_data: Dict[str, Any] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)
    version: int = 0
    occurred_at: datetime = field(default_factory=datetime.utcnow)
    
    def to_dynamodb_item(self) -> dict:
        return {
            "pk": f"{self.aggregate_type}#{self.aggregate_id}",
            "sk": f"v{self.version:010d}",
            "event_id": str(self.event_id),
            "aggregate_type": self.aggregate_type,
            "aggregate_id": str(self.aggregate_id),
            "event_type": self.event_type,
            "event_data": json.dumps(self.event_data),
            "metadata": json.dumps(self.metadata),
            "version": self.version,
            "occurred_at": self.occurred_at.isoformat(),
            "gsi1pk": self.event_type,
            "gsi1sk": self.occurred_at.isoformat(),
        }
    
    @classmethod
    def from_dynamodb_item(cls, item: dict) -> "StoredEvent":
        return cls(
            event_id=UUID(item["event_id"]),
            aggregate_type=item["aggregate_type"],
            aggregate_id=UUID(item["aggregate_id"]),
            event_type=item["event_type"],
            event_data=json.loads(item["event_data"]),
            metadata=json.loads(item["metadata"]),
            version=item["version"],
            occurred_at=datetime.fromisoformat(item["occurred_at"]),
        )
```

### 2.2 Event Store Repository

```python
# src/infrastructure/event_store/repository.py
import boto3
from boto3.dynamodb.conditions import Key
from typing import List, Optional
from uuid import UUID

class DynamoDBEventStore:
    """DynamoDB ベースの Event Store"""
    
    def __init__(self, table_name: str = "nova-event-store"):
        self.dynamodb = boto3.resource("dynamodb")
        self.table = self.dynamodb.Table(table_name)
    
    async def append_events(
        self,
        aggregate_type: str,
        aggregate_id: UUID,
        events: List[DomainEvent],
        expected_version: int
    ) -> None:
        """イベントを追記（楽観的ロック付き）"""
        
        # 現在のバージョンを確認
        current_version = await self._get_current_version(aggregate_type, aggregate_id)
        
        if current_version != expected_version:
            raise ConcurrencyError(
                f"Expected version {expected_version}, but found {current_version}"
            )
        
        # イベントをバッチ書き込み
        with self.table.batch_writer() as batch:
            for i, event in enumerate(events):
                version = expected_version + i + 1
                stored_event = StoredEvent(
                    aggregate_type=aggregate_type,
                    aggregate_id=aggregate_id,
                    event_type=type(event).__name__,
                    event_data=event.__dict__,
                    metadata={"correlation_id": str(uuid4())},
                    version=version,
                )
                batch.put_item(Item=stored_event.to_dynamodb_item())
    
    async def get_events(
        self,
        aggregate_type: str,
        aggregate_id: UUID,
        from_version: int = 0
    ) -> List[StoredEvent]:
        """集約のイベント履歴を取得"""
        
        response = self.table.query(
            KeyConditionExpression=Key("pk").eq(f"{aggregate_type}#{aggregate_id}")
            & Key("sk").gte(f"v{from_version:010d}")
        )
        
        return [StoredEvent.from_dynamodb_item(item) for item in response["Items"]]
    
    async def get_events_by_type(
        self,
        event_type: str,
        from_time: Optional[datetime] = None,
        limit: int = 100
    ) -> List[StoredEvent]:
        """イベントタイプで検索（GSI使用）"""
        
        key_condition = Key("gsi1pk").eq(event_type)
        if from_time:
            key_condition = key_condition & Key("gsi1sk").gte(from_time.isoformat())
        
        response = self.table.query(
            IndexName="gsi1",
            KeyConditionExpression=key_condition,
            Limit=limit,
        )
        
        return [StoredEvent.from_dynamodb_item(item) for item in response["Items"]]
    
    async def _get_current_version(
        self,
        aggregate_type: str,
        aggregate_id: UUID
    ) -> int:
        """現在のバージョンを取得"""
        
        response = self.table.query(
            KeyConditionExpression=Key("pk").eq(f"{aggregate_type}#{aggregate_id}"),
            ScanIndexForward=False,
            Limit=1,
        )
        
        if not response["Items"]:
            return 0
        
        return response["Items"][0]["version"]
```

### 2.3 集約の再構築

```python
# src/domain/audio/entities/audio_file.py
class AudioFile:
    """イベントソーシング対応の集約ルート"""
    
    def __init__(self):
        self.id = None
        self.user_id = None
        self.s3_key = ""
        self.status = ProcessingStatus.PENDING
        self.transcription = None
        self._version = 0
        self._uncommitted_events = []
    
    # === Event Sourcing Methods ===
    
    @classmethod
    def create(cls, user_id: UUID, s3_key: str, metadata: AudioMetadata) -> "AudioFile":
        """ファクトリメソッド"""
        audio = cls()
        audio._apply(AudioCreated(
            audio_id=uuid4(),
            user_id=user_id,
            s3_key=s3_key,
            metadata=metadata.__dict__
        ))
        return audio
    
    def _apply(self, event: DomainEvent) -> None:
        """イベントを適用（状態変更）"""
        self._when(event)
        self._uncommitted_events.append(event)
    
    def _when(self, event: DomainEvent) -> None:
        """イベントハンドラ（状態遷移ロジック）"""
        handler_name = f"_on_{self._to_snake_case(type(event).__name__)}"
        handler = getattr(self, handler_name, None)
        if handler:
            handler(event)
    
    def _on_audio_created(self, event: AudioCreated) -> None:
        self.id = event.audio_id
        self.user_id = event.user_id
        self.s3_key = event.s3_key
        self.metadata = AudioMetadata(**event.metadata)
        self.status = ProcessingStatus.PENDING
    
    def _on_audio_processing_started(self, event: AudioProcessingStarted) -> None:
        self.status = ProcessingStatus.PROCESSING
    
    def _on_transcription_completed(self, event: TranscriptionCompleted) -> None:
        self.transcription = Transcription(
            text=event.text,
            confidence=event.confidence,
            segments=event.segments
        )
    
    def _on_audio_processing_completed(self, event: AudioProcessingCompleted) -> None:
        self.status = ProcessingStatus.COMPLETED
    
    # === Command Methods ===
    
    def start_processing(self) -> None:
        if self.status != ProcessingStatus.PENDING:
            raise InvalidStateError("Cannot start processing")
        self._apply(AudioProcessingStarted(audio_id=self.id))
    
    def complete_transcription(self, result: TranscriptionResult) -> None:
        if self.status != ProcessingStatus.PROCESSING:
            raise InvalidStateError("Not in processing state")
        self._apply(TranscriptionCompleted(
            audio_id=self.id,
            text=result.text,
            confidence=result.confidence,
            segments=[s.__dict__ for s in result.segments]
        ))
    
    # === Event Sourcing Helpers ===
    
    @classmethod
    def reconstitute(cls, events: List[StoredEvent]) -> "AudioFile":
        """イベント履歴から集約を再構築"""
        audio = cls()
        for stored_event in events:
            event = cls._deserialize_event(stored_event)
            audio._when(event)
            audio._version = stored_event.version
        return audio
    
    def get_uncommitted_events(self) -> List[DomainEvent]:
        return self._uncommitted_events.copy()
    
    def mark_events_as_committed(self) -> None:
        self._uncommitted_events.clear()
```

## 3. CQRS 実装

### 3.1 Command Handler

```python
# src/application/commands/audio_commands.py
from dataclasses import dataclass
from uuid import UUID

@dataclass
class TranscribeAudioCommand:
    audio_id: UUID
    language: str = "ja-JP"
    enable_diarization: bool = False

class TranscribeAudioCommandHandler:
    def __init__(
        self,
        event_store: DynamoDBEventStore,
        transcription_gateway: IAudioTranscriptionGateway,
        event_publisher: IEventPublisher
    ):
        self._event_store = event_store
        self._transcription_gateway = transcription_gateway
        self._event_publisher = event_publisher
    
    async def handle(self, command: TranscribeAudioCommand) -> None:
        # 1. イベントから集約を再構築
        events = await self._event_store.get_events(
            aggregate_type="AudioFile",
            aggregate_id=command.audio_id
        )
        audio = AudioFile.reconstitute(events)
        
        # 2. コマンド実行（ドメインロジック）
        audio.start_processing()
        
        # 3. 外部サービス呼び出し
        result = await self._transcription_gateway.transcribe(
            s3_key=audio.s3_key,
            language=command.language,
            enable_diarization=command.enable_diarization
        )
        
        # 4. 結果を反映
        audio.complete_transcription(result)
        audio.complete_processing()
        
        # 5. 新しいイベントを永続化
        await self._event_store.append_events(
            aggregate_type="AudioFile",
            aggregate_id=audio.id,
            events=audio.get_uncommitted_events(),
            expected_version=audio._version
        )
        
        # 6. イベントを発行
        for event in audio.get_uncommitted_events():
            await self._event_publisher.publish(event)
        
        audio.mark_events_as_committed()
```

### 3.2 Read Model (Projection)

```python
# src/infrastructure/projections/audio_projection.py
class AudioReadModelProjector:
    """イベントを処理してRead Modelを更新"""
    
    def __init__(self, dynamodb, opensearch):
        self.dynamodb = dynamodb
        self.opensearch = opensearch
        self.table = dynamodb.Table("nova-audio-read-model")
    
    async def project(self, event: StoredEvent) -> None:
        """イベントに基づいてRead Modelを更新"""
        
        handler = getattr(self, f"_on_{self._to_snake_case(event.event_type)}", None)
        if handler:
            await handler(event)
    
    async def _on_audio_created(self, event: StoredEvent) -> None:
        """AudioCreated イベントの投影"""
        data = event.event_data
        
        # DynamoDB に保存
        self.table.put_item(Item={
            "pk": f"AUDIO#{data['audio_id']}",
            "sk": "METADATA",
            "audio_id": data["audio_id"],
            "user_id": data["user_id"],
            "s3_key": data["s3_key"],
            "status": "pending",
            "created_at": event.occurred_at.isoformat(),
            "gsi1pk": f"USER#{data['user_id']}",
            "gsi1sk": event.occurred_at.isoformat(),
        })
    
    async def _on_transcription_completed(self, event: StoredEvent) -> None:
        """TranscriptionCompleted イベントの投影"""
        data = event.event_data
        
        # DynamoDB を更新
        self.table.update_item(
            Key={"pk": f"AUDIO#{data['audio_id']}", "sk": "METADATA"},
            UpdateExpression="SET transcription = :t, confidence = :c, updated_at = :u",
            ExpressionAttributeValues={
                ":t": data["text"],
                ":c": data["confidence"],
                ":u": event.occurred_at.isoformat(),
            }
        )
        
        # OpenSearch にインデックス（全文検索用）
        await self.opensearch.index(
            index="audio-transcriptions",
            id=str(data["audio_id"]),
            body={
                "audio_id": data["audio_id"],
                "transcription": data["text"],
                "confidence": data["confidence"],
                "timestamp": event.occurred_at.isoformat(),
            }
        )
    
    async def _on_audio_processing_completed(self, event: StoredEvent) -> None:
        """AudioProcessingCompleted イベントの投影"""
        data = event.event_data
        
        self.table.update_item(
            Key={"pk": f"AUDIO#{data['audio_id']}", "sk": "METADATA"},
            UpdateExpression="SET #status = :s, completed_at = :c",
            ExpressionAttributeNames={"#status": "status"},
            ExpressionAttributeValues={
                ":s": "completed",
                ":c": event.occurred_at.isoformat(),
            }
        )
```

### 3.3 Query Handler

```python
# src/application/queries/audio_queries.py
from dataclasses import dataclass
from typing import List, Optional
from uuid import UUID

@dataclass
class GetAudioByIdQuery:
    audio_id: UUID

@dataclass
class SearchTranscriptionsQuery:
    query: str
    user_id: Optional[UUID] = None
    limit: int = 20

@dataclass
class AudioReadModel:
    """Read Model DTO"""
    audio_id: UUID
    user_id: UUID
    s3_key: str
    status: str
    transcription: Optional[str] = None
    confidence: Optional[float] = None
    created_at: str = ""
    completed_at: Optional[str] = None

class AudioQueryHandler:
    """クエリハンドラ（Read Model から直接読み取り）"""
    
    def __init__(self, dynamodb, opensearch):
        self.table = dynamodb.Table("nova-audio-read-model")
        self.opensearch = opensearch
    
    async def get_by_id(self, query: GetAudioByIdQuery) -> Optional[AudioReadModel]:
        """ID で音声情報を取得"""
        response = self.table.get_item(
            Key={"pk": f"AUDIO#{query.audio_id}", "sk": "METADATA"}
        )
        
        if "Item" not in response:
            return None
        
        item = response["Item"]
        return AudioReadModel(
            audio_id=UUID(item["audio_id"]),
            user_id=UUID(item["user_id"]),
            s3_key=item["s3_key"],
            status=item["status"],
            transcription=item.get("transcription"),
            confidence=item.get("confidence"),
            created_at=item["created_at"],
            completed_at=item.get("completed_at"),
        )
    
    async def search_transcriptions(
        self, 
        query: SearchTranscriptionsQuery
    ) -> List[AudioReadModel]:
        """文字起こしを全文検索"""
        
        search_body = {
            "query": {
                "bool": {
                    "must": [
                        {"match": {"transcription": query.query}}
                    ]
                }
            },
            "size": query.limit
        }
        
        if query.user_id:
            search_body["query"]["bool"]["filter"] = [
                {"term": {"user_id": str(query.user_id)}}
            ]
        
        response = await self.opensearch.search(
            index="audio-transcriptions",
            body=search_body
        )
        
        return [
            AudioReadModel(**hit["_source"])
            for hit in response["hits"]["hits"]
        ]
```

## 4. DynamoDB テーブル設計

### 4.1 Event Store Table

```json
{
  "TableName": "nova-event-store",
  "KeySchema": [
    { "AttributeName": "pk", "KeyType": "HASH" },
    { "AttributeName": "sk", "KeyType": "RANGE" }
  ],
  "AttributeDefinitions": [
    { "AttributeName": "pk", "AttributeType": "S" },
    { "AttributeName": "sk", "AttributeType": "S" },
    { "AttributeName": "gsi1pk", "AttributeType": "S" },
    { "AttributeName": "gsi1sk", "AttributeType": "S" }
  ],
  "GlobalSecondaryIndexes": [
    {
      "IndexName": "gsi1",
      "KeySchema": [
        { "AttributeName": "gsi1pk", "KeyType": "HASH" },
        { "AttributeName": "gsi1sk", "KeyType": "RANGE" }
      ],
      "Projection": { "ProjectionType": "ALL" }
    }
  ],
  "StreamSpecification": {
    "StreamEnabled": true,
    "StreamViewType": "NEW_IMAGE"
  }
}
```

### 4.2 Read Model Table

```json
{
  "TableName": "nova-audio-read-model",
  "KeySchema": [
    { "AttributeName": "pk", "KeyType": "HASH" },
    { "AttributeName": "sk", "KeyType": "RANGE" }
  ],
  "GlobalSecondaryIndexes": [
    {
      "IndexName": "gsi1-user-audio",
      "KeySchema": [
        { "AttributeName": "gsi1pk", "KeyType": "HASH" },
        { "AttributeName": "gsi1sk", "KeyType": "RANGE" }
      ]
    }
  ]
}
```

