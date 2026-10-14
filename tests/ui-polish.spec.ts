import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('Chinese labels and the merged About copy render', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('locale-toggle').click();
  await expect(page.locator('[data-nav-link="library"] .lang-copy--zh')).toHaveText('资料库');
  await expect(page.locator('#writing-title .lang-copy--zh')).toBeVisible();
  await expect(page.locator('.interest-list .lang-copy--zh')).toHaveText(['人工智能', '学习', '想象']);
  await expect(page.locator('.about-copy > p .lang-copy--zh')).toContainText('复旦大学的开放课程资料');
});

test('the hero copy sits left of the illustration on desktop', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const box = await page.locator('#hero-title').boundingBox();
  expect(box!.x + box!.width).toBeLessThan(1440 * 0.5);
});
