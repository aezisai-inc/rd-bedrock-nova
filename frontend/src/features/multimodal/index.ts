/**
 * Multimodal Feature Module (FSD)
 *
 * Public API for multimodal generation feature
 */

// UI Components
export { MultimodalPanel } from './ui/MultimodalPanel';

// Model (Hooks)
export {
  useImageGeneration,
  useVideoGeneration,
  type ImageStyle,
  type ImageGenerationParams,
  type GeneratedImage,
  type VideoGenerationParams,
  type GeneratedVideo,
} from './model/use-generation';
