# クリーンアーキテクチャ設計書

## 1. レイヤー構造

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       CLEAN ARCHITECTURE                                     │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    FRAMEWORKS & DRIVERS                              │    │
│  │                                                                      │    │
│  │   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐           │    │
│  │   │ FastAPI  │  │ AWS SDK  │  │ DynamoDB │  │ Bedrock  │           │    │
│  │   │          │  │ (boto3)  │  │ Client   │  │ Runtime  │           │    │
│  │   └──────────┘  └──────────┘  └──────────┘  └──────────┘           │    │
│  │                                                                      │    │
│  └────────────────────────────────┬────────────────────────────────────┘    │
│                                   │                                          │
│                                   ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    INTERFACE ADAPTERS                                │    │
│  │                                                                      │    │
│  │   ┌────────────────────────────────────────────────────────────┐   │    │
│  │   │ Controllers (API Endpoints)                                 │   │    │
│  │   │ • AudioController  • VideoController  • AgentController    │   │    │
│  │   └────────────────────────────────────────────────────────────┘   │    │
│  │                                                                      │    │
│  │   ┌────────────────────────────────────────────────────────────┐   │    │
│  │   │ Gateways (External Service Adapters)                        │   │    │
│  │   │ • BedrockGateway  • S3Gateway  • OpenSearchGateway         │   │    │
│  │   └────────────────────────────────────────────────────────────┘   │    │
│  │                                                                      │    │
│  │   ┌────────────────────────────────────────────────────────────┐   │    │
│  │   │ Repositories (Data Access Implementation)                   │   │    │
│  │   │ • DynamoDBRepository  • EventStoreRepository               │   │    │
│  │   └────────────────────────────────────────────────────────────┘   │    │
│  │                                                                      │    │
│  │   ┌────────────────────────────────────────────────────────────┐   │    │
│  │   │ Presenters (Response Formatters)                            │   │    │
│  │   │ • JSONPresenter  • StreamPresenter                         │   │    │
│  │   └────────────────────────────────────────────────────────────┘   │    │
│  │                                                                      │    │
│  └────────────────────────────────┬────────────────────────────────────┘    │
│                                   │                                          │
│                                   ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    APPLICATION BUSINESS RULES                        │    │
│  │                                                                      │    │
│  │   ┌────────────────────────────────────────────────────────────┐   │    │
│  │   │ Use Cases (Application Services)                            │   │    │
│  │   │                                                             │   │    │
│  │   │ • TranscribeAudioUseCase                                    │   │    │
│  │   │ • AnalyzeVideoUseCase                                       │   │    │
│  │   │ • InvokeAgentUseCase                                        │   │    │
│  │   │ • SearchContentUseCase                                      │   │    │
│  │   └────────────────────────────────────────────────────────────┘   │    │
│  │                                                                      │    │
│  │   ┌────────────────────────────────────────────────────────────┐   │    │
│  │   │ Ports (Interfaces)                                          │   │    │
│  │   │                                                             │   │    │
│  │   │ • IAudioRepository  • IVideoRepository                      │   │    │
│  │   │ • IAgentGateway     • ISearchGateway                       │   │    │
│  │   │ • IEventPublisher   • IEventStore                          │   │    │
│  │   └────────────────────────────────────────────────────────────┘   │    │
│  │                                                                      │    │
│  └────────────────────────────────┬────────────────────────────────────┘    │
│                                   │                                          │
│                                   ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    ENTERPRISE BUSINESS RULES                         │    │
│  │                                                                      │    │
│  │   ┌────────────────────────────────────────────────────────────┐   │    │
│  │   │ Entities (Domain Models)                                    │   │    │
│  │   │                                                             │   │    │
│  │   │ • AudioFile    • VideoFile    • AgentSession               │   │    │
│  │   │ • Transcription • VideoAnalysis • Conversation             │   │    │
│  │   └────────────────────────────────────────────────────────────┘   │    │
│  │                                                                      │    │
│  │   ┌────────────────────────────────────────────────────────────┐   │    │
│  │   │ Value Objects                                               │   │    │
│  │   │                                                             │   │    │
│  │   │ • AudioMetadata  • SentimentScore  • AgentContext          │   │    │
│  │   │ • TranscriptSegment  • Embedding  • Message                │   │    │
│  │   └────────────────────────────────────────────────────────────┘   │    │
│  │                                                                      │    │
│  │   ┌────────────────────────────────────────────────────────────┐   │    │
│  │   │ Domain Events                                               │   │    │
│  │   │                                                             │   │    │
│  │   │ • AudioUploaded  • TranscriptionCompleted                  │   │    │
│  │   │ • AnomalyDetected  • SessionTerminated                     │   │    │
│  │   └────────────────────────────────────────────────────────────┘   │    │
│  │                                                                      │    │
│  │   ┌────────────────────────────────────────────────────────────┐   │    │
│  │   │ Domain Services                                             │   │    │
│  │   │                                                             │   │    │
│  │   │ • TranscriptionService  • AnomalyDetectionService          │   │    │
│  │   └────────────────────────────────────────────────────────────┘   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Dependency Rule: Dependencies point INWARD only                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 2. ディレクトリ構造

