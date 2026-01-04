'use client';

/**
 * MultimodalPanel - Image/Video Generation UI
 *
 * FSD features/multimodal/ui layer
 * Atomic Design: Organism
 */

import React, { useState, useCallback, FormEvent } from 'react';
import {
  useImageGeneration,
  useVideoGeneration,
  type ImageStyle,
  type GeneratedImage,
} from '../model/use-generation';

// =============================================================================
// Sub-components (Molecules)
// =============================================================================

interface StyleSelectorProps {
  value?: ImageStyle;
  onChange: (style: ImageStyle | undefined) => void;
}

function StyleSelector({ value, onChange }: StyleSelectorProps) {
  const styles: { id: ImageStyle; label: string; icon: string }[] = [
    { id: 'photographic', label: '写真', icon: '📷' },
    { id: 'cinematic', label: 'シネマ', icon: '🎬' },
    { id: 'anime', label: 'アニメ', icon: '🎨' },
    { id: 'digital-art', label: 'デジタル', icon: '💻' },
    { id: 'fantasy', label: 'ファンタジー', icon: '✨' },
    { id: 'neon-punk', label: 'ネオン', icon: '🌃' },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {styles.map((style) => (
        <button
          key={style.id}
          type="button"
          onClick={() => onChange(value === style.id ? undefined : style.id)}
          className={`px-3 py-2 text-sm rounded-lg border transition-all ${
            value === style.id
              ? 'bg-pink-600 text-white border-pink-600'
              : 'bg-white text-slate-600 border-slate-200 hover:border-pink-300'
          }`}
        >
          <span className="mr-1">{style.icon}</span>
          {style.label}
        </button>
      ))}
    </div>
  );
}

interface ImagePreviewProps {
  image: GeneratedImage;
}

function ImagePreview({ image }: ImagePreviewProps) {
  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-lg">
      {image.base64 ? (
        <img
          src={`data:image/png;base64,${image.base64}`}
          alt={image.prompt}
          className="w-full h-auto"
        />
      ) : (
        <div className="aspect-square bg-slate-100 flex items-center justify-center">
          <p className="text-slate-400">Loading...</p>
        </div>
      )}
      <div className="p-4 border-t border-slate-100">
        <p className="text-sm text-slate-700 line-clamp-2">{image.prompt}</p>
        <div className="flex items-center gap-2 mt-2 text-xs text-slate-500">
          {image.style && (
            <span className="px-2 py-0.5 bg-slate-100 rounded">
              {image.style}
            </span>
          )}
          <span>
            {image.width}×{image.height}
          </span>
        </div>
      </div>
    </div>
  );
}

interface HistoryGalleryProps {
  images: GeneratedImage[];
  onSelect?: (image: GeneratedImage) => void;
}

