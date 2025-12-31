/**
 * Runtime Configuration
 *
 * Static Export では環境変数がビルド時に固定されるため、
 * ランタイムで設定を取得する仕組みを提供。
 *
 * 設定取得の優先順位:
 * 1. ローカルストレージ (開発用オーバーライド)
 * 2. S3 からの config.json
 * 3. 環境変数 (ビルド時)
 * 4. デフォルト値
 */

export interface RuntimeConfig {
  agUiEndpoint: string
  apiEndpoint?: string
  region?: string
  environment?: 'development' | 'staging' | 'production'
}

const DEFAULT_CONFIG: RuntimeConfig = {
  agUiEndpoint: '',
  region: 'ap-northeast-1',
  environment: 'development',
}

// キャッシュ
let cachedConfig: RuntimeConfig | null = null

/**
 * S3 から設定を取得
 */
async function fetchConfigFromS3(configUrl: string): Promise<RuntimeConfig | null> {
  try {
    const response = await fetch(configUrl, {
      cache: 'no-store', // 常に最新を取得
    })
    if (!response.ok) {
      console.warn(`Failed to fetch config from ${configUrl}: ${response.status}`)
      return null
    }
    return await response.json()
  } catch (error) {
    console.warn('Failed to fetch runtime config:', error)
    return null
  }
}

/**
 * ローカルストレージから設定を取得 (開発用)
 */
function getLocalOverride(): Partial<RuntimeConfig> | null {
  if (typeof window === 'undefined') return null
  
  try {
    const stored = localStorage.getItem('nova-config-override')
    if (stored) {
      return JSON.parse(stored)
    }
  } catch {
    // ignore
  }
  return null
}

/**
 * ランタイム設定を取得
 */
export async function getRuntimeConfig(): Promise<RuntimeConfig> {
  // キャッシュがあればそれを返す
  if (cachedConfig) {
    return cachedConfig
  }

  // 1. ローカルオーバーライドをチェック
  const localOverride = getLocalOverride()

  // 2. S3 設定URL (環境変数から)
  const configUrl = process.env.NEXT_PUBLIC_CONFIG_URL

  // 3. S3 から取得
  let s3Config: RuntimeConfig | null = null
  if (configUrl) {
    s3Config = await fetchConfigFromS3(configUrl)
  }

  // 4. 設定をマージ
  const config: RuntimeConfig = {
    ...DEFAULT_CONFIG,
    // 環境変数 (ビルド時)
    agUiEndpoint: process.env.NEXT_PUBLIC_AG_UI_ENDPOINT || '',
    // S3 設定
    ...(s3Config || {}),
    // ローカルオーバーライド (最優先)
    ...(localOverride || {}),
  }

  // キャッシュに保存
  cachedConfig = config

  return config
}

/**
 * AG-UI エンドポイントを取得
 */
export async function getAgUiEndpoint(): Promise<string> {
  const config = await getRuntimeConfig()
  return config.agUiEndpoint
}

/**
 * 設定をローカルストレージにオーバーライド (開発用)
 */
export function setConfigOverride(override: Partial<RuntimeConfig>): void {
  if (typeof window === 'undefined') return
  
  localStorage.setItem('nova-config-override', JSON.stringify(override))
  // キャッシュをクリア
  cachedConfig = null
}

/**
 * ローカルオーバーライドをクリア
 */
export function clearConfigOverride(): void {
  if (typeof window === 'undefined') return
  
  localStorage.removeItem('nova-config-override')
  cachedConfig = null
}

/**
 * 設定が有効かチェック
 */
export function isConfigValid(config: RuntimeConfig): boolean {
  return Boolean(config.agUiEndpoint && config.agUiEndpoint.startsWith('https://'))
}



