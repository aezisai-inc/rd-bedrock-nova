'use client';

import { cn } from '@/shared/lib/utils';
import { Avatar } from '../atoms/Avatar';

export interface ChatBubbleProps {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: Date;
  isLoading?: boolean;
  className?: string;
}

/**
 * チャットバブル Molecule
 * 
 * Atomの組み合わせ：Avatar + テキスト + タイムスタンプ
 */
export function ChatBubble({ role, content, timestamp, isLoading, className }: ChatBubbleProps) {
  const isUser = role === 'user';
  
  return (
    <div
      className={cn(
        'flex gap-3',
        isUser ? 'flex-row-reverse' : 'flex-row',
        className
      )}
    >
      <Avatar
        fallback={isUser ? 'U' : '🤖'}
        size="sm"
        className={cn(
          isUser ? 'bg-slate-600' : 'bg-indigo-600'
        )}
      />
      
      <div
        className={cn(
          'max-w-[70%] rounded-2xl px-4 py-2',
          isUser
            ? 'bg-indigo-600 text-white rounded-br-none'
            : 'bg-slate-700 text-slate-100 rounded-bl-none'
        )}
      >
        {isLoading ? (
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        ) : (
          <p className="whitespace-pre-wrap break-words">{content}</p>
        )}
        
        {timestamp && (
          <span className={cn(
            'block text-xs mt-1',
            isUser ? 'text-indigo-200' : 'text-slate-400'
          )}>
            {timestamp.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>
    </div>
  );
}
