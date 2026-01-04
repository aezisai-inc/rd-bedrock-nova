/**
 * Multimodal Feature - Model Layer (FSD)
 *
 * React hooks for Nova Canvas/Reel generation
 */

import { useState, useCallback } from 'react';

// =============================================================================
// Types
// =============================================================================

export type ImageStyle =
  | 'photographic'
  | 'cinematic'
  | 'anime'
  | 'digital-art'
  | 'fantasy'
  | 'neon-punk';

export interface ImageGenerationParams {
  prompt: string;
  negativePrompt?: string;
  style?: ImageStyle;
  width?: number;
  height?: number;
}

export interface GeneratedImage {
  imageId: string;
  s3Uri: string;
  base64?: string;
  prompt: string;
  style?: string;
  width: number;
  height: number;
  generatedAt: string;
}

export interface VideoGenerationParams {
  prompt: string;
  imageUri?: string;
  duration?: number;
}

export interface GeneratedVideo {
  videoId: string;
  s3Uri: string;
  prompt: string;
  duration: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  generatedAt: string;
}

// =============================================================================
// API Client
// =============================================================================

const API_ENDPOINT = process.env.NEXT_PUBLIC_API_ENDPOINT || '/api';

async function generateImageApi(params: ImageGenerationParams): Promise<GeneratedImage> {
  const response = await fetch(`${API_ENDPOINT}/generation/image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw new Error(`Image generation failed: ${response.statusText}`);
  }

  return response.json();
}

async function generateVideoApi(params: VideoGenerationParams): Promise<GeneratedVideo> {
  const response = await fetch(`${API_ENDPOINT}/generation/video`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw new Error(`Video generation failed: ${response.statusText}`);
  }

  return response.json();
}

// =============================================================================
// Hooks
// =============================================================================

/**
 * useImageGeneration - 画像生成フック
 */
export function useImageGeneration() {
  const [image, setImage] = useState<GeneratedImage | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [history, setHistory] = useState<GeneratedImage[]>([]);

  const generate = useCallback(async (params: ImageGenerationParams) => {
    setIsGenerating(true);
    setError(null);

    try {
      const result = await generateImageApi(params);
      setImage(result);
      setHistory((prev) => [result, ...prev].slice(0, 10));
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Generation failed');
      setError(error);
      throw error;
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const clear = useCallback(() => {
    setImage(null);
    setError(null);
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
  }, []);

  return {
    image,
    isGenerating,
    error,
    history,
    generate,
    clear,
    clearHistory,
  };
}

/**
 * useVideoGeneration - 動画生成フック
 */
export function useVideoGeneration() {
  const [video, setVideo] = useState<GeneratedVideo | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const generate = useCallback(async (params: VideoGenerationParams) => {
    setIsGenerating(true);
    setError(null);

    try {
      const result = await generateVideoApi(params);
      setVideo(result);
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Generation failed');
      setError(error);
      throw error;
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const clear = useCallback(() => {
    setVideo(null);
    setError(null);
  }, []);

  return {
    video,
    isGenerating,
    error,
    generate,
    clear,
  };
}
