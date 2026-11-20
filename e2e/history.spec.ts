// The address bar, and the Back button.
//
// This is the least-covered machinery in the app and it is about to be
// extracted, which is the worst possible combination: a refactor that quietly
// changes what Back does looks identical to one that doesn't. Nothing here
// existed before — no test anywhere called `goBack`, and none asserted a title.
//
// Two of these started as `test.fail` — reproductions of bugs the extraction had
// to preserve before fixing deliberately, rather than absorb silently. Both are
// fixed now, and both announced it themselves: Playwright reports "expected to
// fail, but passed", which is why they were `fail` and not `fixme`. They stay
// here as ordinary tests, with a note on what each used to catch.
//
// They are marked `test.fail`, not `test.fixme`. The difference is the whole
// point: fixme *skips*, which would make them decoration, while fail *runs*
// them and expects red — and reports loudly if one unexpectedly passes. So the
// day either bug is fixed, CI says so and this annotation comes off, rather
// than a green suite quietly covering for a test nobody executes.
import { expect, test } from './fixtures';

/** history.length is capped at 50 by Chrome, so absolutes tell you nothing.
 *  Deltas do. */
const depth = (page: import('@playwright/test').Page) =>
  page.evaluate(() => window.history.length);

test('a panel is a place you can come back from', async ({ page }) => {
  await page.goto('/daily/hive');
  const before = await depth(page);

  await page.getByRole('link', { name: 'About & FAQ' }).click();
  await expect(page).toHaveURL(/\/about$/);
  await expect(page.getByRole('dialog', { name: 'About and FAQ' })).toBeVisible();
  expect(await depth(page), 'opening a panel should add one entry').toBe(before + 1);

  await page.goBack();
  await expect(page).toHaveURL(/\/daily\/hive$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('closing a panel we opened steps back rather than stacking', async ({ page }) => {
  // otherwise Back would reopen the thing you just closed, which is the one
  // behaviour a close button must not have
  await page.goto('/daily/hive');
  await page.getByRole('link', { name: 'About & FAQ' }).click();
  const opened = await depth(page);

  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  await expect(page).toHaveURL(/\/daily\/hive$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await depth(page), 'closing should not add an entry').toBe(opened);
});

test('moving within a panel replaces, so Back is one step not one per tab', async ({ page }) => {
  // A modal covers the footer, so panels are not swapped for each other — the
  // overlay-to-overlay case is moving between a panel's own tabs, and each of
  // those is a real address. If they stacked, leaving a panel you had read
  // three tabs of would take four Backs.
  await page.goto('/daily/hive');
  await page.locator('footer').getByRole('link', { name: 'Privacy' }).click();
  await expect(page).toHaveURL(/\/legal\/privacy$/);
  const opened = await depth(page);

  await page.getByRole('dialog').getByRole('button', { name: 'Terms' }).click();
  await expect(page).toHaveURL(/\/legal\/terms$/);
  await page.getByRole('dialog').getByRole('button', { name: 'Notices' }).click();
  await expect(page).toHaveURL(/\/legal\/notices$/);
  expect(await depth(page), 'two tab moves should add no entries').toBe(opened);

  await page.goBack();
  await expect(page, 'one Back leaves the panel entirely').toHaveURL(/\/daily\/hive$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('forward works too, which is the half people forget', async ({ page }) => {
  await page.goto('/daily/hive');
  await page.getByRole('link', { name: 'About & FAQ' }).click();
  await page.goBack();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.goForward();
  await expect(page).toHaveURL(/\/about$/);
  await expect(page.getByRole('dialog', { name: 'About and FAQ' })).toBeVisible();
});

test('the view switch is an address, and Back returns the board', async ({ page }) => {
  await page.goto('/daily/hive');
  await page.getByRole('link', { name: 'Solve', exact: true }).click();
  await expect(page).toHaveURL(/\/solve\/hive$/);

  await page.goBack();
  await expect(page).toHaveURL(/\/daily\/hive$/);
});

test('the daily and practice boards are different addresses', async ({ page }) => {
  // Hive rather than bridge: ladder and bridge have no practice mode at all,
  // which is its own roadmap item and the reason this test names a game that
  // does.
  await page.goto('/daily/hive');
  await page.getByRole('button', { name: 'Practice', exact: true }).click();
  await expect(page).toHaveURL(/\/play\/hive$/);

  await page.goBack();
  await expect(page, 'Back should return the daily board').toHaveURL(/\/daily\/hive$/);
});

test('a legacy query link rewrites itself and leaves nothing to go back to', async ({ page }) => {
  await page.goto('/?daily=hive');
  await expect(page).toHaveURL(/\/daily\/hive$/);
  await expect(page).not.toHaveURL(/\?/);
});

test('the tab title follows the address', async ({ page }) => {
  // titleOf has never been asserted anywhere, including that it is wired up
  for (const [path, title] of [
    ['/daily/hive', /Hive/],
    ['/solve/guess', /Guess/],
    ['/about', /About/],
    ['/legal/privacy', /Privacy/],
    ['/reports', /Open reports/],
  ] as const) {
    await page.goto(path);
    await expect(page, `title for ${path}`).toHaveTitle(title);
  }
});

// ---------------------------------------------------------------------------
// Both known bugs, now fixed, kept as the tests that caught them.
// ---------------------------------------------------------------------------

test('closing a deep-linked panel actually closes it', async ({ page }) => {
  // It didn't. Landing on /legal/notices and switching to Privacy fell through
  // to a push — the replace branch required "we opened this panel", which a
  // deep link is not — and Close then stepped back onto the arrival entry,
  // which is *also* the panel. The button appeared to do nothing.
  //
  // Moving within a panel is a replace whoever opened it, so a deep-linked one
  // is never mistaken for ours, and Close goes somewhere instead of back.
  await page.goto('/legal/notices');
  await page.getByRole('dialog').getByRole('button', { name: 'Privacy' }).click();
  await expect(page).toHaveURL(/\/legal\/privacy$/);

  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).not.toHaveURL(/\/legal/);

  // and Back returns to the panel, because they really were there — the
  // deliberate choice over erasing a page somebody actually visited
  await page.goBack();
  await expect(page).toHaveURL(/\/legal\/privacy$/);
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('a menu link goes where its href says', async ({ page }) => {
  // It didn't. The anchor rendered `to="/stats/overall"` while the click
  // handler opened whichever tab was last used, and the tab survives closing —
  // so after one visit to Boards, middle-click and left-click went to different
  // pages. Fixed by computing the href from the same value the click uses, so
  // the two cannot disagree; this test reported the fix itself, by being a
  // `test.fail` that unexpectedly passed.
  // Stats was a footer link when this was written; it is in the bar's menu of
  // your own things now, which is a disclosure, so open it first each time.
  await page.setViewportSize({ width: 1280, height: 900 });
  const menu = page.getByRole('button', { name: 'Your stats and settings' });
  await page.goto('/');
  await menu.click();
  await page.getByRole('link', { name: 'Stats' }).click();
  // plain buttons rather than a tablist — worth marking up properly one day,
  // but that is not what this test is about
  await page.getByRole('dialog').getByRole('button', { name: 'Boards' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();

  await menu.click();
  const stats = page.getByRole('link', { name: 'Stats' });
  const href = await stats.getAttribute('href');
  await stats.click();
  expect(new URL(page.url()).pathname, `href said ${href}`).toBe(href);
});
