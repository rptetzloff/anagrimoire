// Bridge, on the things that make it different from the rest: the rule is
// membership in the word list rather than a stored answer, a hint is spent on
// one prompt rather than the board, and the solver can legitimately return more
// than one word where the daily never does.
import { expect, test } from './fixtures';

const rows = (page: import('@playwright/test').Page) =>
  page.getByRole('list', { name: 'bridges' }).locator('li');

test('the board gives five prompts and a hint budget', async ({ page }) => {
  await page.goto('/daily/bridge');
  await expect(rows(page)).toHaveCount(5);
  await expect(page.getByText(/0 \/ 5 found/)).toBeVisible();
  // easy grants three; the count is the difficulty setting, so it is on screen
  await expect(page.getByText(/\d+ left/)).toBeVisible();
});

test('a word that joins both sides is taken, and one that does not is refused', async ({
  page,
}) => {
  await page.goto('/daily/bridge');
  const input = page.getByRole('textbox', { name: /joins/ });
  await expect(input).toBeVisible();

  // The prompt is whatever the fixture holds today, so the answer is derived
  // rather than hardcoded: read the two ends off the row and search the same
  // way the game does. A hardcoded word would rot the day the feed moved.
  const first = await rows(page).first().locator('span.sr-only').innerText();
  const [x, , y] = first.trim().split(/\s+/);

  // something that is certainly not a word on either side
  await input.fill('zzz');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText(/is not a word/)).toBeVisible();
  await expect(rows(page).filter({ hasText: 'found' })).toHaveCount(0);

  // and the real answer, found by asking the page's own solver for it
  await page.goto('/solve/bridge');
  await page.getByRole('textbox', { name: 'first' }).fill(x);
  await page.getByRole('textbox', { name: 'second' }).fill(y);
  const answer = await page
    .getByRole('main')
    .locator('ul li')
    .first()
    .innerText({ timeout: 20000 })
    .then((t) => t.trim().slice(x.length, t.trim().length - y.length));

  await page.goto('/daily/bridge');
  const again = page.getByRole('textbox', { name: /joins/ });
  await again.fill(answer);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText(/1 \/ 5 found/)).toBeVisible();
  await expect(rows(page).filter({ hasText: 'found' })).toHaveCount(1);
});

// The whole difficulty setting, so it gets a check: a hint applies to the row
// you are on and comes out of a budget, rather than lighting up the board.
test('a hint is spent on one prompt and comes out of the budget', async ({ page }) => {
  await page.goto('/daily/bridge');
  await expect(page.getByText(/3 left/)).toBeVisible();
  await page.getByRole('button', { name: 'Length' }).click();
  await expect(page.getByText(/2 left/)).toBeVisible();
  // exactly one row now states a length; the other four are untouched
  await expect(rows(page).filter({ hasText: /\d+ letters/ })).toHaveCount(1);
});

test('the solver lists every word that joins two ends, not just one', async ({ page }) => {
  await page.goto('/solve/bridge');
  await page.getByRole('textbox', { name: 'first' }).fill('snow');
  await page.getByRole('textbox', { name: 'second' }).fill('room');
  // snowball/ballroom and snowboard/boardroom are both real, which is the
  // reason the solver returns a list: the daily only publishes prompts with a
  // single answer, and the solver says what is true rather than what shipped
  // the page's own list: the bar's phone tabs are a list too, hidden by CSS
  const results = page.getByRole('main').locator('ul li');
  await expect(results).toHaveCount(2, { timeout: 20000 });
  await expect(results.first()).toHaveText(/snow\s*ball\s*room/i);
});

test('Learn is the real board, played', async ({ page }) => {
  await page.goto('/learn/bridge');
  const demo = page.locator('ol li span.sr-only');
  await expect(demo.first()).toHaveText(/snow blank park/);
  // typed at the document, the way the demo listens
  for (const ch of 'ball') await page.keyboard.press(ch);

  // The word list is a real download and the demo says so rather than
  // swallowing the keypress, which is what this retry is waiting out. The
  // entry survives a refused submit, so pressing again is all it takes —
  // and this is how the loading case was found in the first place.
  await expect
    .poll(
      async () => {
        await page.keyboard.press('Enter');
        return demo.first().innerText();
      },
      { timeout: 30000, message: 'the demo never accepted BALL' }
    )
    .toMatch(/snow ball park, found/);
});
