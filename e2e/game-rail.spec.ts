// A game's own panel -- its progress, what it found, sharing -- in the rail
// beside the board when there is one, and inline where it always was when the
// rail has dropped below the game (railSlot.ts). Drawn once either way: a
// panel in the rail and its twin above the board would be two clocks.
import { expect, test } from './fixtures';

const wide = { width: 1440, height: 900 };

test('Guess the Word: its game in the rail on a wide page, inline on a narrow one', async ({ page }) => {
  await page.setViewportSize(wide);
  await page.goto('/daily/guess');
  const panel = page.getByRole('region', { name: 'Your game' });
  await expect(panel).toContainText('Guess 1 of 6');
  await expect(panel.getByText('Played')).toBeVisible();
  await expect(panel.getByText('Win %')).toBeVisible();
  // above the leaderboard: it is about what you are doing
  const board = page.getByRole('region', { name: /board · / });
  expect((await panel.boundingBox())!.y).toBeLessThan((await board.boundingBox())!.y);
  // and not also above the board
  await expect(page.getByText(/^Streak \d+$/)).toHaveCount(0);

  await page.setViewportSize({ width: 900, height: 900 });
  await expect(panel).toHaveCount(0);
  await expect(page.getByText(/^Streak \d+$/)).toBeVisible();
});

test('Hive: the rank, the way to Genius and the words found, in the rail', async ({ page }) => {
  await page.setViewportSize(wide);
  await page.goto('/daily/hive');
  const panel = page.getByRole('region', { name: 'Your progress' });
  await expect(panel).toContainText(/Genius at \d+/);
  await expect(panel).toContainText(/0 words found of \d+/);
  // the line above the board went with it
  await expect(page.getByRole('main').getByText(/Genius at \d+/)).toHaveCount(1);
});

test('Scramble: what was found and how long the longest word is, the clock with the rack', async ({ page }) => {
  await page.setViewportSize(wide);
  await page.goto('/daily/scramble');
  await expect(page.getByRole('region', { name: 'Found' })).toContainText('Start the clock to play.');
  // the length, but not the word, while it can still be played
  const longest = page.getByRole('region', { name: 'Longest possible' });
  await expect(longest).toContainText(/\d+ letters · shown when the clock stops/);
});

test('Grid: the words found and the score in the rail, the clock with the board', async ({ page }) => {
  await page.setViewportSize(wide);
  await page.goto('/daily/grid');
  const panel = page.getByRole('region', { name: 'Found' });
  await expect(panel).toContainText('Start the clock to play.');
  await expect(panel).toContainText(/0 words · 0 pts/);
  // the clock stays above the board: it is what you watch while tracing
  await expect(page.getByRole('main').getByText(/^\d:\d\d$/)).toBeVisible();

  await page.setViewportSize({ width: 900, height: 900 });
  await expect(panel).toHaveCount(0);
});

test('Boxed: the clock, letters used and par in the rail, not above the board', async ({ page }) => {
  await page.setViewportSize(wide);
  await page.goto('/daily/boxed');
  const panel = page.getByRole('region', { name: 'Your box' });
  await expect(panel).toContainText('0 / 12 letters');
  await expect(panel).toContainText(/0 words so far · solvable in \d/);
  await expect(page.getByText(/^Solvable in \d$/)).toHaveCount(0);

  await page.setViewportSize({ width: 900, height: 900 });
  await expect(panel).toHaveCount(0);
  await expect(page.getByText(/^Solvable in \d$/)).toBeVisible();
});

test('Weave: progress and the hint button in the rail, once', async ({ page }) => {
  await page.setViewportSize(wide);
  await page.goto('/daily/weave');
  const panel = page.getByRole('region', { name: 'Your progress' });
  await expect(panel).toContainText(/0 \/ \d+ found/);
  await expect(panel.getByRole('button', { name: /^Hint / })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Hint / })).toHaveCount(1);

  await page.setViewportSize({ width: 900, height: 900 });
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Hint / })).toHaveCount(1);
  await expect(page.getByText(/^0 \/ \d+ found$/)).toBeVisible();
});

test('Word Squares: the clock and the words made, in the rail', async ({ page }) => {
  await page.setViewportSize(wide);
  await page.goto('/daily/squares');
  const panel = page.getByRole('region', { name: 'Your square' });
  await expect(panel).toContainText(/\d+ \/ \d+ words/);
  await expect(panel).toContainText('Lines that read as words, across and down.');

  await page.setViewportSize({ width: 900, height: 900 });
  await expect(panel).toHaveCount(0);
});

test('Cryptogram: the passage and the crossed-off alphabet beside it', async ({ page }) => {
  await page.setViewportSize(wide);
  await page.goto('/daily/cryptogram');
  const panel = page.getByRole('region', { name: 'Your passage' });
  await expect(panel).toContainText(/\d+ \/ \d+ letters/);
  await expect(page.getByRole('region', { name: 'Letters used' })).toContainText(/\d+ \/ 26/);

  await page.setViewportSize({ width: 900, height: 900 });
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Letters used' })).toHaveCount(0);
});

test('Word Ladder: steps against par and the two ends, drawn once', async ({ page }) => {
  await page.setViewportSize(wide);
  await page.goto('/daily/ladder');
  const panel = page.getByRole('region', { name: 'Your ladder' });
  await expect(panel).toContainText(/From \w+ to \w+, one letter at a time\./);
  await expect(page.getByText(/^\d+ \/ \d+ steps$/)).toHaveCount(1);

  await page.setViewportSize({ width: 900, height: 900 });
  await expect(panel).toHaveCount(0);
  await expect(page.getByText(/^\d+ \/ \d+ steps$/)).toHaveCount(1);
});

test('Bridge: bridges found and hints left, drawn once', async ({ page }) => {
  await page.setViewportSize(wide);
  await page.goto('/daily/bridge');
  const panel = page.getByRole('region', { name: 'Your board' });
  await expect(panel).toContainText(/0 \/ \d+ found/);
  await expect(page.getByText(/^\d+ \/ \d+ found$/)).toHaveCount(1);

  await page.setViewportSize({ width: 900, height: 900 });
  await expect(panel).toHaveCount(0);
  await expect(page.getByText(/^\d+ \/ \d+ found$/)).toHaveCount(1);
});
