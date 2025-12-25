/**
 * CopilotKit Chat Page
 *
 * CopilotKit の標準 UI コンポーネントを使用したチャット画面。
 * AG-UI Protocol を通じて Lambda + NovaCoordinatorAgent と通信。
 */
'use client'

import { CopilotChat } from '@copilotkit/react-ui'
import Link from 'next/link'
import '@copilotkit/react-ui/styles.css'

export default function CopilotPage() {
  return (
    <div className="flex h-screen flex-col bg-surface-950">
      {/* Header */}
      <header className="border-b border-surface-800 px-6 py-4 bg-surface-900/80 backdrop-blur-sm">
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-surface-500 hover:text-surface-300 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </Link>
            <div>
              <h1 className="text-lg font-bold text-surface-100">
                Nova AI Agent
              </h1>
              <p className="text-xs text-surface-500">
                Powered by AG-UI Protocol + CopilotKit
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <StatusIndicator />
            <CapabilitiesBadges />
          </div>
        </div>
      </header>

      {/* Chat Area */}
      <main className="flex-1 overflow-hidden max-w-4xl mx-auto w-full">
        <CopilotChat
          labels={{
            title: 'Nova AI アシスタント',
            initial: `こんにちは！Nova AI アシスタントです。
            
以下の機能をご利用いただけます：

🎙️ **音声処理** - 音声認識・話者識別・感情分析
🎬 **映像分析** - 映像理解・時系列分析
🔍 **ベクトル検索** - マルチモーダル埋め込み・意味検索

何かお手伝いできることはありますか？`,
            placeholder: 'メッセージを入力...',
          }}
          className="h-full copilot-chat-container"
          icons={{
            sendIcon: <SendIcon />,
          }}
        />
      </main>
      
      {/* Footer */}
      <footer className="border-t border-surface-800 px-6 py-3 bg-surface-900/50">
        <div className="max-w-6xl mx-auto flex items-center justify-between text-xs text-surface-600">
          <span>Nova Platform • Research & Development</span>
          <span>Lambda + DynamoDB + S3 Vectors</span>
        </div>
      </footer>
    </div>
  )
}

function StatusIndicator() {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-800 border border-surface-700">
      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
      <span className="text-xs text-surface-400">Connected</span>
    </div>
  )
}

function CapabilitiesBadges() {
  return (
    <div className="hidden md:flex items-center gap-2">
      <Badge icon="🎙️" label="Sonic" />
      <Badge icon="🎬" label="Omni" />
      <Badge icon="🔍" label="Search" />
    </div>
  )
}

function Badge({ icon, label }: { icon: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-surface-800/50 border border-surface-700/50 text-xs text-surface-400">
      <span>{icon}</span>
      <span>{label}</span>
    </span>
  )
}

function SendIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
    </svg>
  )
}

