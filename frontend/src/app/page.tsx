'use client'

import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      {/* Hero Section */}
      <div className="text-center max-w-3xl mx-auto">
        <div className="inline-flex items-center px-4 py-2 rounded-full bg-primary-600/20 text-primary-400 text-sm font-medium mb-6 border border-primary-600/30">
          <span className="w-2 h-2 rounded-full bg-primary-400 mr-2 animate-pulse" />
          Research & Development
        </div>
        
        <h1 className="text-5xl font-bold mb-6 bg-gradient-to-r from-white via-primary-200 to-accent-400 bg-clip-text text-transparent">
          Nova Platform
        </h1>
        
        <p className="text-xl text-surface-400 mb-4">
          Amazon Bedrock Nova シリーズを活用した
          <br />
          <span className="text-surface-200">マルチモーダル AI エージェント</span>
        </p>
        
        <p className="text-surface-500 mb-10 max-w-xl mx-auto">
          Nova Sonic (音声) / Nova Omni (映像) / Nova Embeddings (ベクトル検索) を
          サーバレス構成で統合。AG-UI Protocol と CopilotKit によるリアルタイム UI を提供。
        </p>
        
        {/* Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
          <FeatureCard
            icon="🎙️"
            title="Nova Sonic"
            description="音声認識・話者識別・感情分析"
          />
          <FeatureCard
            icon="🎬"
            title="Nova Omni"
            description="映像理解・時系列分析・異常検知"
          />
          <FeatureCard
            icon="🔍"
            title="S3 Vectors"
            description="マルチモーダル埋め込み・ベクトル検索"
          />
        </div>
        
        {/* CTA Button */}
        <Link
          href="/copilot/"
          className="inline-flex items-center px-8 py-4 rounded-xl bg-gradient-to-r from-primary-600 to-accent-600 text-white font-semibold text-lg hover:from-primary-500 hover:to-accent-500 transition-all shadow-lg shadow-primary-900/30 hover:shadow-primary-900/50"
        >
          <span className="mr-2">🤖</span>
          AI Agent を試す
          <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </Link>
        
        <p className="text-surface-600 text-sm mt-4">
          CopilotKit + AG-UI Protocol によるリアルタイムチャット
        </p>

        {/* Settings Link */}
        <Link
          href="/settings/"
          className="inline-flex items-center mt-4 text-surface-500 hover:text-surface-300 text-sm"
        >
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          エンドポイント設定
        </Link>
      </div>
      
      {/* Tech Stack */}
      <div className="mt-16 text-center">
        <p className="text-surface-600 text-sm mb-4">Powered by</p>
        <div className="flex flex-wrap justify-center gap-4 text-surface-500 text-sm">
          <TechBadge>Amazon Bedrock</TechBadge>
          <TechBadge>Lambda</TechBadge>
          <TechBadge>DynamoDB</TechBadge>
          <TechBadge>S3 Vectors</TechBadge>
          <TechBadge>Strands SDK</TechBadge>
          <TechBadge>AG-UI Protocol</TechBadge>
          <TechBadge>CopilotKit</TechBadge>
        </div>
      </div>
    </main>
  )
}

function FeatureCard({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div className="p-5 rounded-xl bg-surface-900/50 border border-surface-800 hover:border-surface-700 transition-colors">
      <div className="text-3xl mb-3">{icon}</div>
      <h3 className="text-surface-100 font-semibold mb-1">{title}</h3>
      <p className="text-surface-500 text-sm">{description}</p>
    </div>
  )
}

function TechBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-3 py-1 rounded-full bg-surface-900 border border-surface-800 text-surface-400">
      {children}
    </span>
  )
}

