/**
 * Settings Page
 *
 * 開発者がランタイム設定を管理するためのページ。
 * ローカルストレージに保存した設定はブラウザに永続化される。
 */
'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  getRuntimeConfig,
  setConfigOverride,
  clearConfigOverride,
  isConfigValid,
  type RuntimeConfig,
} from '@/lib/config'

export default function SettingsPage() {
  const [config, setConfig] = useState<RuntimeConfig | null>(null)
  const [endpoint, setEndpoint] = useState('')
  const [status, setStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  useEffect(() => {
    async function loadConfig() {
      const runtimeConfig = await getRuntimeConfig()
      setConfig(runtimeConfig)
      setEndpoint(runtimeConfig.agUiEndpoint || '')
    }
    loadConfig()
  }, [])

  const handleTest = async () => {
    if (!endpoint) {
      setStatus('error')
      setMessage('エンドポイントを入力してください')
      return
    }

    setStatus('testing')
    setMessage('接続テスト中...')

    try {
      // OPTIONS リクエストで CORS チェック
      const response = await fetch(endpoint, {
        method: 'OPTIONS',
        mode: 'cors',
      })

      if (response.ok || response.status === 204) {
        setStatus('success')
        setMessage('接続成功！CORS設定も正常です')
      } else {
        setStatus('error')
        setMessage(`接続エラー: HTTP ${response.status}`)
      }
    } catch (error) {
      setStatus('error')
      setMessage(`接続失敗: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const handleSave = () => {
    setConfigOverride({ agUiEndpoint: endpoint })
    setMessage('設定を保存しました')
    setStatus('success')
  }

  const handleClear = () => {
    clearConfigOverride()
    setEndpoint('')
    setConfig(null)
    setMessage('設定をクリアしました')
    setStatus('idle')
    
    // リロードして環境変数のデフォルトに戻す
    setTimeout(() => {
      window.location.reload()
    }, 500)
  }

  return (
    <div className="min-h-screen bg-surface-950 p-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center text-surface-500 hover:text-surface-300 text-sm mb-4"
          >
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            ホームに戻る
          </Link>
          <h1 className="text-3xl font-bold text-surface-100">⚙️ 設定</h1>
          <p className="text-surface-400 mt-2">
            Nova Platform のランタイム設定を管理します
          </p>
        </div>

        {/* Current Status */}
        <div className="bg-surface-900 rounded-xl border border-surface-800 p-6 mb-6">
          <h2 className="text-lg font-semibold text-surface-100 mb-4">現在の状態</h2>
          <div className="space-y-3">
            <StatusRow
              label="AG-UI エンドポイント"
              value={config?.agUiEndpoint || '未設定'}
              isValid={config ? isConfigValid(config) : false}
            />
            <StatusRow
              label="環境"
              value={config?.environment || 'development'}
              isValid={true}
            />
            <StatusRow
              label="リージョン"
              value={config?.region || 'ap-northeast-1'}
              isValid={true}
            />
          </div>
        </div>

        {/* Endpoint Configuration */}
        <div className="bg-surface-900 rounded-xl border border-surface-800 p-6 mb-6">
          <h2 className="text-lg font-semibold text-surface-100 mb-4">
            AG-UI エンドポイント設定
          </h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-surface-300 text-sm mb-2">
                Lambda Function URL
              </label>
              <input
                type="url"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                placeholder="https://xxx.lambda-url.ap-northeast-1.on.aws"
                className="w-full px-4 py-3 rounded-lg bg-surface-800 border border-surface-700 text-surface-100 placeholder-surface-500 focus:outline-none focus:border-primary-500 font-mono text-sm"
              />
            </div>

            {/* Status Message */}
            {message && (
              <div
                className={`p-3 rounded-lg text-sm ${
                  status === 'success'
                    ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-800'
                    : status === 'error'
                    ? 'bg-red-900/30 text-red-400 border border-red-800'
                    : status === 'testing'
                    ? 'bg-amber-900/30 text-amber-400 border border-amber-800'
                    : 'bg-surface-800 text-surface-400'
                }`}
              >
                {message}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={handleTest}
                disabled={status === 'testing'}
                className="px-4 py-2 rounded-lg bg-surface-700 text-surface-200 hover:bg-surface-600 disabled:opacity-50 transition-colors"
              >
                {status === 'testing' ? '接続中...' : '🔌 接続テスト'}
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-500 transition-colors"
              >
                💾 保存
              </button>
              <button
                onClick={handleClear}
                className="px-4 py-2 rounded-lg bg-surface-700 text-surface-400 hover:bg-surface-600 hover:text-surface-200 transition-colors"
              >
                🗑️ クリア
              </button>
            </div>
          </div>
        </div>

        {/* Quick Links */}
        <div className="bg-surface-900 rounded-xl border border-surface-800 p-6">
          <h2 className="text-lg font-semibold text-surface-100 mb-4">クイックリンク</h2>
          <div className="grid grid-cols-2 gap-4">
            <QuickLink
              href="/copilot/"
              icon="🤖"
              title="AI Chat"
              description="CopilotKit チャット画面"
            />
            <QuickLink
              href="https://github.com/aezisai-inc/rd-bedrock-nova"
              icon="📚"
              title="GitHub"
              description="リポジトリ"
              external
            />
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-surface-600 text-sm">
          Nova Platform • Research & Development
        </div>
      </div>
    </div>
  )
}

function StatusRow({
  label,
  value,
  isValid,
}: {
  label: string
  value: string
  isValid: boolean
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-surface-800 last:border-0">
      <span className="text-surface-400 text-sm">{label}</span>
      <div className="flex items-center gap-2">
        <span className={`font-mono text-sm ${isValid ? 'text-surface-200' : 'text-red-400'}`}>
          {value.length > 50 ? `${value.slice(0, 50)}...` : value}
        </span>
        <span className={`w-2 h-2 rounded-full ${isValid ? 'bg-emerald-500' : 'bg-red-500'}`} />
      </div>
    </div>
  )
}

function QuickLink({
  href,
  icon,
  title,
  description,
  external,
}: {
  href: string
  icon: string
  title: string
  description: string
  external?: boolean
}) {
  const Component = external ? 'a' : Link
  const props = external ? { target: '_blank', rel: 'noopener noreferrer' } : {}

  return (
    <Component
      href={href}
      {...props}
      className="p-4 rounded-lg bg-surface-800/50 border border-surface-700 hover:border-surface-600 transition-colors block"
    >
      <div className="text-2xl mb-2">{icon}</div>
      <div className="text-surface-200 font-medium">{title}</div>
      <div className="text-surface-500 text-sm">{description}</div>
    </Component>
  )
}