```
backend/
├── src/
│   ├── domain/                      # Enterprise Business Rules
│   │   ├── audio/
│   │   │   ├── entities/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── audio_file.py    # Aggregate Root
│   │   │   │   └── transcription.py # Entity
│   │   │   ├── value_objects/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── audio_metadata.py
│   │   │   │   ├── sentiment_score.py
│   │   │   │   └── transcript_segment.py
│   │   │   ├── events/
│   │   │   │   ├── __init__.py
│   │   │   │   └── audio_events.py
│   │   │   └── services/
│   │   │       └── transcription_service.py
│   │   ├── video/
│   │   │   └── ...
│   │   ├── agent/
│   │   │   └── ...
│   │   └── search/
│   │       └── ...
│   │
│   ├── application/                 # Application Business Rules
│   │   ├── ports/                   # Interfaces (Ports)
│   │   │   ├── __init__.py
│   │   │   ├── repositories.py      # Repository Interfaces
│   │   │   ├── gateways.py          # External Service Interfaces
│   │   │   └── event_publisher.py   # Event Publisher Interface
│   │   ├── use_cases/
│   │   │   ├── audio/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── transcribe_audio.py
│   │   │   │   └── analyze_sentiment.py
│   │   │   ├── video/
│   │   │   ├── agent/
│   │   │   └── search/
│   │   └── dto/                     # Data Transfer Objects
│   │       ├── __init__.py
│   │       ├── audio_dto.py
│   │       └── agent_dto.py
│   │
│   ├── infrastructure/              # Interface Adapters (Outer)
│   │   ├── repositories/            # Repository Implementations
│   │   │   ├── __init__.py
│   │   │   ├── dynamodb/
│   │   │   │   ├── audio_repository.py
│   │   │   │   └── session_repository.py
│   │   │   └── event_store/
│   │   │       └── event_store_repository.py
│   │   ├── gateways/                # External Service Adapters
│   │   │   ├── __init__.py
│   │   │   ├── bedrock/
│   │   │   │   ├── nova_sonic_gateway.py
│   │   │   │   ├── nova_omni_gateway.py
│   │   │   │   └── nova_embeddings_gateway.py
│   │   │   ├── s3/
│   │   │   │   └── s3_gateway.py
│   │   │   └── opensearch/
│   │   │       └── opensearch_gateway.py
│   │   ├── event_bus/               # Event Publishing
│   │   │   ├── __init__.py
│   │   │   └── eventbridge_publisher.py
│   │   └── config/
│   │       └── settings.py
│   │
│   └── presentation/                # Frameworks & Drivers
│       ├── api/                     # FastAPI Controllers
│       │   ├── __init__.py
│       │   ├── routes/
│       │   │   ├── audio_routes.py
│       │   │   ├── video_routes.py
│       │   │   ├── agent_routes.py
│       │   │   └── search_routes.py
│       │   ├── middleware/
│       │   │   ├── auth.py
│       │   │   └── error_handler.py
│       │   └── presenters/
│       │       ├── json_presenter.py
│       │       └── stream_presenter.py
│       ├── handlers/                # Lambda Handlers
│       │   ├── audio_handler.py
│       │   └── event_handler.py
│       └── main.py                  # Application Entry Point
│
├── tests/
│   ├── unit/
│   │   ├── domain/
│   │   └── application/
│   ├── integration/
│   └── e2e/
│
├── Dockerfile
├── requirements.txt
└── pyproject.toml
```

