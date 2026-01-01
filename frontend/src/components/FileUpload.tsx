'use client'

import { useState, useRef, useCallback } from 'react'

export type FileType = 'audio' | 'video' | 'image' | 'document'

export interface UploadedFile {
  id: string
  name: string
  type: FileType
  size: number
  url?: string
  status: 'pending' | 'uploading' | 'uploaded' | 'error'
  progress: number
  error?: string
}

interface FileUploadProps {
  onFileSelect: (file: File, type: FileType) => void
  onFileUpload?: (file: UploadedFile) => void
  acceptedTypes?: FileType[]
  maxSizeMB?: number
  disabled?: boolean
}

const FILE_TYPE_CONFIG: Record<FileType, { accept: string; icon: string; label: string }> = {
  audio: {
    accept: 'audio/*,.wav,.mp3,.flac,.m4a,.ogg',
    icon: '🎙️',
    label: '音声',
  },
  video: {
    accept: 'video/*,.mp4,.mov,.avi,.webm',
    icon: '🎬',
    label: '動画',
  },
  image: {
    accept: 'image/*,.png,.jpg,.jpeg,.gif,.webp',
    icon: '🖼️',
    label: '画像',
  },
  document: {
    accept: '.pdf,.txt,.md,.json,.csv',
    icon: '📄',
    label: 'ドキュメント',
  },
}

export function FileUpload({
  onFileSelect,
  onFileUpload,
  acceptedTypes = ['audio', 'video', 'image', 'document'],
  maxSizeMB = 100,
  disabled = false,
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [selectedType, setSelectedType] = useState<FileType | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const getFileType = useCallback((file: File): FileType | null => {
    const mimeType = file.type.toLowerCase()
    
    if (mimeType.startsWith('audio/')) return 'audio'
    if (mimeType.startsWith('video/')) return 'video'
    if (mimeType.startsWith('image/')) return 'image'
    
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (['wav', 'mp3', 'flac', 'm4a', 'ogg'].includes(ext || '')) return 'audio'
    if (['mp4', 'mov', 'avi', 'webm'].includes(ext || '')) return 'video'
    if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext || '')) return 'image'
    if (['pdf', 'txt', 'md', 'json', 'csv'].includes(ext || '')) return 'document'
    
    return null
  }, [])

  const handleFile = useCallback((file: File) => {
    const type = getFileType(file)
    if (!type) {
      alert('サポートされていないファイル形式です')
      return
    }
    
    if (!acceptedTypes.includes(type)) {
      alert(`${FILE_TYPE_CONFIG[type].label}ファイルはサポートされていません`)
      return
    }
    
    const sizeMB = file.size / (1024 * 1024)
    if (sizeMB > maxSizeMB) {
      alert(`ファイルサイズが大きすぎます (最大 ${maxSizeMB}MB)`)
      return
    }
    
    onFileSelect(file, type)
  }, [acceptedTypes, maxSizeMB, getFileType, onFileSelect])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    
    if (disabled) return
    
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      handleFile(files[0])
    }
  }, [disabled, handleFile])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (!disabled) {
      setIsDragging(true)
    }
  }, [disabled])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleClick = (type: FileType) => {
    if (disabled) return
    setSelectedType(type)
    if (inputRef.current) {
      inputRef.current.accept = FILE_TYPE_CONFIG[type].accept
      inputRef.current.click()
    }
  }

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      handleFile(files[0])
    }
    // Reset input
    if (inputRef.current) {
      inputRef.current.value = ''
    }
  }, [handleFile])

  return (
    <div className="w-full">
      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={handleInputChange}
        disabled={disabled}
      />
      
      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`
          relative rounded-xl border-2 border-dashed transition-all duration-200
          ${isDragging 
            ? 'border-primary-500 bg-primary-500/10' 
            : 'border-surface-700 hover:border-surface-600'
          }
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
      >
        <div className="p-4">
          <div className="text-center mb-3">
            <p className="text-surface-400 text-sm">
              ファイルをドラッグ＆ドロップ または
            </p>
          </div>
          
          {/* File type buttons */}
          <div className="flex flex-wrap justify-center gap-2">
            {acceptedTypes.map((type) => (
              <button
                key={type}
                onClick={() => handleClick(type)}
                disabled={disabled}
                className={`
                  flex items-center gap-2 px-4 py-2 rounded-lg
                  bg-surface-800 hover:bg-surface-700 
                  border border-surface-700 hover:border-surface-600
                  text-surface-300 text-sm font-medium
                  transition-all duration-200
                  disabled:opacity-50 disabled:cursor-not-allowed
                `}
              >
                <span>{FILE_TYPE_CONFIG[type].icon}</span>
                <span>{FILE_TYPE_CONFIG[type].label}</span>
              </button>
            ))}
          </div>
          
          <p className="text-center text-surface-600 text-xs mt-3">
            最大 {maxSizeMB}MB
          </p>
        </div>
      </div>
    </div>
  )
}

interface FilePreviewProps {
  file: UploadedFile
  onRemove?: () => void
}

export function FilePreview({ file, onRemove }: FilePreviewProps) {
  const config = FILE_TYPE_CONFIG[file.type]
  
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-surface-800 border border-surface-700">
      <div className="text-2xl">{config.icon}</div>
      
      <div className="flex-1 min-w-0">
        <p className="text-surface-200 text-sm font-medium truncate">
          {file.name}
        </p>
        <p className="text-surface-500 text-xs">
          {(file.size / 1024 / 1024).toFixed(2)} MB
        </p>
        
        {file.status === 'uploading' && (
          <div className="mt-1 w-full h-1 bg-surface-700 rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary-500 transition-all duration-300"
              style={{ width: `${file.progress}%` }}
            />
          </div>
        )}
        
        {file.status === 'error' && (
          <p className="text-red-400 text-xs mt-1">{file.error}</p>
        )}
      </div>
      
      <div className="flex items-center gap-2">
        {file.status === 'uploaded' && (
          <span className="text-emerald-400 text-xs">✓ アップロード完了</span>
        )}
        
        {file.status === 'uploading' && (
          <span className="text-primary-400 text-xs">{file.progress}%</span>
        )}
        
        {onRemove && (
          <button
            onClick={onRemove}
            className="p-1 rounded hover:bg-surface-700 text-surface-500 hover:text-surface-300"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}

