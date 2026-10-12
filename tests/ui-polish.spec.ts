import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

const activeDot = (page: Page) => page.locator('[data-deck-pager] i').evaluateAll(
  (dots) => dots.findIndex((dot) => dot.classList.contains('is-active')),
);

test('tablet pager follows center-aligned cards and preserves the end positions', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 1000 });
  await page.goto('/');
  await page.getByTestId('overview-button').click();
  await expect.poll(() => activeDot(page)).toBe(0);

  for (const index of [1, 2]) {
    await page.locator('#overview-deck').evaluate((deck, cardIndex) => {
      const card = deck.querySelectorAll<HTMLElement>('.deck-card')[cardIndex]!;
      const deckRect = deck.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      deck.scrollTo({ left: deck.scrollLeft + cardRect.left + cardRect.width / 2 - deckRect.left - deckRect.width / 2, behavior: 'instant' });
    }, index);
    await expect.poll(() => activeDot(page)).toBe(index);
  }

  await page.locator('#overview-deck').evaluate((deck) => deck.scrollTo({ left: deck.scrollWidth, behavior: 'instant' }));
  await expect.poll(() => activeDot(page)).toBe(3);
  await page.locator('#overview-deck').evaluate((deck) => deck.scrollTo({ left: 0, behavior: 'instant' }));
  await expect.poll(() => activeDot(page)).toBe(0);
});

test('phone pager follows all four start-aligned cards', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByTestId('overview-button').click();
  await expect(page.locator('[data-deck-pager] i')).toHaveCount(4);
  await expect.poll(() => activeDot(page)).toBe(0);
  for (const index of [1, 2, 3]) {
    await page.locator('#overview-deck').evaluate((deck, cardIndex) => {
      const card = deck.querySelectorAll<HTMLElement>('.deck-card')[cardIndex]!;
      const padding = Number.parseFloat(getComputedStyle(deck).scrollPaddingLeft);
      deck.scrollTo({ left: deck.scrollLeft + card.getBoundingClientRect().left - deck.getBoundingClientRect().left - padding, behavior: 'instant' });
    }, index);
    await expect.poll(() => activeDot(page)).toBe(index);
  }
});

test('new Chinese labels, distinct About copy, and notes library link work', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('locale-toggle').click();
  await expect(page.locator('#projects .section-index')).toHaveText('01 — Orbit轨道');
  await expect(page.locator('#projects .section-index .lang-copy--zh')).toBeVisible();
  await expect(page.locator('#projects .section-index .lang-copy--en')).toBeHidden();
  await expect(page.locator('.live-label .lang-copy--zh')).toHaveText('GitHub 快照');
  await expect(page.locator('.interest-list .lang-copy--zh')).toHaveText(['人工智能', '学习', '想象']);
  await expect(page.locator('.about-copy > p:not(.section-index) .lang-copy--zh')).toContainText('复旦大学的开放课程资料');
  await page.locator('.empty-notes__link').click();
  await expect(page.locator('[data-library-disclosure]')).toHaveAttribute('open', '');
  await expect(page.locator('[data-resource-search]')).toBeVisible();
});
