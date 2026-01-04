/**
 * Voice Feature Module (FSD)
 *
 * Public API for voice feature
 */

// UI Components
export { VoicePanel } from './ui/VoicePanel';

// Model (Hooks)
export {
  useVoiceRecorder,
  useVoiceConverse,
  useTextToSpeech,
  type TranscriptionResult,
  type SynthesizedAudio,
  type VoiceConverseResult,
  type RecordingState,
} from './model/use-voice';
