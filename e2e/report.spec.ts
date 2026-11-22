// Reporting, from the two places a player can do it, on the thing that makes
// a report worth acting on: what leaves the browser.
//
// The unit test asserts the same rule against the transport. This one asserts
// it against the actual button, because between the two there is a dialog, a
// difficulty, and a date — and the date in particular is the puzzle's own
// rather than today's, which is a distinction no amount of typechecking makes.
import { expect, test } from './fixtures';

/** Open the footer's report menu. */
async function openReportMenu(page: import('@playwright/test').Page) {
  const button = page.getByRole('button', { name: 'Report a problem' });
  await button.scrollIntoViewIfNeeded();
  await button.click();
  return button;
}

test('reporting a player sends the name and the reason, and nothing else', async ({
  page,
  rpcCalls,
}) => {
  await page.goto('/stats/boards');

  // One flag per row, and the fixture's player is on four boards — so this
  // takes the first rather than the only. A bare locator here failed on strict
  // mode, which is the assertion doing its job: the button is per row, not per
  // player, and a player on four boards is reportable from any of them.
  const flag = page.getByRole('button', { name: /^Report Anagrimoire$/ }).first();
  await expect(flag).toBeVisible();
  await flag.click();

  const dialog = page.getByRole('dialog', { name: /Report this player/i });
  await expect(dialog).toBeVisible();
  // two textboxes now, the reason and the optional address — named rather
  // than positional, or this passes by typing into the wrong one
  await dialog.getByRole('textbox', { name: /What.s wrong with it/i }).fill('the name is a slur');
  await dialog.getByRole('button', { name: 'Send report' }).click();

  await expect(dialog.getByText(/Thank you/)).toBeVisible();
  // the reference, which is the difference between a report and a thank-you
  await expect(dialog.getByText('4f2ba9c17d')).toBeVisible();

  const sent = rpcCalls.filter((c) => c.fn === 'report_player');
  expect(sent).toHaveLength(1);
  // exactly two fields: who, and why. No rank, no score, no board.
  expect(Object.keys(sent[0].args).sort()).toEqual(['p_email', 'p_name', 'p_reason']);
  expect(sent[0].args.p_name).toBe('Anagrimoire');
});

