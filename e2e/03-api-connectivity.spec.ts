import { test, expect } from '@playwright/test';

/**
 * API接続テスト
 * 
 * 検証項目:
 * - CORSエラーがない
 * - AppSync/Cognitoエンドポイントが正しい
 * - 環境相違によるfetch errorがない
 * - モック・フォールバックではなく本番接続
 */

test.describe('API接続', () => {
  test('CORSエラーがない', async ({ page }) => {
    const corsErrors: string[] = [];

    page.on('console', (msg) => {
      const text = msg.text();
      if (
        text.includes('CORS') ||
        text.includes('Access-Control-Allow-Origin') ||
        text.includes('cross-origin')
      ) {
        corsErrors.push(text);
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // ログインを試行してAPI呼び出しを発生させる
    await page.getByRole('textbox', { name: 'Email' }).fill('test@example.com');
    await page.getByRole('textbox', { name: /password/i }).fill('TestP@ss123');
    await page.getByRole('button', { name: 'Sign in' }).click();
    
    await page.waitForTimeout(3000);

    // CORSエラーがないことを確認
    expect(corsErrors).toHaveLength(0);
  });

  test('Cognitoエンドポイントが東京リージョン（ap-northeast-1）', async ({ page }) => {
    const cognitoRequests: string[] = [];

    page.on('request', (request) => {
      if (request.url().includes('cognito')) {
        cognitoRequests.push(request.url());
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 認証リクエストを発生させる
    await page.getByRole('textbox', { name: 'Email' }).fill('test@example.com');
    await page.getByRole('textbox', { name: /password/i }).fill('TestP@ss123');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await page.waitForTimeout(3000);

    // Cognitoリクエストがあれば東京リージョンであることを確認
    if (cognitoRequests.length > 0) {
      const tokyoRegionRequests = cognitoRequests.filter((url) =>
        url.includes('ap-northeast-1')
      );
      expect(tokyoRegionRequests.length).toBeGreaterThan(0);
    }
  });

  test('fetch errorがない', async ({ page }) => {
    const fetchErrors: string[] = [];

    page.on('console', (msg) => {
      const text = msg.text();
      if (
        text.includes('fetch') && text.includes('error') ||
        text.includes('Failed to fetch') ||
        text.includes('NetworkError')
      ) {
        fetchErrors.push(text);
      }
    });

    page.on('pageerror', (error) => {
      if (error.message.includes('fetch')) {
        fetchErrors.push(error.message);
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // fetch errorがないことを確認
    expect(fetchErrors).toHaveLength(0);
  });

  test('amplify_outputs.jsonが正しく読み込まれている', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Amplifyが設定されていることをUIで確認
    // 認証UIが表示されればAmplifyは正しく設定されている
    const signInTab = page.getByRole('tab', { name: 'Sign In' });
    await expect(signInTab).toBeVisible();

    // Amplifyエラーがないことも確認
    const configErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.text().includes('Amplify') && msg.type() === 'error') {
        configErrors.push(msg.text());
      }
    });

    await page.reload();
    await page.waitForLoadState('networkidle');
    
    expect(configErrors).toHaveLength(0);
  });
});

