import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
      configurable: true,
      value() {
        this.dispatchEvent(new Event('play'));
        return Promise.resolve();
      },
    });
    Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
      configurable: true,
      value() {
        this.dispatchEvent(new Event('pause'));
      },
    });
  });
});

test('enters the site and starts the music from a user gesture', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.getByRole('button', { name: /enter the site/i }).click();
  await expect(page.locator('body')).toHaveClass(/is-entered/);
  await expect(page.getByTestId('music-toggle')).toHaveAttribute('data-state', 'playing');
});

test('switches to Chinese and remembers the locale', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('locale-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page.locator('.primary-navigation')).toContainText('项目');
});

test('placeholder cards never expose fake links', async ({ page }) => {
  await page.goto('/');
  const placeholders = page.locator('[data-placeholder="true"]');
  await expect(placeholders).toHaveCount(3);
  await expect(placeholders.locator('a')).toHaveCount(0);
});

test('mobile navigation opens and closes accessibly', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile');
  await page.goto('/');
  const menu = page.getByTestId('menu-toggle');
  await menu.click();
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('link', { name: /projects/i }).click();
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
});
