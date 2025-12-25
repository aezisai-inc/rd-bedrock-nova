/**
 * CopilotKit Layout
 *
 * CopilotKit Provider を /copilot 配下のみに適用。
 * Static Export モードでは API Routes が使用できないため、
 * CopilotKit は環境変数で指定された外部エンドポイントに直接接続。
 */
'use client'

import { CopilotKit } from '@copilotkit/react-core'
import type { ReactNode } from 'react'

export default function CopilotLayout({ children }: { children: ReactNode }) {
  // AG-UI エンドポイントURL (環境変数から取得)
  const runtimeUrl = process.env.NEXT_PUBLIC_AG_UI_ENDPOINT || ''
  
  // 設定が無効な場合のフォールバック
  if (!runtimeUrl) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-950">
        <div className="max-w-md text-center p-8 bg-surface-900 rounded-2xl border border-surface-700 shadow-xl">
          <div className="text-5xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-surface-100 mb-4">
            AG-UI エンドポイント未設定
          </h2>
          <p className="text-surface-400 text-sm mb-6">
            環境変数{' '}
            <code className="px-2 py-1 bg-surface-800 rounded text-accent-400 font-mono">
              NEXT_PUBLIC_AG_UI_ENDPOINT
            </code>{' '}
            を設定してください。
          </p>
          <div className="bg-surface-800 rounded-lg p-4 text-left mb-6">
            <p className="text-surface-500 text-xs mb-2">例: .env.local</p>
            <code className="text-surface-300 text-sm font-mono">
              NEXT_PUBLIC_AG_UI_ENDPOINT=https://xxx.lambda-url.ap-northeast-1.on.aws
            </code>
          </div>
          <a
            href="/"
            className="inline-flex items-center text-primary-400 hover:text-primary-300 text-sm"
          >
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            ホームに戻る
          </a>
        </div>
      </div>
    )
  }

  return (
    <CopilotKit runtimeUrl={runtimeUrl}>
      {children}
    </CopilotKit>
  )
}

