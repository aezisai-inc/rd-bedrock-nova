/**
 * Voice Feature - Model Layer (FSD)
 *
 * React hooks for Nova Sonic voice integration
 */

import { useState, useCallback, useRef, useEffect } from 'react';

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
// API Client
// =============================================================================

const API_ENDPOINT = process.env.NEXT_PUBLIC_API_ENDPOINT || '/api';

async function transcribeAudioApi(audioBase64: string): Promise<TranscriptionResult> {
  const response = await fetch(`${API_ENDPOINT}/voice/transcribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ audioBase64 }),
  });

  if (!response.ok) {
    throw new Error(`Transcription failed: ${response.statusText}`);
  }

  return response.json();
}

async function synthesizeSpeechApi(
  text: string,
  voice?: string
): Promise<SynthesizedAudio> {
  const response = await fetch(`${API_ENDPOINT}/voice/synthesize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice }),
  });

  if (!response.ok) {
    throw new Error(`Synthesis failed: ${response.statusText}`);
  }

  return response.json();
}

async function voiceConverseApi(
  sessionId: string,
  audioBase64: string
): Promise<VoiceConverseResult> {
  const response = await fetch(`${API_ENDPOINT}/voice/converse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, audioBase64 }),
  });

  if (!response.ok) {
    throw new Error(`Voice conversation failed: ${response.statusText}`);
  }

  return response.json();
}

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
 * useVoiceConverse - 音声対話フック
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
        // Convert blob to base64
        const arrayBuffer = await audioBlob.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString('base64');

        const converseResult = await voiceConverseApi(sessionId, base64);
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
 * useTextToSpeech - TTS フック
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
      const result = await synthesizeSpeechApi(text, voice);
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
