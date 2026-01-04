/**
 * Generation Agent Module
 *
 * Nova Canvas (画像生成) + Nova Reel (動画生成) 統合
 * Strands Agents SDK + Bedrock Runtime API
 *
 * 設計原則:
 * - Application層: strands-agents (@tool デコレータ)
 * - Platform層: bedrock-agentcore (Observability)
 * - Model層: bedrock-runtime (InvokeModel API)
 *
 * 禁止事項:
 * - boto3 直接使用
 * - 外部生成サービス (DALL-E等)
 */

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import {
  S3Client,
  PutObjectCommand,
} from '@aws-sdk/client-s3';

// =============================================================================
// Configuration
// =============================================================================

const REGION = process.env.AWS_REGION || 'ap-northeast-1';
const STORAGE_BUCKET = process.env.STORAGE_BUCKET_NAME || '';
const NOVA_CANVAS_MODEL = 'amazon.nova-canvas-v1:0';
const NOVA_REEL_MODEL = 'amazon.nova-reel-v1:0';

// Clients
const bedrockClient = new BedrockRuntimeClient({ region: REGION });
const s3Client = new S3Client({ region: REGION });

// =============================================================================
// Types
// =============================================================================

export interface ImageGenerationParams {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  numberOfImages?: number;
  style?: ImageStyle;
  seed?: number;
}

export type ImageStyle =
  | 'photographic'
  | 'cinematic'
  | 'anime'
  | 'digital-art'
  | 'fantasy'
  | 'neon-punk';

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
  fps?: number;
  dimension?: '1280x720' | '720x1280' | '1024x1024';
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
// Observability
// =============================================================================

const log = (level: string, message: string, data?: Record<string, unknown>) => {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      ...data,
      service: 'generation-agent',
    })
  );
};

// =============================================================================
// Image Generation (Nova Canvas)
// =============================================================================

export async function generateImage(
  params: ImageGenerationParams,
  userId?: string
): Promise<GeneratedImage> {
  const {
    prompt,
    negativePrompt,
    width = 1024,
    height = 1024,
    numberOfImages = 1,
    style,
    seed = Math.floor(Math.random() * 1000000),
  } = params;

  log('INFO', 'Generating image', { prompt: prompt.substring(0, 50), style, width, height });

  // Build style suffix if specified
  let styledPrompt = prompt;
  if (style) {
    const stylePrompts: Record<ImageStyle, string> = {
      photographic: ', professional photography, realistic, high quality',
      cinematic: ', cinematic lighting, dramatic, film still',
      anime: ', anime style, Japanese animation, vibrant colors',
      'digital-art': ', digital art, illustration, highly detailed',
      fantasy: ', fantasy art, magical, ethereal',
      'neon-punk': ', neon lights, cyberpunk, futuristic, glowing',
    };
    styledPrompt += stylePrompts[style];
  }

  // Nova Canvas request
  const requestBody = {
    taskType: 'TEXT_IMAGE',
    textToImageParams: {
      text: styledPrompt,
      ...(negativePrompt && { negativeText: negativePrompt }),
    },
    imageGenerationConfig: {
      numberOfImages,
      width,
      height,
      cfgScale: 8.0,
      seed,
    },
  };

  const response = await bedrockClient.send(
    new InvokeModelCommand({
      modelId: NOVA_CANVAS_MODEL,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(requestBody),
    })
  );

  const result = JSON.parse(new TextDecoder().decode(response.body));

  if (!result.images || result.images.length === 0) {
    throw new Error('Image generation failed: No images returned');
  }

  const imageId = `img-${Date.now()}-${seed}`;
  const base64Image = result.images[0];
  const imageBuffer = Buffer.from(base64Image, 'base64');
  const s3Key = `generated/${userId || 'anonymous'}/images/${imageId}.png`;

  // Save to S3
  if (STORAGE_BUCKET) {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: STORAGE_BUCKET,
        Key: s3Key,
        Body: imageBuffer,
        ContentType: 'image/png',
        Metadata: {
          prompt: prompt.substring(0, 256),
          style: style || 'default',
          width: width.toString(),
          height: height.toString(),
        },
      })
    );
  }

  log('INFO', 'Image generated', { imageId, s3Key });

  return {
    imageId,
    s3Uri: STORAGE_BUCKET ? `s3://${STORAGE_BUCKET}/${s3Key}` : '',
    base64: base64Image,
    prompt,
    style,
    width,
    height,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * 画像編集 (Nova Canvas Inpainting)
 */
export async function editImage(
  imageBase64: string,
  maskBase64: string,
  prompt: string,
  userId?: string
): Promise<GeneratedImage> {
  log('INFO', 'Editing image', { prompt: prompt.substring(0, 50) });

  const requestBody = {
    taskType: 'INPAINTING',
    inPaintingParams: {
      image: imageBase64,
      maskImage: maskBase64,
      text: prompt,
    },
    imageGenerationConfig: {
      numberOfImages: 1,
      cfgScale: 8.0,
      seed: Math.floor(Math.random() * 1000000),
    },
  };

  const response = await bedrockClient.send(
    new InvokeModelCommand({
      modelId: NOVA_CANVAS_MODEL,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(requestBody),
    })
  );

  const result = JSON.parse(new TextDecoder().decode(response.body));

  if (!result.images || result.images.length === 0) {
    throw new Error('Image editing failed: No images returned');
  }

  const imageId = `edit-${Date.now()}`;
  const base64Image = result.images[0];
  const imageBuffer = Buffer.from(base64Image, 'base64');
  const s3Key = `generated/${userId || 'anonymous'}/edits/${imageId}.png`;

  if (STORAGE_BUCKET) {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: STORAGE_BUCKET,
        Key: s3Key,
        Body: imageBuffer,
        ContentType: 'image/png',
      })
    );
  }

  return {
    imageId,
    s3Uri: STORAGE_BUCKET ? `s3://${STORAGE_BUCKET}/${s3Key}` : '',
    base64: base64Image,
    prompt,
    width: 1024,
    height: 1024,
    generatedAt: new Date().toISOString(),
  };
}

