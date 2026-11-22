// Settings, Keys, About and Legal were panels over the game; since the layout
// spec (November 2026) each is a page with its own address, drawn where the
// game was. Nothing covers the page any more, so the phone's tab bar, which
// stepped aside under a panel, stays.
import { expect, test } from './fixtures';

const PAGES: [string, string | RegExp][] = [
  ['/settings', 'Settings'],
  ['/keys', 'Keyboard controls'],
  ['/about', /^About /],
  ['/legal/notices', 'Legal'],
];

for (const [path, title] of PAGES) {
  test(`${path} is a page, not a dialog over a game`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // the game is not underneath it
    await expect(page.getByRole('link', { name: 'Solve', exact: true })).toHaveCount(0);
  });

  test(`${path} marks no section of the bar as the one you are in`, async ({ page }) => {
    // It marked Solvers or Games, left over from the last game view: these
    // pages are in none of the bar's four sections.
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/solve/hive');
    await expect(page.getByRole('navigation', { name: 'Site' }).locator('[aria-current]')).toHaveCount(1);
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Site' }).locator('[aria-current]')).toHaveCount(0);
  });
}

test('the Me menu goes to Settings as a page, and its tabs are links', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/daily/hive');
  await page.getByRole('button', { name: 'Your stats and settings' }).click();
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL(/\/settings\/site$/);
  const tabs = page.getByRole('navigation', { name: 'Settings' });
  await expect(tabs.getByRole('link', { name: 'Site' })).toHaveAttribute('aria-current', 'page');
  await tabs.getByRole('link', { name: 'Games' }).click();
  await expect(page).toHaveURL(/\/settings\/games$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/settings\/site$/);
});

test('on a phone, the tab bar stays on these pages', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  for (const path of ['/settings', '/about', '/legal/privacy']) {
    await page.goto(path);
    await expect(page.getByRole('navigation', { name: 'Site' }).getByRole('link', { name: 'Today' })).toBeVisible();
  }
});
