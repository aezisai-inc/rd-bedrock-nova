import { test, expect } from '@playwright/test';

/**
 * アプリケーション基本ロードテスト
 * 
 * 検証項目:
 * - ページが正常にロードされる
 * - Amplify設定が正しく読み込まれる（エラーなし）
 * - 認証UIが表示される
 * - localhostハードコードがない
 */

test.describe('アプリケーション基本ロード', () => {
  test('ページが正常にロードされ、コンソールエラーがない', async ({ page }) => {
    const consoleErrors: string[] = [];
    const networkErrors: string[] = [];

    // コンソールエラーを収集
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // ネットワークエラーを収集
    page.on('requestfailed', (request) => {
      networkErrors.push(`${request.url()} - ${request.failure()?.errorText}`);
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Amplify設定エラーがないことを確認
    const amplifyConfigError = consoleErrors.find(
      (e) => e.includes('Amplify has not been configured')
    );
    expect(amplifyConfigError).toBeUndefined();

    // 404エラーがないことを確認
    const notFoundErrors = networkErrors.filter((e) => e.includes('404'));
    expect(notFoundErrors).toHaveLength(0);

    // ページタイトルが正しい
    await expect(page).toHaveTitle(/Nova AI Platform/);
  });

  test('認証UIが表示される', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Sign In タブが表示される
    await expect(page.getByRole('tab', { name: 'Sign In' })).toBeVisible();
    
    // Create Account タブが表示される
    await expect(page.getByRole('tab', { name: 'Create Account' })).toBeVisible();
    
    // Emailフィールドが表示される
    await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible();
    
    // Passwordフィールドが表示される
    await expect(page.getByRole('textbox', { name: /password/i })).toBeVisible();
    
    // Sign inボタンが表示される
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });

  test('localhostへのリクエストがない', async ({ page }) => {
    const localhostRequests: string[] = [];

    page.on('request', (request) => {
      if (request.url().includes('localhost') || request.url().includes('127.0.0.1')) {
        localhostRequests.push(request.url());
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // localhostへのリクエストがないことを確認
    expect(localhostRequests).toHaveLength(0);
  });

  test('APIエンドポイントが環境変数で設定されている（ハードコードなし）', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // ページのJavaScriptコンテキストで設定を確認
    const hasHardcodedLocalhost = await page.evaluate(() => {
      // グローバルオブジェクトをチェック
      const scripts = Array.from(document.scripts).map((s) => s.textContent || '');
      return scripts.some(
        (s) => s.includes("'http://localhost") || s.includes('"http://localhost')
      );
    });

    expect(hasHardcodedLocalhost).toBe(false);
  });
});

