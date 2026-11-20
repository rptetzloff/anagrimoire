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
  // the board renders as a link into the boards, named by its rows
  await expect(page.getByRole('link', { name: /Hive.*Anagrimoire/s })).toBeVisible();
});

test('nothing played falls back to a single board rather than none', async ({ page }) => {
  await page.goto('/');
  // the stub gives four boards rows; exactly one should show unplayed. Counted
  // as boards rather than as the text: the bar says "Anagrimoire" too, so
  // counting the word passed with no board on the page.
  await expect(page.getByRole('main').getByRole('link', { name: /Anagrimoire/ })).toHaveCount(1);
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

// ---- the layout spec's Home (November 2026) ----

test('before the first move, Home says what is on and offers the first game', async ({ page }) => {
  await page.goto('/');
  const today = page.getByRole('region', { name: /new puzzles today/ });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ten new puzzles today.');
  await expect(today.getByRole('img', { name: '0 of 10 finished' })).toBeVisible();
  await today.getByRole('link', { name: 'Play Guess' }).click();
  await expect(page).toHaveURL(/\/daily\/guess$/);
});

test('a game under way is the one Home offers to continue', async ({ page }) => {
  await seedPlayedHive(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('0 of 10 done. Keep going.');
  await expect(page.getByRole('img', { name: '0 of 10 finished, 1 in progress' })).toBeVisible();
  await page.getByRole('link', { name: 'Continue Hive' }).click();
  await expect(page).toHaveURL(/\/daily\/hive$/);
});

test('the rail sits beside the puzzles on a desk and under them on a phone', async ({ page }) => {
  const rail = page.getByRole('complementary', { name: 'Boards and solvers' });
  const puzzles = page.getByRole('region', { name: "Today's puzzles" });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await expect(rail.getByRole('heading', { name: 'On the boards' })).toBeVisible();
  let r = (await rail.boundingBox())!;
  let p = (await puzzles.boundingBox())!;
  expect(r.x, 'the rail is to the right of the puzzles').toBeGreaterThanOrEqual(p.x + p.width);
  expect(Math.abs(r.y - p.y), 'and level with them').toBeLessThan(40);

  await page.setViewportSize({ width: 390, height: 844 });
  r = (await rail.boundingBox())!;
  p = (await puzzles.boundingBox())!;
  expect(r.y, 'the rail follows the puzzles').toBeGreaterThanOrEqual(p.y + p.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('the rail opens a solver', async ({ page }) => {
  await page.goto('/');
  const solvers = page.getByRole('region', { name: 'Stuck? Open a solver' });
  await expect(solvers.getByRole('link')).toHaveCount(10);
  await solvers.getByRole('link', { name: 'Hive' }).click();
  await expect(page).toHaveURL(/\/solve\/hive$/);
});

test('with Solve hidden, the rail offers no solvers', async ({ page }) => {
  await page.addInitScript(() => {
    // written after the fixture's own seeding, which runs first on every load
    localStorage.setItem('anagrimoire:v1', JSON.stringify({ onboarded: true, hiddenViews: ['solve'] }));
  });
  await page.goto('/');
  // the rail is there, so its missing solver card is the setting and not a
  // page without a rail
  const rail = page.getByRole('complementary', { name: 'Boards and solvers' });
  await expect(rail.getByRole('heading', { name: 'On the boards' })).toBeVisible();
  await expect(rail.getByText(/Nothing you type into a solver leaves your device/)).toBeVisible();
  await expect(rail.getByRole('region', { name: 'Stuck? Open a solver' })).toHaveCount(0);
});

test('the name in the bar is set in Fraunces, served from the site', async ({ page }) => {
  const fonts: string[] = [];
  page.on('request', (r) => {
    if (/\.woff2?(\?|$)/.test(r.url())) fonts.push(r.url());
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  const name = page.getByRole('banner').getByText('Anagrimoire', { exact: true }).first();
  await expect(name).toBeVisible();
  expect(await name.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/^"?Fraunces/);
  await expect.poll(() => page.evaluate(() => document.fonts.check('600 20px Fraunces'))).toBe(true);
  // bundled, like Inter: a font from a third party would tell it who visited
  const origin = new URL(page.url()).origin;
  expect(fonts.some((u) => /fraunces/i.test(u))).toBe(true);
  expect(fonts.filter((u) => !u.startsWith(origin))).toEqual([]);
});