## 3. ユースケース実装

```python
# src/application/use_cases/audio/transcribe_audio.py
from dataclasses import dataclass
from uuid import UUID
from typing import Optional

from domain.audio.entities import AudioFile
from domain.audio.events import TranscriptionCompleted
from application.ports.repositories import IAudioRepository
from application.ports.gateways import IAudioTranscriptionGateway
from application.ports.event_publisher import IEventPublisher

@dataclass
class TranscribeAudioInput:
    audio_id: UUID
    language: str = "ja-JP"
    enable_speaker_diarization: bool = False

@dataclass
class TranscribeAudioOutput:
    audio_id: UUID
    text: str
    confidence: float
    segments: list
    speakers: Optional[list] = None

class TranscribeAudioUseCase:
    """音声文字起こしユースケース"""
    
    def __init__(
        self,
        audio_repository: IAudioRepository,
        transcription_gateway: IAudioTranscriptionGateway,
        event_publisher: IEventPublisher,
    ):
        self._audio_repo = audio_repository
        self._transcription_gateway = transcription_gateway
        self._event_publisher = event_publisher
    
    async def execute(self, input_data: TranscribeAudioInput) -> TranscribeAudioOutput:
        # 1. Fetch aggregate from repository
        audio = await self._audio_repo.find_by_id(input_data.audio_id)
        if not audio:
            raise AudioNotFoundError(f"Audio {input_data.audio_id} not found")
        
        # 2. Start processing (domain logic)
        audio.start_processing()
        
        # 3. Call external service via gateway
        transcription_result = await self._transcription_gateway.transcribe(
            s3_key=audio.s3_key,
            language=input_data.language,
            enable_diarization=input_data.enable_speaker_diarization,
        )
        
        # 4. Update aggregate with result (domain logic)
        audio.complete_transcription(transcription_result)
        
        # 5. Persist aggregate
        await self._audio_repo.save(audio)
        
        # 6. Publish domain events
        events = audio.pull_domain_events()
        for event in events:
            await self._event_publisher.publish(event)
        
        # 7. Return output DTO
        return TranscribeAudioOutput(
            audio_id=audio.id,
            text=audio.transcription.text,
            confidence=audio.transcription.confidence,
            segments=[s.__dict__ for s in audio.transcription.segments],
            speakers=transcription_result.speakers,
        )


# src/application/use_cases/agent/invoke_agent.py
@dataclass
class InvokeAgentInput:
    session_id: Optional[UUID]
    user_id: UUID
    message: str
    context: Optional[dict] = None

@dataclass
class InvokeAgentOutput:
    session_id: UUID
    response: str
    tool_calls: list
    citations: list

class InvokeAgentUseCase:
    """Agent呼び出しユースケース"""
    
    def __init__(
        self,
        session_repository: ISessionRepository,
        agent_gateway: IAgentGateway,
        knowledge_gateway: IKnowledgeGateway,
        event_publisher: IEventPublisher,
    ):
        self._session_repo = session_repository
        self._agent_gateway = agent_gateway
        self._knowledge_gateway = knowledge_gateway
        self._event_publisher = event_publisher
    
    async def execute(self, input_data: InvokeAgentInput) -> InvokeAgentOutput:
        # 1. Get or create session
        if input_data.session_id:
            session = await self._session_repo.find_by_id(input_data.session_id)
            if session and session.status == SessionStatus.IDLE:
                session.reactivate()
        else:
            session = AgentSession(user_id=input_data.user_id)
        
        # 2. Add user message (domain logic)
        session.receive_user_message(
            content=input_data.message,
            metadata=input_data.context
        )
        
        # 3. Search knowledge base for context
        knowledge_context = await self._knowledge_gateway.retrieve(
            query=input_data.message,
            limit=5
        )
        
        # 4. Invoke agent via gateway
        agent_response = await self._agent_gateway.invoke(
            session_id=str(session.id),
            input_text=input_data.message,
            context=knowledge_context,
        )
        
        # 5. Update session with response (domain logic)
        session.send_assistant_message(
            content=agent_response.completion,
            tool_calls=agent_response.tool_calls
        )
        
        # 6. Persist session
        await self._session_repo.save(session)
        
        # 7. Publish events
        for event in session.pull_domain_events():
            await self._event_publisher.publish(event)
        
        return InvokeAgentOutput(
            session_id=session.id,
            response=agent_response.completion,
            tool_calls=agent_response.tool_calls,
            citations=agent_response.citations,
        )
```

