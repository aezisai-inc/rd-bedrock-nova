"""AudioFile Aggregate Unit Tests"""
import pytest
from uuid import uuid4

from src.domain.audio.entities import AudioFile, ProcessingStatus
from src.domain.audio.entities.audio_file import InvalidStateError
from src.domain.audio.entities.transcription import Transcription
from src.domain.audio.value_objects import (
    AudioMetadata,
    AudioFormat,
    SentimentScore,
    TranscriptSegment,
)
from src.domain.audio.events import (
    AudioCreated,
    AudioProcessingStarted,
    TranscriptionCompleted,
    AudioProcessingCompleted,
    AudioProcessingFailed,
)


class TestAudioFileCreation:
    """AudioFile 作成のテスト"""

    def test_create_audio_file(self):
        """正常: AudioFile を作成できる"""
        # Arrange
        user_id = uuid4()
        s3_key = "audio/test/sample.wav"
        metadata = AudioMetadata(
            duration_seconds=30.0,
            sample_rate=16000,
            channels=1,
            format=AudioFormat.WAV,
            file_size_bytes=1024000,
        )

        # Act
        audio = AudioFile.create(
            user_id=user_id,
            s3_key=s3_key,
            metadata=metadata,
        )

        # Assert
        assert audio.id is not None
        assert audio.user_id == user_id
        assert audio.s3_key == s3_key
        assert audio.status == ProcessingStatus.PENDING
        assert audio.metadata is not None
        assert audio.metadata.duration_seconds == 30.0
        assert audio.transcription is None
        assert audio.sentiment is None

    def test_create_emits_audio_created_event(self):
        """正常: 作成時に AudioCreated イベントが発行される"""
        # Arrange
        user_id = uuid4()
        metadata = AudioMetadata(
            duration_seconds=60.0,
            sample_rate=44100,
            channels=2,
            format=AudioFormat.MP3,
        )

        # Act
        audio = AudioFile.create(
            user_id=user_id,
            s3_key="test.mp3",
            metadata=metadata,
        )

        # Assert
        events = audio.get_uncommitted_events()
        assert len(events) == 1
        assert isinstance(events[0], AudioCreated)
        assert events[0].user_id == user_id


class TestAudioFileProcessing:
    """AudioFile 処理フローのテスト"""

    @pytest.fixture
    def pending_audio(self) -> AudioFile:
        """PENDING 状態の AudioFile"""
        return AudioFile.create(
            user_id=uuid4(),
            s3_key="test.wav",
            metadata=AudioMetadata(
                duration_seconds=30.0,
                sample_rate=16000,
                channels=1,
                format=AudioFormat.WAV,
            ),
        )

    def test_start_processing_from_pending(self, pending_audio: AudioFile):
        """正常: PENDING 状態から処理を開始できる"""
        # Arrange
        pending_audio.mark_events_as_committed()

        # Act
        pending_audio.start_processing()

        # Assert
        assert pending_audio.status == ProcessingStatus.PROCESSING
        events = pending_audio.get_uncommitted_events()
        assert len(events) == 1
        assert isinstance(events[0], AudioProcessingStarted)

    def test_cannot_start_processing_twice(self, pending_audio: AudioFile):
        """異常: 処理中に再度開始できない"""
        # Arrange
        pending_audio.start_processing()

        # Act & Assert
        with pytest.raises(InvalidStateError) as exc_info:
            pending_audio.start_processing()

        assert "Cannot start processing" in str(exc_info.value)

    def test_complete_transcription(self, pending_audio: AudioFile):
        """正常: 文字起こしを完了できる"""
        # Arrange
        pending_audio.start_processing()
        pending_audio.mark_events_as_committed()

        transcription = Transcription(
            text="テストテキスト",
            confidence=0.95,
            segments=[
                TranscriptSegment(
                    start_time=0.0,
                    end_time=1.0,
                    text="テスト",
                    confidence=0.96,
                ),
                TranscriptSegment(
                    start_time=1.0,
                    end_time=2.0,
                    text="テキスト",
                    confidence=0.94,
                ),
            ],
            language="ja-JP",
        )

        # Act
        pending_audio.complete_transcription(transcription)

        # Assert
        assert pending_audio.transcription is not None
        assert pending_audio.transcription.text == "テストテキスト"
        assert pending_audio.transcription.confidence == 0.95

    def test_cannot_complete_transcription_from_pending(self, pending_audio: AudioFile):
        """異常: PENDING 状態では文字起こしを完了できない"""
        # Arrange
        transcription = Transcription(text="Test", confidence=0.9)

        # Act & Assert
        with pytest.raises(InvalidStateError):
            pending_audio.complete_transcription(transcription)

    def test_complete_processing(self, pending_audio: AudioFile):
        """正常: 処理を完了できる"""
        # Arrange
        pending_audio.start_processing()
        transcription = Transcription(text="Test", confidence=0.9)
        pending_audio.complete_transcription(transcription)
        pending_audio.mark_events_as_committed()

        # Act
        pending_audio.complete_processing()

        # Assert
        assert pending_audio.status == ProcessingStatus.COMPLETED
        events = pending_audio.get_uncommitted_events()
        assert isinstance(events[-1], AudioProcessingCompleted)

    def test_fail_processing(self, pending_audio: AudioFile):
        """正常: 処理を失敗としてマークできる"""
        # Arrange
        pending_audio.start_processing()
        pending_audio.mark_events_as_committed()

        # Act
        pending_audio.fail_processing("Test error", "TEST_ERROR")

        # Assert
        assert pending_audio.status == ProcessingStatus.FAILED
        events = pending_audio.get_uncommitted_events()
        assert isinstance(events[-1], AudioProcessingFailed)
        assert events[-1].reason == "Test error"


