# DDD ドメインモデル設計書

## 1. 戦略的設計

### 1.1 ドメイン分割

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DOMAIN MAP                                           │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                      CORE DOMAIN                                     │    │
│  │                                                                      │    │
│  │   ┌──────────────────┐     ┌──────────────────┐                     │    │
│  │   │ AI Processing    │     │ Agent            │                     │    │
│  │   │                  │     │ Orchestration    │                     │    │
│  │   │ • Audio Analysis │     │                  │                     │    │
│  │   │ • Video Analysis │     │ • Task Planning  │                     │    │
│  │   │ • Embeddings     │     │ • Tool Selection │                     │    │
│  │   └──────────────────┘     │ • Response Gen   │                     │    │
│  │                            └──────────────────┘                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    SUPPORTING DOMAIN                                 │    │
│  │                                                                      │    │
│  │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │    │
│  │   │ Search       │  │ Knowledge    │  │ Session      │             │    │
│  │   │              │  │ Management   │  │ Management   │             │    │
│  │   │ • Semantic   │  │              │  │              │             │    │
│  │   │ • Hybrid     │  │ • Documents  │  │ • Context    │             │    │
│  │   │ • Filtering  │  │ • FAQ        │  │ • History    │             │    │
│  │   └──────────────┘  └──────────────┘  └──────────────┘             │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    GENERIC DOMAIN                                    │    │
│  │                                                                      │    │
│  │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │    │
│  │   │ Identity     │  │ Notification │  │ Storage      │             │    │
│  │   │              │  │              │  │              │             │    │
│  │   │ • AuthN/AuthZ│  │ • Email      │  │ • Files      │             │    │
│  │   │ • Users      │  │ • Push       │  │ • Objects    │             │    │
│  │   └──────────────┘  └──────────────┘  └──────────────┘             │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 境界づけられたコンテキスト

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    BOUNDED CONTEXTS                                          │
│                                                                              │
│  ┌───────────────────┐        ┌───────────────────┐                        │
│  │ Audio Context     │        │ Video Context     │                        │
│  │                   │        │                   │                        │
│  │ ┌───────────────┐ │        │ ┌───────────────┐ │                        │
│  │ │ AudioFile     │ │        │ │ VideoFile     │ │                        │
│  │ │ Transcription │ │ ACL    │ │ VideoAnalysis │ │                        │
│  │ │ Speaker       │ │◀──────▶│ │ Frame         │ │                        │
│  │ │ Sentiment     │ │        │ │ Anomaly       │ │                        │
│  │ └───────────────┘ │        │ └───────────────┘ │                        │
│  └─────────┬─────────┘        └─────────┬─────────┘                        │
│            │                            │                                   │
│            │    Published Events        │                                   │
│            │                            │                                   │
│            ▼                            ▼                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        Event Bus                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│            │                            │                                   │
│            ▼                            ▼                                   │
│  ┌───────────────────┐        ┌───────────────────┐                        │
│  │ Search Context    │        │ Agent Context     │                        │
│  │                   │        │                   │                        │
│  │ ┌───────────────┐ │        │ ┌───────────────┐ │                        │
│  │ │ SearchIndex   │ │        │ │ AgentSession  │ │                        │
│  │ │ Embedding     │ │ ACL    │ │ Conversation  │ │                        │
│  │ │ SearchResult  │ │◀──────▶│ │ Tool          │ │                        │
│  │ │ Facet         │ │        │ │ ActionGroup   │ │                        │
│  │ └───────────────┘ │        │ └───────────────┘ │                        │
│  └───────────────────┘        └───────────────────┘                        │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     Context Map Legend                               │   │
│  │                                                                      │   │
│  │   ACL = Anti-Corruption Layer (コンテキスト間の変換層)               │   │
│  │   U/D = Upstream / Downstream                                        │   │
│  │   OHS = Open Host Service                                            │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 2. 戦術的設計

### 2.1 Audio Context

