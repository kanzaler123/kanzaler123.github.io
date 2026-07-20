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

async function mockLowFrequencyAudioContext(page: Page) {
  await page.addInitScript(() => {
    type FakeAudioState = {
      analyserReads: number;
      contextCreates: number;
      mediaSourceCreates: number;
    };

    const state: FakeAudioState = {
      analyserReads: 0,
      contextCreates: 0,
      mediaSourceCreates: 0,
    };
    (window as typeof window & { __fakeAudioState: FakeAudioState }).__fakeAudioState = state;

    class FakeMediaSource {
      connect<T>(target: T) {
        return target;
      }

      disconnect() {}
    }

    class FakeAnalyser {
      fftSize = 1024;
      smoothingTimeConstant = 0;
      minDecibels = -100;
      maxDecibels = -30;
      readonly frequencyBinCount = 512;

      connect<T>(target: T) {
        return target;
      }

      getByteFrequencyData(data: Uint8Array) {
        state.analyserReads += 1;
        data.fill(0);
        const binWidth = 44_100 / this.fftSize;
        const firstBin = Math.ceil(45 / binWidth);
        const lastBin = Math.floor(220 / binWidth);
        for (let index = firstBin; index <= lastBin; index += 1) data[index] = 255;
      }
    }

    class FakeAudioContext {
      state: AudioContextState = 'running';
      readonly sampleRate = 44_100;
      readonly destination = {};
      onstatechange: ((event: Event) => void) | null = null;

      constructor() {
        state.contextCreates += 1;
      }

      createMediaElementSource() {
        state.mediaSourceCreates += 1;
        return new FakeMediaSource();
      }

      createAnalyser() {
        return new FakeAnalyser();
      }

      async resume() {
        this.state = 'running';
      }
    }

    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      value: FakeAudioContext,
    });
  });
}

const readHeroProgress = (page: Page) => page.locator('[data-hero-sequence]').evaluate((sequence) => (
  Number.parseFloat(getComputedStyle(sequence).getPropertyValue('--hero-progress'))
));

test('uses one sticky starry scene without a preview or a second background', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByText('Click to Enter', { exact: true })).toHaveCount(0);
  await expect(page.getByText('点击进入', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Preview', { exact: true })).toHaveCount(0);
  await expect(page.locator('.entry-preview')).toHaveCount(0);
  await expect(page.locator('[data-hero-sequence]')).toHaveCount(1);
  await expect(page.locator('[data-hero-sticky]')).toHaveCSS('position', 'sticky');
  await expect(page.locator('.hero-media')).toHaveCount(1);
  await expect(page.locator('.overview-media')).toHaveCount(0);

  const initial = await page.evaluate(() => ({
    overflowY: getComputedStyle(document.body).overflowY,
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight,
    contentInert: document.querySelector('.content-stage')?.hasAttribute('inert'),
    sequenceHeight: document.querySelector<HTMLElement>('[data-hero-sequence]')?.offsetHeight ?? 0,
    stickyHeight: document.querySelector<HTMLElement>('[data-hero-sticky]')?.offsetHeight ?? 0,
  }));
  expect(initial.overflowY).not.toBe('hidden');
  expect(initial.scrollHeight).toBeGreaterThan(initial.innerHeight * 2);
  expect(initial.contentInert).toBe(false);
  expect(initial.sequenceHeight).toBeGreaterThan(initial.stickyHeight * 1.8);
  await expect(page.locator('#overview-deck')).toHaveCSS('visibility', 'hidden');
  await expect.poll(() => readHeroProgress(page)).toBeCloseTo(0, 2);

  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = 'auto';
    const sequence = document.querySelector<HTMLElement>('[data-hero-sequence]')!;
    const sticky = document.querySelector<HTMLElement>('[data-hero-sticky]')!;
    scrollTo(0, sequence.offsetTop + (sequence.offsetHeight - sticky.offsetHeight) * 0.64);
  });
  await expect.poll(() => readHeroProgress(page)).toBeGreaterThan(0.6);
  await expect(page.locator('[data-hero-sequence]')).toHaveAttribute('data-hero-phase', 'morph');
  await expect(page.locator('#overview-deck')).toHaveCSS('visibility', 'visible');

  await page.evaluate(() => scrollTo(0, 0));
  await expect.poll(() => readHeroProgress(page)).toBeCloseTo(0, 2);
  await expect(page.locator('[data-hero-sequence]')).toHaveAttribute('data-hero-phase', 'entry');
  await expect(page.locator('#overview-deck')).toHaveCSS('visibility', 'hidden');
  await expect(page.getByTestId('audio-orb')).toBeInViewport();
});

test('the center star advances the sticky scene to 94% and scrolling up reverses it', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#overview-deck')).toHaveCSS('visibility', 'hidden');
  await page.getByTestId('overview-button').click();
  await expect.poll(() => readHeroProgress(page)).toBeCloseTo(0.94, 1);
  await expect(page.locator('[data-hero-sequence]')).toHaveAttribute('data-hero-phase', 'overview');
  await expect(page.locator('#overview-deck')).toHaveCSS('visibility', 'visible');
  await expect.poll(() => page.locator('[data-hero-sequence]').evaluate((sequence) => (
    Number.parseFloat(getComputedStyle(sequence).getPropertyValue('--deck-opacity'))
  ))).toBeGreaterThan(0.98);
  await expect(page.locator('body')).not.toHaveClass(/is-entered/);

  await page.evaluate(() => scrollTo(0, 0));
  await expect.poll(() => readHeroProgress(page)).toBeCloseTo(0, 2);
  await expect(page.locator('[data-hero-sequence]')).toHaveAttribute('data-hero-phase', 'entry');
  await expect(page.locator('#overview-deck')).toHaveCSS('visibility', 'hidden');
  await expect(page.getByTestId('audio-orb')).toBeInViewport();
});

