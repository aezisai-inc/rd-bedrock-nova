'use client';

import './globals.css';
import '@aws-amplify/ui-react/styles.css';
import { Amplify } from 'aws-amplify';
import { Authenticator } from '@aws-amplify/ui-react';
import outputs from '../../amplify_outputs.json';

// Amplify 設定
Amplify.configure(outputs);

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <head>
        <title>rd-bedrock-nova | Nova AI Platform</title>
        <meta name="description" content="AWS Bedrock Nova シリーズを活用したAIプラットフォーム" />
      </head>
      <body className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <Authenticator
          signUpAttributes={['email']}
          components={{
            Header() {
              return (
                <div className="text-center py-8">
                  <h1 className="text-3xl font-bold text-white mb-2">
                    🚀 Nova AI Platform
                  </h1>
                  <p className="text-slate-300">
                    AWS Bedrock Nova シリーズ検証環境
                  </p>
                </div>
              );
            },
          }}
        >
          {({ signOut, user }) => (
            <div className="min-h-screen">
              {/* ヘッダー */}
              <header className="bg-slate-800/50 backdrop-blur-sm border-b border-slate-700">
                <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
                  <div className="flex items-center gap-6">
                    <a href="/" className="flex items-center gap-3 hover:opacity-80 transition">
                      <span className="text-2xl">🚀</span>
                      <span className="text-white font-semibold">Nova AI Platform</span>
                    </a>
                    <nav className="flex items-center gap-4">
                      <a href="/" className="text-slate-300 hover:text-white text-sm transition">
                        💬 Chat
                      </a>
                      <a href="/features" className="text-slate-300 hover:text-white text-sm transition" data-testid="nav-features">
                        🎛️ Features
                      </a>
                    </nav>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-slate-300 text-sm">
                      {user?.signInDetails?.loginId}
                    </span>
                    <button
                      onClick={signOut}
                      className="px-3 py-1 text-sm bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition"
                    >
                      サインアウト
                    </button>
                  </div>
                </div>
              </header>

              {/* メインコンテンツ */}
              <main>{children}</main>
            </div>
          )}
        </Authenticator>
      </body>
    </html>
  );
}
