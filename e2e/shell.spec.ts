// The shell from the layout spec: the bar on a desktop, the bar and tabs on a
// phone, the big name on Home alone, and the quick-solve box.
//
// What has to hold: every game is one menu away with today's state beside it,
// and opens on its daily; every solver is one menu away; a menu whose view is
// hidden is not drawn; a phone reaches the same lists through its tabs, and
// its title switches game; the masthead is Home's only; and a line typed into
// quick solve lands in the solver it reads as, with its letters in place.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';

const desktop = { width: 1280, height: 900 };
const site = (page: import('@playwright/test').Page) => page.getByRole('navigation', { name: 'Site' });

test('the Games menu lists every game and opens one on its daily', async ({ page }) => {
  await page.setViewportSize(desktop);
  await page.goto('/');
  await site(page).getByRole('button', { name: 'Games' }).click();
  const list = page.getByRole('list', { name: 'Games' });
  await expect(list.getByRole('link')).toHaveCount(10);
  await expect(page.getByRole('link', { name: 'All the boards' })).toBeVisible();
  await list.getByRole('link', { name: /Word Ladder/ }).click();
  await expect(page).toHaveURL(/\/daily\/ladder$/);
  await expect(list).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Word Ladder');
});

test('the Solvers menu opens a game on its solver', async ({ page }) => {
  await page.setViewportSize(desktop);
  await page.goto('/');
  await site(page).getByRole('button', { name: 'Solvers' }).click();
  await page.getByRole('list', { name: 'Solvers' }).getByRole('link', { name: /^Hive/ }).click();
  await expect(page).toHaveURL(/\/solve\/hive$/);
});

test('a menu whose view is hidden is not drawn', async ({ page }) => {
  await page.setViewportSize(desktop);
  await page.addInitScript(() => {
    // hidden in settings: Solve. Written once, before the app first reads it.
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('anagrimoire:v1', JSON.stringify({ onboarded: true, hiddenViews: ['solve'] }));
  });
  await page.goto('/');
  await expect(site(page).getByRole('button', { name: 'Games' })).toBeVisible();
  await expect(site(page).getByRole('button', { name: 'Solvers' })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Quick solve' })).toHaveCount(0);
});

test('the big name is on Home, and a game page names its game instead', async ({ page }) => {
  await page.setViewportSize(desktop);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Anagrimoire');
  await page.goto('/daily/hive');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hive');
  // the bar's logo is still the way home
  await page.getByRole('link', { name: 'Anagrimoire, home' }).first().click();
  await expect(page).toHaveURL(/\/$/);
});

test('quick solve opens the pattern solver with the letters in place', async ({ page }) => {
  await page.setViewportSize(desktop);
  await page.goto('/');
  const box = page.getByRole('banner').getByRole('textbox', { name: 'Quick solve' }).first();
  await box.fill('c?a?t');
  await box.press('Enter');
  await expect(page).toHaveURL(/\/solve\/guess$/);
  // the five-letter board, with c, a and t where they were typed
  const cells = page.getByRole('textbox', { name: /^Letter at position \d+$/ });
  await expect(cells).toHaveCount(5);
  await expect(cells.nth(0)).toHaveValue(/c/i);
  await expect(cells.nth(1)).toHaveValue('');
  await expect(cells.nth(2)).toHaveValue(/a/i);
  await expect(cells.nth(4)).toHaveValue(/t/i);
});

test('quick solve sends letters alone to the scramble solver', async ({ page }) => {
  await page.setViewportSize(desktop);
  await page.goto('/');
  const box = page.getByRole('banner').getByRole('textbox', { name: 'Quick solve' }).first();
  await box.fill('retains');
  await box.press('Enter');
  await expect(page).toHaveURL(/\/solve\/scramble$/);
  // the rack is drawn as chips, one per letter, each with its own remove button
  await expect(page.getByRole('button', { name: /^Remove [a-z]$/ })).toHaveCount(7);
  for (const c of 'retains') await expect(page.getByRole('button', { name: `Remove ${c}` })).toBeVisible();
});

test('quick solve says what it takes, and keeps what was typed', async ({ page }) => {
  await page.setViewportSize(desktop);
  await page.goto('/');
  const box = page.getByRole('banner').getByRole('textbox', { name: 'Quick solve' }).first();
  await box.fill('c4t');
  await box.press('Enter');
  await expect(page.getByRole('alert')).toHaveText(/Letters only/);
  await expect(box).toHaveValue('c4t');
  await expect(page).toHaveURL(/\/$/);
});

test('on a phone, the tabs open the same lists, and the title switches game', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/daily/ladder');
  await page.getByRole('button', { name: /: switch game$/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Games' });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('link', { name: /Guess the Word/ }).click();
  await expect(page).toHaveURL(/\/daily\/guess$/);
  await expect(sheet).toHaveCount(0);

  await site(page).getByRole('button', { name: 'Solvers', exact: true }).click();
  const solvers = page.getByRole('dialog', { name: 'Solvers' });
  // the box rides in the sheet on a phone, where the bar has no room for it
  await expect(solvers.getByRole('textbox', { name: 'Quick solve' })).toBeVisible();
  await page.keyboard.press('Escape');

  await site(page).getByRole('button', { name: 'Me', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('link', { name: 'Settings' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('the bar with a menu open has no WCAG A/AA violations axe can see', async ({ page }) => {
  await page.setViewportSize(desktop);
  await page.goto('/');
  await site(page).getByRole('button', { name: 'Solvers' }).click();
  const results = await new AxeBuilder({ page }).include('header').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const summary = results.violations.map((v) => ({ id: v.id, sample: v.nodes[0]?.html.slice(0, 200), why: v.nodes[0]?.failureSummary }));
  expect(summary, JSON.stringify(summary, null, 2)).toEqual([]);
});
