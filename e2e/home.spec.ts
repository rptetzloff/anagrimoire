// The home page: today's games, and the boards. The boards rule has been
// wrong twice (find() only ever reached Guess; filtering on "done" excluded
// Hive and Weave for ever), so this is the page that most needs a browser.
import { expect, seedPlayedHive, test } from './fixtures';

test('shows all seven games', async ({ page }) => {
  await page.goto('/');
  const today = page.getByRole('main');
  for (const name of [
    'Guess the Word',
    'Scramble',
    'Hive',
    'Boxed',
    'Grid',
    'Weave',
    'Word Squares',
  ]) {
    await expect(today.getByText(name, { exact: false }).first()).toBeVisible();
  }
});

test('a played hive puts the hive board on the page — started counts, done is not required', async ({
  page,
}) => {
  await seedPlayedHive(page);
  await page.goto('/');
  // the board renders as a button (it links into stats), named by its rows
  await expect(page.getByRole('button', { name: /Hive.*Anagrimoire/s })).toBeVisible();
});

test('nothing played falls back to a single board rather than none', async ({ page }) => {
  await page.goto('/');
  // the stub gives four boards rows; exactly one should show unplayed. Counted
  // as boards rather than as the text: the wordmark and the bar both say
  // "Anagrimoire", so counting the word passed with no board on the page.
  await expect(page.getByRole('main').getByRole('button', { name: /Anagrimoire/ })).toHaveCount(1);
});

test('the difficulty tabs re-ask the server for that difficulty', async ({ page, rpcCalls }) => {
  await page.goto('/');
  await expect
    .poll(() => rpcCalls.filter((c) => c.fn === 'leaderboard').length)
    .toBeGreaterThanOrEqual(1);
  await page.getByRole('group', { name: /difficulty/i }).getByRole('button', { name: 'Hard' }).click();
  await expect
    .poll(() =>
      rpcCalls.filter((c) => c.fn === 'leaderboard' && c.args.p_difficulty === 'hard').length
    )
    .toBeGreaterThanOrEqual(1);
});
