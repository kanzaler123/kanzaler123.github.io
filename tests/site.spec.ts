import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

async function mockMediaPlayback(page: Page, rejectFirst = false) {
  await page.addInitScript(({ shouldRejectFirst }) => {
    (window as typeof window & { __mediaPlayCalls: number }).__mediaPlayCalls = 0;
    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
      configurable: true,
      value() {
        const state = window as typeof window & { __mediaPlayCalls: number };
        state.__mediaPlayCalls += 1;
        if (shouldRejectFirst && state.__mediaPlayCalls === 1) {
          return Promise.reject(new DOMException('Autoplay blocked', 'NotAllowedError'));
        }
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
  }, { shouldRejectFirst: rejectFirst });
}

test('is a natural two-screen page without an entrance gate', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByText('Click to Enter', { exact: true })).toHaveCount(0);
  await expect(page.getByText('点击进入', { exact: true })).toHaveCount(0);

  const initial = await page.evaluate(() => ({
    overflowY: getComputedStyle(document.body).overflowY,
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight,
    contentInert: document.querySelector('.content-stage')?.hasAttribute('inert'),
  }));
  expect(initial.overflowY).not.toBe('hidden');
  expect(initial.scrollHeight).toBeGreaterThan(initial.innerHeight * 2);
  expect(initial.contentInert).toBe(false);

  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = 'auto';
    scrollTo(0, document.querySelector<HTMLElement>('#overview')!.offsetTop);
  });
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(100);
  await page.evaluate(() => scrollTo(0, 0));
  await expect(page.locator('.entry-orb-wrap')).toBeInViewport();
  await expect(page.locator('.entry-panel')).toHaveCSS('visibility', 'visible');
});

test('the center star scrolls to the overview and keeps the first screen reversible', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('overview-button').click();
  await expect.poll(() => page.evaluate(() => Math.round(document.querySelector<HTMLElement>('#overview')!.getBoundingClientRect().top))).toBe(0);
  await expect(page.locator('body')).not.toHaveClass(/is-entered/);
  await expect(page.locator('.entry-panel')).toHaveCSS('visibility', 'visible');

  await page.evaluate(() => scrollTo(0, 0));
  await expect(page.locator('.entry-orb-wrap')).toBeInViewport();
});

test('attempts audible autoplay immediately at the saved volume', async ({ page }) => {
  await mockMediaPlayback(page);
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __mediaPlayCalls: number }).__mediaPlayCalls)).toBeGreaterThanOrEqual(1);
  await expect(page.getByTestId('music-toggle')).toHaveAttribute('data-state', 'playing');
  await expect(page.locator('#background-music')).toHaveAttribute('autoplay', '');
  await expect(page.locator('#background-music')).toHaveAttribute('preload', 'auto');
  await expect.poll(() => page.locator('#background-music').evaluate((audio) => (audio as HTMLAudioElement).volume)).toBeCloseTo(0.25, 2);
});

test('retries blocked autoplay on the first center-star gesture', async ({ page }) => {
  await mockMediaPlayback(page, true);
  await page.goto('/');
  await expect(page.getByTestId('music-toggle')).toHaveAttribute('data-state', 'blocked');
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __mediaPlayCalls: number }).__mediaPlayCalls)).toBe(1);

  await page.getByTestId('overview-button').click();
  await expect(page.getByTestId('music-toggle')).toHaveAttribute('data-state', 'playing');
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __mediaPlayCalls: number }).__mediaPlayCalls)).toBe(2);
  await expect.poll(() => page.evaluate(() => Math.round(document.querySelector<HTMLElement>('#overview')!.getBoundingClientRect().top))).toBe(0);
});

test('uses the supplied account avatar instead of the hero background', async ({ page }) => {
  await page.goto('/');
  const avatar = page.getByTestId('profile-avatar');
  await expect(avatar).toHaveAttribute('alt', "Kanzaler's avatar");
  const result = await avatar.evaluate((image: HTMLImageElement) => ({
    loaded: image.complete && image.naturalWidth > 0,
    src: image.currentSrc,
    heroSrc: document.querySelector<HTMLImageElement>('.hero-media img')?.currentSrc,
  }));
  expect(result.loaded).toBe(true);
  expect(result.src).toContain('avatar');
  expect(result.src).not.toBe(result.heroSrc);
});

test('shows petals and meteors before any click when motion is allowed', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await expect(page.locator('.petal-layer i')).toHaveCount(26);
  await expect(page.locator('.petal-layer')).toHaveCSS('opacity', '0.88');
  await expect.poll(
    () => page.locator('#meteor-layer').getAttribute('data-spawn-count').then((value) => Number(value ?? 0)),
    { timeout: 5000 },
  ).toBeGreaterThan(0);
});

test('reduces ambient motion without disabling scrolling', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.star-field')).toHaveCSS('display', 'none');
  await expect(page.locator('.meteor-layer')).toHaveCSS('display', 'none');
  await expect(page.locator('.petal-layer')).toHaveCSS('display', 'none');
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeGreaterThan(await page.evaluate(() => innerHeight));
});

test('switches to Chinese and remembers the locale', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('locale-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page.locator('.entry-tagline .lang-copy--zh')).toBeVisible();
  await expect(page.locator('.entry-tagline .lang-copy--en')).toBeHidden();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page.locator('#overview-title')).toContainText('Kanzaler');
});

test('placeholder cards never expose fake links', async ({ page }) => {
  await page.goto('/');
  const placeholders = page.locator('[data-placeholder="true"]');
  await expect(placeholders).toHaveCount(3);
  await expect(placeholders.locator('a')).toHaveCount(0);
});

test('has no horizontal page overflow', async ({ page }) => {
  await page.goto('/');
  for (const viewport of [
    { width: 375, height: 812 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
    { width: 1672, height: 941 },
  ]) {
    await page.setViewportSize(viewport);
    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  }
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
