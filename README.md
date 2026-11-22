# Anagrimoire

Ten word games, each with a solver behind it, a fresh puzzle every morning, and a guided demo. Solve by pattern — lock in the letters you know by position, list the letters that must appear somewhere, exclude the rest — descramble a rack, crack a Spelling Bee hive, find two-word Letter Boxed solutions, trace a Strands-style board, fill a word square, break a substitution cipher, climb a word ladder, or find the word that joins SNOW to ROOM.

*Vibe-coded with [Claude](https://claude.com/claude-code).*

**Live site:** [anagrimoire.com](https://anagrimoire.com) · **Dev preview:** [dev.anagrimoire.com](https://dev.anagrimoire.com)

## Features

### Solver modes

- **Guess the Word** (Wordle, crosswords, hangman) — word lengths from 3 to 12; tile inputs for known positions, must-contain letters (position unknown, duplicates respected), and excluded letters, with per-letter highlighting in the results
- **Scramble** (Scrabble, Jumble) — find every word a rack of letters can spell, with `?` wildcards for blank tiles, an exact-anagram "use every letter" option, and a minimum-length filter
- **Hive** (Spelling Bee-style) — seven letters entered on a hive (amber center, six around), 4+ letter words, center letter required, letters reusable; pangrams surface in their own highlighted group, and today's NYT puzzle autofills with one click for solving
- **Grid** (Boggle-style) — enter the letters of a 3×3, 4×4, or 5×5 square and find every word traceable through adjacent cells (diagonals count), each cell used once per word
- **Boxed** (Letter Boxed-style) — twelve letters entered around a square, 3+ letter words, letters reusable, but consecutive letters can't share a side. Pick a solution length (1–5 words) to see chains covering all twelve letters, get a starred recommendation (fewest words, everyday vocabulary, fewest letters), hover any word or solution chain to trace its criss-cross path on the box, or autofill today's NYT puzzle with one click (a daily GitHub Action publishes Letter Boxed and Spelling Bee data to the `puzzle-data` branch about 15 minutes after the NYT publishes at 3:00 a.m. Eastern)
- **Squares** — type the letters you're sure of in a 4×4 or 5×5 grid and it fills the rest so that every row *and* every column spells a word, showing several ways where more than one fits
- **Word Ladder** — give it two words of the same length and it finds the shortest route between them, every rung a real word one letter from the last
- **Bridge** — give it two words and it finds every word that ends the first compound and starts the second
- **Cryptogram** — still being built: a cipher solver has to offer the readings that fit rather than guess one, which is a different thing from the word solvers

The Scramble, Hive, Grid, Boxed, and Weave solvers can autofill **today's daily puzzle** (ours) with one click; Hive, Boxed, and Weave can also load **today's NYT puzzle** (Spelling Bee, Letter Boxed, Strands).

### Play mode

Every mode has a **Solve / Play / Learn** switch, beside the game's name at the top of its page. On a wide screen the games run down the left — today's, with how far you've got in each, while playing; the solvers while solving; the lessons while learning — and while playing, the right-hand column holds that game's leaderboard at the difficulty you're on.

- **Guess the Word**: six tries at any length from 3 to 12 letters, duplicate-aware coloring, physical and on-screen keyboard support (with letter coloring), and persistent boards and stats. **Daily** serves the same word to everyone per length — generated deterministically by the daily GitHub Action — with a win streak; **Practice** deals unlimited random words. Answers come from the word list one rung below what's accepted, so the answer is always recognisable while guesses get the benefit of the doubt.
- **Scramble**: a three-minute sprint to find every word you can from a seven-letter rack (each letter usable once per word). Racks are shuffled real words, so a full-rack bonus word always exists, and are dealt so the rack never reads as a word itself; 3-letter words score 1, longer words their length, whole-rack +7. When time's up, one click reveals every answer in the solver. **Daily** rack for everyone; **Practice** deals unlimited racks.
- **Grid** (Boggle-style): a three-minute sprint to find every word you can trace through the 4×4 grid, with classic scoring (3–4 letters 1 pt, 5: 2, 6: 3, 7: 5, 8+: 11). Cells stay face-down until you press Start. **Daily** grids roll from the classic dice distributions — 4×4 at Easy, 5×5 above (Big Boggle dice), with Extreme differing from Hard in what scores rather than in the board; **Practice** deals unlimited grids at whatever difficulty is set.
- **Box** (Letter Boxed-style): chain words around the square to use all twelve letters — each word starts with the previous word's last letter, consecutive letters can't share a side. Boxes are our own, built from two chainable words so a two-word solution always exists; **Daily** is the same generated box for everyone, **Practice** deals unlimited boxes. Backspace un-commits words for editing. The current entry draws its criss-cross line live on the box, and hovering a committed word traces its path. **Help** peeks at the solver mid-game; **Reveal** gives up, ending the board unfinished (no solve is recorded).
- **Hive**: find words from seven letters — 4-letter words score 1, longer words score their length, pangrams +7 — with a rank ladder up to Queen Bee, scored against the word list for the difficulty you're playing. **Daily** plays our own generated hive (the same one for everyone, seeded from a pangram so it's always completable — not the NYT's puzzle); **Practice** deals unlimited fresh hives. Tap the hive or type; shuffle, delete, and found-word history included. **Help** peeks at the solver mid-game; **Reveal** gives up, ending the hive unfinished.

- **Weave** (Strands-style): themed words tile the whole board — every letter used exactly once, with a spangram spanning the board. Drag to trace; theme words lock blue, the spangram gold, other dictionary words (4+ letters) bank toward hints that outline an unfound word, and a Reveal gives up gracefully. Completion (either way) draws every word's path as a line overlay. Puzzles are generated from a curated theme file with a subset-sum + backtracking packer. **Daily** boards are 6, 7 or 8 wide as the difficulty climbs; **Practice** draws from a daily pool at the same widths. Weave also has a Solve mode: enter any 6×8 Strands or 8×10 board (or autofill today's NYT Strands with its theme clue) to list every traceable word, hover to see its path.
- **Word Squares**: fill a grid so every row and every column is a word. Some letters are given and the rest are yours; a bar beside each line turns green when that line is a word and red when it's full but isn't. The shape follows the difficulty — a 4×4 with eight letters given at Easy, a 5×5 with ten at Hard, and a 5×5 with six at Extreme — with boards kept per size, since a 4×4 and a 5×5 aren't the same puzzle. Boards are generated so that ten *different* words appear (five read twice would be half a puzzle) and exactly one filling works. **Practice** draws from a daily pool.
- **Cryptogram**: a public-domain passage under a substitution cipher — every letter stands for another, the same way throughout, and passages are screened so the answer is actually deducible (and unique). Easy's key keeps a discoverable shortcut, Hard's takes it away, and Extreme also deals a shorter passage — fewer letters is less to reason from.
- **Word Ladder**: turn the first word into the last, one letter at a time, every rung a real word, against a stated par. A wrong rung is refused rather than recorded, and the refusal names the rule it broke. The rungs climb with difficulty — 3–4 letters at Easy, 5–6 at Hard, 7–8 at Extreme.
- **Bridge**: five prompts, each SNOW · ? · ROOM — the answer ends the first compound and starts the second. Hints spend from a budget, and each reveals one word's answer length or its next letter: Easy gets three, Hard one, Extreme none, so choose wisely.

Daily content refreshes about 15 minutes after 3:00 a.m. Eastern. The dev site (and local development) gets its own independently generated daily set, so testing there never spoils the production puzzles.

Dailies are served from Postgres first and the published files second: a scheduled workflow generates a rolling fortnight of boards into a `daily_puzzles` table whose only public door is a security-definer RPC that takes no date parameter and never serves past today Eastern — so future rows sit there as outage insurance while remaining unaskable. A secret salt mixes into every generation seed, so the boards aren't computable from this repo either; the `puzzle-data` branch remains as the client's fallback feed. A GitHub outage costs nothing for two weeks, and a Supabase outage costs a slower first load, not the puzzle.

#### Difficulty

Every daily comes in three — **Easy**, **Hard** and **Extreme** — and they're three separate puzzles, not one puzzle with a setting: each keeps its own progress, statistics, streaks and leaderboards, and playing all three is the intended mode (a lock option pins one for people who want no decision). What changes depends on the game: Guess, Scramble, Hive and Boxed draw their answers from progressively less common word bands (exclusive bands, so Extreme practises Extreme rather than a third easy words); Squares and Weave grow their boards; Grid keeps its dice and widens what scores; the Ladder's words lengthen; Cryptogram hardens its key and then shortens its passage; Bridge shrinks its hint budget from three to one to none. What a difficulty *accepts* is one band wider than what it *asks*, so answers stay recognisable while long-shot guesses get the benefit of the doubt.

When accounts are configured, each daily also shows a one-line **global summary** once you finish (player count, solve rate, averages — e.g. "12 players · 75% solved · avg 2 hints"). The numbers are anonymous aggregates over signed-in players' synced results, computed by a security-definer SQL function that exposes only totals, and they're visible to everyone — signing in is how you contribute, not how you see them.

### Word lists

One published, versioned artifact ([src/wordbands/](src/wordbands/)), built by `npm run build-words` from SCOWL and nothing else — via wordlist-english up to size 70, and SCOWL's own "huge" (80) list, vendored in [scripts/scowl/](scripts/scowl/), for the top tier: six exclusive bands that every pool is a union of. Generation is one band, acceptance is the bands up to a cut (55 / 70 / 80), and every tier is a size SCOWL itself defined. The same build seeds the Postgres `words` table, so the client and the database cannot disagree by construction. In production the bands come from jsDelivr at a pinned tag with the bundled copies as fallback; the solver's **Easy / Hard / Extreme** lists are exactly the difficulties' accept tiers, so a word the solver finds is a word that scores.

The files are a public release channel — anyone can read them (these track `main` and update within hours of a release; pin a tag instead — `@words-v6` — if you need URLs whose content never changes (`WORDS_VERSION` in [src/dictionaries.ts](src/dictionaries.ts) names the current one)):

| File | Contents |
|---|---|
| [band-10.json](https://cdn.jsdelivr.net/gh/rptetzloff/anagrimoire@main/src/wordbands/band-10.json) | SCOWL ≤ 10 — 3,973 words everybody knows |
| [band-20.json](https://cdn.jsdelivr.net/gh/rptetzloff/anagrimoire@main/src/wordbands/band-20.json) | 10 < level ≤ 20 — 6,928 words |
| [band-35.json](https://cdn.jsdelivr.net/gh/rptetzloff/anagrimoire@main/src/wordbands/band-35.json) | 20 < level ≤ 35 — 28,197 words |
| [band-55.json](https://cdn.jsdelivr.net/gh/rptetzloff/anagrimoire@main/src/wordbands/band-55.json) | 35 < level ≤ 55 — 28,072 words |
| [band-70.json](https://cdn.jsdelivr.net/gh/rptetzloff/anagrimoire@main/src/wordbands/band-70.json) | 55 < level ≤ 70 — 44,236 words |
| [band-80.json](https://cdn.jsdelivr.net/gh/rptetzloff/anagrimoire@main/src/wordbands/band-80.json) | 70 < level ≤ 80 — 131,250 words |
| [domains.json](https://cdn.jsdelivr.net/gh/rptetzloff/anagrimoire@main/src/wordbands/domains.json) | WordNet noun categories for 73,031 words, as arrays |
| [blocked-words.json](https://cdn.jsdelivr.net/gh/rptetzloff/anagrimoire@main/src/wordbands/blocked-words.json) | The generation blocklist — 593 entries, each with its origin, scope, and (for the hand-added ones) the reason |

Each band is `{ version, words, flags }` — words alphabetical, flags a sparse map (`slur` / `strong` / `mild`) present only for flagged words. **Use them for anything** — no permission needed; they carry SCOWL's and WordNet's permissive notices ([scripts/scowl/Copyright.txt](scripts/scowl/Copyright.txt), and the credits in the site's Legal page), and our packaging is MIT like the rest of the repo.

Words carry content flags: **slur** never scores and is never shown, at any difficulty under any setting; **strong** and **mild** score, and a Settings control lets a player hide them from solver results and missed-word lists — display only, so everyone on a board plays the same rules. The generation blocklist lives beside the bands and governs what we'll publish as an answer, which is a different question from what a player may type: its `both`-scope entries are refused in both directions, while `generation`-scope words (the ones with an ordinary sense — a chink of light, the verb retard) are never dealt but always accepted. The word build reads the blocklist's slurs to set the `slur` flag, so the two judgements cannot drift; the **Rebuild word lists** workflow refreshes blocklist, bands, CSV, and the Postgres tables in one run. WordNet noun categories for ~75k words ride along in a shared `domains.json` for other projects and, someday, themed generation.

### Quality of life

- **Live results** computed entirely in the browser — nothing leaves your device
- **Quick solve** — the box in the bar at the top (inside the Solvers menu on narrower screens) takes one line: a pattern with `?` for each unknown letter, like `c?a?t`, opens the Guess solver with those letters in place, and letters alone open Scramble's. Anything else gets a sentence saying what the box takes; the solvers that need a shape — a hive, a box, a grid — are a click away in the same menu
- **Sorting** — alphabetical asc/desc everywhere; Descramble and Spelling Bee also sort by word length with results grouped per length
- **Click any result to copy it** to the clipboard
- **Smart letter tiles** — typing auto-advances to the next box, Backspace steps back, arrow keys navigate, and filled tiles get a small × pill to clear them
- **Letter-pill inputs** — multi-letter fields (must contain, excluded, rack) show each letter as a removable pill with a corner ×
- **Toggleable on-screen keyboard** — fluid-width QWERTY panel that fits any screen, with a `?` key for blank tiles in Descramble; while open, the device's native keyboard stays suppressed
- **Themes & accessibility** — a Settings page (in the menu under the person icon at the top, or **Me** on a phone) offers light, dark, or system appearance plus four color palettes: **Default**, **Red–green friendly** (deuteranopia/protanopia — blue and orange replace green and amber, on Okabe-Ito hues), **Blue–yellow friendly** (tritanopia — green against vermilion, the axis those eyes keep), and **Monochrome** (no hue at all; game states separate by lightness). Every color resolves through CSS variables. All eight theme × palette combinations were audited to meet WCAG AA contrast, and the game states were checked to stay distinguishable under simulated deuteranopia, protanopia, and tritanopia. A text-size setting (normal / large / larger) scales the whole page, and browser zoom and font-size preferences still compound on top — every size in the app is expressed in relative units. Verified against WCAG 1.4.4 (text at 200%), 1.4.10 (reflow at 320px, including the 8×10 board, the on-screen keyboard, and every dialog), and 1.4.12 (text-spacing overrides) with no clipping or horizontal scrolling. Settings persist locally and sync to your account when signed in.
- **Share your result** — every game offers a spoiler-free summary once it's finished: Guess posts the familiar coloured tile grid, Weave one mark per word in the order you found them (gold for the spangram, a bulb per hint), and the rest a score-and-rank line. Emoji follow your palette, so what you post matches what you saw. **Nothing shared ever contains a letter or a word** — not even Weave's theme clue, since working that out is half the puzzle. Uses the native share sheet on phones and the clipboard elsewhere.
- **Keyboard accessible** — a skip link jumps past the bar at the top to the puzzle, every focusable control shows a high-contrast focus ring, and dialogs move focus in, trap Tab, close on Escape, and hand focus back to whatever opened them. Every game is playable by keyboard: the typing games listen directly, and Weave's board (a single tab stop) gets a cursor you steer with the arrow keys plus a diagonal ring — number pad `7 8 9 / 4 6 / 1 2 3` or `Q W E / A D / Z S X`, selectable in Settings with a diagram of the chosen layout. Enter starts a word and submits it, Backspace steps back — and every reachable cell shows its key in the corner, so the next move is never a guess. You still have to find the word on the board. A **Keys** page, in the same menu as Settings, lists every shortcut.
- **Learn mode** — every game has a third Solve / Play / **Learn** tab: rules, scoring, daily/practice differences, tips, and a hands-on interactive demo (step through a worked Guess solve, tap out words on a mini rack/hive/box, drag-trace a mini grid or Weave board) validated against the real dictionary
- **You choose what's remembered** — a first visit asks two separate questions, because they aren't the same question: what stays on this device, and whether analytics may leave it. Storage has two answers — **Keep essentials only** (just your privacy answers, which have to be remembered to be honoured; every game and solver still works in full, and closing the tab starts over) and **Keep my games and settings** (boards, settings, statistics and your sign-in kept in this browser). There's deliberately no third setting for whether anything may reach the server, because signing in already is that answer — so you can sign in under either, and under the first the session is simply held in memory. Changeable later under Settings → Privacy; choosing less clears what was already there. Everything in the app reads and writes through one gate, so the setting is enforced in a single place rather than in every game
- **Statistics, history and boards** — a Stats page under **Boards** (also in the same menu as Settings) with five tabs, each its own address (`/stats/overall` … `/stats/boards`), and a By game summary beside the totals. **Overall / Daily / Practice** are lifetime totals: Guess win rate, streak and distribution; Hive words, pangrams, Genius and Queen Bee; Scramble and Grid sprint scores; Boxed solves with fewest words and best time; Weave solves, reveals and hints; Word Squares solves and best time, kept per board size. **History** plots your dailies day by day — Guess as a distribution plus a table per word length, the rest as sparklines, with streaks counted off puzzle dates rather than a stored counter. **Boards** ranks everyone who has set a display name, one board per difficulty — a time at Easy and a time at Extreme aren't the same event — with Easy/Hard/Extreme tabs there, on the home page, and in History. Signed out it's all local; signed in it's your account's.
- **Real addresses** — every state has a URL and the address bar follows you: `/solve/guess`, `/play/hive`, `/daily/squares`, `/learn/grid`, `/stats/history`, `/settings/games`, `/legal/privacy`, `/report/<ticket>`. Stats, Settings, Account, Keys, About and Legal are pages, not panels over the game: each tab is its own address, and Back walks back through them like any other page. (They were panels until November 2026, whose Close stepped Back and whose tabs replaced one another.) Older spellings still work and rewrite themselves on arrival — both the `?daily=hive` query links and `/solve/pattern`, from when Guess was called Pattern.
- **A front page** — `/` opens on how today is going: how many of the ten are done, a bar of them, and a button to continue the one you started (or play the next). Below, the ten games with today's state on each (read from your own browser, so it works signed out), and beside them the top of today's boards and a way into every solver. Regulars who'd rather skip it can set Settings → Site → Start on to a game, or to wherever they left off.

## Getting started

```sh
npm install
npm run dev
```

Other scripts:

| Command | Purpose |
|---|---|
| `npm run build` | Production build via Vite |
| `npm run preview` | Preview the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript type check |
| `npm test` | Unit tests + the feed contract (vitest) |
| `npm run test:e2e` | Browser tests incl. WCAG scans (Playwright) |
| `npm run build-words` | Rebuild the word-list artifact: bands, flags, domains, CSV |
| `npm run blocklist` | Refresh the generation blocklist from its sources |
| `node scripts/report-digest.mjs` | The daily report round: digest, receipts, outcomes |

## Testing

CI runs six gates on every push and pull request ([ci.yml](.github/workflows/ci.yml)): typecheck, lint, the unit rules (`tests/unit/`), the feed contract (`tests/contract/` — runs the real puzzle generator for a pinned date with the NYT fetches skipped, and asserts everything the client relies on, from board shapes to "no blocked word is ever published"), a production build, and a Playwright pass (`e2e/`) where every network the app talks to is stubbed, so a red run is ours rather than an outage's. The browser job scans every route against WCAG 2.1 A/AA with axe: all four views of all ten games, plus Stats, About, Keys, the settings tabs and the legal pages. That is the mechanical half of accessibility; the judgment half stays a human's. Merging to `main` requires both jobs green.

## Tech stack

- [React 18](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Vite](https://vitejs.dev/) for build tooling
- [Tailwind CSS](https://tailwindcss.com/) for styling
- [Lucide](https://lucide.dev/) icons
- [wordlist-english](https://github.com/jacksonrayhamilton/wordlist-english) (MIT), built from [SCOWL](http://wordlist.aspell.net/) by Kevin Atkinson — the source of every word list band and every puzzle answer
- [WordNet](https://wordnet.princeton.edu/) (via wordnet-db) for noun categories in the shared word-list files, and for harvesting the Ladder and Bridge pools
- [Vitest](https://vitest.dev/) and [Playwright](https://playwright.dev/) (+ [axe-core](https://github.com/dequelabs/axe-core)) for the test suite

## Accounts & sync (optional)

The site is fully functional with no backend — solving and playing stay in the browser. Optionally, a [Supabase](https://supabase.com/) project adds sign-in (magic link, one-time code, GitHub or Google) and carries four things between devices:

- **Statistics.** Every completed practice game is appended to a per-user event log; the browser's pre-account totals are imported once as a baseline, and the Stats page replays baseline + log instead of reading the local store.
- **Dailies in progress.** A daily's board is one row per puzzle, merged rather than overwritten, so you can start on a phone and finish on a laptop — and can't accidentally play the same day twice. The merge rules are deliberate about deletions: erasing a letter has to survive the next sync, which a naive union would undo.
- **Settings.** Theme, palette, text size, which games are shown, and the start page.
- **A display name**, which is the opt-in to the leaderboards and the only thing about an account any other player can see. Without one you don't appear at all.

### Reporting

A generator drawing from 240,000 words will eventually publish something
offensive, and a display name field will eventually hold something worse. Both
have preventive filters, and neither is a substitute for someone saying "this
one is wrong" at the moment they see it. So every daily board has **Report
this puzzle** beside it throughout play (in the column to its right on a
desktop, under it on a phone), **Report a problem** at the bottom of every page
takes the rest, and every name on a leaderboard carries a flag beside it. Anyone can file one, signed in or not — the site plays without
an account, and the person who sees the bad word usually has none.

What the browser sends is where the thing was, never what it said: a puzzle
report is `(game, date, difficulty)` and the server reads the actual board out
of `daily_puzzles`; a player report is a name the server resolves to a profile
itself. Posting the board the client is holding would make a report of a puzzle
that never existed worth exactly as much as a real one. The free-text reason is
the only client-supplied field stored, and it's optional — a report with no
words still says somebody looked at this and thought it was wrong.

Filing one hands back a **ticket**, and `/report/<ticket>` answers for it: open
or closed, and how it ended. Nothing else — not the board, not the name, not
your own words back, and a wrong code reads the same as a real one. An email
address is optional on top, used only to send a receipt and the eventual
outcome, and deleted with the report.

Reports are insert-only with no read-back, capped per subject and per day
rather than per IP, and nothing about an anonymous reporter is stored beyond an
address they chose to give. A daily workflow emails whatever is open — carrying
the filing date and the days it has been waiting, so an ignored report reads
louder each morning — and **nothing closes on its own**. Each report's mail
carries links to dismiss it, block a word, or remove a name; those need two
keys, the token in the link *and* an owner account signed in, so a forwarded
digest or a mail scanner pre-clicking every URL can't ban anybody.

There's also self-serve deletion under Account: one button clears your play record and keeps the account, another deletes the account outright. Both derive the account from `auth.uid()` and take no argument, because a function accepting a user id is a delete-anybody endpoint the moment somebody edits a uuid in the network tab.

Signed out — or without the env vars below — every auth surface hides and everything stays local.

Setup:

1. Create a free Supabase project.
2. Run [supabase/schema.sql](supabase/schema.sql) in the SQL Editor (safe to re-run — re-run it after pulling changes, since it also adds new columns like `profiles.settings`), then [supabase/words.sql](supabase/words.sql) and load `scripts/words.csv` (from `npm run build-words`) into the `words` table — or dispatch the **Rebuild word lists** workflow, which does the whole thing in one transaction.
3. In **Authentication → URL Configuration**, set the Site URL to `https://anagrimoire.com` and add `https://www.anagrimoire.com` (the alias), `https://dev.anagrimoire.com`, and `http://localhost:5173` as additional redirect URLs — sign-in redirects back to whichever origin the visitor is on, so both spellings of production must be allowed.
4. Copy the Project URL and anon/publishable key (**Settings → API**) into env vars — `.env.local` for local dev (see [.env.example](.env.example)), and environment variables on each Render static site. The anon key is public by design; row-level security protects the data.

5. Optionally enable OAuth providers (**Authentication → Providers**): create a GitHub/Google OAuth app with the callback URL Supabase shows there, and paste in its client ID and secret. The sign-in page offers both alongside email.

Reporting needs one more step and two more optional secrets: seed
`public.owners` with your own auth id in the SQL editor (nobody can act on a
report until you do), then set `RESEND_API_KEY` and `REPORT_DIGEST_TO` for the
digest. Without them the workflow still runs and prints what is open to its own
log, and leaves everything open for a later run to send.

Three GitHub Actions secrets complete the pipeline: `SUPABASE_SERVICE_ROLE_KEY` (an `sb_secret_` key; lets the daily workflow publish puzzle rows), `PUZZLES_SEED_SALT` (permanent; what keeps future boards uncomputable from this repo — rotate only on suspicion of leak, which reshuffles every unplayed day), and `SUPABASE_DB_URL` (the session-pooler connection string, for the word-list rebuild workflow). Each workflow skips politely when its secret is absent.

Note: Supabase's built-in email service is rate-limited (a few magic links per hour) and its templates can't be edited without custom SMTP. Magic links are single-use, and corporate email scanners sometimes pre-click them — the sign-in page accepts the emailed one-time code as a fallback, but the code only appears in the email once custom SMTP is configured with `{{ .Token }}` in the Magic Link template. Until then, OAuth is the frictionless path.

## Analytics (optional)

Set `VITE_GA_ID` to a Google Analytics 4 measurement ID (`G-…`) and the site loads gtag and reports pageviews; leave it unset and nothing is injected. Use one GA4 property with a separate web data stream (and measurement ID) for each environment, set on the matching Render site, so prod and dev numbers stay separable.

Every visitor is asked, wherever they are, and nothing loads until they agree — no geo-IP lookup, and no guessing the region from a time zone, which was the previous approach and could be defeated by a VPN. Declining is one click, the same as accepting, and is remembered. An answer lasts a year before it's asked again. A Global Privacy Control signal counts as a refusal without asking at all. Either way it can be switched off under Settings → Analytics, which also clears the cookies it had set. No account identifier is ever sent, so Google holds a browser-scoped id with nothing to tie it to a person.

## Security

[SECURITY.md](SECURITY.md) says what's in scope, what's a deliberate trade-off,
and how to report something privately. The short version: the database is the
part worth attacking — row-level security, the definer functions that bypass
it, the daily gate that refuses to serve tomorrow, and the two-key lock on
report actions. Every puzzle answer is already in the browser by design, so
that isn't a finding; a way past a database policy is.

Report privately via [GitHub's advisory form](https://github.com/rptetzloff/anagrimoire/security/advisories/new),
the security option under **Report a problem** at the bottom of any page, or
<security@anagrimoire.com>.

## Privacy and terms

`/legal/privacy` and `/legal/terms`, written to describe what the code actually does — the rule being that if the two disagree, the code is right and the document is wrong. Both live in [src/LegalDocs.tsx](src/LegalDocs.tsx).

## Deployment

The repo includes a [Render](https://render.com/) blueprint ([render.yaml](render.yaml)) that provisions a static site: it builds with `npm ci && npm run build`, publishes `dist/`, rewrites all routes to `index.html`, and sets long-lived cache headers on hashed assets.

Two environments are deployed on Render:

| Environment | URL | Branch |
|---|---|---|
| Production | [anagrimoire.com](https://anagrimoire.com) (www is an alias) | `main` |
| Dev | [dev.anagrimoire.com](https://dev.anagrimoire.com) | `dev` |

Pushes to each branch auto-deploy to the matching environment.

## Disclaimer

Anagrimoire is an independent project. It is not affiliated with, endorsed by, or sponsored by The New York Times Company (Wordle, Spelling Bee, Letter Boxed, Strands), Hasbro or Mattel (Scrabble, Boggle), Tribune Content Agency (Jumble), or any other puzzle publisher. All game names and trademarks are the property of their respective owners and are used only to describe the kinds of puzzles this tool can help with. No word list is guaranteed to match any game's official dictionary.

## License

[MIT](LICENSE) © Ray Tetzloff
