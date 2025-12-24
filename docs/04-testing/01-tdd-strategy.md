# TDD 戦略書

## 1. TDD サイクル

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         TDD CYCLE                                            │
│                                                                              │
│                          ┌─────────────┐                                    │
│                          │    RED      │                                    │
│                          │             │                                    │
│                          │ 失敗する    │                                    │
│                          │ テストを書く │                                   │
│                          └──────┬──────┘                                    │
│                                 │                                            │
│                                 ▼                                            │
│                          ┌─────────────┐                                    │
│         ┌───────────────▶│   GREEN     │                                    │
│         │                │             │                                    │
│         │                │ テストを    │                                    │
│         │                │ 通す最小コード│                                   │
│         │                └──────┬──────┘                                    │
│         │                       │                                            │
│         │                       ▼                                            │
│         │                ┌─────────────┐                                    │
│         │                │  REFACTOR   │                                    │
│         │                │             │                                    │
│         │                │ コードを    │                                    │
│         └────────────────│ リファクタ  │                                    │
│                          └─────────────┘                                    │
│                                                                              │
│  Principles:                                                                 │
│  • テストファースト - コードの前にテストを書く                                │
│  • 小さなステップ - 一度に1つのテストだけ                                    │
│  • シンプルな実装 - 最小限のコードでテストを通す                             │
│  • 継続的リファクタリング - テストが通ったらリファクタ                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 2. テストピラミッド

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         TEST PYRAMID                                         │
│                                                                              │
│                           ┌─────┐                                           │
│                          ╱       ╲                                          │
│                         ╱   E2E   ╲           少数・遅い・高コスト          │
│                        ╱───────────╲                                        │
│                       ╱             ╲                                       │
│                      ╱  Integration  ╲        中程度                        │
│                     ╱─────────────────╲                                     │
│                    ╱                   ╲                                    │
│                   ╱       Unit          ╲     多数・速い・低コスト          │
│                  ╱───────────────────────╲                                  │
│                                                                              │
│  Target Distribution:                                                        │
│  ├── Unit Tests:        70% (Domain, Application層)                         │
│  ├── Integration Tests: 20% (Repository, Gateway)                           │
│  └── E2E Tests:         10% (Critical User Journeys)                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 3. テストカテゴリ

### 3.1 Unit Tests（単体テスト）