## 4. ポート（インターフェース）定義

```python
# src/application/ports/repositories.py
from abc import ABC, abstractmethod
from typing import Optional, List
from uuid import UUID

class IAudioRepository(ABC):
    @abstractmethod
    async def find_by_id(self, audio_id: UUID) -> Optional[AudioFile]:
        pass
    
    @abstractmethod
    async def save(self, audio: AudioFile) -> None:
        pass
    
    @abstractmethod
    async def find_by_user(self, user_id: UUID, limit: int = 100) -> List[AudioFile]:
        pass

class ISessionRepository(ABC):
    @abstractmethod
    async def find_by_id(self, session_id: UUID) -> Optional[AgentSession]:
        pass
    
    @abstractmethod
    async def save(self, session: AgentSession) -> None:
        pass

# src/application/ports/gateways.py
class IAudioTranscriptionGateway(ABC):
    @abstractmethod
    async def transcribe(
        self, 
        s3_key: str, 
        language: str,
        enable_diarization: bool
    ) -> TranscriptionResult:
        pass

class IAgentGateway(ABC):
    @abstractmethod
    async def invoke(
        self,
        session_id: str,
        input_text: str,
        context: Optional[dict] = None
    ) -> AgentResponse:
        pass

class IKnowledgeGateway(ABC):
    @abstractmethod
    async def retrieve(self, query: str, limit: int) -> List[KnowledgeChunk]:
        pass

# src/application/ports/event_publisher.py
class IEventPublisher(ABC):
    @abstractmethod
    async def publish(self, event: DomainEvent) -> None:
        pass
```

## 5. 依存性注入

```python
# src/infrastructure/config/container.py
from dependency_injector import containers, providers

class Container(containers.DeclarativeContainer):
    config = providers.Configuration()
    
    # Infrastructure
    dynamodb_client = providers.Singleton(
        boto3.resource,
        'dynamodb',
        region_name=config.aws_region
    )
    
    bedrock_client = providers.Singleton(
        boto3.client,
        'bedrock-runtime',
        region_name=config.aws_region
    )
    
    # Repositories
    audio_repository = providers.Factory(
        DynamoDBaudioRepository,
        dynamodb=dynamodb_client
    )
    
    session_repository = providers.Factory(
        DynamoDBSessionRepository,
        dynamodb=dynamodb_client
    )
    
    # Gateways
    transcription_gateway = providers.Factory(
        NovaSonicGateway,
        bedrock_client=bedrock_client
    )
    
    agent_gateway = providers.Factory(
        BedrockAgentGateway,
        bedrock_client=bedrock_client
    )
    
    # Event Publisher
    event_publisher = providers.Factory(
        EventBridgePublisher,
        event_bus_name=config.event_bus_name
    )
    
    # Use Cases
    transcribe_audio_use_case = providers.Factory(
        TranscribeAudioUseCase,
        audio_repository=audio_repository,
        transcription_gateway=transcription_gateway,
        event_publisher=event_publisher
    )
    
    invoke_agent_use_case = providers.Factory(
        InvokeAgentUseCase,
        session_repository=session_repository,
        agent_gateway=agent_gateway,
        knowledge_gateway=knowledge_gateway,
        event_publisher=event_publisher
    )
```