function HistoryGallery({ images, onSelect }: HistoryGalleryProps) {
  if (images.length === 0) return null;

  return (
    <div className="mt-6">
      <h3 className="text-sm font-medium text-slate-700 mb-3">生成履歴</h3>
      <div className="flex gap-2 overflow-x-auto pb-2">
        {images.map((img) => (
          <button
            key={img.imageId}
            type="button"
            onClick={() => onSelect?.(img)}
            className="shrink-0 w-16 h-16 rounded-lg overflow-hidden border border-slate-200 hover:border-pink-500 transition-all"
          >
            {img.base64 && (
              <img
                src={`data:image/png;base64,${img.base64}`}
                alt={img.prompt}
                className="w-full h-full object-cover"
              />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// Main Component (Organism)
// =============================================================================

type GenerationMode = 'image' | 'video';

export function MultimodalPanel() {
  const [mode, setMode] = useState<GenerationMode>('image');
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [style, setStyle] = useState<ImageStyle | undefined>();
  const [duration, setDuration] = useState(6);

  const {
    image,
    isGenerating: isGeneratingImage,
    error: imageError,
    history,
    generate: generateImage,
    clear: clearImage,
  } = useImageGeneration();

  const {
    video,
    isGenerating: isGeneratingVideo,
    error: videoError,
    generate: generateVideo,
    clear: clearVideo,
  } = useVideoGeneration();

  const isGenerating = mode === 'image' ? isGeneratingImage : isGeneratingVideo;
  const error = mode === 'image' ? imageError : videoError;

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!prompt.trim()) return;

      if (mode === 'image') {
        await generateImage({
          prompt,
          negativePrompt: negativePrompt || undefined,
          style,
        });
      } else {
        await generateVideo({
          prompt,
          duration,
        });
      }
    },
    [mode, prompt, negativePrompt, style, duration, generateImage, generateVideo]
  );

  const handleClear = useCallback(() => {
    setPrompt('');
    setNegativePrompt('');
    if (mode === 'image') {
      clearImage();
    } else {
      clearVideo();
    }
  }, [mode, clearImage, clearVideo]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-slate-200 bg-gradient-to-r from-pink-50 to-orange-50 px-6 py-4">
        <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <span className="text-2xl">🎨</span> Multimodal Generation
        </h2>
        <p className="text-sm text-slate-600 mt-1">
          Nova Canvas / Nova Reel で画像・動画を生成
        </p>
      </div>

      {/* Mode Toggle */}
      <div className="px-6 py-3 border-b border-slate-100 bg-slate-50">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode('image')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
              mode === 'image'
                ? 'bg-pink-600 text-white shadow-md'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            🖼️ 画像生成
          </button>
          <button
            type="button"
            onClick={() => setMode('video')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
              mode === 'video'
                ? 'bg-pink-600 text-white shadow-md'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            🎬 動画生成
          </button>
        </div>
      </div>

      {/* Generation Form */}
      <form onSubmit={handleSubmit} className="px-6 py-4 border-b border-slate-100 space-y-4">
        {/* Main Prompt */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            プロンプト
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={
              mode === 'image'
                ? '生成したい画像を説明してください...'
                : '生成したい動画を説明してください...'
            }
            rows={3}
            className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent text-slate-800 placeholder:text-slate-400 resize-none"
            disabled={isGenerating}
          />
        </div>

        {/* Image-specific options */}
        {mode === 'image' && (
          <>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                ネガティブプロンプト (オプション)
              </label>
              <input
                type="text"
                value={negativePrompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
                placeholder="避けたい要素..."
                className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent text-slate-800 placeholder:text-slate-400"
                disabled={isGenerating}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                スタイル
              </label>
              <StyleSelector value={style} onChange={setStyle} />
            </div>
          </>
        )}

        {/* Video-specific options */}
        {mode === 'video' && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              動画の長さ: {duration}秒
            </label>
            <input
              type="range"
              min={2}
              max={10}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className="w-full"
              disabled={isGenerating}
            />
          </div>
        )}

        {/* Submit Button */}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={isGenerating || !prompt.trim()}
            className="flex-1 px-6 py-3 bg-gradient-to-r from-pink-600 to-orange-500 text-white font-medium rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isGenerating ? (
              <span className="flex items-center justify-center gap-2">
                <svg
                  className="animate-spin h-4 w-4"
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
                生成中...
              </span>
            ) : (
              `${mode === 'image' ? '画像' : '動画'}を生成`
            )}
          </button>
          {(image || video) && (
            <button
              type="button"
              onClick={handleClear}
              className="px-4 py-3 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all"
            >
              クリア
            </button>
          )}
        </div>
      </form>

      {/* Result Area */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {/* Error State */}
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-red-700 mb-4">
            <p className="font-medium">エラーが発生しました</p>
            <p className="text-sm mt-1">{error.message}</p>
          </div>
        )}

        {/* Image Result */}
        {mode === 'image' && image && <ImagePreview image={image} />}

        {/* Video Result */}
        {mode === 'video' && video && (
          <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-lg p-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-2xl">🎬</span>
              <span
                className={`px-2 py-1 text-xs font-medium rounded ${
                  video.status === 'completed'
                    ? 'bg-green-100 text-green-700'
                    : video.status === 'failed'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-amber-100 text-amber-700'
                }`}
              >
                {video.status === 'pending'
                  ? '待機中'
                  : video.status === 'processing'
                    ? '処理中'
                    : video.status === 'completed'
                      ? '完了'
                      : '失敗'}
              </span>
            </div>
            <p className="text-sm text-slate-700">{video.prompt}</p>
            <p className="text-xs text-slate-500 mt-2">
              {video.duration}秒 • ID: {video.videoId}
            </p>
          </div>
        )}

        {/* Empty State */}
        {!image && !video && !isGenerating && (
          <div className="text-center py-12 text-slate-500">
            <p className="text-5xl mb-4">{mode === 'image' ? '🖼️' : '🎬'}</p>
            <p className="font-medium">
              {mode === 'image' ? '画像を生成' : '動画を生成'}
            </p>
            <p className="text-sm mt-2">
              プロンプトを入力して生成ボタンをクリック
            </p>
          </div>
        )}

        {/* History Gallery */}
        {mode === 'image' && <HistoryGallery images={history} />}
      </div>
    </div>
  );
}

export default MultimodalPanel;
