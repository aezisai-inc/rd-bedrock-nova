import { test, expect } from '@playwright/test';

/**
 * リソースロードテスト
 * 
 * 検証項目:
 * - 404エラーの検出
 * - 静的アセットの読み込み
 * - JavaScript/CSSのロードエラー
 * - 画像リソースのエラー
 */

test.describe('リソースロード', () => {
  test('404エラーが発生しない', async ({ page }) => {
    const notFoundErrors: { url: string; status: number }[] = [];

    page.on('response', (response) => {
      if (response.status() === 404) {
        notFoundErrors.push({
          url: response.url(),
          status: response.status(),
        });
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 404エラーがあれば詳細を表示
    if (notFoundErrors.length > 0) {
      console.log('404 Errors found:');
      notFoundErrors.forEach((err) => {
        console.log(`  - ${err.url}`);
      });
    }

    expect(notFoundErrors).toHaveLength(0);
  });

  test('JavaScript ロードエラーがない', async ({ page }) => {
    const jsErrors: string[] = [];

    page.on('response', (response) => {
      const url = response.url();
      if (url.endsWith('.js') && !response.ok()) {
        jsErrors.push(`${url} - ${response.status()}`);
      }
    });

    page.on('pageerror', (error) => {
      jsErrors.push(error.message);
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    expect(jsErrors).toHaveLength(0);
  });

  test('CSS ロードエラーがない', async ({ page }) => {
    const cssErrors: string[] = [];

    page.on('response', (response) => {
      const url = response.url();
      if (url.endsWith('.css') && !response.ok()) {
        cssErrors.push(`${url} - ${response.status()}`);
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    expect(cssErrors).toHaveLength(0);
  });

  test('画像リソースが正常にロードされる', async ({ page }) => {
    const imageErrors: string[] = [];

    page.on('response', (response) => {
      const url = response.url();
      const contentType = response.headers()['content-type'] || '';
      if (contentType.includes('image') && !response.ok()) {
        imageErrors.push(`${url} - ${response.status()}`);
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    expect(imageErrors).toHaveLength(0);
  });

  test('全てのネットワークリクエストが成功する', async ({ page }) => {
    const failedRequests: { url: string; status: number; method: string }[] = [];

    page.on('response', (response) => {
      // 400番台・500番台のエラー（ただし認証エラーは除外）
      const status = response.status();
      if (status >= 400 && status !== 401 && status !== 403) {
        failedRequests.push({
          url: response.url(),
          status: status,
          method: response.request().method(),
        });
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 失敗したリクエストがあれば詳細を表示
    if (failedRequests.length > 0) {
      console.log('Failed requests:');
      failedRequests.forEach((req) => {
        console.log(`  - [${req.method}] ${req.url} (${req.status})`);
      });
    }

    expect(failedRequests).toHaveLength(0);
  });
});

test.describe('Amplify Hosting 静的アセット', () => {
  test('Next.js _next アセットが正常にロードされる', async ({ page }) => {
    const nextErrors: string[] = [];

    page.on('response', (response) => {
      const url = response.url();
      if (url.includes('/_next/') && !response.ok()) {
        nextErrors.push(`${url} - ${response.status()}`);
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    expect(nextErrors).toHaveLength(0);
  });

  test('ページ遷移後も404エラーがない', async ({ page }) => {
    const notFoundAfterNav: string[] = [];

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 404モニタリング開始
    page.on('response', (response) => {
      if (response.status() === 404) {
        notFoundAfterNav.push(response.url());
      }
    });

    // 各種操作を実行
    // タブ切り替え
    const createAccountTab = page.getByRole('tab', { name: 'Create Account' });
    if (await createAccountTab.isVisible()) {
      await createAccountTab.click();
      await page.waitForTimeout(500);
    }

    const signInTab = page.getByRole('tab', { name: 'Sign In' });
    if (await signInTab.isVisible()) {
      await signInTab.click();
      await page.waitForTimeout(500);
    }

    expect(notFoundAfterNav).toHaveLength(0);
  });
});

test.describe('コンソールエラー検出', () => {
  test('致命的なJavaScriptエラーがない', async ({ page }) => {
    const criticalErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // 無視するエラー（認証関連の expected errors）
        const ignoredPatterns = [
          'User does not exist',
          'Incorrect username or password',
          'NotAuthorizedException',
        ];
        
        const isIgnored = ignoredPatterns.some((pattern) =>
          text.includes(pattern)
        );
        
        if (!isIgnored) {
          criticalErrors.push(text);
        }
      }
    });

    page.on('pageerror', (error) => {
      criticalErrors.push(`PageError: ${error.message}`);
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 致命的エラーがあれば詳細を表示
    if (criticalErrors.length > 0) {
      console.log('Critical errors found:');
      criticalErrors.forEach((err) => {
        console.log(`  - ${err}`);
      });
    }

    expect(criticalErrors).toHaveLength(0);
  });
});
