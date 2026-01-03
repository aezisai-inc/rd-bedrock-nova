import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E テスト設定
 * 
 * 対象: AWS Amplify デプロイ済み環境
 * - 認証フロー
 * - チャット機能
 * - ファイルアップロード
 * - API接続（CORS、環境変数）
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list'],
  ],
  
  use: {
    // 本番環境をテスト
    baseURL: process.env.E2E_BASE_URL || 'https://main.d1rojnqtubey1r.amplifyapp.com',
    
    // トレース収集（デバッグ用）
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
    
    // タイムアウト設定
    actionTimeout: 30000,
    navigationTimeout: 30000,
  },

  // グローバルタイムアウト
  timeout: 60000,
  expect: {
    timeout: 10000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // ローカル開発時のサーバー起動（オプション）
  // webServer: {
  //   command: 'npm run frontend:dev',
  //   url: 'http://localhost:3000',
  //   reuseExistingServer: !process.env.CI,
  // },
});