class TestAudioFileEventSourcing:
    """AudioFile Event Sourcing のテスト"""

    def test_reconstitute_from_events(self):
        """正常: イベント履歴から集約を再構築できる"""
        # Arrange
        audio_id = uuid4()
        user_id = uuid4()

        events = [
            {
                "event_type": "AudioCreated",
                "event_data": {
                    "audio_id": str(audio_id),
                    "user_id": str(user_id),
                    "s3_key": "test.wav",
                    "metadata": {
                        "duration_seconds": 30.0,
                        "sample_rate": 16000,
                        "channels": 1,
                        "format": "wav",
                    },
                },
                "version": 1,
            },
            {
                "event_type": "AudioProcessingStarted",
                "event_data": {"audio_id": str(audio_id)},
                "version": 2,
            },
        ]

        # Act
        audio = AudioFile.reconstitute(events)

        # Assert
        assert audio.id == audio_id
        assert audio.user_id == user_id
        assert audio.status == ProcessingStatus.PROCESSING
        assert audio.version == 2

    def test_uncommitted_events_tracking(self):
        """正常: 未コミットイベントを追跡できる"""
        # Arrange
        audio = AudioFile.create(
            user_id=uuid4(),
            s3_key="test.wav",
            metadata=AudioMetadata(
                duration_seconds=30.0,
                sample_rate=16000,
                channels=1,
                format=AudioFormat.WAV,
            ),
        )

        # Assert: 作成時に1イベント
        assert len(audio.get_uncommitted_events()) == 1

        # Act: コミット
        audio.mark_events_as_committed()

        # Assert: クリアされる
        assert len(audio.get_uncommitted_events()) == 0
        assert audio.version == 1

        # Act: 新しい操作
        audio.start_processing()

        # Assert: 新しいイベントが追跡される
        assert len(audio.get_uncommitted_events()) == 1


class TestAudioMetadata:
    """AudioMetadata 値オブジェクトのテスト"""

    def test_valid_metadata(self):
        """正常: 有効なメタデータを作成"""
        metadata = AudioMetadata(
            duration_seconds=60.0,
            sample_rate=44100,
            channels=2,
            format=AudioFormat.MP3,
            file_size_bytes=5000000,
            bitrate=320000,
        )

        assert metadata.duration_seconds == 60.0
        assert metadata.sample_rate == 44100
        assert metadata.is_stereo is True
        assert metadata.duration_minutes == 1.0

    def test_invalid_duration(self):
        """異常: 無効な再生時間"""
        with pytest.raises(ValueError) as exc_info:
            AudioMetadata(
                duration_seconds=-1,
                sample_rate=44100,
                channels=2,
                format=AudioFormat.MP3,
            )

        assert "Duration must be positive" in str(exc_info.value)

    def test_invalid_sample_rate(self):
        """異常: 無効なサンプルレート"""
        with pytest.raises(ValueError) as exc_info:
            AudioMetadata(
                duration_seconds=60.0,
                sample_rate=12345,
                channels=2,
                format=AudioFormat.MP3,
            )

        assert "Invalid sample rate" in str(exc_info.value)


class TestSentimentScore:
    """SentimentScore 値オブジェクトのテスト"""

    def test_positive_dominant(self):
        """正常: ポジティブが支配的"""
        score = SentimentScore(positive=0.7, negative=0.2, neutral=0.1)

        assert score.dominant.value == "positive"
        assert score.is_positive is True

    def test_scores_must_sum_to_one(self):
        """異常: スコア合計が1.0でない"""
        with pytest.raises(ValueError) as exc_info:
            SentimentScore(positive=0.5, negative=0.5, neutral=0.5)

        assert "must sum to 1.0" in str(exc_info.value)

    def test_neutral_default(self):
        """正常: デフォルトスコアを生成"""
        score = SentimentScore.neutral_default()

        assert score.neutral == 1.0
        assert score.positive == 0.0
        assert score.negative == 0.0

