// Stats is a page under Boards (the layout spec, November 2026), not a panel
// over the game: its own address, its tabs links, and Back leaves it.
import { expect, test } from './fixtures';

test('the Boards link opens a page, not a dialog', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Site' }).getByRole('link', { name: 'Boards' }).click();
  await expect(page).toHaveURL(/\/stats\/boards$/);
  await expect(page.getByRole('heading', { level: 1, name: 'The boards' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('each tab is a link to its own address, the open one marked', async ({ page }) => {
  await page.goto('/stats/overall');
  const tabs = page.getByRole('navigation', { name: 'Stats' });
  await expect(tabs.getByRole('link', { name: 'Overall' })).toHaveAttribute('aria-current', 'page');
  await tabs.getByRole('link', { name: 'History' }).click();
  await expect(page).toHaveURL(/\/stats\/history$/);
  await expect(tabs.getByRole('link', { name: 'History' })).toHaveAttribute('aria-current', 'page');
  await page.goBack();
  await expect(page).toHaveURL(/\/stats\/overall$/);
});

test('the tabs fit a small phone on one line', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/stats/boards');
  const tabs = page.getByRole('navigation', { name: 'Stats' });
  await expect(tabs).toBeVisible();
  expect(await tabs.evaluate((el) => el.scrollWidth <= el.clientWidth && el.getBoundingClientRect().height < 60)).toBe(true);
});
