'use client';

/**
 * VoicePanel - Voice Interaction UI
 *
 * FSD features/voice/ui layer
 * Atomic Design: Organism
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  useVoiceConverse,
  useTextToSpeech,
  type VoiceConverseResult,
} from '../model/use-voice';

// =============================================================================
// Sub-components (Molecules)
// =============================================================================

interface WaveformProps {
  isRecording: boolean;
}

function Waveform({ isRecording }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    const drawWave = () => {
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(0, 0, width, height);

      if (isRecording) {
        ctx.beginPath();
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;

        for (let x = 0; x < width; x++) {
          const amplitude = isRecording ? 20 + Math.random() * 20 : 5;
          const y = height / 2 + Math.sin((x + Date.now() / 50) * 0.05) * amplitude;
          if (x === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 1;
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();
      }

      animationRef.current = requestAnimationFrame(drawWave);
    };

    drawWave();

    return () => {
      cancelAnimationFrame(animationRef.current);
    };
  }, [isRecording]);

  return (
    <canvas
      ref={canvasRef}
      width={300}
      height={60}
      className="w-full h-15 rounded-lg"
    />
  );
}

interface RecordButtonProps {
  isRecording: boolean;
  isProcessing: boolean;
  onClick: () => void;
}

function RecordButton({ isRecording, isProcessing, onClick }: RecordButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isProcessing}
      className={`w-20 h-20 rounded-full flex items-center justify-center transition-all shadow-lg ${
        isRecording
          ? 'bg-red-500 hover:bg-red-600 animate-pulse'
          : isProcessing
            ? 'bg-slate-400 cursor-not-allowed'
            : 'bg-teal-500 hover:bg-teal-600'
      }`}
    >
      {isProcessing ? (
        <svg
          className="animate-spin h-8 w-8 text-white"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      ) : isRecording ? (
        <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="6" width="12" height="12" rx="2" />
        </svg>
      ) : (
        <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
          <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
        </svg>
      )}
    </button>
  );
}

interface ConversationItemProps {
  result: VoiceConverseResult;
  index: number;
}

function ConversationItem({ result, index }: ConversationItemProps) {
  return (
    <div
      className="space-y-3"
      style={{ animationDelay: `${index * 100}ms` }}
    >
      {/* User message */}
      <div className="flex justify-end">
        <div className="max-w-[80%] bg-teal-500 text-white rounded-2xl rounded-tr-sm px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs opacity-75">🎤 You</span>
          </div>
          <p className="text-sm">{result.transcription.text}</p>
        </div>
      </div>

      {/* Assistant message */}
      <div className="flex justify-start">
        <div className="max-w-[80%] bg-slate-100 text-slate-800 rounded-2xl rounded-tl-sm px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-slate-500">🤖 Assistant</span>
          </div>
          <p className="text-sm">{result.response}</p>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Main Component (Organism)
// =============================================================================

interface VoicePanelProps {
  sessionId?: string;
}

export function VoicePanel({ sessionId: propSessionId }: VoicePanelProps) {
  const sessionId = propSessionId || `voice-session-${Date.now()}`;

  const {
    result,
    isProcessing,
    error,
    conversationHistory,
    recorder,
    startConversation,
    endConversation,
  } = useVoiceConverse(sessionId);

  const { synthesize } = useTextToSpeech();

  const [ttsText, setTtsText] = useState('');
  const [activeTab, setActiveTab] = useState<'conversation' | 'tts'>('conversation');

  const handleRecordToggle = useCallback(async () => {
    if (recorder.isRecording) {
      const converseResult = await endConversation();
      // Auto-play response if available
      if (converseResult?.audio?.audioBase64) {
        // Would play audio here
      }
    } else {
      await startConversation();
    }
  }, [recorder.isRecording, startConversation, endConversation]);

  const handleTTS = useCallback(async () => {
    if (!ttsText.trim()) return;
    await synthesize(ttsText);
  }, [ttsText, synthesize]);

  const conversationContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (conversationContainerRef.current) {
      conversationContainerRef.current.scrollTop =
        conversationContainerRef.current.scrollHeight;
    }
  }, [conversationHistory]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-slate-200 bg-gradient-to-r from-teal-50 to-cyan-50 px-6 py-4">
        <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <span className="text-2xl">🎙️</span> Voice
        </h2>
        <p className="text-sm text-slate-600 mt-1">
          Nova Sonic で音声対話
        </p>
      </div>

      {/* Tab Toggle */}
      <div className="px-6 py-3 border-b border-slate-100 bg-slate-50">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('conversation')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
              activeTab === 'conversation'
                ? 'bg-teal-600 text-white shadow-md'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            💬 音声会話
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('tts')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
              activeTab === 'tts'
                ? 'bg-teal-600 text-white shadow-md'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            🔊 テキスト読み上げ
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {activeTab === 'conversation' ? (
          <>
            {/* Conversation History */}
            <div
              ref={conversationContainerRef}
              className="flex-1 overflow-y-auto px-6 py-4 space-y-4"
            >
              {conversationHistory.length === 0 && !recorder.isRecording && (
                <div className="text-center py-12 text-slate-500">
                  <p className="text-5xl mb-4">🎤</p>
                  <p className="font-medium">音声会話を開始</p>
                  <p className="text-sm mt-2">
                    マイクボタンを押して話しかけてください
                  </p>
                </div>
              )}

              {conversationHistory.map((item, idx) => (
                <ConversationItem key={idx} result={item} index={idx} />
              ))}

              {/* Error State */}
              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-red-700">
                  <p className="font-medium">エラーが発生しました</p>
                  <p className="text-sm mt-1">{error.message}</p>
                </div>
              )}
            </div>

            {/* Recording Controls */}
            <div className="border-t border-slate-200 bg-slate-50 px-6 py-6">
              {/* Waveform */}
              <div className="mb-4">
                <Waveform isRecording={recorder.isRecording} />
              </div>

              {/* Duration */}
              {recorder.isRecording && (
                <p className="text-center text-sm text-red-600 font-mono mb-4">
                  録音中: {Math.floor(recorder.duration / 60)
                    .toString()
                    .padStart(2, '0')}
                  :
                  {(recorder.duration % 60).toString().padStart(2, '0')}
                </p>
              )}

              {/* Record Button */}
              <div className="flex justify-center">
                <RecordButton
                  isRecording={recorder.isRecording}
                  isProcessing={isProcessing}
                  onClick={handleRecordToggle}
                />
              </div>

              <p className="text-center text-xs text-slate-500 mt-4">
                {recorder.isRecording
                  ? 'タップして録音を停止'
                  : 'タップして録音を開始'}
              </p>
            </div>
          </>
        ) : (
          /* TTS Tab */
          <div className="flex-1 p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                読み上げるテキスト
              </label>
              <textarea
                value={ttsText}
                onChange={(e) => setTtsText(e.target.value)}
                placeholder="テキストを入力してください..."
                rows={6}
                className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-slate-800 placeholder:text-slate-400 resize-none"
              />
            </div>

            <button
              type="button"
              onClick={handleTTS}
              disabled={!ttsText.trim()}
              className="w-full px-6 py-3 bg-teal-600 text-white font-medium rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              🔊 読み上げ
            </button>

            <audio id="tts-audio" className="w-full" controls style={{ display: 'none' }} />
          </div>
        )}
      </div>
    </div>
  );
}

export default VoicePanel;
