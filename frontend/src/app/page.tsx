'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { generateClient } from 'aws-amplify/data';
import { uploadData, getUrl } from 'aws-amplify/storage';
import ReactMarkdown from 'react-markdown';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  files?: { name: string; type: string; s3Key: string }[];
  timestamp: Date;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [sessionId] = useState(() => `session-${Date.now()}`);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Amplify client - initialized inside component after Amplify.configure() is called
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = useMemo(() => generateClient() as any, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ファイルアップロード
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setUploadedFiles((prev) => [...prev, ...files]);
  };

  const removeFile = (index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // メッセージ送信
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() && uploadedFiles.length === 0) return;

    setIsLoading(true);
    const userMessage = input;
    setInput('');

    // ファイルをS3にアップロード
    const fileKeys: string[] = [];
    const fileInfos: { name: string; type: string; s3Key: string }[] = [];

    for (const file of uploadedFiles) {
      try {
        const s3Key = `uploads/${sessionId}/${Date.now()}-${file.name}`;
        await uploadData({
          path: s3Key,
          data: file,
          options: { contentType: file.type },
        });
        fileKeys.push(s3Key);
        fileInfos.push({ name: file.name, type: file.type, s3Key });
      } catch (error) {
        console.error('Upload error:', error);
      }
    }

    // ユーザーメッセージを追加
    const newUserMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: userMessage,
      files: fileInfos.length > 0 ? fileInfos : undefined,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, newUserMessage]);
    setUploadedFiles([]);

    try {
      // エージェント呼び出し
      const response = await client.mutations.invokeAgent({
        sessionId,
        message: userMessage,
        fileKeys: fileKeys.length > 0 ? fileKeys : undefined,
      });

      if (response.data) {
        const assistantMessage: Message = {
          id: `msg-${Date.now()}-assistant`,
          role: 'assistant',
          content: response.data,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
      }
    } catch (error) {
      console.error('Agent error:', error);
      const errorMessage: Message = {
        id: `msg-${Date.now()}-error`,
        role: 'assistant',
        content: 'エラーが発生しました。もう一度お試しください。',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 h-[calc(100vh-80px)] flex flex-col">
      {/* 機能説明 */}
      {messages.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-white mb-6">
              Nova AI プラットフォームへようこそ
            </h2>
            <div className="grid grid-cols-2 gap-4 max-w-2xl">
              <FeatureCard
                icon="🖼️"
                title="画像解析"
                description="Nova Omni Vision で画像を分析"
              />
              <FeatureCard
                icon="🎬"
                title="動画解析"
                description="Nova Omni Video で動画を要約"
              />
              <FeatureCard
                icon="🎤"
                title="音声文字起こし"
                description="Nova Sonic で音声をテキスト化"
              />
              <FeatureCard
                icon="🔍"
                title="ベクトル検索"
                description="Nova Embeddings でセマンティック検索"
              />
            </div>
            <p className="text-slate-400 mt-6">
              ファイルをアップロードして質問するか、テキストで対話を始めましょう
            </p>
          </div>
        </div>
      )}

      {/* メッセージ一覧 */}
      {messages.length > 0 && (
        <div className="flex-1 overflow-y-auto space-y-4 mb-4">
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-slate-700 rounded-lg px-4 py-3 max-w-[80%]">
                <div className="flex items-center gap-2 text-slate-300">
                  <div className="animate-spin h-4 w-4 border-2 border-purple-400 border-t-transparent rounded-full" />
                  <span>考え中...</span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* ファイルプレビュー */}
      {uploadedFiles.length > 0 && (
        <div className="flex gap-2 mb-2 flex-wrap">
          {uploadedFiles.map((file, index) => (
            <div
              key={index}
              className="bg-slate-700 rounded-lg px-3 py-2 flex items-center gap-2"
            >
              <span className="text-sm text-slate-300">{file.name}</span>
              <button
                onClick={() => removeFile(index)}
                className="text-slate-400 hover:text-red-400"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 入力フォーム */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          multiple
          accept="image/*,audio/*,video/*,.pdf,.txt"
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition"
        >
          📎
        </button>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="メッセージを入力..."
          className="flex-1 px-4 py-3 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-purple-500"
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading || (!input.trim() && uploadedFiles.length === 0)}
          className="px-6 py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-lg transition font-medium"
        >
          送信
        </button>
      </form>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 text-left">
      <div className="text-3xl mb-2">{icon}</div>
      <h3 className="text-white font-semibold mb-1">{title}</h3>
      <p className="text-slate-400 text-sm">{description}</p>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`rounded-lg px-4 py-3 max-w-[80%] ${
          isUser
            ? 'bg-purple-600 text-white'
            : 'bg-slate-700 text-slate-100'
        }`}
      >
        {/* ファイル表示 */}
        {message.files && message.files.length > 0 && (
          <div className="flex gap-2 mb-2 flex-wrap">
            {message.files.map((file, i) => (
              <div
                key={i}
                className="bg-slate-800/50 rounded px-2 py-1 text-xs flex items-center gap-1"
              >
                {getFileIcon(file.type)}
                <span>{file.name}</span>
              </div>
            ))}
          </div>
        )}

        {/* メッセージ本文 */}
        <div className="prose prose-invert prose-sm max-w-none">
          <ReactMarkdown>{message.content}</ReactMarkdown>
        </div>

        {/* タイムスタンプ */}
        <div
          className={`text-xs mt-2 ${
            isUser ? 'text-purple-200' : 'text-slate-400'
          }`}
        >
          {message.timestamp.toLocaleTimeString('ja-JP', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
      </div>
    </div>
  );
}

function getFileIcon(type: string): string {
  if (type.startsWith('image/')) return '🖼️';
  if (type.startsWith('audio/')) return '🎵';
  if (type.startsWith('video/')) return '🎬';
  if (type === 'application/pdf') return '📄';
  return '📎';
}