```python
# tests/unit/domain/audio/test_audio_file.py
import pytest
from uuid import uuid4
from datetime import datetime
from domain.audio.entities import AudioFile
from domain.audio.value_objects import AudioMetadata, SentimentScore
from domain.audio.events import AudioProcessingStarted, TranscriptionCompleted

class TestAudioFile:
    """AudioFile 集約の単体テスト"""
    
    @pytest.fixture
    def audio_file(self) -> AudioFile:
        """テスト用AudioFile"""
        return AudioFile.create(
            user_id=uuid4(),
            s3_key="test/audio.wav",
            metadata=AudioMetadata(
                duration_seconds=30.0,
                sample_rate=16000,
                channels=1,
                format="wav"
            )
        )
    
    def test_create_audio_file(self, audio_file: AudioFile):
        """正常: AudioFileを作成できる"""
        # Assert
        assert audio_file.id is not None
        assert audio_file.status == ProcessingStatus.PENDING
        assert audio_file.s3_key == "test/audio.wav"
    
    def test_start_processing_from_pending(self, audio_file: AudioFile):
        """正常: PENDING状態から処理を開始できる"""
        # Act
        audio_file.start_processing()
        
        # Assert
        assert audio_file.status == ProcessingStatus.PROCESSING
        events = audio_file.get_uncommitted_events()
        assert len(events) == 2  # Created + Started
        assert isinstance(events[-1], AudioProcessingStarted)
    
    def test_cannot_start_processing_twice(self, audio_file: AudioFile):
        """異常: 処理中に再度開始できない"""
        # Arrange
        audio_file.start_processing()
        
        # Act & Assert
        with pytest.raises(InvalidStateError) as exc_info:
            audio_file.start_processing()
        
        assert "Cannot start processing" in str(exc_info.value)
    
    def test_complete_transcription(self, audio_file: AudioFile):
        """正常: 文字起こしを完了できる"""
        # Arrange
        audio_file.start_processing()
        transcription_result = TranscriptionResult(
            text="テストテキスト",
            confidence=0.95,
            segments=[]
        )
        
        # Act
        audio_file.complete_transcription(transcription_result)
        
        # Assert
        assert audio_file.transcription is not None
        assert audio_file.transcription.text == "テストテキスト"
        assert audio_file.transcription.confidence == 0.95
    
    def test_sentiment_score_dominant(self):
        """正常: SentimentScoreの支配的感情を取得"""
        # Arrange
        sentiment = SentimentScore(positive=0.7, negative=0.2, neutral=0.1)
        
        # Assert
        assert sentiment.dominant == "positive"
    
    def test_reconstitute_from_events(self):
        """正常: イベントから集約を再構築できる"""
        # Arrange
        events = [
            StoredEvent(
                event_type="AudioCreated",
                event_data={"audio_id": "123", "user_id": "456", "s3_key": "test.wav"},
                version=1
            ),
            StoredEvent(
                event_type="AudioProcessingStarted",
                event_data={"audio_id": "123"},
                version=2
            ),
        ]
        
        # Act
        audio = AudioFile.reconstitute(events)
        
        # Assert
        assert audio.status == ProcessingStatus.PROCESSING
        assert audio._version == 2


class TestAudioMetadata:
    """AudioMetadata 値オブジェクトのテスト"""
    
    def test_valid_metadata(self):
        """正常: 有効なメタデータを作成"""
        metadata = AudioMetadata(
            duration_seconds=60.0,
            sample_rate=44100,
            channels=2,
            format="mp3"
        )
        assert metadata.duration_seconds == 60.0
    
    def test_invalid_duration(self):
        """異常: 無効な再生時間"""
        with pytest.raises(ValueError):
            AudioMetadata(
                duration_seconds=-1,
                sample_rate=44100,
                channels=2,
                format="mp3"
            )
    
    def test_invalid_sample_rate(self):
        """異常: 無効なサンプルレート"""
        with pytest.raises(ValueError):
            AudioMetadata(
                duration_seconds=60.0,
                sample_rate=12345,  # Invalid
                channels=2,
                format="mp3"
            )
```

### 3.2 Use Case Tests

```python
# tests/unit/application/test_transcribe_audio_use_case.py
import pytest
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

from application.use_cases.audio import TranscribeAudioUseCase, TranscribeAudioInput
from application.ports.repositories import IAudioRepository
from application.ports.gateways import IAudioTranscriptionGateway

class TestTranscribeAudioUseCase:
    """TranscribeAudioUseCase のテスト"""
    
    @pytest.fixture
    def mock_repository(self) -> AsyncMock:
        return AsyncMock(spec=IAudioRepository)
    
    @pytest.fixture
    def mock_gateway(self) -> AsyncMock:
        return AsyncMock(spec=IAudioTranscriptionGateway)
    
    @pytest.fixture
    def mock_publisher(self) -> AsyncMock:
        return AsyncMock()
    
    @pytest.fixture
    def use_case(
        self,
        mock_repository: AsyncMock,
        mock_gateway: AsyncMock,
        mock_publisher: AsyncMock
    ) -> TranscribeAudioUseCase:
        return TranscribeAudioUseCase(
            audio_repository=mock_repository,
            transcription_gateway=mock_gateway,
            event_publisher=mock_publisher
        )
    
    @pytest.fixture
    def audio_file(self) -> AudioFile:
        audio = AudioFile.create(
            user_id=uuid4(),
            s3_key="test/audio.wav",
            metadata=AudioMetadata(30.0, 16000, 1, "wav")
        )
        audio.mark_events_as_committed()
        return audio
    
    @pytest.mark.asyncio
    async def test_transcribe_audio_success(
        self,
        use_case: TranscribeAudioUseCase,
        mock_repository: AsyncMock,
        mock_gateway: AsyncMock,
        mock_publisher: AsyncMock,
        audio_file: AudioFile
    ):
        """正常: 音声文字起こしが成功する"""
        # Arrange
        mock_repository.find_by_id.return_value = audio_file
        mock_gateway.transcribe.return_value = TranscriptionResult(
            text="こんにちは",
            confidence=0.95,
            segments=[]
        )
        
        input_data = TranscribeAudioInput(
            audio_id=audio_file.id,
            language="ja-JP"
        )
        
        # Act
        result = await use_case.execute(input_data)
        
        # Assert
        assert result.text == "こんにちは"
        assert result.confidence == 0.95
        mock_repository.save.assert_called_once()
        mock_publisher.publish.assert_called()
    
    @pytest.mark.asyncio
    async def test_transcribe_audio_not_found(
        self,
        use_case: TranscribeAudioUseCase,
        mock_repository: AsyncMock
    ):
        """異常: 音声ファイルが見つからない"""
        # Arrange
        mock_repository.find_by_id.return_value = None
        input_data = TranscribeAudioInput(audio_id=uuid4())
        
        # Act & Assert
        with pytest.raises(AudioNotFoundError):
            await use_case.execute(input_data)
    
    @pytest.mark.asyncio
    async def test_transcribe_audio_gateway_failure(
        self,
        use_case: TranscribeAudioUseCase,
        mock_repository: AsyncMock,
        mock_gateway: AsyncMock,
        audio_file: AudioFile
    ):
        """異常: 外部サービスエラー"""
        # Arrange
        mock_repository.find_by_id.return_value = audio_file
        mock_gateway.transcribe.side_effect = TranscriptionServiceError("Service unavailable")
        
        input_data = TranscribeAudioInput(audio_id=audio_file.id)
        
        # Act & Assert
        with pytest.raises(TranscriptionServiceError):
            await use_case.execute(input_data)
```

