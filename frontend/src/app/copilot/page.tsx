/**
 * CopilotKit Chat Page with File Upload
 *
 * CopilotKit + ファイルアップロード機能を統合したチャット画面。
 * Nova Sonic (音声) / Nova Omni (映像) を UI から試せる。
 */
'use client'

import { useState, useCallback } from 'react'
import { CopilotChat } from '@copilotkit/react-ui'
import Link from 'next/link'
import '@copilotkit/react-ui/styles.css'

import { FileUpload, FilePreview, type UploadedFile, type FileType } from '@/components/FileUpload'
import { uploadFile, type UploadProgress, readFileAsDataUrl } from '@/lib/upload'

export default function CopilotPage() {
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [showUpload, setShowUpload] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const handleFileSelect = useCallback(async (file: File, type: FileType) => {
    const fileId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    // 新しいファイルを追加
    const newFile: UploadedFile = {
      id: fileId,
      name: file.name,
      type,
      size: file.size,
      status: 'uploading',
      progress: 0,
    }
    
    setFiles(prev => [...prev, newFile])
    setUploadError(null)
    
    try {
      // アップロード進捗を追跡
      const onProgress = (progress: UploadProgress) => {
        setFiles(prev => prev.map(f => 
          f.id === fileId ? { ...f, progress: progress.percentage } : f
        ))
      }
      
      // ファイルをアップロード
      const fileUrl = await uploadFile(file, onProgress)
      
      // 成功
      setFiles(prev => prev.map(f => 
        f.id === fileId ? { ...f, status: 'uploaded', url: fileUrl, progress: 100 } : f
      ))
      
    } catch (error) {
      // エラー処理
      const errorMessage = error instanceof Error ? error.message : 'アップロードに失敗しました'
      setFiles(prev => prev.map(f => 
        f.id === fileId ? { ...f, status: 'error', error: errorMessage } : f
      ))
      setUploadError(errorMessage)
    }
  }, [])

  const handleRemoveFile = useCallback((fileId: string) => {
    setFiles(prev => prev.filter(f => f.id !== fileId))
  }, [])

  const getUploadedFilesContext = useCallback(() => {
    const uploadedFiles = files.filter(f => f.status === 'uploaded' && f.url)
    if (uploadedFiles.length === 0) return ''
    
    return uploadedFiles.map(f => {
      const typeLabel = {
        audio: '音声ファイル',
        video: '動画ファイル',
        image: '画像ファイル',
        document: 'ドキュメント',
      }[f.type]
      
      return `[アップロード済み ${typeLabel}: ${f.name}]\nURL: ${f.url}`
    }).join('\n\n')
  }, [files])

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
                音声・映像・検索 マルチモーダル AI
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowUpload(!showUpload)}
              className={`
                flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium
                transition-all duration-200
                ${showUpload 
                  ? 'bg-primary-600 text-white' 
                  : 'bg-surface-800 text-surface-300 hover:bg-surface-700'
                }
              `}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              ファイル
            </button>
            <StatusIndicator />
            <CapabilitiesBadges />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Chat Area */}
        <main className="flex-1 overflow-hidden max-w-4xl mx-auto w-full">
          <CopilotChat
            labels={{
              title: 'Nova AI アシスタント',
              initial: `こんにちは！Nova AI アシスタントです。

以下の機能をご利用いただけます：

🎙️ **音声処理** (Nova Sonic)
   - 音声→テキスト文字起こし
   - 話者識別・感情分析

🎬 **映像分析** (Nova Omni)
   - 映像理解・シーン分析
   - 時系列分析・異常検知

🔍 **ベクトル検索** (S3 Vectors)
   - マルチモーダル埋め込み
   - 意味検索・類似検索

**ファイルをアップロードして分析を開始しましょう！**
右上の「ファイル」ボタンからアップロードできます。`,
              placeholder: 'メッセージを入力... (例: この音声ファイルを文字起こしして)',
            }}
            className="h-full copilot-chat-container"
            icons={{
              sendIcon: <SendIcon />,
            }}
          />
        </main>

        {/* File Upload Sidebar */}
        {showUpload && (
          <aside className="w-80 border-l border-surface-800 bg-surface-900/50 p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-surface-200 font-semibold">ファイルアップロード</h2>
              <button
                onClick={() => setShowUpload(false)}
                className="p-1 rounded hover:bg-surface-800 text-surface-500"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <FileUpload
              onFileSelect={handleFileSelect}
              acceptedTypes={['audio', 'video', 'image', 'document']}
              maxSizeMB={100}
            />
            
            {uploadError && (
              <div className="mt-4 p-3 rounded-lg bg-red-900/20 border border-red-800 text-red-400 text-sm">
                {uploadError}
              </div>
            )}
            
            {files.length > 0 && (
              <div className="mt-4 space-y-2">
                <h3 className="text-surface-400 text-sm font-medium">アップロード済み</h3>
                {files.map(file => (
                  <FilePreview
                    key={file.id}
                    file={file}
                    onRemove={() => handleRemoveFile(file.id)}
                  />
                ))}
              </div>
            )}
            
            {/* Usage Instructions */}
            <div className="mt-6 p-4 rounded-lg bg-surface-800/50 border border-surface-700">
              <h3 className="text-surface-300 text-sm font-medium mb-2">使い方</h3>
              <ol className="text-surface-500 text-xs space-y-2">
                <li>1. ファイルをアップロード</li>
                <li>2. チャットで分析を依頼</li>
                <li>3. 例: 「この音声を文字起こしして」</li>
                <li>4. 例: 「この動画の内容を要約して」</li>
              </ol>
            </div>
          </aside>
        )}
      </div>
      
      {/* Footer */}
      <footer className="border-t border-surface-800 px-6 py-3 bg-surface-900/50">
        <div className="max-w-6xl mx-auto flex items-center justify-between text-xs text-surface-600">
          <span>Nova Platform • Research & Development</span>
          <div className="flex items-center gap-4">
            <span>Lambda + DynamoDB + S3 Vectors</span>
            <Link href="/settings" className="text-primary-400 hover:text-primary-300">
              設定
            </Link>
          </div>
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
