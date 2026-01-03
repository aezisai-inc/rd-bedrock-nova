'use client';

import { useState, useCallback, type FormEvent, type KeyboardEvent } from 'react';
import { Button } from '@/shared/ui/atoms/Button';
import { cn } from '@/shared/lib/utils';

export interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

/**
 * チャット入力コンポーネント
 * 
 * FSD Feature UI層
 */
export function ChatInput({
  onSend,
  disabled,
  placeholder = 'メッセージを入力...',
  className,
}: ChatInputProps) {
  const [value, setValue] = useState('');

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      if (value.trim() && !disabled) {
        onSend(value.trim());
        setValue('');
      }
    },
    [value, disabled, onSend]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (value.trim() && !disabled) {
          onSend(value.trim());
          setValue('');
        }
      }
    },
    [value, disabled, onSend]
  );

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        'flex items-end gap-3 p-4 bg-slate-800/50 backdrop-blur-sm border-t border-slate-700',
        className
      )}
    >
      <div className="flex-1 relative">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className={cn(
            'w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl',
            'text-white placeholder-slate-400',
            'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent',
            'resize-none overflow-hidden',
            'transition-all duration-200'
          )}
          style={{
            minHeight: '48px',
            maxHeight: '200px',
          }}
        />
      </div>
      
      <Button
        type="submit"
        disabled={!value.trim() || disabled}
        variant="primary"
        size="md"
        className="shrink-0"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
          />
        </svg>
      </Button>
    </form>
  );
}