test('reporting a puzzle sends where it was, never what it said', async ({ page, rpcCalls }) => {
  await page.goto('/daily/bridge');

  await openReportMenu(page);
  await page.getByRole('button', { name: /^A puzzle/ }).click();

  const dialog = page.getByRole('dialog', { name: /Report a puzzle/i });
  await expect(dialog).toBeVisible();
  // the reason is optional, and a report with none is still a signal
  await dialog.getByRole('button', { name: 'Send report' }).click();
  await expect(dialog.getByText(/Thank you/)).toBeVisible();

  const sent = rpcCalls.filter((c) => c.fn === 'report_puzzle');
  expect(sent).toHaveLength(1);
  expect(Object.keys(sent[0].args).sort()).toEqual([
    'p_date',
    'p_difficulty',
    'p_email',
    'p_env',
    'p_game',
    'p_reason',
  ]);
  expect(sent[0].args.p_game).toBe('bridge');
  // a date, and the board's own — not a board, not a prompt, not an answer
  expect(String(sent[0].args.p_date)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  const located = { ...sent[0].args } as Record<string, unknown>;
  delete located.p_reason;
  expect(JSON.stringify(located)).not.toMatch(/board|prompt|answer|cells|letters/i);
});

test('the dialog closes on Escape and hands focus back', async ({ page }) => {
  await page.goto('/daily/bridge');
  const flag = await openReportMenu(page);
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(flag).toBeFocused();
});

test('a ticket looks itself up, and a wrong one says so plainly', async ({ page }) => {
  await page.goto('/report/4f2ba9c17d');
  await expect(page.getByText('Still open')).toBeVisible();
  // and it replaces the board rather than sitting over it: gating only the
  // home page left a playable puzzle rendered underneath the ticket
  await expect(page.getByRole('textbox', { name: /next rung|Letters to/i })).toHaveCount(0);
  await expect(page.locator('main').getByRole('button', { name: /^Start$/ })).toHaveCount(0);

  await page.goto('/report/notaticket');
  // A wrong code and a real one read alike on the server; this is as much as
  // the page can honestly say, and it must not imply the code was malformed.
  await expect(page.getByText(/Nothing found under that reference/)).toBeVisible();
});

test('the owner action page refuses without an owner signed in', async ({ page }) => {
  await page.goto('/report/act/00000000-0000-0000-0000-000000000001/deadbeef/dismiss');
  await expect(page.getByText('Not allowed')).toBeVisible();
  // and it must not have shown the report on the way to refusing
  await expect(page.getByText(/The evidence/)).toHaveCount(0);
  // nor a playable board underneath it — same gap as the ticket page, since
  // both are whole views and only the home page was being stood down
  await expect(page.getByRole('textbox', { name: /next rung|Letters to/i })).toHaveCount(0);
  await expect(page.locator('main').getByRole('button', { name: /^Start$/ })).toHaveCount(0);
});

// The failure this replaced: the report link hung off a date the game had to
// volunteer through the daily bus, and six of the ten games keep their date
// somewhere the gate never saw — so it was quietly absent on Guess, Scramble,
// Hive, Grid, Boxed and Ladder. Nothing failed, because a control that isn't
// rendered doesn't throw. This walks all ten.
const GAMES = [
  'guess', 'scramble', 'hive', 'grid', 'boxed',
  'squares', 'weave', 'cryptogram', 'ladder', 'bridge',
];

test('every game can be reported from, and so can the front page', async ({ page }) => {
  test.slow();
  const missing: string[] = [];
  for (const slug of [...GAMES.map((g) => `/daily/${g}`), '/', '/stats/boards']) {
    await page.goto(slug);
    if (!(await page.getByRole('button', { name: 'Report a problem' }).isVisible())) {
      missing.push(slug);
    }
  }
  expect(missing, `no way to report from: ${missing.join(', ')}`).toEqual([]);
});

test('a site problem insists on words, because there is nothing to look up', async ({
  page,
  rpcCalls,
}) => {
  await page.goto('/');
  await openReportMenu(page);
  await page.getByRole('button', { name: /^A problem with the site/ }).click();

  const dialog = page.getByRole('dialog', { name: /Report a problem with the site/i });
  const send = dialog.getByRole('button', { name: 'Send report' });
  // empty is not a report here: a puzzle report with no words still points at
  // a board, and this points at nothing
  await expect(send).toBeDisabled();

  await dialog.getByRole('textbox', { name: /What.s wrong with it/i }).fill('the board is upside down');
  await expect(send).toBeEnabled();
  await send.click();
  await expect(dialog.getByText(/Thank you/)).toBeVisible();

  const sent = rpcCalls.filter((c) => c.fn === 'report_general');
  expect(sent).toHaveLength(1);
  expect(sent[0].args.p_kind).toBe('site');
});

test('the owner queue is invisible to everyone else', async ({ page }) => {
  // Signed out, which is how these tests run. The link is a link and the RPCs
  // behind it check again on the server — but a queue advertised to visitors
  // is an invitation to try the door, and there is no reason to extend one.
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Open reports' })).toHaveCount(0);

  // and the page itself answers with nothing rather than an error, because an
  // empty list is the honest reply to "show me what I may see"
  await page.goto('/reports');
  await expect(page.getByRole('heading', { name: 'Open reports' })).toBeVisible();
  await expect(page.getByText('Nothing open.')).toBeVisible();
});

test('a closed ticket says what was decided, in the words that were written', async ({ page }) => {
  // The note reached the reporter by email but not on their own ticket page,
  // which made two promises out of one field: a reporter who left an address
  // was told why, and one who didn't got a note written for them that they
  // could never read.
  await page.goto('/report/c105ed0000');
  // exact, because getByText is a case-insensitive substring match and the
  // date line underneath says "closed 8/16/2026"
  await expect(page.getByText('Closed', { exact: true })).toBeVisible();
  await expect(page.getByText(/won.t be published again/)).toBeVisible();
  await expect(page.getByText('Blocked the word and rebuilt the bands.')).toBeVisible();

  // and an open one has nothing to say beyond that it is open
  await page.goto('/report/4f2ba9c17d');
  await expect(page.getByText('Still open')).toBeVisible();
  await expect(page.getByText(/Blocked the word/)).toHaveCount(0);
});

// Every report page is the whole page. This began as "does it render a board",
// which it no longer did — while the Solve/Play/Learn switch, the difficulty
// tabs, the dictionary picker and the game's own strapline all carried on
// underneath, because they were separate sections and only two were gated.
// Asserting the chrome is gone, not just the board.
for (const [name, path] of [
  ['the queue', '/reports'],
  ['a ticket', '/report/4f2ba9c17d'],
  ['the action page', '/report/act/00000000-0000-0000-0000-000000000001/deadbeef/dismiss'],
] as const) {
  test(`${name} wears none of the game's chrome`, async ({ page }) => {
    await page.goto(path);
    const main = page.locator('main');
    await expect(main.getByRole('button', { name: 'Solve', exact: true })).toHaveCount(0);
    await expect(main.getByRole('button', { name: 'Play', exact: true })).toHaveCount(0);
    await expect(main.getByRole('button', { name: 'Learn', exact: true })).toHaveCount(0);
    await expect(main.getByText('Word list', { exact: true })).toHaveCount(0);
    await expect(main.getByText('Difficulty', { exact: true })).toHaveCount(0);
    await expect(main.getByText(/^Play the .*puzzle/)).toHaveCount(0);
    // the address survives, which is the other half: it used to be rewritten
    // to whichever game was loaded behind, so a refresh landed elsewhere
    expect(new URL(page.url()).pathname).toBe(path);
  });
}

test('privacy and security have their own doors, and security names a better one', async ({
  page,
  rpcCalls,
}) => {
  await page.goto('/');
  await openReportMenu(page);
  await page.getByRole('button', { name: /^A security problem/ }).click();

  const dialog = page.getByRole('dialog', { name: /Report a security problem/i });
  // The private advisory is offered first, because a report table can't give
  // a disclosure process and GitHub's form can. The form stays open anyway —
  // somebody who found a hole should not be turned away for lacking an account.
  const advisory = dialog.getByRole('link', { name: /private security advisory/i });
  await expect(advisory).toHaveAttribute(
    'href',
    'https://github.com/rptetzloff/anagrimoire/security/advisories/new'
  );

  await dialog.getByRole('textbox', { name: /What.s wrong with it/i }).fill('a way in');
  await dialog.getByRole('button', { name: 'Send report' }).click();
  await expect(dialog.getByText(/Thank you/)).toBeVisible();

  const sent = rpcCalls.filter((c) => c.fn === 'report_general');
  expect(sent).toHaveLength(1);
  expect(sent[0].args.p_kind).toBe('security');
});

test('a filed report hands over a link, not just a code', async ({ page }) => {
  // A ten-character string with a Copy button beside it is a code somebody has
  // to work out what to do with. The address is the instruction and the
  // reference at once, and it survives being pasted into a note to yourself.
  await page.goto('/');
  await openReportMenu(page);
  await page.getByRole('button', { name: /^A problem with the site/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: /What.s wrong with it/i }).fill('something');
  await dialog.getByRole('button', { name: 'Send report' }).click();

  const link = dialog.getByRole('link', { name: /report\/4f2ba9c17d/ });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', '/report/4f2ba9c17d');
});

// The claim the dialog makes about the address has to be true of the code, not
// just of the sentence. The three surfaces a person could see it on are the
// queue, the action page, and the digest — the first two never ask the server
// for it, and the digest says only that somebody asked to be told.
test('the address is not carried onto any surface that shows a report', async ({
  page,
  rpcCalls,
}) => {
  await page.goto('/');
  await openReportMenu(page);
  await page.getByRole('button', { name: /^A problem with the site/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: /What.s wrong with it/i }).fill('something');
  await dialog.getByLabel(/Email, if you.d like/i).fill('someone@example.com');
  await dialog.getByRole('button', { name: 'Send report' }).click();
  await expect(dialog.getByText(/Thank you/)).toBeVisible();

  // it goes to the server, because that is what it is for
  const sent = rpcCalls.filter((c) => c.fn === 'report_general');
  expect(sent[0].args.p_email).toBe('someone@example.com');

  // and the two owner-facing reads never ask for it back
  rpcCalls.length = 0;
  await page.goto('/reports');
  await page.goto('/report/act/00000000-0000-0000-0000-000000000001/deadbeef/dismiss');
  const asked = rpcCalls.map((c) => c.fn);
  expect(asked).not.toContain('open_reports');
  expect(asked).not.toContain('unsent_outcomes');
  await expect(page.getByText('someone@example.com')).toHaveCount(0);
});

test('About can open the report menu, and Escape closes only that', async ({ page }) => {
  await page.goto('/about');
  // a page since the layout spec, so the FAQ is the main content, not a dialog
  const about = page.locator('main');
  await expect(about.getByRole('heading', { level: 1, name: /^About / })).toBeVisible();

  // named in the sentence rather than described, so it can be used from where
  // it is explained
  // the one in the FAQ's answer, not the footer's
  await about.getByRole('paragraph').filter({ hasText: 'at the bottom of any page' })
    .getByRole('button', { name: 'Report a problem' }).click();
  const chooser = page.getByRole('dialog', { name: /What would you like to report/ });
  await expect(chooser).toBeVisible();

  // Every open dialog listens for Escape on the document, so one press used to
  // close the whole stack — losing the page you were reading as well as the
  // thing you meant to cancel.
  await page.keyboard.press('Escape');
  await expect(chooser).toHaveCount(0);
  // and the page you were reading is still there, at its address
  await expect(about.getByRole('heading', { level: 1, name: /^About / })).toBeVisible();
  await expect(page).toHaveURL(/\/about$/);
});

test('the legal pages route people to the form, and name the right addresses', async ({ page }) => {
  await page.goto('/legal/privacy');
  const privacy = page.locator('main');
  await expect(privacy.getByRole('link', { name: 'privacy@anagrimoire.com' }).first()).toBeVisible();
  await expect(privacy.getByRole('link', { name: 'support@anagrimoire.com' })).toBeVisible();

  // and the form is openable from the sentence that names it
  // three of them on this page, and role-name matching is case-insensitive, so
  // "The report form" also matches the two lowercase mentions
  await privacy.getByRole('button', { name: 'The report form' }).first().click();
  const chooser = page.getByRole('dialog', { name: /What would you like to report/ });
  await expect(chooser.getByRole('button', { name: /^A privacy concern/ })).toBeEnabled();
  // no board behind a legal page, so that option says so rather than opening a
  // form that cannot be sent
  await expect(chooser.getByRole('button', { name: /^A puzzle/ })).toBeDisabled();
  await page.keyboard.press('Escape');

  await page.goto('/legal/terms');
  const terms = page.locator('main');
  // security has its own address and its own route, and no longer points at
  // public issues — an open issue publishes the hole before it is fixed
  await expect(terms.getByRole('link', { name: 'security@anagrimoire.com' })).toBeVisible();
  await expect(
    terms.getByRole('link', { name: /private security advisory/i })
  ).toHaveAttribute('href', /security\/advisories\/new$/);
  await expect(terms.getByRole('link', { name: /GitHub issues/ })).toHaveCount(0);
});
