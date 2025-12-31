/**
 * CopilotKit Layout
 *
 * CopilotKit Provider を /copilot 配下のみに適用。
 * ランタイム設定を使用してエンドポイントを動的に取得。
 */
'use client'

import { CopilotKit } from '@copilotkit/react-core'
import { useEffect, useState, type ReactNode } from 'react'
import { getRuntimeConfig, isConfigValid, type RuntimeConfig } from '@/lib/config'

type LoadingState = 'loading' | 'ready' | 'error'

export default function CopilotLayout({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<RuntimeConfig | null>(null)
  const [loadingState, setLoadingState] = useState<LoadingState>('loading')

  useEffect(() => {
    async function loadConfig() {
      try {
        const runtimeConfig = await getRuntimeConfig()
        setConfig(runtimeConfig)
        
        if (isConfigValid(runtimeConfig)) {
          setLoadingState('ready')
        } else {
          setLoadingState('error')
        }
      } catch (error) {
        console.error('Failed to load config:', error)
        setLoadingState('error')
      }
    }
    
    loadConfig()
  }, [])

  // ローディング中
  if (loadingState === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-950">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mx-auto mb-4" />
          <p className="text-surface-400">設定を読み込み中...</p>
        </div>
      </div>
    )
  }

  // 設定エラー
  if (loadingState === 'error' || !config || !isConfigValid(config)) {
    return <ConfigErrorScreen currentEndpoint={config?.agUiEndpoint} />
  }

  return (
    <CopilotKit runtimeUrl={config.agUiEndpoint}>
      {children}
    </CopilotKit>
  )
}

function ConfigErrorScreen({ currentEndpoint }: { currentEndpoint?: string }) {
  const [endpoint, setEndpoint] = useState(currentEndpoint || '')
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    if (!endpoint.startsWith('https://')) {
      alert('エンドポイントは https:// で始まる必要があります')
      return
    }
    
    // ローカルストレージに保存
    localStorage.setItem('nova-config-override', JSON.stringify({ agUiEndpoint: endpoint }))
    setSaved(true)
    
    // リロード
    setTimeout(() => {
      window.location.reload()
    }, 500)
  }

  return (
    <div className="flex h-screen items-center justify-center bg-surface-950">
      <div className="max-w-lg w-full mx-4 p-8 bg-surface-900 rounded-2xl border border-surface-700 shadow-xl">
        <div className="text-5xl mb-4 text-center">⚙️</div>
        <h2 className="text-xl font-bold text-surface-100 mb-2 text-center">
          AG-UI エンドポイント設定
        </h2>
        <p className="text-surface-400 text-sm mb-6 text-center">
          Lambda Function URL を入力してください
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-surface-300 text-sm mb-2">
              AG-UI Endpoint URL
            </label>
            <input
              type="url"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="https://xxx.lambda-url.ap-northeast-1.on.aws"
              className="w-full px-4 py-3 rounded-lg bg-surface-800 border border-surface-700 text-surface-100 placeholder-surface-500 focus:outline-none focus:border-primary-500 font-mono text-sm"
            />
          </div>

          <button
            onClick={handleSave}
            disabled={saved}
            className="w-full py-3 rounded-lg bg-primary-600 text-white font-medium hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saved ? '保存しました！リロード中...' : '保存して接続'}
          </button>
        </div>

        <div className="mt-6 p-4 bg-surface-800/50 rounded-lg">
          <p className="text-surface-500 text-xs mb-2">💡 取得方法:</p>
          <ol className="text-surface-400 text-xs space-y-1 list-decimal list-inside">
            <li>CDKデプロイを実行: <code className="text-accent-400">cdk deploy</code></li>
            <li>Outputs から <code className="text-accent-400">NovaAgUiEndpointUrl</code> を確認</li>
            <li>上のフィールドに貼り付け</li>
          </ol>
        </div>

        <div className="mt-4 text-center">
          <a
            href="/"
            className="inline-flex items-center text-surface-500 hover:text-surface-300 text-sm"
          >
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            ホームに戻る
          </a>
        </div>
      </div>
    </div>
  )
}
