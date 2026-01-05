/**
 * Voice Feature - Model Layer (FSD)
 *
 * React hooks for Nova Sonic voice integration
 * GraphQL API経由でAmplify Lambdaを呼び出す
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { generateClient } from 'aws-amplify/data';
import { uploadData } from 'aws-amplify/storage';

// =============================================================================
// Types
// =============================================================================

export interface TranscriptionResult {
  text: string;
  confidence: number;
  language: string;
  duration: number;
}

export interface SynthesizedAudio {
  audioId: string;
  s3Uri: string;
  audioBase64?: string;
  text: string;
  voice: string;
  duration: number;
}

export interface VoiceConverseResult {
  transcription: TranscriptionResult;
  response: string;
  audio?: SynthesizedAudio;
}

export type RecordingState = 'idle' | 'recording' | 'processing';

// =============================================================================
// Audio Recording Helper
// =============================================================================

class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private stream: MediaStream | null = null;

  async start(): Promise<void> {
    this.audioChunks = [];

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    this.mediaRecorder = new MediaRecorder(this.stream, {
      mimeType: 'audio/webm;codecs=opus',
    });

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.audioChunks.push(event.data);
      }
    };

    this.mediaRecorder.start(100); // Collect data every 100ms
  }

  async stop(): Promise<Blob> {
    return new Promise((resolve) => {
      if (!this.mediaRecorder) {
        resolve(new Blob());
        return;
      }

      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        resolve(audioBlob);
      };

      this.mediaRecorder.stop();

      // Stop all tracks
      if (this.stream) {
        this.stream.getTracks().forEach((track) => track.stop());
      }
    });
  }

  isRecording(): boolean {
    return this.mediaRecorder?.state === 'recording';
  }
}

// =============================================================================
// GraphQL Client
// =============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getClient = () => generateClient() as any;

// =============================================================================
// Hooks
// =============================================================================

/**
 * useVoiceRecorder - マイク録音フック
 */
export function useVoiceRecorder() {
  const [state, setState] = useState<RecordingState>('idle');
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [duration, setDuration] = useState(0);

  const recorderRef = useRef<AudioRecorder>(new AudioRecorder());
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      await recorderRef.current.start();
      setState('recording');
      startTimeRef.current = Date.now();

      // Update duration every 100ms
      timerRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 100);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Recording failed'));
      setState('idle');
    }
  }, []);

  const stopRecording = useCallback(async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    try {
      setState('processing');
      const blob = await recorderRef.current.stop();
      setAudioBlob(blob);

      // Create URL for playback
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);

      setState('idle');
      return blob;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Stop recording failed'));
      setState('idle');
      return null;
    }
  }, []);

  const clearRecording = useCallback(() => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioBlob(null);
    setAudioUrl(null);
    setDuration(0);
  }, [audioUrl]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  return {
    state,
    audioBlob,
    audioUrl,
    duration,
    error,
    startRecording,
    stopRecording,
    clearRecording,
    isRecording: state === 'recording',
  };
}

/**
 * useVoiceConverse - 音声対話フック (GraphQL API使用)
 */
export function useVoiceConverse(sessionId: string) {
  const [result, setResult] = useState<VoiceConverseResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [conversationHistory, setConversationHistory] = useState<VoiceConverseResult[]>([]);

  const recorder = useVoiceRecorder();

  const sendVoice = useCallback(
    async (audioBlob: Blob) => {
      setIsProcessing(true);
      setError(null);

      try {
        const client = getClient();
        
        // 1. Upload audio to S3
        const s3Key = `voice/${sessionId}/${Date.now()}.webm`;
        await uploadData({
          path: s3Key,
          data: audioBlob,
          options: { contentType: 'audio/webm' },
        });

        // 2. Call voiceConverse mutation
        const response = await client.mutations.voiceConverse({
          sessionId,
          audioS3Key: s3Key,
        });

        if (response.errors) {
          throw new Error(response.errors[0]?.message || 'Voice conversation failed');
        }

        const converseResult = response.data as VoiceConverseResult;
        setResult(converseResult);
        setConversationHistory((prev) => [...prev, converseResult]);

        return converseResult;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Voice conversation failed');
        setError(error);
        throw error;
      } finally {
        setIsProcessing(false);
      }
    },
    [sessionId]
  );

  const startConversation = useCallback(async () => {
    await recorder.startRecording();
  }, [recorder]);

  const endConversation = useCallback(async () => {
    const blob = await recorder.stopRecording();
    if (blob && blob.size > 0) {
      return sendVoice(blob);
    }
    return null;
  }, [recorder, sendVoice]);

  const clear = useCallback(() => {
    setResult(null);
    setError(null);
    recorder.clearRecording();
  }, [recorder]);

  return {
    result,
    isProcessing,
    error,
    conversationHistory,
    recorder,
    startConversation,
    endConversation,
    sendVoice,
    clear,
  };
}

/**
 * useTextToSpeech - TTS フック (GraphQL API使用)
 */
export function useTextToSpeech() {
  const [audio, setAudio] = useState<SynthesizedAudio | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const synthesize = useCallback(async (text: string, voice?: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const client = getClient();
      
      const response = await client.mutations.synthesizeSpeech({
        text,
        voice,
        language: 'ja-JP',
      });

      if (response.errors) {
        throw new Error(response.errors[0]?.message || 'Synthesis failed');
      }

      const result = response.data as SynthesizedAudio;
      setAudio(result);

      // Play audio if available
      if (result.audioBase64) {
        const audioData = `data:audio/wav;base64,${result.audioBase64}`;
        if (audioRef.current) {
          audioRef.current.src = audioData;
          audioRef.current.play();
        }
      }

      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Synthesis failed');
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, []);

  return {
    audio,
    isLoading,
    error,
    audioRef,
    synthesize,
    stop,
  };
}

/**
 * useTranscription - 音声認識フック (GraphQL API使用)
 */
export function useTranscription() {
  const [transcription, setTranscription] = useState<TranscriptionResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const transcribe = useCallback(async (audioS3Key: string, language?: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const client = getClient();
      
      const response = await client.mutations.transcribeAudio({
        audioS3Key,
        language: language || 'ja-JP',
        enableSpeakerDiarization: false,
      });

      if (response.errors) {
        throw new Error(response.errors[0]?.message || 'Transcription failed');
      }

      const result = response.data as TranscriptionResult;
      setTranscription(result);

      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Transcription failed');
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setTranscription(null);
    setError(null);
  }, []);

  return {
    transcription,
    isLoading,
    error,
    transcribe,
    clear,
  };
}
