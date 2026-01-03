/**
 * Runtime Configuration
 *
 * 環境変数とローカルストレージからの設定管理
 */

export interface RuntimeConfig {
  agUiEndpoint?: string
  region?: string
}

/**
 * ランタイム設定を取得
 * 優先順位:
 * 1. ローカルストレージのオーバーライド
 * 2. 環境変数 (NEXT_PUBLIC_AG_UI_ENDPOINT)
 */
export async function getRuntimeConfig(): Promise<RuntimeConfig> {
  // ローカルストレージのオーバーライドをチェック
  if (typeof window !== 'undefined') {
    const override = localStorage.getItem('nova-config-override')
    if (override) {
      try {
        const parsed = JSON.parse(override)
        if (parsed.agUiEndpoint) {
          return {
            agUiEndpoint: parsed.agUiEndpoint,
            region: process.env.NEXT_PUBLIC_AWS_REGION || 'ap-northeast-1',
          }
        }
      } catch {
        // JSONパースエラーは無視
      }
    }
  }

  // 環境変数から取得
  return {
    agUiEndpoint: process.env.NEXT_PUBLIC_AG_UI_ENDPOINT,
    region: process.env.NEXT_PUBLIC_AWS_REGION || 'ap-northeast-1',
  }
}

/**
 * 設定が有効かどうかをチェック
 */
export function isConfigValid(config: RuntimeConfig): boolean {
  return !!(config.agUiEndpoint && config.agUiEndpoint.startsWith('https://'))
}

/**
 * AG-UI エンドポイントを取得 (同期版)
 * ローカルストレージを直接参照
 */
export function getAgUiEndpoint(): string | null {
  if (typeof window === 'undefined') {
    return process.env.NEXT_PUBLIC_AG_UI_ENDPOINT || null
  }

  // ローカルストレージのオーバーライドをチェック
  const override = localStorage.getItem('nova-config-override')
  if (override) {
    try {
      const parsed = JSON.parse(override)
      if (parsed.agUiEndpoint) {
        return parsed.agUiEndpoint
      }
    } catch {
      // JSONパースエラーは無視
    }
  }

  return process.env.NEXT_PUBLIC_AG_UI_ENDPOINT || null
}

/**
 * 設定をクリア
 */
export function clearConfigOverride(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('nova-config-override')
  }
}