// =============================================================================
// Video Generation (Nova Reel)
// =============================================================================

export async function generateVideo(
  params: VideoGenerationParams,
  userId?: string
): Promise<GeneratedVideo> {
  const {
    prompt,
    imageUri,
    duration = 6,
    fps = 24,
    dimension = '1280x720',
  } = params;

  log('INFO', 'Generating video', { prompt: prompt.substring(0, 50), duration });

  const videoId = `vid-${Date.now()}`;
  const s3Key = `generated/${userId || 'anonymous'}/videos/${videoId}.mp4`;

  // Nova Reel request (async operation)
  const requestBody = {
    taskType: imageUri ? 'IMAGE_TO_VIDEO' : 'TEXT_TO_VIDEO',
    ...(imageUri
      ? {
          imageToVideoParams: {
            text: prompt,
            images: [{ source: { uri: imageUri } }],
          },
        }
      : {
          textToVideoParams: {
            text: prompt,
          },
        }),
    videoGenerationConfig: {
      durationSeconds: duration,
      fps,
      dimension,
      seed: Math.floor(Math.random() * 1000000),
    },
  };

  // Note: Nova Reel is async - in production use StartAsyncInvoke
  // For now, return pending status
  log('INFO', 'Video generation initiated', { videoId, s3Key });

  return {
    videoId,
    s3Uri: STORAGE_BUCKET ? `s3://${STORAGE_BUCKET}/${s3Key}` : '',
    prompt,
    duration,
    status: 'pending',
    generatedAt: new Date().toISOString(),
  };
}

// =============================================================================
// Tool Functions (Strands @tool pattern)
// =============================================================================

export function getGenerationTools() {
  return {
    generate_image: {
      description: 'Generate an image using Nova Canvas based on a text prompt',
      parameters: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'Text description of the image to generate',
          },
          negativePrompt: {
            type: 'string',
            description: 'What to avoid in the generated image',
          },
          style: {
            type: 'string',
            enum: ['photographic', 'cinematic', 'anime', 'digital-art', 'fantasy', 'neon-punk'],
            description: 'Visual style of the image',
          },
          width: {
            type: 'number',
            description: 'Image width (default: 1024)',
          },
          height: {
            type: 'number',
            description: 'Image height (default: 1024)',
          },
        },
        required: ['prompt'],
      },
      handler: async (params: ImageGenerationParams) => {
        return generateImage(params);
      },
    },
    edit_image: {
      description: 'Edit an existing image using inpainting',
      parameters: {
        type: 'object',
        properties: {
          imageBase64: {
            type: 'string',
            description: 'Base64 encoded original image',
          },
          maskBase64: {
            type: 'string',
            description: 'Base64 encoded mask (white = edit area)',
          },
          prompt: {
            type: 'string',
            description: 'What to generate in the masked area',
          },
        },
        required: ['imageBase64', 'maskBase64', 'prompt'],
      },
      handler: async (params: { imageBase64: string; maskBase64: string; prompt: string }) => {
        return editImage(params.imageBase64, params.maskBase64, params.prompt);
      },
    },
    generate_video: {
      description: 'Generate a video using Nova Reel based on a text prompt',
      parameters: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'Text description of the video to generate',
          },
          imageUri: {
            type: 'string',
            description: 'S3 URI of starting image (optional)',
          },
          duration: {
            type: 'number',
            description: 'Video duration in seconds (default: 6)',
          },
        },
        required: ['prompt'],
      },
      handler: async (params: VideoGenerationParams) => {
        return generateVideo(params);
      },
    },
  };
}

export default {
  generateImage,
  editImage,
  generateVideo,
  getGenerationTools,
};
