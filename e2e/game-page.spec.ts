// A game page after the layout spec: the games down the left, the game in the
// middle under a heading that says which puzzle it is, and while playing, the
// game's own board and the way to report the puzzle down the right.
//
// What has to hold: the left rail lists the side of the site you are on and
// keeps you on it; the game you are on is marked as the page, with its state in
// words as well as a dot; the right rail is about this game at this
// difficulty, and only offers to report a puzzle that was published; and the
// rails give way, in order, as the window narrows.
import { expect, seedPlayedHive, test } from './fixtures';

const wide = { width: 1440, height: 900 };

test('playing: the day’s games down the left, this one marked, and each opens on its daily', async ({ page }) => {
  // a hive under way, seen from another game's page: on Hive's own, today's
  // real board replaces the seeded one
  await seedPlayedHive(page);
  await page.setViewportSize(wide);
  await page.goto('/daily/guess');
  const rail = page.getByRole('navigation', { name: 'Today' });
  await expect(rail.getByRole('link')).toHaveCount(10);
  await expect(rail.getByRole('link', { name: /^Guess the Word/ })).toHaveAttribute('aria-current', 'page');
  // the state in words, for anyone not seeing the dot
  await expect(rail.getByRole('link', { name: 'Hive, In progress' })).toBeVisible();
  await expect(rail.getByRole('link', { name: 'Word Ladder, Not started' })).toBeVisible();

  await rail.getByRole('link', { name: /^Word Ladder/ }).click();
  await expect(page).toHaveURL(/\/daily\/ladder$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Word Ladder');
  await expect(rail.getByRole('link', { name: /^Word Ladder/ })).toHaveAttribute('aria-current', 'page');
});

test('the heading says which puzzle: the daily’s date, or practice', async ({ page }) => {
  await page.setViewportSize(wide);
  await page.goto('/daily/hive');
  const main = page.getByRole('main');
  await expect(main.getByText(/^Daily · [A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2}$/)).toBeVisible();
  await page.getByRole('button', { name: 'Practice', exact: true }).click();
  await expect(main.getByText('Practice', { exact: true }).first()).toBeVisible();
});

// The commonest visit, and the one that had no date: a player back for a daily
// they started earlier today. The game reported its board as it mounted, before
// the page was listening, and never again because the date did not change.
test('back for a daily already under way, the page still knows which one it is', async ({ page }) => {
  await seedPlayedHive(page);
  await page.setViewportSize(wide);
  await page.goto('/daily/hive');
  await expect(page.getByRole('main').getByText(/^Daily · [A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2}$/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Report this puzzle' })).toBeVisible();
});

test('the right rail is this game’s board at this difficulty, and reports a daily only', async ({ page }) => {
  await page.setViewportSize(wide);
  await page.goto('/daily/hive');
  const side = page.getByRole('region', { name: /board · Easy$/ });
  await expect(side).toHaveCount(1);
  await expect(side.getByRole('listitem').first()).toContainText('Anagrimoire');
  await expect(page.getByRole('button', { name: 'Report this puzzle' })).toBeVisible();

  // Squares fields a board per size, so it gets two
  await page.goto('/daily/squares');
  await expect(page.getByRole('region', { name: /board · Easy$/ })).toHaveCount(2);

  // practice was never published: nothing on the server to report
  await page.goto('/play/hive');
  await expect(page.getByRole('region', { name: /board · / })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Report this puzzle' })).toHaveCount(0);

  await page.getByRole('link', { name: /Full board/ }).click();
  await expect(page).toHaveURL(/\/stats\/boards$/);
});

test('solving: the left rail lists the solvers and keeps you solving; no board rail', async ({ page }) => {
  await page.setViewportSize(wide);
  await page.goto('/solve/hive');
  await expect(page.getByRole('main').getByText('Solver', { exact: true })).toBeVisible();
  const rail = page.getByRole('navigation', { name: 'Solvers' }).last();
  await expect(rail.getByRole('link', { name: 'Hive' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('region', { name: /board · / })).toHaveCount(0);
  await rail.getByRole('link', { name: 'Grid' }).click();
  await expect(page).toHaveURL(/\/solve\/grid$/);
});

test('learning: the left rail lists the lessons', async ({ page }) => {
  await page.setViewportSize(wide);
  await page.goto('/learn/hive');
  const rail = page.getByRole('navigation', { name: 'Learn' });
  await expect(rail.getByRole('link', { name: 'Hive' })).toHaveAttribute('aria-current', 'page');
  await rail.getByRole('link', { name: 'Boxed' }).click();
  await expect(page).toHaveURL(/\/learn\/boxed$/);
});

test('the rails give way as the window narrows: the left first, then the right drops below', async ({ page }) => {
  await page.goto('/daily/hive');
  const left = page.getByRole('navigation', { name: 'Today' });
  const side = page.getByRole('region', { name: /board · Easy$/ });
  const game = page.getByRole('button', { name: 'Daily', exact: true });

  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(left).toBeVisible();

  await page.setViewportSize({ width: 1100, height: 900 });
  await expect(left).toBeHidden();
  let s = (await side.boundingBox())!;
  let g = (await game.boundingBox())!;
  expect(s.x, 'the board rail beside the game').toBeGreaterThan(g.x + g.width);

  await page.setViewportSize({ width: 390, height: 844 });
  s = (await side.boundingBox())!;
  g = (await game.boundingBox())!;
  expect(s.y, 'and under it on a phone').toBeGreaterThan(g.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