test('navigation highlight returns to Home after scrolling back to the starry scene', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = 'auto';
    const projects = document.querySelector<HTMLElement>('#projects')!;
    scrollTo(0, projects.getBoundingClientRect().top + scrollY);
  });
  await expect(page.locator('[data-nav-link="projects"]')).toHaveClass(/active/);

  await page.evaluate(() => scrollTo(0, 0));
  await expect(page.locator('[data-nav-link="home"]')).toHaveClass(/active/);
  await expect(page.locator('[data-nav-link="projects"]')).not.toHaveClass(/active/);
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

test('low frequencies drive a smooth ring waveform through a single media-element source', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await mockMediaPlayback(page);
  await mockLowFrequencyAudioContext(page);
  await page.goto('/');

  await expect(page.getByTestId('music-toggle')).toHaveAttribute('data-state', 'playing');
  await expect(page.locator('.entry-orb')).toHaveAttribute('data-audio-state', 'active');
  await expect(page.locator('[data-audio-wave-line]')).toHaveAttribute('d', /Q/);
  await expect.poll(() => page.locator('[data-audio-wave-line]').evaluate((wave) => (
    Number.parseFloat(wave.getAttribute('data-wave-deviation') ?? '0')
  ))).toBeGreaterThan(0.5);
  await expect.poll(() => page.evaluate(() => (
    (window as typeof window & { __fakeAudioState: { mediaSourceCreates: number } }).__fakeAudioState.mediaSourceCreates
  ))).toBe(1);

  await page.getByTestId('music-toggle').click();
  await expect(page.getByTestId('music-toggle')).toHaveAttribute('data-state', 'paused');
  await expect.poll(() => page.locator('[data-audio-wave-line]').evaluate((wave) => (
    Number.parseFloat(wave.getAttribute('data-wave-deviation') ?? '0')
  )), { timeout: 3000 }).toBeLessThan(0.08);
  await page.getByTestId('music-toggle').click();
  await expect(page.getByTestId('music-toggle')).toHaveAttribute('data-state', 'playing');
  await expect.poll(() => page.evaluate(() => (
    (window as typeof window & { __fakeAudioState: { mediaSourceCreates: number } }).__fakeAudioState.mediaSourceCreates
  ))).toBe(1);
});

test('retries blocked autoplay on the first center-star gesture', async ({ page }) => {
  await mockMediaPlayback(page, true);
  await page.goto('/');
  await expect(page.getByTestId('music-toggle')).toHaveAttribute('data-state', 'blocked');
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __mediaPlayCalls: number }).__mediaPlayCalls)).toBe(1);

  await page.getByTestId('overview-button').click();
  await expect(page.getByTestId('music-toggle')).toHaveAttribute('data-state', 'playing');
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __mediaPlayCalls: number }).__mediaPlayCalls)).toBe(2);
  await expect.poll(() => readHeroProgress(page)).toBeCloseTo(0.94, 1);
});

test('a downward touch gesture unlocks music without pressing the center star', async ({ page }) => {
  await mockMediaPlayback(page, true);
  await page.goto('/');
  await expect(page.getByTestId('music-toggle')).toHaveAttribute('data-state', 'blocked');

  await page.locator('body').dispatchEvent('touchend');

  await expect(page.getByTestId('music-toggle')).toHaveAttribute('data-state', 'playing');
  await expect.poll(() => page.evaluate(() => (
    (window as typeof window & { __mediaPlayCalls: number }).__mediaPlayCalls
  ))).toBe(2);
  await expect.poll(() => readHeroProgress(page)).toBeCloseTo(0, 2);
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
  await expect(page.locator('#hero-title')).toContainText('Kanzaler');
});

test('placeholder cards never expose fake links', async ({ page }) => {
  await page.goto('/');
  const placeholders = page.locator('[data-placeholder="true"]');
  await expect(placeholders).toHaveCount(2);
  await expect(placeholders.locator('a')).toHaveCount(0);
});

test('course resources are grouped, searchable, and directly downloadable', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-placeholder="false"]')).toHaveAttribute('href', '#course-resources');
  await expect(page.locator('[data-course-tab]')).toHaveCount(15);
  await expect(page.locator('[data-resource-file]')).toHaveCount(562);

  const search = page.locator('[data-resource-search]');
  await search.fill('Computer Systems');
  await expect(page.locator('[data-course-panel]:visible')).toHaveCount(1);
  await expect(page.locator('[data-resource-file]:visible').first()).toBeVisible();

  const download = page.locator('[data-resource-file]:visible .file-download').first();
  await expect(download).toHaveAttribute('href', /github\.com\/kanzaler123\/fdu-course-resources\/raw\/refs\/heads\/main\//);

  await page.getByTestId('locale-toggle').click();
  await expect(search).toHaveAttribute('placeholder', '搜索文件、课程或格式…');
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