### 3.3 Integration Tests

```python
# tests/integration/test_dynamodb_event_store.py
import pytest
import boto3
from moto import mock_aws
from uuid import uuid4

from infrastructure.event_store import DynamoDBEventStore, StoredEvent
from domain.audio.events import AudioCreated

@pytest.fixture
def dynamodb():
    with mock_aws():
        dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
        
        # テーブル作成
        dynamodb.create_table(
            TableName='nova-event-store',
            KeySchema=[
                {'AttributeName': 'pk', 'KeyType': 'HASH'},
                {'AttributeName': 'sk', 'KeyType': 'RANGE'}
            ],
            AttributeDefinitions=[
                {'AttributeName': 'pk', 'AttributeType': 'S'},
                {'AttributeName': 'sk', 'AttributeType': 'S'}
            ],
            BillingMode='PAY_PER_REQUEST'
        )
        yield dynamodb

@pytest.fixture
def event_store(dynamodb) -> DynamoDBEventStore:
    return DynamoDBEventStore(table_name='nova-event-store')

class TestDynamoDBEventStore:
    """DynamoDB Event Store 統合テスト"""
    
    @pytest.mark.asyncio
    async def test_append_and_get_events(self, event_store: DynamoDBEventStore):
        """正常: イベントを追記して取得できる"""
        # Arrange
        aggregate_id = uuid4()
        events = [
            AudioCreated(audio_id=aggregate_id, user_id=uuid4(), s3_key="test.wav")
        ]
        
        # Act
        await event_store.append_events(
            aggregate_type="AudioFile",
            aggregate_id=aggregate_id,
            events=events,
            expected_version=0
        )
        
        # Assert
        stored_events = await event_store.get_events("AudioFile", aggregate_id)
        assert len(stored_events) == 1
        assert stored_events[0].event_type == "AudioCreated"
    
    @pytest.mark.asyncio
    async def test_optimistic_concurrency(self, event_store: DynamoDBEventStore):
        """異常: 楽観的ロック違反"""
        # Arrange
        aggregate_id = uuid4()
        events = [AudioCreated(audio_id=aggregate_id, user_id=uuid4(), s3_key="test.wav")]
        
        await event_store.append_events("AudioFile", aggregate_id, events, 0)
        
        # Act & Assert
        with pytest.raises(ConcurrencyError):
            await event_store.append_events("AudioFile", aggregate_id, events, 0)


# tests/integration/test_bedrock_gateway.py
@pytest.fixture
def mock_bedrock():
    with mock_aws():
        # Bedrock のモック設定
        yield

class TestNovaSonicGateway:
    """Nova Sonic Gateway 統合テスト"""
    
    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_transcribe_real_service(self):
        """実サービス統合テスト（CI/CDでスキップ）"""
        # このテストは実際の AWS サービスに接続
        gateway = NovaSonicGateway(region="us-east-1")
        
        # テスト用音声ファイル
        result = await gateway.transcribe(
            s3_key="test-fixtures/sample.wav",
            language="ja-JP"
        )
        
        assert result.text is not None
        assert result.confidence > 0
```

