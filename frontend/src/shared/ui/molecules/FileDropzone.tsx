'use client';

import { useCallback, useState } from 'react';
import { cn } from '@/shared/lib/utils';

export interface FileDropzoneProps {
  accept?: string[];
  maxSize?: number; // bytes
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * ファイルドロップゾーン Molecule
 */
export function FileDropzone({
  accept,
  maxSize = 10 * 1024 * 1024, // 10MB default
  onFilesSelected,
  disabled,
  className,
}: FileDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateFiles = useCallback(
    (files: FileList): File[] => {
      const validFiles: File[] = [];
      
      for (const file of Array.from(files)) {
        // サイズチェック
        if (file.size > maxSize) {
          setError(`ファイルサイズが大きすぎます (最大: ${Math.round(maxSize / 1024 / 1024)}MB)`);
          continue;
        }
        
        // タイプチェック
        if (accept && !accept.some(type => file.type.match(type))) {
          setError(`対応していないファイル形式です`);
          continue;
        }
        
        validFiles.push(file);
      }
      
      if (validFiles.length > 0) {
        setError(null);
      }
      
      return validFiles;
    },
    [accept, maxSize]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      
      if (disabled) return;
      
      const files = validateFiles(e.dataTransfer.files);
      if (files.length > 0) {
        onFilesSelected(files);
      }
    },
    [disabled, validateFiles, onFilesSelected]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (disabled || !e.target.files) return;
      
      const files = validateFiles(e.target.files);
      if (files.length > 0) {
        onFilesSelected(files);
      }
    },
    [disabled, validateFiles, onFilesSelected]
  );

  return (
    <div
      className={cn(
        'relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200',
        isDragging
          ? 'border-indigo-500 bg-indigo-500/10'
          : 'border-slate-600 hover:border-slate-500',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <input
        type="file"
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        accept={accept?.join(',')}
        onChange={handleChange}
        disabled={disabled}
        multiple
      />
      
      <div className="pointer-events-none">
        <svg
          className="mx-auto h-12 w-12 text-slate-400"
          stroke="currentColor"
          fill="none"
          viewBox="0 0 48 48"
        >
          <path
            d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        
        <p className="mt-4 text-sm text-slate-300">
          <span className="font-medium text-indigo-400">ファイルを選択</span>
          {' '}または ドラッグ＆ドロップ
        </p>
        
        <p className="mt-2 text-xs text-slate-500">
          {accept?.join(', ') ?? '全てのファイル'} (最大 {Math.round(maxSize / 1024 / 1024)}MB)
        </p>
        
        {error && (
          <p className="mt-2 text-sm text-red-400">{error}</p>
        )}
      </div>
    </div>
  );
}