```python
# domain/audio/aggregates/audio_file.py
from dataclasses import dataclass, field
from typing import List, Optional
from datetime import datetime
from uuid import UUID, uuid4
from enum import Enum

class AudioFormat(Enum):
    WAV = "wav"
    MP3 = "mp3"
    FLAC = "flac"

class ProcessingStatus(Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"

# === Value Objects ===
@dataclass(frozen=True)
class AudioMetadata:
    """音声メタデータ（値オブジェクト）"""
    duration_seconds: float
    sample_rate: int
    channels: int
    format: AudioFormat
    
    def validate(self) -> None:
        if self.duration_seconds <= 0:
            raise ValueError("Duration must be positive")
        if self.sample_rate not in [8000, 16000, 44100, 48000]:
            raise ValueError("Invalid sample rate")

@dataclass(frozen=True)
class TranscriptSegment:
    """文字起こしセグメント（値オブジェクト）"""
    start_time: float
    end_time: float
    text: str
    confidence: float
    speaker_id: Optional[str] = None

@dataclass(frozen=True)
class SentimentScore:
    """感情スコア（値オブジェクト）"""
    positive: float
    negative: float
    neutral: float
    
    @property
    def dominant(self) -> str:
        scores = {"positive": self.positive, "negative": self.negative, "neutral": self.neutral}
        return max(scores, key=scores.get)

# === Entity ===
@dataclass
class Transcription:
    """文字起こし結果（エンティティ）"""
    id: UUID = field(default_factory=uuid4)
    text: str = ""
    segments: List[TranscriptSegment] = field(default_factory=list)
    language: str = "ja-JP"
    confidence: float = 0.0
    created_at: datetime = field(default_factory=datetime.utcnow)
    
    def add_segment(self, segment: TranscriptSegment) -> None:
        self.segments.append(segment)
        self._recalculate_text()
        self._recalculate_confidence()
    
    def _recalculate_text(self) -> None:
        self.text = " ".join(s.text for s in sorted(self.segments, key=lambda x: x.start_time))
    
    def _recalculate_confidence(self) -> None:
        if self.segments:
            self.confidence = sum(s.confidence for s in self.segments) / len(self.segments)

# === Aggregate Root ===
@dataclass
class AudioFile:
    """音声ファイル（集約ルート）"""
    id: UUID = field(default_factory=uuid4)
    user_id: UUID = None
    s3_key: str = ""
    metadata: AudioMetadata = None
    status: ProcessingStatus = ProcessingStatus.PENDING
    transcription: Optional[Transcription] = None
    sentiment: Optional[SentimentScore] = None
    created_at: datetime = field(default_factory=datetime.utcnow)
    
    # ドメインイベント
    _domain_events: List = field(default_factory=list, repr=False)
    
    def start_processing(self) -> None:
        """処理を開始"""
        if self.status != ProcessingStatus.PENDING:
            raise ValueError("Can only start processing from PENDING status")
        self.status = ProcessingStatus.PROCESSING
        self._domain_events.append(AudioProcessingStarted(audio_id=self.id))
    
    def complete_transcription(self, transcription: Transcription) -> None:
        """文字起こし完了"""
        self.transcription = transcription
        self._domain_events.append(TranscriptionCompleted(
            audio_id=self.id,
            text=transcription.text,
            confidence=transcription.confidence
        ))
    
    def analyze_sentiment(self, sentiment: SentimentScore) -> None:
        """感情分析結果を設定"""
        self.sentiment = sentiment
        self._domain_events.append(SentimentAnalyzed(
            audio_id=self.id,
            sentiment=sentiment.dominant
        ))
    
    def complete_processing(self) -> None:
        """処理完了"""
        if self.status != ProcessingStatus.PROCESSING:
            raise ValueError("Can only complete from PROCESSING status")
        self.status = ProcessingStatus.COMPLETED
        self._domain_events.append(AudioProcessingCompleted(audio_id=self.id))
    
    def fail_processing(self, reason: str) -> None:
        """処理失敗"""
        self.status = ProcessingStatus.FAILED
        self._domain_events.append(AudioProcessingFailed(audio_id=self.id, reason=reason))
    
    def pull_domain_events(self) -> List:
        """ドメインイベントを取得してクリア"""
        events = self._domain_events.copy()
        self._domain_events.clear()
        return events

# === Domain Events ===
@dataclass(frozen=True)
class AudioProcessingStarted:
    audio_id: UUID
    occurred_at: datetime = field(default_factory=datetime.utcnow)

@dataclass(frozen=True)
class TranscriptionCompleted:
    audio_id: UUID
    text: str
    confidence: float
    occurred_at: datetime = field(default_factory=datetime.utcnow)

@dataclass(frozen=True)
class SentimentAnalyzed:
    audio_id: UUID
    sentiment: str
    occurred_at: datetime = field(default_factory=datetime.utcnow)

@dataclass(frozen=True)
class AudioProcessingCompleted:
    audio_id: UUID
    occurred_at: datetime = field(default_factory=datetime.utcnow)

@dataclass(frozen=True)
class AudioProcessingFailed:
    audio_id: UUID
    reason: str
    occurred_at: datetime = field(default_factory=datetime.utcnow)
```

### 2.2 Agent Context