### 3.4 E2E Tests

```typescript
// tests/e2e/agent-chat.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Agent Chat', () => {
  test.beforeEach(async ({ page }) => {
    // ログイン
    await page.goto('/login');
    await page.fill('[data-testid="email-input"]', 'test@example.com');
    await page.fill('[data-testid="password-input"]', 'password');
    await page.click('[data-testid="login-button"]');
    await page.waitForURL('/dashboard');
  });

  test('should send message and receive response', async ({ page }) => {
    // Arrange
    await page.goto('/agent');
    
    // Act
    await page.fill('[data-testid="chat-input"]', 'こんにちは');
    await page.click('[data-testid="send-button"]');
    
    // Assert
    await expect(page.locator('[data-testid="user-message"]')).toContainText('こんにちは');
    await expect(page.locator('[data-testid="assistant-message"]')).toBeVisible({ timeout: 10000 });
  });

  test('should display tool execution', async ({ page }) => {
    await page.goto('/agent');
    
    // 検索を要求するメッセージ
    await page.fill('[data-testid="chat-input"]', '最新のFAQを検索してください');
    await page.click('[data-testid="send-button"]');
    
    // ツール実行が表示される
    await expect(page.locator('[data-testid="tool-call"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="tool-call"]')).toContainText('search_knowledge');
  });
});
```

## 4. テスト設定

### 4.1 pytest 設定

```toml
# pyproject.toml
[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
addopts = [
    "--strict-markers",
    "-ra",
    "-q",
    "--cov=src",
    "--cov-report=term-missing",
    "--cov-report=html",
    "--cov-fail-under=80",
]
markers = [
    "unit: Unit tests",
    "integration: Integration tests",
    "e2e: End-to-end tests",
    "slow: Slow running tests",
]
filterwarnings = [
    "ignore::DeprecationWarning",
]

[tool.coverage.run]
branch = true
source = ["src"]
omit = [
    "*/tests/*",
    "*/__init__.py",
]

[tool.coverage.report]
exclude_lines = [
    "pragma: no cover",
    "def __repr__",
    "raise NotImplementedError",
    "if TYPE_CHECKING:",
]
```

### 4.2 CI/CD パイプライン

```yaml
# .github/workflows/test.yml
name: Test

on:
  push:
    branches: [main, develop]
  pull_request:

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      
      - name: Install dependencies
        run: |
          pip install -e ".[dev]"
      
      - name: Run unit tests
        run: |
          pytest tests/unit -v --cov --cov-report=xml
      
      - name: Upload coverage
        uses: codecov/codecov-action@v4

  integration-tests:
    runs-on: ubuntu-latest
    services:
      localstack:
        image: localstack/localstack:latest
        ports:
          - 4566:4566
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Run integration tests
        run: |
          pytest tests/integration -v -m integration
        env:
          AWS_ENDPOINT_URL: http://localhost:4566

  e2e-tests:
    runs-on: ubuntu-latest
    needs: [unit-tests, integration-tests]
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Install Playwright
        run: npx playwright install --with-deps
      
      - name: Run E2E tests
        run: |
          npx playwright test
      
      - name: Upload test results
        uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```

## 5. テストダブル

```python
# tests/doubles/gateways.py
from typing import Dict, List
from domain.audio.entities import TranscriptionResult

class FakeTranscriptionGateway:
    """テスト用 Fake Gateway"""
    
    def __init__(self):
        self._responses: Dict[str, TranscriptionResult] = {}
        self._calls: List[dict] = []
    
    def set_response(self, s3_key: str, result: TranscriptionResult):
        self._responses[s3_key] = result
    
    async def transcribe(self, s3_key: str, language: str = "ja-JP") -> TranscriptionResult:
        self._calls.append({"s3_key": s3_key, "language": language})
        
        if s3_key in self._responses:
            return self._responses[s3_key]
        
        # デフォルトレスポンス
        return TranscriptionResult(
            text="Fake transcription",
            confidence=0.99,
            segments=[]
        )
    
    def assert_called_with(self, s3_key: str, language: str = None):
        for call in self._calls:
            if call["s3_key"] == s3_key:
                if language is None or call["language"] == language:
                    return
        raise AssertionError(f"Expected call with s3_key={s3_key} not found")
```