```python
# domain/agent/aggregates/agent_session.py
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any
from datetime import datetime
from uuid import UUID, uuid4
from enum import Enum

class SessionStatus(Enum):
    ACTIVE = "active"
    IDLE = "idle"
    TERMINATED = "terminated"

class MessageRole(Enum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"
    TOOL = "tool"

# === Value Objects ===
@dataclass(frozen=True)
class Message:
    """メッセージ（値オブジェクト）"""
    role: MessageRole
    content: str
    timestamp: datetime = field(default_factory=datetime.utcnow)
    metadata: Dict[str, Any] = field(default_factory=dict)

@dataclass(frozen=True)
class ToolCall:
    """ツール呼び出し（値オブジェクト）"""
    tool_name: str
    parameters: Dict[str, Any]
    result: Optional[str] = None
    success: bool = True
    execution_time_ms: int = 0

@dataclass(frozen=True)
class AgentContext:
    """エージェントコンテキスト（値オブジェクト）"""
    intent: Optional[str] = None
    entities: Dict[str, Any] = field(default_factory=dict)
    confidence: float = 0.0

# === Entity ===
@dataclass
class Conversation:
    """会話（エンティティ）"""
    id: UUID = field(default_factory=uuid4)
    messages: List[Message] = field(default_factory=list)
    tool_calls: List[ToolCall] = field(default_factory=list)
    context: AgentContext = field(default_factory=AgentContext)
    
    def add_message(self, message: Message) -> None:
        self.messages.append(message)
    
    def add_tool_call(self, tool_call: ToolCall) -> None:
        self.tool_calls.append(tool_call)
    
    def update_context(self, context: AgentContext) -> None:
        self.context = context
    
    @property
    def turn_count(self) -> int:
        return len([m for m in self.messages if m.role == MessageRole.USER])
    
    @property
    def last_message(self) -> Optional[Message]:
        return self.messages[-1] if self.messages else None

# === Aggregate Root ===
@dataclass
class AgentSession:
    """エージェントセッション（集約ルート）"""
    id: UUID = field(default_factory=uuid4)
    user_id: UUID = None
    agent_id: str = ""
    status: SessionStatus = SessionStatus.ACTIVE
    conversation: Conversation = field(default_factory=Conversation)
    created_at: datetime = field(default_factory=datetime.utcnow)
    last_active_at: datetime = field(default_factory=datetime.utcnow)
    ttl: Optional[datetime] = None
    
    _domain_events: List = field(default_factory=list, repr=False)
    
    def __post_init__(self):
        if self.ttl is None:
            self.ttl = datetime.utcnow() + timedelta(hours=1)
    
    def receive_user_message(self, content: str, metadata: Dict = None) -> None:
        """ユーザーメッセージを受信"""
        if self.status != SessionStatus.ACTIVE:
            raise ValueError("Session is not active")
        
        message = Message(
            role=MessageRole.USER,
            content=content,
            metadata=metadata or {}
        )
        self.conversation.add_message(message)
        self._update_activity()
        
        self._domain_events.append(UserMessageReceived(
            session_id=self.id,
            message_content=content
        ))
    
    def send_assistant_message(self, content: str, tool_calls: List[ToolCall] = None) -> None:
        """アシスタントメッセージを送信"""
        message = Message(
            role=MessageRole.ASSISTANT,
            content=content
        )
        self.conversation.add_message(message)
        
        if tool_calls:
            for tc in tool_calls:
                self.conversation.add_tool_call(tc)
        
        self._update_activity()
        
        self._domain_events.append(AssistantMessageSent(
            session_id=self.id,
            message_content=content,
            tool_count=len(tool_calls) if tool_calls else 0
        ))
    
    def update_context(self, intent: str, entities: Dict, confidence: float) -> None:
        """コンテキストを更新"""
        context = AgentContext(intent=intent, entities=entities, confidence=confidence)
        self.conversation.update_context(context)
    
    def mark_idle(self) -> None:
        """アイドル状態にする"""
        if self.status == SessionStatus.ACTIVE:
            self.status = SessionStatus.IDLE
            self._domain_events.append(SessionMarkedIdle(session_id=self.id))
    
    def reactivate(self) -> None:
        """再アクティブ化"""
        if self.status == SessionStatus.IDLE:
            self.status = SessionStatus.ACTIVE
            self._update_activity()
    
    def terminate(self) -> None:
        """セッション終了"""
        self.status = SessionStatus.TERMINATED
        self._domain_events.append(SessionTerminated(
            session_id=self.id,
            turn_count=self.conversation.turn_count
        ))
    
    def _update_activity(self) -> None:
        self.last_active_at = datetime.utcnow()
        self.ttl = datetime.utcnow() + timedelta(hours=1)
    
    def pull_domain_events(self) -> List:
        events = self._domain_events.copy()
        self._domain_events.clear()
        return events

# === Domain Events ===
@dataclass(frozen=True)
class UserMessageReceived:
    session_id: UUID
    message_content: str
    occurred_at: datetime = field(default_factory=datetime.utcnow)

@dataclass(frozen=True)
class AssistantMessageSent:
    session_id: UUID
    message_content: str
    tool_count: int
    occurred_at: datetime = field(default_factory=datetime.utcnow)

@dataclass(frozen=True)
class SessionMarkedIdle:
    session_id: UUID
    occurred_at: datetime = field(default_factory=datetime.utcnow)

@dataclass(frozen=True)
class SessionTerminated:
    session_id: UUID
    turn_count: int
    occurred_at: datetime = field(default_factory=datetime.utcnow)
```

### 2.3 ユビキタス言語

| 用語 | 定義 | コンテキスト |
|------|------|-------------|
| AudioFile | 処理対象の音声ファイル集約 | Audio |
| Transcription | 音声の文字起こし結果 | Audio |
| Sentiment | 感情分析結果 | Audio |
| VideoFile | 処理対象の映像ファイル集約 | Video |
| Anomaly | 検出された異常 | Video |
| AgentSession | AI Agent との対話セッション | Agent |
| Conversation | セッション内の会話履歴 | Agent |
| ToolCall | Agent が実行したツール呼び出し | Agent |
| Embedding | コンテンツのベクトル表現 | Search |
| SearchIndex | 検索用インデックス | Search |

