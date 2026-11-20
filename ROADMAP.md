# Roadmap

Ideas we've agreed are worth doing, roughly in the order that makes sense to
build them. Nothing here is committed to a date — it's a parking lot so we
don't have to re-derive the reasoning each time.

## Near term

### Layout redesign — in progress
The layout spec of November 2026 (mockups shared with Amherst Games, which
built it first): a persistent shell, a home page with rails, game pages with
a game list on the left and progress, the board and Hint / Share / Report on
the right, and the remaining pop-ups as pages. Ported by hand from Amherst one
piece at a time rather than merged — the fork has diverged too far for that.

1. **The look** — done. The room moves to the spec's neutral slate (page
   #0A0F1C, cards #111827), the accent to its amber #F5B83D, Inter is bundled
   with the site (not fetched from Google, which would tell a third party who
   visited), each game gets a tile — its icon on a colour of its own, the
   colours in `index.css` and measured in `tests/unit/gameTiles.test.ts` —
   and the ambient glow goes. Every control that picks one of several, and
   every primary button, is solid accent; green means done and nothing else.
   Letter states inside the games keep their colours. The site keeps its own
   logo rather than the spec's lettered tile.

   A tinted version (accent text on a 15% accent wash) was tried first for the
   lighter picks — Daily/Practice, the current game — and failed AA on sepia,
   ocean and ember by day (3.99–4.36:1). Solid accent clears every theme ×
   palette, which `e2e/contrast.spec.ts` checks.
2. **The shell** — done. A bar across the top of every page in place of the
   strip of game tabs: the logo and name (home), Today, Games, Solvers and
   Boards, the quick-solve box, and a menu of your own things — Stats,
   Settings, Keys, Account, and Open reports for an owner — beside Sign in.
   Games lists every shown game with today's state and opens it on its daily;
   Solvers opens each on its solver. Hiding Play or Solve in Settings takes
   that menu away rather than leaving one whose links bounce. On a phone: the
   logo, the page's name (on a game, a tap switches game) and the avatar at the
   top, and Today · Games · Solvers · Boards · Me along the bottom; the tabs
   step aside while a panel is open, and the on-screen keyboard sits above
   them. The big name is Home's alone; a game page starts with the game's own
   name. The footer is About & FAQ, Privacy, Terms, Report a problem, GitHub
   and WordLock — WordLock kept, though the mockup's footer did not show it.

   Quick solve reads one line two ways: with a `?` (or `.` or `_`) it is a
   pattern and opens the Guess solver with the letters in place; letters alone
   are a rack for Scramble's. The mockup only showed the pattern; the rack
   reading is ours, because a bare `retains` has nothing else to mean.
   Anything else is refused with a sentence, and the box keeps what was typed.
   It sits in the bar from 1024px and inside the Solvers menu below that —
   at 768px the bar holds the rest with no room left for a 240px box.
   `e2e/nav-fit.spec.ts` checks the bar at ten widths, including where the box
   is.

   Not in this step: the mockup's Fraunces for the name. The bar and the
   masthead set it in Inter; Home (step 3) redraws the masthead, and the face
   is decided there.
3. Home: today's progress, the puzzles, boards and solvers in a rail.
4. Game pages with both rails.
5. Each game's own progress in the right rail.
6. Stats, Settings, Account, About and Legal as pages rather than pop-ups.

### ~~Share buttons~~ — done
Guess posts the tile grid, Weave one mark per word in find order (gold
spangram, bulb per hint), the rest a score-and-rank line. Emoji follow the
sharer's palette. Verified that no shared text contains a letter or word from
any answer — including Weave's clue, which was dropped because working out
the theme is half the puzzle.

Results carry a deep link (`/daily/hive`, `/play/weave`, `/solve/boxed`,
`/learn/grid`) that opens the exact board, and a 1200×630 preview card so a
pasted link renders as something rather than a naked URL. Each deployment
stamps its own origin from `VITE_SITE_ORIGIN`. The older `?daily=hive` query
form still works and is rewritten to a path on arrival — those links are out
in shared results and in Google's OAuth console, so they don't get to break.

### ~~Personal history~~ — done
A card per game under Stats → History: Guess as a distribution plus a table
per word length, the rest as sparklines, all with streaks counted off puzzle
dates rather than kept in a counter. Reads `daily_progress`, which is the only
place a day-by-day series exists — the event log has timestamps but no puzzle
identity, and hive wrote a row per word.

### ~~Realtime instead of polling~~ — done
**Built** (August 2026): `daily_progress` joined the `supabase_realtime`
publication, and one channel per signed-in session (`src/realtimeSync.ts`)
listens to that user's rows. Exactly the doorbell described below — an event
triggers the same authenticated read and merge the poll performed, and the
payload is only ever used to say *which* board moved, never as data. The poll
survives as the fallback: ten seconds while the socket is down, a
once-a-minute sweep while it's up, because a socket can go quiet without
reporting itself down. The original analysis follows.

A visible board re-reads `daily_progress` every ten seconds so two windows
stay in step. That mostly serves side-by-side testing; the real case is a
phone in the morning and a laptop at lunch, which the pull on open already
covers, and the interval is already a middle ground rather than a live feed.
To stop polling altogether:

- **Realtime.** `alter publication supabase_realtime add table
  public.daily_progress`, then one shared channel filtered to `user_id`. Use
  it as a doorbell — an event triggers the same authenticated read and merge
  rather than trusting the payload, so there's one set of rules, not two. RLS
  still applies, so a subscription can only ever carry your own rows. Your own
  writes echo back, which is harmless: the row's `updated_at` matches the base
  we recorded, so it reads as ours and changes nothing. Keep polling as a slow
  fallback for when the socket drops.

Deliberately parked until the merge rules had been proven in use — adding a
second delivery path while they were still being validated would have made it
impossible to tell a bad rule from a bad transport.

### ~~Hide games and features~~ — done
Settings → Show, a pill per game and per tab. Rides the existing settings
sync, so it follows an account across devices.

- A display filter and nothing else: statistics, streaks and dailies all keep
  accruing for a hidden game, and unhiding brings back exactly what was there
- The last game and the last tab can't be hidden — the control disables rather
  than explaining an empty site afterwards, and the loader refuses a stored
  list that hides everything
- Hiding the game or tab you're standing on moves you to one that exists
- The Solve/Play/Learn switch disappears entirely at one tab, which is how the
  site becomes a game site rather than a tool with games attached
- A shared link outranks hiding for that visit, without changing the setting:
  landing someone on the wrong page because of a preference they set months
  ago is worse than showing them one game they'd switched off
- Pattern's thirteen word lengths narrow to a range in the same place. Set it
  to 5–5 and the length row disappears too; the other lengths keep their
  dailies and statistics, as with any hidden game
- Practice can go on its own, pinning every game to the daily
- Help and Reveal can go while the solver stays, for someone who wants the
  solver available but not one keypress from the board they're playing
- One dictionary for every solver, instead of a pick per game; the per-solver
  picker disappears when it's set, since there'd be nothing left to choose

### ~~Onboarding~~ — done
One dismissible card above the view switch, naming the game actually on
screen. The Learn demos do the teaching; the card only points at them.

- "Show me" opens Learn and retires the card; the X retires it without
- Only where there's a Learn tab to point at, and never on Learn itself
- The flag rides the synced settings, and the pull only ever promotes it to
  true — an account that has seen the card has seen it on every device
- A stored blob means the browser has been here before, so anyone upgrading
  from a version without the flag is treated as already onboarded rather than
  greeted with "new here?"

### ~~Self-serve account deletion~~ — done
Two buttons under Account, each behind its own panel: `clear_my_stats()` wipes
the play record and keeps the account, `delete_account()` removes the account
itself. Neither takes an argument — the account comes from `auth.uid()` and
only from there, because a function accepting a user id is a delete-anybody
endpoint the moment somebody edits one uuid in the network tab.

- Deleting the `auth.users` row is the whole job; all four tables cascade from
  it, so there's no list here to fall out of date when a fifth is added. It
  works because the function runs as its owner — worth re-checking after any
  project migration, though it fails loudly and rolls back if that ever stops
  being true.
- **The trap was the baseline flag, not the delete.** Clearing stats removes
  `stats_baselines`, and `importBaselineOnce` would happily put this browser's
  totals straight back — except it guards on a localStorage flag we don't
  touch, so the clear stays cleared. Deleting the account and signing up again
  *does* re-import, because that's a new user id and a new flag: correct, and
  what the "erase this browser too" tick is for.
- Local play state is the player's own copy, so deletion offers to erase it
  rather than deciding. Ticked by default, since someone deleting an account
  usually means all of it.
- **Analytics needed no deletion, and the policy now says why.** We never sent
  GA4 a user id, so Google holds a browser-scoped client id with nothing to
  tie it to an account, and their deletion API works on identifiers you
  supply. Dropping the `_ga` cookies is the honest whole of what we can do.

### Verified results — a word list in the database
**Built** (August 2026): `result_is_plausible` grew from arithmetic-only to
three layers — arithmetic always; dictionary membership at the row's
difficulty cut (55/70/80, slurs excluded) for rows dated 2026-08-10 on; and
answer verification wherever `daily_puzzles` holds the puzzle, which
superseded the hash plan below — a Guess win must end on the actual answer,
Squares must reconstruct the actual grid, Weave's finds must be actual theme
words, Hive/Box words must fit the actual board. Not security definer and
revoked from web roles, because a public function over the answers table
would be an oracle. Verified on migration day: every honest row unchanged
(leaderboard fingerprints identical), eight classes of fabrication caught.
The original analysis follows.
`result_is_plausible()` recomputes each score from the words the client says it
found. That catches a score disagreeing with its own evidence, but the database
has no dictionary, so ten invented words score exactly like ten real ones.
Every game sits in that tier — Squares, whose grid can only be checked for
shape, is no worse than the rest.

**Client-side signing can't fix it at any key length.** If the browser computes
an HMAC, the browser holds the key, and anything shipped to the browser is
public. The flaw isn't where the key is kept, it's that the key is there at
all — the same wall the display-name work hit.

So the fix is the server knowing the truth independently, as one piece of work
rather than a patch per game:

- **Our own word list, in Postgres.** The dictionaries are already normalised
  in the build; publishing them to a `words` table lets `result_is_plausible`
  check membership instead of re-adding a claimed score. Worth pricing first —
  the full list is large, and the check runs per row.
- **Answer hashes for Squares**, whose evidence is a grid rather than words.
  The pipeline writes `sha256(rows joined)` per date and size; the check hashes
  the submitted grid and compares.
- Written by the daily workflow under a service-role key held only as a CI
  secret, never in the bundle. Grants revoked from every web role: a readable
  answers table is just the answers, and a hash over a small answer space is
  guessable.

**Not urgent.** The realistic threat is one curious person with the network tab
open, and the exposure is bounded — `daily_progress` holds one row per puzzle,
so nobody can claim more solves than there are days, unlike an unbounded score.
Doing it for Squares alone would leave one trustworthy board among seven.

### Puzzles in Postgres, and difficulty instead of dictionary size
**Built** (August 2026), in three stages: the daily workflow publishes a
rolling fortnight of rows to `daily_puzzles` (RLS on, zero policies; the only
read is `daily_puzzle()`, a security-definer RPC with no date parameter and a
3:15 a.m. Eastern gate); the client reads the RPC first with the file feed as
fallback, pinned by e2e tests; and `PUZZLES_SEED_SALT` mixes into every seed,
so the public repo no longer predicts future boards.

**Stage four, half done** (August 2026). The legacy feed keys are gone: every
feed repeated its easy board at the top level — `words`, `sides`, `cells`,
squares' `boards` map — for clients predating difficulty, and nothing has
read them for weeks. A contract test now asserts a feed carries only `date`,
`byDifficulty` and `fetchedAt`, because a stray duplicate is how squares once
let extreme overwrite hard.

**Retiring the puzzle-data branch is deliberately not done, and the reason
has changed.** The motive was that a public branch of deterministic output
let anyone compute every future puzzle — `PUZZLES_SEED_SALT` already fixed
that. What removal would buy now is one less delivery path; what it costs is
the outage insurance this entry itself warned about: today a Supabase outage
costs accounts and sync while the dailies still play, and afterwards it costs
both. A last-good client copy covers a player mid-session but not someone
arriving during an outage, which is exactly what the files cover. Worth
keeping until there's a better reason than tidiness. The original analysis
follows.

Three things that turned out to be one thing.

**Why move the puzzle data off GitHub.** Delivery isn't the problem —
`raw.githubusercontent.com` is Fastly-fronted and answers in under 100ms.
Generation is: if Actions is down at 07:15 and 08:15 UTC there's no puzzle that
morning. Worse, the generator is a pure function of the Eastern date seeded by
`xmur3` in a public repo, so *every future day is computable today, forever* —
anyone can clone and run it with tomorrow's date. Pre-publishing a rolling
window would fix the outage problem but makes the leak explicit rather than
merely available. In a table the two goals stop fighting: rows for the next
fortnight sit there while a security-definer RPC, taking no date parameter,
serves only `date <= today ET`.

Cost, stated plainly: today a Supabase outage costs accounts and sync but the
dailies still play, because they come from somewhere else. Afterwards it costs
both. Pair it with a client-side last-good copy so an outage mid-session
doesn't blank a board already in progress.

Cheapest route is two steps. First keep Actions as the generator and have it
write to Supabase — nothing puzzle-related is public any more, and no Deno
port. Later move the schedule to `pg_cron`/Edge Functions, which removes the
credential question entirely: no service-role key in CI, because the generator
is already inside the database it writes to. That second step is what needs the
word list server-side, which is the entry above.

**Difficulty instead of dictionary size.** The current setting is backwards as
difficulty. Answers always come from `common`; the tier only widens what's
*accepted*, so choosing "full" makes Guess **easier** — more guesses are legal
and the answer is no harder. Renaming to easy/hard/extreme and generating per
difficulty makes the label mean what it says. Generation sits a notch below
validation at every level, which is the rule Squares already uses
(`genWords`=common, `valWords`=standard), generalised:

| difficulty | answers from | guesses validated against |
|---|---|---|
| easy | SCOWL 10–35 (39,137) | 10–55 |
| hard | SCOWL 10–55 (67,309) | 10–70 |
| extreme | SCOWL 10–70 (111,630) | full ∪ hard (275,458) |

`extreme` has to be the **union**, not `an-array-of-english-words` alone: 521
words in `standard` are missing from it — mostly accented forms (café, cliché,
attaché) plus `ok` — so without the union, moving *up* a difficulty starts
rejecting words that were legal below. The ladder must nest strictly.

Generating extreme answers from the raw 275k would give unguessable
obscurities; 10–70 is hard for the right reason.

**Difficulty is the obscurity lever, which removes a job.** The worry that
Squares publishes odd words doesn't need a second review pass: how obscure a
word is tracks which SCOWL size it enters at, and difficulty already selects
that. Extreme is *supposed* to reach words easy doesn't have.

What it does not need is narrower bands. An earlier draft here proposed easy =
levels 10–20 on the theory that level 35 was "where the odd words live". That
was wrong, and worth recording so it isn't re-derived: SCOWL's sizes are 35
small, 50 medium, 60 medium-large (the default spell-checking dictionary), 70
large, 80 a valid word in current usage. Level 35 is ordinary vocabulary —
aback, civic, flank, gourd, impel, nasal, pique, upend — and `adze`, the word
that prompted the theory, is level 50 and not in `common` at all.

So the three tiers above stand as written: easy is the small dictionary
(10–35), hard the medium (10–55), extreme the large (10–70). Easy has ample
depth at every length that survives the cap — 464 words at three letters, 1,065
at twelve — so the tier ladder in `fetch-puzzles.mjs` has nothing to fix.

**Guess caps at 12 — and so does everything else.** One puzzle per length per day means each length is its own
stream, and on `common` the long ones are threadbare: 82 words at 15 (under
three months before every 15-letter daily has been used), 199 at 14, 558 at 13.
Cutting at 10 rather than 12 costs ~3,000 words across lengths 11–12 and buys
nothing, because the binding constraint at either cap is length 3, not the long
end. The requirement is a cooldown, not permanent exclusion — "don't repeat
within a year" needs ≥365 words per length, which lengths 3–13 all clear.

Solving and practice stopped at twelve as well rather than only the daily: a
length the daily can't offer isn't worth a button elsewhere, and nobody plays
a fourteen-letter Guess.

**Done, and it removed the reason to widen.** Capping at 12 was going to come
with a move from `common` to `standard`, because the long lengths were
threadbare. With 13–15 gone they aren't: every remaining stream clears a
one-year cooldown on `common` alone, the thinnest being length 3 at 464 words.
So generation stays on `common` for now, and widening becomes purely a
difficulty feature rather than something the depth numbers demand.

**One `words` table for every game.** 276,854 rows — the union of everything we
might ever accept. Squares, Hive, Boxed and Scramble all ask anagram- or
subset-shaped questions, so they differ by predicate rather than by table.

```sql
create table words (
  word   text primary key,   -- 276,854 rows
  len    smallint not null,  -- derivable, but it makes the queries read plainly
  sorted text not null,      -- letters sorted: anagram and subset lookups
  level  smallint,           -- SCOWL size; null = only in the large list
  pos    text,               -- ESDB part of speech: n, v, aj, av, abbr, ...
  lemma  text                -- the headword this inflects from; null if it is one
);
```

**Store the SCOWL level, not a difficulty**, because generation and validation
use different bands — a level-60 word is generatable only at extreme but
accepted from hard, and one column can't say both:

| difficulty | generates from | accepts |
|---|---|---|
| easy | `level <= 35` | `level <= 55` |
| hard | `level <= 55` | `level <= 70` |
| extreme | `level <= 70` | everything, `null` included |

The ladder is then provably nested rather than nested by convention, changing a
band is an edit to a query rather than a re-seed, and the 1,917 words that are
in SCOWL but missing from the large list (`ok`, `cs`, `configurable`) land in
extreme automatically — which is the bug that forced `full ∪ hard` back when
this was three fixed lists.

**`pos` and `lemma` replace a heuristic with a fact.** The generator currently
skips plurals by suffix: ends in s, and the stem is also a word. Measured
against ESDB's inflection data that drops 9,558 words from the common answer
pool, of which **73 aren't inflections at all** — `brass`, `discuss`, `assess`,
`caress`, `canvass`, `buss` — each excluded because its "stem" happens to be a
word (`bras`, `discus`, `asses`, `cares`). It also can't see `oxen`, `mice` or
`geese`, which sail through as lemmas. With `lemma` the rule becomes "don't set
an inflection whose lemma is also in the pool", which is true rather than
approximate, and `pos` gives the same handle for verb forms.

Two things not to re-investigate. ESDB's mapping isn't a complete oracle —
122,098 inflected forms against 276,854 rows — so "absent from the lemma
column" can't be read as "not an inflection". And **proper nouns are not a
problem**: `wordlist-english` already excludes them (`paris`, `texas`,
`tuesday` are in no tier; the common files hold exactly four capitalised
entries, all `OK`). An earlier pass here reported abbreviations and proper
nouns in the pool; that was a parsing error, not a finding.

**Take membership and `level` from the npm packages, `pos` and `lemma` from
ESDB.** Membership has to match the client's bundles exactly or a generated
answer can fail to validate — the failure that shows up on one puzzle months
apart. And parse ESDB's database rather than `scowl-pre.txt`: POS lives on the
entry, entries are case-sensitive, and inflections appear on their lemma's
line. Regexing that file gave wrong answers twice in one sitting. Its
`postgresql/` directory exists for this.

**A blocked-words table, not a hardcoded list.** ESDB (the English Speller
Database, `en-wl/wordlist` — the upstream `wordlist-english` is built from)
marks words with usage notes: `offensive-1` (7 racial slurs), `offensive-2`
(4), `vulgar-1` (21 swear words) and `vulgar-3` (11 mild). Its own README warns
the marking "only covers the worst offenders", and the categories don't split
cleanly — `vulgar-3` sweeps in **craps**, **dickens** and **dicker**, which are
flagged for their roots, not themselves.

```sql
create table blocked_words (
  word     text primary key,
  origin   text not null,   -- 'esdb:offensive-1' | 'esdb:vulgar-1' | 'manual'
  scope    text not null,   -- 'generation' | 'both'
  added_at timestamptz not null default now(),
  note     text
);
```

`scope` carries the distinction that matters: refusing to *publish* a word as an
answer is not the same as refusing to *accept* one a player typed. Slurs and
`vulgar-1` are `both`. bugger/crap/crapper/dick/fart/piss/pisser are
`generation` only. craps/dickens/dicker aren't blocked at all. Filtering a
validation dictionary is where Scunthorpe bites, so `both` stays small and
deliberate.

Generation always subtracts the blocklist, at **every** difficulty — publishing
a slur as the answer isn't a matter of anyone's filter setting. Because every
generated solution is therefore filter-clean, a player with the filter on can
always finish any puzzle, which is why no variant pools are needed: the filter
only ever subtracts from what's accepted, never from what's required.

Two measurements worth not re-deriving: none of the flagged words are in
`common` (they all sit at level 40+), so the filter is a no-op until generation
moves to `standard` — and every currently published pool and daily is clean.

**Play mode doesn't read the dictionary setting at all**, which is worth
knowing before touching any of this. `dictionaries[mode]` is consumed in one
place — `App.tsx`, for the *solver*. Play uses hardcoded lists: Guess validates
guesses against `full`, every other game against `standard`. So no player
setting can make a puzzle unsolvable today, and this is also where the ladder
being backwards is most stark — Guess draws answers from 39k `common` while
accepting guesses from 275k `full`, the most permissive combination available,
for everyone, always.

The consequence is that a puzzle's own solution words must be exempted from
validation *as part of* the difficulty work, not before it: the exemption only
matters once play-validation varies. Guess already does it
(`current !== secret`); Squares and Weave will need it the moment their play
dictionary stops being a constant.

**What difficulty means, per game.** It isn't one thing. Four games vary by
word tier, one by what it accepts, and two by shape — because a tier is
meaningless for a dice grid and for hand-curated themes.

| game | easy | hard | extreme |
|---|---|---|---|
| Guess | answer from easy tier | hard tier | extreme tier |
| Hive | pangram base, easy tier | hard | extreme |
| Boxed | chain words, easy tier | hard | extreme |
| Scramble | rack from easy tier | hard | extreme |
| Grid | accepts easy tier | hard | extreme |
| Squares | 4×4, 8 given | 5×5, 10 given | 5×5, 6 given |
| Weave | 6×8 | 7×9 | 8×10 |

Grid earns its place despite the board being dice-generated: it scores against
the maximum achievable, so a wider dictionary moves the target.

Two sizes that looked obvious don't exist, both measured rather than assumed:

- **Squares 6×6 is not buildable.** 0/5 from the easy tier, 0/5 from hard, and
  0/3 against all 22,418 six-letter words in the large list. Order-6 double
  word squares are genuinely scarce, and the generator also rejects symmetric
  ones. So extreme keeps the 5×5 grid and takes letters away instead.
- **Weave 10×12 is not fillable.** A theme carries 69–105 letters (median 91)
  and 120 cells need 120. Only 21 of 60 themes even have a spangram long
  enough to span ten columns. 6×8, 7×9 and 8×10 all build 40/40.

**Squares' given count is also its distribution.** At today's 10 givens the
spread is uneven — of 25 puzzles, 10 had a line with 4 givens and one had all
5, which is an entire word handed over. Asking for 6 instead brings the worst
line down to 2.2 on average without needing an explicit per-line cap: the
count and the spread are the same dial. Note `target` is a floor the chooser
removes down to, not a ceiling — asking 6 yields 6–8, averaging 6.6.

**Cost to watch:** an extreme square takes ~20s to generate against 0.2s for
easy. Across three difficulties, two environments and the practice pools, that
is where the daily workflow could get slow.

**Difficulty is a dimension, not a setting.** Taking it through the dailies
means `daily_puzzles`, `daily_progress`, `game_results`, the leaderboard RPC and
its boards, streaks and share cards all carry it. A streak has to be
per-difficulty or dropping to easy for a day quietly protects one earned on
hard. Boards currently hold about one entry per game per day, so splitting them
three ways will look thin before it looks rich.

### A test suite worth having
**Built** (August 2026): `.github/workflows/ci.yml` runs six gates on every
push — typecheck, lint, unit (vitest, `tests/unit/`), the feed contract
(`tests/contract/`, which runs the real generator for a pinned date with the
NYT fetches skipped), a production build, and Playwright with axe (`e2e/`,
WCAG A/AA on every route, every network stubbed). Squares uniqueness is re-checked in the
contract suite (August 2026) — a verified-results requirement, since a board
with a second legal fill would flag its honest solver as a fabricator. The
ear-test axe can't do was walked by hand with NVDA (August 2026): the games,
the account tabs, the invite flow and modal focus all narrate sensibly. It
found what automation couldn't — the leaderboard cards were static text in a
dialog, spoken on hover but unreachable by Tab, and now take focus. Worth
re-walking after any new surface; axe still covers only the mechanical half.

**Owed: an NVDA walk of the Cryptogram surfaces.** They shipped after that
pass and no screen reader has been near them — the board, where the cursor is
a position and every mark of the same letter fills at once; the mobile key
overlay; the solver panel and its candidate lists; the Learn demo. It is the
newest and by far the most keyboard-driven thing here, which is exactly the
shape the last walk found a bug in.

The case for doing it by ear rather than trusting the sweep got made in
August 2026, on a different surface. Monochrome on a light page rendered
Weave's spangram and its theme words seventeen values of grey apart, so the
board could not say which word you had found — on the palette that exists for
people who cannot use hue. Every automated check passed, and correctly:
axe measures *text* contrast, and two adjacent tiles reading identically is
non-text contrast, which it does not cover. It took someone looking at a
screenshot. The equivalent problem on a cryptogram board would hide the same
way.

**The sweep now walks every route** (August 2026): 43, from 14. It had grown
once already, to cover all eight dailies, and the comment it grew for said
"every game's daily, not a sample of them" — true, and it read as
thoroughness. Underneath, three of the four views were still samples: two
solvers of eight, two learn pages of eight, and **not one of the eight
practice routes had ever been scanned**. Panels, legal pages and two of three
settings tabs were outside it too. The list is generated from the games now,
so a ninth game is scanned on all four views the day it exists.

It found two real defects on the first run, both of a kind axe is good at and
a person is not:

- The **Squares learn demo** had eight buttons with no accessible name — the
  blank cells render no text, so a screen reader read the grid as eight
  buttons called "button". The real board had carried a proper label all
  along; the demo was markup that looked the same and wasn't.
- **`/keys`**, the panel documenting how to play without a mouse, had a scroll
  region a keyboard could not reach. It is all text and diagrams, so nothing
  in it takes focus, and axe flags a scrollable region with no focusable
  descendant for exactly that reason. Four sibling panels share the markup and
  escape the rule only because they happen to contain buttons.

Coverage that looks complete is worse than coverage that admits its gaps,
because nobody goes back to check it. Both of these lived behind a comment
claiming the sweep was thorough.

Difficulty took a day and produced roughly a dozen bugs. Every one was found
by playing the site or by a throwaway script, and several looked fine right up
until someone typed something. That's the argument: not coverage for its own
sake, but the specific shapes of thing that got through.

**What the throwaway harnesses already proved works.** Fixtures compiled with
esbuild and run under node caught the storage-gate rules, the board selector,
the difficulty resolution, and an ESDB parse that was wrong twice. They cost
minutes and they were right. The only reason they aren't a suite is that
nothing collects them — each was written for one bug and thrown away. Give
them a runner (vitest reads the existing tsconfig paths) and they become
regressions instead of anecdotes.

**What fixtures could never have caught**, and therefore what needs a rendered
component or a real request:

- Weave's grid class was `cols === 8 ? 'grid-cols-8' : 'grid-cols-6'`, so a
  7-wide board wrapped into six columns. The data was right; the CSS was not.
- Weave's validator accepted boards 6 or 8 wide, so hard was silently rejected
  and the game kept the previous board. Nothing threw.
- Squares' legacy `boards` map is keyed by size, and hard and extreme are both
  5x5 — so extreme overwrote hard and one difficulty vanished from the feed.
- Practice only drew a board when it hadn't got one, so changing difficulty
  left the old one on screen and the setting looked inert.
- Clearing that board on the *setting* change rebuilt it from the word band
  about to be replaced, so every level drew from the one below. The words
  changed, which is why it looked like it worked.

**What to assert on.** Prefer stored state and returned data over rendered
text. Two of the day's false negatives came from matching DOM strings — a
filter for buttons labelled `4` and `5` when they read `4×4` and `5×5`, and a
component that had unmounted between steps. A check that can quietly pass is
worse than no check.

**A generator contract test** is the cheapest high-value piece, because the
feed is the interface between two halves that deploy separately:

- every game has all three difficulties, and they're distinct boards
- the legacy top-level keys equal the easy board, so an old client is unaffected
- no blocked word appears anywhere, in plain text or base64
- every hive board clears its floor; every square is uniquely solvable
- guess covers exactly lengths 3–12

**A handful of end-to-end paths**, and only a handful: pick a difficulty and
see the board change, in each game; play a daily and see it recorded at that
difficulty; a board that predates difficulty still plays. Playwright against
the dev server, not against production.

**Read through the API, not the CDN.** Three times in one day a fresh publish
looked stale — `raw.githubusercontent.com` caches for 300 seconds and Render
sits behind Cloudflare with `s-maxage=300`, and `cache: 'no-store'` governs
the browser's cache, not a shared one. A test that fetches published data
should use the GitHub contents API or bust the cache deliberately.

**Where it pays off twice**: the same suite is what makes the puzzle pipeline
safe to move into Postgres, since the contract tests describe the feed rather
than the file.

### Leaderboards that show what they ranked on — proposed August 2026

Home and the leaderboard panel both draw from `boards_for`, and for several
games every row reads `1 solved`. Weave, Word Squares at both sizes and
Cryptogram return an empty `detail` in `BOARD_LABELS`, so a board of five
people is five identical lines.

**The rows are not actually tied, which is the worse half.** `boards_for`
already ranks on time — it sums `(dp.result->>'timeMs')` as `tiebreak` and
orders `value desc, detail asc, tiebreak asc`. So the order on screen is real
and considered, and the page shows nothing that accounts for it. Five rows
reading the same thing in a deliberate order looks like no order at all, and
the natural reading is that the board is broken or arbitrary. A missing number
would be a gap; a hidden ranking is misinformation.

The data is already there and already trustworthy: `timeMs` is stored per
result and `result_is_plausible` has been checking it since the verification
work. What is missing is one column in the RPC's projection — it selects
`name, value, detail` and drops the tiebreak it just computed — and a `detail`
for the four games that have none.

**Decided per game, because time is not equally meaningful across them:**

- **Cryptogram, Word Squares** — a single solve, where elapsed time is the
  whole story.
- **Weave** — time *and* hints, ranked on time with hints breaking the tie.
  Both say something real, and they say different things: the clock is how
  hard it was, the hint count is whether you did it yourself.
- **Guess** — already shows `best n/6`, which beats either.
- **Hive, Scramble, Grid** — no clock. They are scored on points, so they are
  already ranked on the thing the player chose to optimise, and a timer would
  rank them on something they were not doing.

Weave is the one that needs no new machinery to say all of it: `boards_for`
already orders on three levels — `value desc, detail asc, tiebreak asc` — so
solves, then time, then hints drops straight into the slots that exist. The
projection is what has to grow, not the ordering.

Small, and it touches the thing the site says it cares about most: a result you
can check. A board that will not say why one row is above another is the same
failure as a score that cannot be recomputed, one layer up.

### One blocklist, not two — proposed August 2026

`blocked_words` and `blocked_names` hold **the same 349 words**. Measured:
349 rows each, 349 shared, none unique to either. Both are projections of
`src/wordbands/blocked-words.json` — the words table is reloaded by
`rebuild-words.yml`, the names table is seeded by `name-blocklist.mjs` — and
they differ only in the column each carries.

| | column | means |
| --- | --- | --- |
| `blocked_words` | `scope` | `both` = never generated and never accepted; `generation` = never generated, accepted if typed |
| `blocked_names` | `match` | `substring` = rejected anywhere in a name; `exact` = rejected as the whole name |

The two columns are not redundant and the merge has to keep both. They are
also not independent: `name-blocklist.mjs` already derives one from the other
— `both`-scope entries become substring patterns, because "not even if you
type it" is the same judgement a substring match makes — with a computed
safety check, since `abo` is inside *about*, `spic` inside *suspicion* and
`coon` inside *raccoon*.

So: one table with `term, origin, scope, match`, and the two derivations stay
where they are. The reason to do it is the reason it surfaced. Adding a slur
means remembering two tables loaded by two different mechanisms, one of which
is a manual paste — and the August audit found the anti-LGBTQ+ terms at 5 of
25 covered, which is what happens when a list has two homes and neither is
obviously the one you are looking at.

Not urgent, and worth doing before a third consumer appears.

**The exception list is built** (August 2026), ahead of the merge rather than
with it, because `scunthorpe` was being refused today. `public.allowed_names`
holds fragments that are removed from a name *before* the patterns are matched
— strip-then-match rather than exempt-after, so "scunthorpe" clears to nothing
and passes while "scunthorpecunt" clears to "cunt" and is still refused.

It also collapsed the duplicate matcher: `set_display_name` and `would_block`
each carried their own copy of the same `like`, and the first version of this
change updated only one of them, so the dry run allowed a name the claim would
have refused. Both call `name_is_blocked` now.

### Report a puzzle or a player — shipped August 2026

A generator that draws from 240,000 words will eventually publish something
offensive, and a display name field will eventually hold something worse. Both
have preventive filters — `blocked-words.json` through the bands, the
`blocked_names` table and `would_block` for names — and neither is a substitute
for someone being able to say "this one is wrong" at the moment they see it.

**Decided:** reports land in a table and a scheduled function emails a digest,
so there is a signal without an admin UI to build first. Anyone can file one,
signed in or not, because the site plays without an account and the person who
sees the bad word usually has none.

**The design point worth getting right is the evidence.** The obvious version
posts what the client saw, which is attacker-controlled and therefore worth
very little — someone reporting a board that never existed is indistinguishable
from someone reporting a real one. Almost nothing needs to be sent: a puzzle
report is `(game, date, difficulty)` and the server reads the actual board out
of `daily_puzzles`, and a player report is a profile id whose name the server
already holds. The free-text reason is the only client-supplied field, and it
is the only one that should be.

Which also means a report is verifiable in a way most user-generated content is
not: the server can confirm the reported thing exists and says what the reporter
claims, before anyone reads a word of it.

The rest is the shape of any anonymous write path — an insert-only policy with
no read-back, a rate limit per source, and a `status` column so a handled report
stops appearing in the digest. Worth building before the pool of games gets
larger rather than after, since every new generator widens the surface.

**Built as described, with one clause overturned: the rate limit is not per
source.** Per source means an IP, and an IP is something identifying about
people the rest of the site is careful not to identify — for a privacy page
written to describe what the code actually does, that is a real cost against a
small benefit. The caps are on the subject (five per thirty days) and on the
day (five hundred), and nothing about the reporter is stored beyond `auth.uid()`
when they happen to be signed in. Per subject works because the goal is a
signal: the sixth report of the same board carries none. What it does not do is
stop one person filing against a thousand different names — that bounds volume,
not intent, and the answer to intent is the admin portal below.

The other thing the build learned: the report link belongs where a player is
*reading*, not where they finish. It went into each game's completion panel
first, which put it furthest away in Bridge and Ladder — the two games whose
words are legible in the first second. It rides the daily bus now, so App draws
it once for every game, on every daily board, throughout.

### Reporting: what is still owed — August 2026

Three things the first build does not do.

**Practice boards cannot be reported.** The whole evidence design rests on the
server being able to look the thing up, and a practice board was never
published — there is nothing to look up. That makes it the one case where the
browser has to send what it saw, which is exactly the input the rest of this
refuses to trust. The answer is not to refuse the report; it is to keep the two
apart and say which is which: `verified` for a board read out of
`daily_puzzles`, `claimed` for one the browser handed over, marked as such in
the row and in the digest. A claimed report is still worth having — the usual
cause is a single word, and a word is checkable on its own.

It needs each game to expose its current board, which is ten wiring sites and
the reason it isn't done yet.

**Ladder and Bridge have no practice mode at all.** Every other game deals
unlimited boards; those two have only the daily. Worth fixing on its own terms,
and it also removes half of what the paragraph above is for.

**The consent banner covers the footer.** It is `fixed inset-x-0 bottom-0`, so
until a visitor answers it, every footer control — including the report menu —
is present, visible, and unclickable. Found by the report tests, which failed
while a sibling test asserting the button was *visible* passed, which is a
lesson about what `toBeVisible` does and does not promise.

### Reporter addresses: a retention sweep — proposed August 2026

An address left on a report is deleted when the outcome email is sent, which
makes the promise on the form true for every report that gets closed. It is not
true for one that doesn't: a report nobody ever handles keeps its address
indefinitely, and that is exactly the report most likely to be forgotten.

A sweep in the daily digest would close it — drop the address from anything
closed but unsent after a few days, and from anything still open after ninety.
Fifteen lines, no new moving parts.

**Encrypting the column was considered and rejected.** It would only defend
against reading the database without also holding the CI secrets — a
Supabase-side compromise, or a leaked backup — because the mailer has to
decrypt to send, so the key lives in Actions and the operator holds both. It
would not touch the larger exposure either, which is that the address goes to
Resend the moment an email is sent. Against that narrow gain: a key that, lost
or rotated wrong, silently breaks the one thing the address exists for. Shorter
retention is the better lever and has no key to lose.

### The reconstruction: breaking up App.tsx, and standing up for a store — proposed August 2026

Three strands that want doing together, because each makes the others cheaper.

#### 1. The monolith

`App.tsx` is 4,261 lines and holds **92 `useState` calls**. The line count is the
symptom; the state count is the disease, and it has already cost something
measurable: the report dialog lost focus after every keystroke because a parent
re-render tore down a child's effect, and in a component with 92 pieces of state
every one of them re-renders the whole page.

**The reason to do it is that development and troubleshooting get easier, not
that a long file is ugly.** That is one criterion for where to cut: go where the
troubleshooting keeps landing, not where the line count is highest.

**It is not the only one, and on its own it under-delivers.** The routing cut
took `App.tsx` from 4,261 lines to 4,158 — a hundred lines, two per cent — while
finding six real bugs. Good trade, and visibly nothing happened to the file.

The second criterion is reading cost, and it is about locality rather than
length: a four-thousand-line file makes every edit load context you have already
decided is irrelevant, and you cannot tell it is irrelevant without reading it.
Splitting buys the ability to *not look*. That value is real whether or not the
total shrinks, and it points somewhere different — at the largest self-contained
blocks, whether or not they have ever caused trouble.
`LearnMode.tsx` is 2,195 lines and nothing has gone wrong inside it; the route
and panel state machine is a fraction of that and is where two bugs landed this
month. Line count puts LearnMode second on the list. This test puts it nowhere
near.

The seams, in that order:

- ~~**The route and panel state machine**~~ — **done, August 2026.** It lives in
  `src/routing/` now: `nav.ts` (a page and a stack of overlays, with `routeOf`
  and `navOf` proved inverses over every address), `history.ts` (the push /
  replace / back decision as a pure function with an exhaustive branch table),
  `entry.ts` (the incoming address, memoised — it was an IIFE running
  `history.replaceState` at import) and `useRouting.ts` (the two effects).
  `App.tsx` went 92 `useState` calls to 80.

  It found and fixed two live bugs, both invisible to every other check: a
  footer link whose `href` and destination disagreed once a tab was remembered,
  so middle-click and left-click went to different pages; and the close button
  on a deep-linked panel doing nothing at all. Both were written as failing
  tests first, and both announced their own fix by being `test.fail` rather than
  `test.fixme` — Playwright reports "expected to fail, but passed".
- **Dictionary loading and the solver allowlist** — where the dead bridge solver
  hid for a release.
- **The ten solver surfaces** — 2,341 lines of the render, more than half the
  file, and already ten separate units with their own inputs and results. Their
  own files rather than folded into the `*Game.tsx` components: those are 650 to
  890 lines each already, and Solve and Play are different surfaces with
  different state and different failure modes. What they legitimately share is
  the rules module — `src/bridge.ts`, `src/ladder.ts` — which both already
  import.

  Which gives a game a shape, arrived at from the opposite direction to the
  acceptance test below and agreeing with it: **a rules module, a play surface,
  a solve surface, a learn demo.** Adding the eleventh becomes filling that in,
  rather than finding the ten places the tenth was mentioned.
- **Chrome** — header, nav, footer. Small, and `GameMenu` shows the shape.

##### What "templatised" has to mean, to be worth doing

Not tidier files. **No drift between the ten games** — and there is an unusually
clear evidence base for what causes it. Every per-game list that was not
exhaustively typed has drifted:

- `MODES` is an array, so the bridge solver shipped dead.
- `ORDER` in the leaderboard is an array, so ladder and bridge had boards with
  ranked players on them and no way to see either.
- The solver results panel was gated by a denylist naming two of the four
  rule-based games, so two solvers printed the whole dictionary under their
  answers.
- `DailyStats` reaches six of ten games.
- The report link reached four of ten, twice, in two different ways.

Against that, one `Record<Mode, …>` caught eleven wiring sites in a single
change, because the compiler asked. Every failure above is an array or a
hand-kept list; every success is an exhaustive map.

So the acceptance test is mechanical rather than aesthetic:

1. **A new game is a value satisfying one interface** — what it needs to draw a
   board, a solver, a Learn demo, a daily, a practice deal, a share line and a
   leaderboard column. That shape currently exists only as a pattern across ten
   files that mostly agree.
2. **Every per-game enumeration is keyed by `Mode`, never listed.** Adding the
   eleventh game becomes filling in a form the compiler grades, instead of
   grepping for the tenth and copying what it did — which is exactly how the
   drift above happened, since you only find the sites you remember to look for.

If adding a game still requires remembering anywhere, the restructure has not
finished.

##### And it is the whole project, not `App.tsx`

Measured rather than guessed: Bridge was the last game added, so the files
mentioning it by name *are* the cost of adding one. **28 files.** Five of them
are Bridge — the game, its row, its rules module, its generator, its harvest
script. The other **23 are places that had to be told Bridge exists**, across
four layers:

| layer | files | can the compiler help? |
|---|---|---|
| `src/` | 14 | yes, where the enumeration is a `Record<Mode, …>` — and no, where it is an array |
| `scripts/` | 6 | no — plain JS, and the game list is a literal array in the publish step |
| `supabase/` | 1 file, **4 identical hand-copied CHECK lists** | no, and nothing will |
| `e2e/`, `tests/` | 7 | only by failing later |

The schema is the sharpest case. The same ten game names are written out in
full four times — `daily_progress`, `game_results`, and two `alter table`
constraints — plus a branch in `result_is_plausible` and a board in the
leaderboard. Nothing checks that those four lists agree with each other, or with
`Mode` in the client. They agree today because someone was careful five times in
a row.

That has a fix, and it is the same fix as everywhere else: name the set once.
A `games` reference table with foreign keys, or a domain, replaces four
literals with one row per game — and the client's `Mode` union becomes something
that can be checked against it rather than something that happens to match.

So the acceptance test extends: adding a game should touch its own files, one
list per layer, and nothing else.

##### The number above is wrong, and here is the right one

**Overturned after the routing work, August 2026.** "Twenty-three files
mentioning Bridge" was the measure, and it counts the wrong thing: a file that
*mentions* a game is not the same as a file that *must be edited to add one*.

Measured after stages 0–5 it read 33 — worse — because new test files use
`bridge` as example data. Meanwhile `e2e/a11y.spec.ts` dropped out of the count
entirely by deriving its routes from `ALL_SLUGS`, which is exactly the win the
metric exists to reward. It punished writing tests and hid the one real
improvement. A number that moves the wrong way under work that helped is not a
measure, it is a mood.

The honest target is the places carrying a **hand-maintained per-game list**,
which have to gain a line for game eleven. There are nine:

| where | what |
|---|---|
| `src/dailyData.ts` | the `dailyDataUrl` name union, and the pool URLs |
| `src/dailySync.ts` | the per-game merge switch |
| `src/leaderboard.ts` | `BoardGame`, `emptyBoards`, `MODE_BOARDS` |
| `src/stats.ts` | the per-game stat shapes |
| `src/App.tsx` | per-game literals outside the exhaustive Records |
| `src/LearnMode.tsx` | the demo per game |
| `scripts/publish-puzzles.mjs` | the `GAMES` array |
| `scripts/themes.mjs` | its own list |
| `supabase/schema.sql` | **four identical CHECK lists**, plus a `result_is_plausible` branch and a leaderboard board |

The roughly fourteen `Record<Mode, …>` tables in `src/` are deliberately *not*
on that list. The compiler already asks about those, so consolidating them into
one `GameSpec` is tidying rather than safety — worth doing, but it is not what
this number is for.

**Nine is the number to drive down.** It counts places that can silently
disagree, which is the thing that has actually gone wrong five times.

#### 2. Security as a stated requirement rather than a habit

Several good patterns exist and are nowhere written down as rules: definer
functions pinned with `search_path = ''`, RLS tables with grants revoked
outright rather than merely unpoliced, and the two-key model the report actions
established. Those belong in CLAUDE.md as requirements.

Two things that do not exist yet:

- **A content security policy.** A static SPA with no inline-script needs can
  take a strict one, and it is the single biggest lever available here.
- **A dependency policy**, so the 27 open Dependabot alerts are a routine sweep
  rather than an event. Triage by whether a package reaches the runtime bundle
  or processes untrusted input — a build-only advisory in a toolchain does not
  reach a player, and a forced major on Vite or Vitest can cost more than the
  alert it closes.

#### 3. App mode, and the store

Nothing is in place: no manifest, no service worker, no maskable icons, and
Vite's default `base: '/'` emits absolute asset paths — which is exactly what
breaks inside a native shell serving from a non-http origin. Cheap now, painful
after a restructure.

What shapes decisions *before* the restructure rather than at submission:

- **Asset paths and routing.** `base: './'`, and a router that does not assume
  the server rewrites every path to `index.html`, because in a wrapper there is
  no server to do it.
- **OAuth redirects.** Sign-in currently returns to the visitor's origin. In a
  wrapper the origin is a custom scheme, so the redirect allow-list and
  deep-link handling both need work. This is the fiddliest part of the whole
  track.
- **Offline.** The word bands are already versioned, fetched from a pinned tag,
  and shipped with a bundled fallback — which means bundling them in an app is a
  short step and gives real offline play. That matters beyond convenience: a
  repackaged website is the classic App Store rejection, and genuine offline is
  the most honest answer to it.

Already in hand, and worth knowing because they are the two things that most
often sink a first submission: **in-app account deletion exists** (`delete_account`,
a button under Account), and the privacy work of August maps almost directly onto
Apple's privacy labels and Google's Data Safety form — the hard part of those
forms is enumerating what you collect, which is now written down and checked
against the code.

To verify rather than assume: whether Apple's login rule obliges Sign in with
Apple here. It applies to apps using a third-party service for the primary
account, and there is an exemption where the app has its own account system —
email one-time codes, which this has. It should be read against the current
guidelines rather than guessed at, because adding it touches the auth UI and is
much cheaper before a restructure than after. Analytics may also implicate
Apple's tracking prompt in an app context.

Google Play is the easier of the two: a Trusted Web Activity via Bubblewrap or
PWABuilder, needing `assetlinks.json` on the domain and a PWA that clears the
quality bar. iOS realistically needs Capacitor and something native to justify
itself.

### The schema, and two systems that already disagree — proposed August 2026

`supabase/schema.sql` is 2,551 lines applied by pasting into a web SQL editor.
The length is not the problem — it has section banners, and it has not been
where the troubleshooting lands. The paste is: a truncated paste or an editor
timeout leaves a half-applied schema with no signal, and that risk grows with
every line while nothing about it announces itself.

**The thing to know before planning this**: the database already has a migration
history and the repo does not. Sixteen versions are recorded, from
`20260808214634` to `20260816132434`, applied through tooling that records a
version — while `schema.sql` is applied by hand and records nothing. So the
`games` table added in August exists in the database and in `schema.sql` and in
no migration at all, and several recorded migrations restate things
`schema.sql` also declares. Two systems, running side by side, disagreeing about
what exists.

That is what makes this a plan rather than a task. Adopting the Supabase CLI
means linking the project, baselining the live schema, and deciding what to do
about sixteen recorded versions with no local files — on a live database.

**Correction, same day:** an earlier draft of this entry said a migration system
would lose the comments. That is wrong, and wrong in the direction of making
this sound harder than it is. Migrations are files you write by hand, in the
repo, with whatever prose you put in them. Only `supabase db pull` generates a
baseline that carries none — and even that is avoidable by writing the baseline
from `schema.sql`, which already has the prose, and marking it applied with
`migration repair` rather than generating it.

So the real tension is narrower: **migrations are organised by time,
documentation is organised by concern.** `20260816_add_games_table.sql` is the
right unit for applying a change and the wrong one for answering "how do reports
work" — that answer would be spread across four migrations written months apart.
Keeping both is the usual answer: migrations to apply, a current-schema
reference to read. The question worth deciding is whether that reference is
generated from the database or maintained by hand, because a maintained one is
exactly the second source of truth this project has spent a day removing
everywhere else.

Worth doing, worth planning, and out of scope for the restructure it came up
during.

### Admin portal — much later
Everything owner-facing is SQL-editor-only today: clearing a display name,
adding blocklist entries, reading `suspect_daily_results`. That's fine, and
the Supabase dashboard is already a competent admin portal built by people who
think about privilege escalation for a living.

**The trigger isn't volume, it's delegation** — the moment somebody who isn't
the owner needs to moderate, or moderation has to happen from a phone where
the SQL editor is miserable. Until then a second portal is new attack surface
guarding data the dashboard already reaches.

If SQL starts to chafe before that, the cheap middle is owner-only helper
functions so routine jobs are one-liners — clear a name, list names set this
week, block a pattern and clear anyone already using it. Same safety model,
most of the convenience.

**Note for whenever this happens:** admin reach is exactly where grant
defaults bite. Postgres gives `EXECUTE` on new functions to `PUBLIC`, and
Supabase grants table privileges to the web roles, so anything new needs an
explicit revoke. Two of those were missed on the leaderboard work and caught
afterwards — including a view that read straight past row-level security.

## Needs a decision first

### ~~Display names → leaderboards~~ — done
Setting a display name is the opt-in and the whole of it; without one you
don't appear. Boards are per game over today, 7 days or 30, and multi-day
windows rank on how often you played as well as how well.

Both original blockers landed differently than expected:

- **Names** are unique on the lowercased value, set through a definer function
  so length, character set, blocklist and uniqueness are checked where the
  client can't skip them. The blocklist has substring entries for slurs and
  exact entries for bulk lists — one matcher can't do both without turning
  away Scunthorpe.
- **Score integrity** didn't need the dictionary in Postgres after all.
  `daily_progress` already stores the words found, so the database recomputes
  hive, scramble and grid scores from the word list and drops any row whose
  claim disagrees with its own evidence. Forgery now needs a plausible list of
  real words rather than a number.
- The trap worth remembering: a result is a record of something that already
  happened, and state is the board as it is now. Boxed can be restarted after
  solving, so the two legitimately diverge — verifying one against the other
  flagged real solves until the result started carrying its own evidence.

### ~~Friends / competition~~ — done
**Built** (August 2026). The jump turned out
smaller than feared, because the crossing stayed narrow: table RLS is still
"own rows only" everywhere — the three new tables (`friendships`,
`friend_blocks`, `friend_invites`) have zero policies and revoked grants — and
the only path across is definer RPCs returning names and numbers. The
decisions, as made:

- **Invite links, not search.** A definer function mints a week-long
  multi-use code; `/friend/<code>` opens the account panel and the code is
  stashed in storage so it survives the OAuth round trip. Nobody is
  discoverable who didn't hand someone a link — a name-search endpoint would
  have been the enumeration oracle the display-name work refused to build.
- **No pending state.** Minting and sharing a link is the requester's
  consent; accepting is the other's. One unordered row per pair
  (`user_a < user_b`), which deleted the whole request state machine.
- **Display names required on both ends** — the existing opt-in, reused.
- **Blocks are unilateral and silent.** They survive unfriending, kill
  accepts in both directions, and every dead end an outsider can probe —
  missing code, expired, blocked — reads identically as 'invalid'.
- **One set of board queries.** `leaderboard()` was refactored into a shared
  `boards_for(..., p_users)` core; the friends board is the same five queries
  scoped to your circle plus yourself, so a rank means the same thing on
  either scope. The Stats → Boards view grew an Everyone/Friends toggle.
- Rate limits live in the definer functions (ten live codes, hundred
  friends); the account-deletion cascade stays list-free because every new
  table references `auth.users on delete cascade`.

Verified in SQL with fabricated JWT claims: the full invite → accept → list →
scoped-board → block → unblock → remove machine, plus revoke probes as both
web roles.

The original note follows. Everything so far is "you can only read your
own rows"; friends means mutual relationships, invitations, and RLS that lets
a friend read *some* of your results, plus blocking and removal. Build after
display names exist and after leaderboards prove the aggregate pattern.

### More themes, for taste rather than need
**Six shipped** (August 2026): Sepia, Ocean, Forest, Plum, Graphite and Ember.
All move the ground only — the page, the panels, the borders, the tiers of
text, and the accent and focus ring, which are decoration wherever they
appear. The hues that carry meaning are left exactly where they were, so green
still means found and rose still means wrong, and the shared-result emoji are
the default squares because there is no sepia green square to post.

The last four took one pass and no fixes, which is the whole return on the
sweep: Sepia and Ocean each needed a round of contrast repairs, and by the
time these were written the rule they had to satisfy was a test rather than a
paragraph. Graphite is worth distinguishing from Monochrome — it greys the
*room* and leaves the game's colours alone, where Monochrome removes hue from
the game itself because someone needs it gone.

**The audit is automated now, which is what made the CSS the easy part.**
`e2e/contrast.spec.ts` walks every theme × palette over four colour-heavy
routes with axe's contrast rule — twelve combinations in about forty seconds.
Before it, the fourteen-route sweep only ever ran on whichever palette was
default, so three of the four palettes had never been checked by anything but
a hand audit. The grid still grows two passes per palette; it just grows in
CI instead of in someone's afternoon.

**"Leaves the meaning-carrying hues alone" is a test now, not a promise.**
Ocean shipped setting `--c-amber-400` to a teal so the accent matched the
mood — and Weave paints its spangram `amber-400` and its theme words
`sky-400`. On a pale blue page the two became the same colour and the board
stopped telling you which word you had found. A decorative palette may change
the slate ramp, `white`, `ink`, `accent` and `focus`; a unit test reads
index.css and fails on anything else. Those two Weave states are separated by
hue alone — luminance ratio 1.07, in the default palette too — so there is no
margin for a decorative palette to borrow from.

**Colour named in prose has the same problem.** "Must use the amber center
letter" is true of one palette in six: under Red-green friendly it is orange,
under Monochrome a pale grey, and Monochrome's whole point is that no hue is
there to name. `COLOR_WORDS` in theme.ts holds the vocabulary per palette and
the copy reads from it. Learn's hive section had been hardcoding, because it
was never passed the words; where the colour added nothing, the sentence lost
it instead.

It earned itself immediately, catching two things a person would not have.
`loadState` validated the palette against a literal `['default', 'deuter',
'tritan', 'mono']` rather than `PALETTES`, so a new palette could be picked,
saved, and silently reset to default on the next load — the list now reads
from the source, as do theme and text scale. And both light palettes had
tinted `--c-ink`, which is the text sitting *on* a saturated fill: warm ink on
a warm accent came out at 3.1:1. The page's own text warms up; ink does not.

The original analysis follows.
The four palettes exist for colour vision — default, red–green, blue–yellow,
monochrome — and the theme switch is light/dark/system. Nothing yet is there
just because someone likes it: sepia, high-contrast, a warmer dark, seasonal.

The architecture already takes them. Every colour resolves through CSS
variables keyed on `data-theme` × `data-palette`, so a new palette is a block
in `index.css` plus an entry in Settings, and no component changes at all.

**The cost isn't the colours, it's the audit.** Contrast is checked across
every theme × palette combination, and that grid is what grows: four palettes
in two themes is eight passes today, and each new one adds two. A palette
that ships unaudited is worse than no palette, because the accessible ones
imply the rest were checked too. Budget the sweep, not the CSS.

Worth separating the two axes in Settings if this happens — colour-vision
palettes and decorative ones sitting in one list invites someone to pick a
seasonal theme and lose an accommodation they needed.

## New game modes

### Word ladder (Doublets) — proposed August 2026
Carroll's game: turn one word into another a letter at a time, every step a
word. COLD, CORD, CARD, WARD, WARM.

**It is the best fit measured so far, and the reason is that it is nothing but
dictionary.** Every step is a vocabulary question, unlike Wordoku's nine cells
of eighty-one or a fill-in crossword's zero. And it needs no corpus that isn't
already here — no passages to harvest, no clues to review, no licence. The
word bands are the whole game.

Supply is not a constraint. Over the common tier: 1,880 four-letter words give
**1.4 million pairs at least three steps apart**, and 3,462 five-letter words
give 1.5 million — spread across ladder lengths three to eight, so difficulty
is a dial rather than a search. Sixty-nine four-letter words have no neighbour
at all and simply never appear as endpoints.

It also lands where the other candidates strain:

- *Verification is the strongest kind.* The claim is the ladder; the server
  checks each rung is a word in the tier and differs from the last by one
  letter, and that the ends are the ends. That is `result_is_plausible`'s
  existing shape — arithmetic, dictionary, then the puzzle itself — with
  nothing new invented.
- *Difficulty falls out.* Ladder length for the shape, word band for the
  vocabulary. Both already exist.
- *It resumes.* A half-built ladder is a list of words, which is what
  `daily_progress` already stores.
- *It has an obvious Solve view*, which every game here has. Breadth-first
  search returns the shortest ladder exactly — no heuristics, no "gave up".
- *Scoring writes itself.* Shortest known ladder is par; beating par is a real
  achievement and cheap to check.

**The pair has to mean something, and that is the scarce part.** COLD to WARM
is a puzzle; ACTS to DIMS is an exercise, and the million-pair supply above
cannot tell them apart. WordNet ships antonym pointers and is already
installed, so the obvious source is free — and measured, it is lovely and
small. Same-length antonyms in the common tier that a ladder actually
connects: **45**. Widening through band-70 reaches 62. What they look like:

    east -> west (3)    hate -> love (3)    fair -> foul (3)
    give -> take (4)    fall -> rise (4)    find -> lose (4)
    cool -> warm (5)    head -> tail (5)    tame -> wild (5)

Sixty is six weeks, so antonymy alone cannot be the daily — but it is one
pointer of a dozen. WordNet also carries synonymy, part-and-whole, "similar
to", "also see", entailment, cause and verb grouping, and taking the union
answers it: **1,415 pairs**, near four years of dailies, every one a relation
a player would recognise.

    cause        jump -> leap   lift -> rise   drop -> fall   halt -> stop
    also see     cold -> cool   fair -> just   lean -> thin   easy -> soft
    entailment   veto -> vote   kick -> move   burn -> sear
    meronym      beef -> cows   hemp -> rope   book -> text
    verb group   break -> crack draw -> pull   quiz -> test
    antonym      east -> west   give -> take   head -> tail

**One relation has to be left out, and it is the biggest.** Hypernymy and its
inverse supply 2,277 of the 3,523 pairs the full union reaches — and they
produce `goat -> soul`, `crab -> soul`, `bull -> soul`, because WordNet files
*soul* as a synonym of *person* and every creature hangs off it. The relation
is real and the pair is nonsense: a player sees two words with no visible
connection, which is worse than ACTS to DIMS, since it looks like it was
*trying* to mean something. Dropping it costs volume there is no shortage of.

**The relation stays out of the board.** Both ends are given — that is the
puzzle — so COLD and WARM already say what they are to each other, and a label
reading "opposites" is only worth printing if one end were hidden. Which
settles the other question too: a daily names both words.

That keeps the relation entirely generator-side. It decides which pairs are
eligible and never reaches the client, so the feed carries what it would have
carried anyway — two words and a par — with no new payload, no copy to keep in
step with the palettes, and nothing to translate.

**Par is shown**, because it gives something to work toward. A ladder with no
stated target is a maze; one that says "five steps" is a challenge, and the
difference costs nothing — breadth-first search computes par anyway, both to
generate the pair and to check the answer.

Boxed already shows one, which is where the idea comes from — and it showed it
the wrong way. `fetch-puzzles.mjs` publishes `par: 2` with every generated
board, and the status row read `Solvable in 2` as a literal. Both said two, so
nothing looked broken; they simply had no connection, and a tier that ever
generated a par-3 board would have had the feed carrying the truth while the
board stated something else. It reads `record.par` now. Practice boards are
built out of two chaining words, so they are par 2 by construction and the
fallback is honest rather than hopeful.

Also open: whether a daily names both ends or only the start, and whether par
is shown or discovered.

**Checked and not proposed: a categories game from the domains map.** The
`domains.json` this repo already ships looked like a free "odd one out", but
they are WordNet's 26 lexicographer files and they are enormous — `artifact`
alone covers 7,604 common words, `act` 6,783. Categories that broad make a
puzzle either trivial or arbitrary. The data earns its place filtering words;
it cannot carry a game.

**Sketched, not measured: an acrostic.** The one idea that would use both
corpora already here — a passage from the cryptogram pool, and clues from the
WordNet glosses the Crossword entry found. Generation is the hard part and it
is a real constraint problem: the quotation's letters have to partition into
words that are themselves cluable, with the answers' initials spelling
something. Worth a feasibility pass before it is worth more words than this.

### Word Tetris
Falling letters you steer into words. A real-time game loop, unlike anything
else here, fully generatable, and distinctive. The most interesting fit.

**Evaluated** (August 2026), and the obstacle is not difficulty. It reuses the
dictionary and bands, the daily feed shape and its seeding, the difficulty
tiers, and the share and stats plumbing — the cheap half. What is new is a
game loop (nothing here uses `requestAnimationFrame` or a tick),
frame-rate-independent timing, collision and stacking, touch controls, and a
render path that is not React state per frame.

**It breaks three things the site currently holds, and a fourth quietly.**

1. *Scores stop being verifiable.* Every leaderboard entry today is recomputed
   server-side from evidence: `result_is_plausible` checks arithmetic, then
   dictionary membership, then the claimed words against the actual puzzle. A
   Tetris score is not a function of a word set — the achievement is the
   real-time sequence, and the letters are as reachable as the player's hands
   allow. Verifying it honestly means shipping an input replay the server
   re-simulates, which is a game loop in plpgsql. The realistic choices are no
   leaderboard, or a verifier outside Postgres.
2. *Play stops being accessible.* WCAG AA across fourteen routes, plus the
   NVDA walks. A falling-block game under time pressure has no screen-reader
   equivalent and excludes motor impairment outright. Text scaling to 125%
   fights a fixed playfield as well.
3. *The site stops being unhurried.* Learn says "no clock, no stakes" in those
   words, twice. Boxed and Cryptogram record elapsed time, but as a stat you
   are free to ignore; nothing here pressures anyone.
4. *A day stops being resumable.* `daily_progress` keeps partial state so a
   half-finished puzzle follows you between devices. A real-time run does not
   resume — it would be the first game where closing the tab costs the day.

**The version that keeps all four: drop the clock, not the idea.** Letters
fall into a well and you place each one with as long as you like; the score is
the words formed. Deterministic dailies, scores the server can recompute from
the placements against the seeded piece sequence, keyboard and screen-reader
play, resume, and the site's own character — while still resembling nothing
else here. The phrase above is "falling letters you steer into words", and
that survives losing the timer. The invariants do not survive keeping it.

**If the arcade version is wanted anyway** — a fair thing to want, it is the
more fun one — the honest shape is practice-only, no leaderboard, explicitly
outside the daily system. Nothing breaks, it is far less work, and it answers
whether the game is fun before anyone pays for replay verification.

### Wordoku
A 9×9 sudoku whose nine symbols are letters, with one row or the main
diagonal spelling a nine-letter word of nine distinct letters (EDUCATION,
FLOWCHART, DIALOGUES). No clues to write: build a valid grid, pick a word
from the dictionary we already load, map digits to its letters. Slots into
the daily pipeline with deterministic seeding; difficulty comes free from how
many cells are revealed.

**Caveat:** it's a logic puzzle wearing letters — the dictionary does almost
no work.

**Evaluated** (August 2026). Technically it is the cheapest game left on this
list, and nothing about it is new work: difficulty is how many cells are
given, resume is a partial grid as Squares already does, and accessibility is
a 9x9 letter grid, which Squares has shown reads fine by keyboard and by ear.
Verification would be the *strongest* of any game here — the answer is a
completed grid, so the server compares it outright, and `result_is_plausible`
already does answer verification for Squares and Weave. Even the uniqueness
requirement is familiar: a sudoku needs exactly one solution, and the Squares
uniqueness contract test is that discipline already written down.

**The word supply is not the problem.** 609 nine-letter words of nine distinct
letters in the common tier, 1,928 through band-70 — algorithm, education,
dangerous, computers. And unlike Cryptogram, where the passage *is* the
puzzle, here the word only labels a grid, so one word backs any number of
boards. Word repeats are cosmetic.

**Making the dictionary work harder is where it gets tight**, and the reason
is structural rather than a matter of effort. A row is a permutation of the
nine letters, so any row can spell a word when the letter set has anagrams —
89 sets do, giving 107 pairs (education / auctioned / cautioned; triangles /
integrals / gnarliest; algorithm / logarithm). But two word *rows* must differ
in every column or they collide, while a word row must *agree* with a diagonal
word at the one cell where they cross. Differing everywhere and matching
somewhere are mutually exclusive, and the measurement says so exactly: 26
pairs can be two rows, 81 can be a row plus the diagonal, **none can be both**.
Completability then splits them further — every two-row grid tried completed,
against 30% for row-plus-diagonal.

So: one word free, two words available in one arrangement or the other, three
never. The scarce thing is vocabulary rather than boards, which is the inverse
of Cryptogram.

**What it costs is character, and more than the caveat above admits.** The
Cryptogram entry warns that two logic-games-wearing-letters make the site
something else, counting Cryptogram as the first. The two are not equivalent.
Solving a cryptogram is word-dependent in every cell — word shapes, a
vocabulary, the pattern dictionary. A wordoku is word-dependent in **nine
cells out of eighty-one**; the other seventy-two are sudoku with letters
painted on. The caveat lands far harder here than it ever did there.

If the goal is more puzzles cheaply, this is the easy yes. If the goal is a
word site, it is the weakest fit on the list — and the multi-word version is
what would earn it a place, since two word rows make it a word puzzle with
sudoku scaffolding rather than sudoku with a word stapled on.

### ~~Word squares~~ — done
An N×N grid where every row *and* column is a real word, some letters given
and the rest to fill in. `scripts/squares.mjs` generates and verifies them;
the game shipped with the difficulty work — 4×4 with 8 givens on easy, 5×5
with 10 on hard and 6 on extreme — and is wired through the pipeline, stats,
sync, share, leaderboards and Learn like the rest. Verified results check a
submitted grid against the actual answer grid, the strongest check any game
here has.

It needed none of Weave's packer — plain backtracking with prefix pruning is
enough. What the probes settled, kept so it isn't re-derived:

- **Sizes stop at five.** 4×4 solves on every seed in milliseconds, 5×5 on
  about four seeds in five. 6×6 falls off a cliff (1 in 5, and the words it
  finds are obscure).
- **Uniqueness is a check, not a goal.** Word squares are so constrained that
  a 5×5 stays mathematically unique down to *three* given letters — and no
  human deduces ten words from three letters. Difficulty comes from a target
  reveal count; uniqueness is verified at that count.
- **Which cells are shown matters as much as how many.** Building up from a
  random subset until it happens to be unique showed 13 of 16 letters on
  average. Removing from the full square instead keeps uniqueness true at
  every step, so it can stop dead on the target: 6 of 16, and 10 of 25.
- **Validate against the list the game accepts typing against.** Uniqueness
  measured against a different dictionary means something different to us
  than to the player. Using `standard` rather than `common` barely moved the
  numbers, so there's no reason to be stingy.

One check that never left the generator: uniqueness is verified at build time
only, which is the same gap the test-suite entry records.

### Cryptogram
A short passage under a substitution cipher; work out the mapping and the text
falls out. Deduction rather than vocabulary, which is a different muscle from
anything else here, and the solver practically exists already — deducing a
word from its pattern and known letters is what Guess's solver does, applied
to twenty words at once instead of one.

**The text is the whole problem.** Cryptograms are traditionally famous
quotations, and famous quotations are somebody's copyright. The site's word
lists are deliberately its own; the passages would have to be too. Options,
roughly in order of how well they'd read:

- **Public-domain sources.** Gutenberg, proverbs, older verse. Real sentences,
  no licence worry, but they need choosing — a passage nobody can parse
  undeciphered is no fun deciphered either.
- **Generated sentences** from our own word lists. Free, endless, deterministic
  per date — and almost certainly flat. A cryptogram's reward is the sentence
  meaning something at the end.

Worth prototyping the generated version first: if it doesn't read well, the
curation cost of the public-domain route is the real cost of the game.

**Probed** (August 2026), and the public-domain route is cheap, which moots
the generated-sentences prototype. `scripts/cryptogram-harvest.mjs` runs
three Gutenberg sources through one filter funnel — ASCII, no digits, ends
like a sentence, 50–100 letters, every word in the shipped dictionary (which
drops archaic spellings), no proper-noun usage, enough letter repetition to
give the cipher a way in, blocklist, dedupe — and keeps **2,674 candidates**:

- Bartlett's Familiar Quotations 10th ed. (1919, #27889): 6,840 parsed,
  **1,641 kept** — the backbone, and the best per-entry quality.
- U.S. Presidential Inaugural Addresses (#4938): federal government works
  carry no copyright at any date, which makes this the one legitimately
  modern vein. 3,850 sentences extracted, **950 kept** — but speeches are
  prose, not aphorisms, so this source carries the most chaff and wants the
  harshest skim.
- A Dictionary of English Proverbs (#39281): 1,880 parsed, only **83 kept**,
  because most proverbs fall under the 50-letter floor. Short proverbs are
  *harder* cryptograms, not easier (fewer letters, less repetition), so the
  cut stock is a ready-made hard tier if passage length becomes the
  difficulty dial the entry above suggests. **It did** — see the short band
  below, which took this source from 83 kept to 360 candidates.

**Attribution is the quiet failure mode** (August 2026). The parsers read an
author header and keep it until the next one, so a header that *doesn't match*
costs nothing visible — it just credits that author's quotes to whoever came
before. 61 Bartlett's headers and one inaugural were being missed, and **112
passages shipped under the wrong name**, including 87 of Wordsworth's as
Joseph Hopkinson and two of Obama's as George W. Bush. Nothing failed; the
harvest reported its usual counts.

The header shapes that broke it, all worth keeping in mind if a fourth source
is ever added: a footnote marker between name and dates
(`WILLIAM WORDSWORTH.[465-1] 1770-1850.`), an unknown birth or death year
(`THOMAS MIDDLETON. ---- -1626.`, `OLIVER WENDELL HOLMES. 1809- ----.`), no
dates at all (`BARTHOLOMEW DOWLING.`), a title with the name last
(`Inaugural Address by President Barack Obama`), and a year wrapped onto the
next line. The book's own divisions — `MISCELLANEOUS`, `OF UNKNOWN
AUTHORSHIP` — share the dateless shape and now clear the author rather than
inherit one, so quotes under them are dropped instead of misattributed.

The lesson is the one worth generalising: **a parser that falls back to its
last good value cannot report a failure.** The inaugural parser now throws on
a title-shaped line it cannot read. Bartlett's cannot do the same, because
capitalised lines are not all headers, so its safeguard is the re-derivation —
if the sources are ever re-harvested, diff the authors against the pool before
merging. That check is what found 14 of the 112; a human reading found 98.

Duplicates keep their first source's attribution, so Bartlett's named
authors beat "English proverb" for the same line. **The skim happened**
(August 2026): the reviewed pool is `scripts/cryptogram-passages.json`,
where `review: true` means held out of play — kept in the data so a change
of heart is an unflag, not a re-harvest. **2,590 passages live** (1,584
Bartlett's, 932 inaugurals, 74 proverbs), 84 held out. That's seven years of
dailies before a repeat. Sourcing rules worth
keeping: quote *collections*, not books; Gutenberg only, so translations are
old enough to be public domain themselves; Wikiquote is CC BY-SA and never a
source, and MIT-licensed quote datasets are copyright-washing. Case is
irrelevant in-cipher, so verse capitalisation artifacts only matter on the
reveal.

**Difficulty maps cleanly**, better than most games here: how many letters
start revealed, how long the passage is, and whether the cipher preserves word
boundaries. No second dial needed.

**The short band shipped** (August 2026), and length is now a real dial:
extreme plays 35-49 letters while easy and hard keep 50-100. A second harvest
pass over the same three sources produced 1,412 candidates, and **350 are
live** (246 Bartlett's, 70 proverbs, 70 inaugurals) — proverbs finally earn
their place, having been all but excluded by the 50-letter floor.

The floor is 35 because the unicity distance of a simple substitution — the
length below which more than one plaintext fits — is about 28 letters for
English. Clearing it on paper is not enough, though, and this is the thing
worth remembering: **a short passage often has two answers.** Enciphered and
solved against the common tier, 58% of 35-49 candidates admitted a second
common-word reading, against 31% at 50-100. "must hunt over night" and "just
hunt over night" are both English, and a player who hands in the second one is
not wrong — but the answer check compares against the passage we stored and
tells them they are. So `scripts/cryptogram-guard.ts` enciphers every
candidate and keeps only those it can prove have one answer, which costs 75%
of the harvest and is worth it.

Two things it can't verify, both recorded rather than papered over.
Contractions: `solveCryptogram` splits on runs of letters, so "Eve's" becomes
"eve" plus a one-letter word that can only read as "a" or "i" — the passage
then reports no reading at all and would be kept as *proven safe* when nothing
was proven. 80% of contraction-bearing candidates were surviving that way.
They're dropped. And a search that exhausts its node budget proves nothing, so
those go too.

**Cold-start suggestions, and what the fix turned out to be** (August 2026).
The open item was n-gram scoring, on the theory that a cold start has too
little to go on. Measured first: over 150 boards at their opening move the
solver was **silent on half of them**, and produced about two suggestions per
board. Accuracy was not the problem — what it did say was 78% right, and its
confidence tracked accuracy cleanly.

The cause was the tally, not the evidence. Each *reading* got a vote, so a
word's influence was its candidate count, and a three-letter shape with three
thousand readings drowned out a nine-letter one with four. The cap at four
hundred readings kept that from being a disaster by throwing most of the board
away instead.

Two changes, both measured against the same boards: one vote per **word**
split across its readings, and that vote split by how ordinary each reading is
(SCOWL band) rather than evenly. Result: **speaks on 63% of boards rather than
51%, and is right 86% of the time rather than 78%.** Calibration sharpened too
— above 80% confidence is 92% right.

No n-grams. Letter statistics were never the missing piece for a board with
word divisions, where shapes and word frequency say more. **Where n-grams
would genuinely be the only tool is a grouped board**, which has no divisions
to make shapes from — `solveCryptogram` refuses those outright and the
suggestions panel has nothing to say. That is a different program (frequency
hill-climbing) and remains unbuilt.

**Repetition has a floor now** (August 2026), because the first short board
that reached production showed why it needed one: 37 marks over 25 distinct
with 7 repeating, homophonic, no reveals. Repetition is what a solver grips —
and homophonic is the only cipher that can lose it, since several marks stand
for one letter, which also makes word shapes lie. Measured across both pools,
every other cipher bottoms out at 55% of distinct marks repeating on standard
and 47% on short; homophonic runs to 25%. Over a year of dates, 42 boards came
in under 40%, the worst at 23%, every one of them extreme.

The fix keeps the announced cipher: re-deal the homophones, which rescues 141
of the 143 short passages that fail at first ask, 93 of them on the first
retry. Only then does the daily fall back to another cipher, and practice
draws another passage instead so a cipher never quietly vanishes from the
pool. A board that passes first time consumes the generator exactly as before,
so nothing already playable moved.

**The 17 markup passages are held** (August 2026) — `_Sir To._`, `*own*`,
`[History]` — which is what the funnel's markup stage would have caught had it
existed when they were curated.

**"31% of the standard pool has the same ambiguity" was overstated**, and the
correction is worth keeping because the number is still true and still not a
defect count. Three measurements, each of which was expected to justify a
cull and didn't:

1. *Do the given letters save it?* No — pinning one revealed letter, the help
   the hard tier always gives, cleared the ambiguity in **1%** of a
   200-passage sample. That was the argument for leaving the pool alone, and
   it was wrong.
2. *Do the rivals outrank the passage?* For 43% of flagged passages, yes — but
   reading them settles it. "It is an ill **bind** turns none to **food**",
   "cowards **[map]** fear to die", "from the **brown** of his head". They win
   on the solver's score, which is a sum of common-word lengths, and lose on
   meaning. The metric measures a dictionary, not an ear.
3. *How many rivals could a person actually write?* Narrowed to those one
   everyday word from the passage: **189 of 2,589**. Of those, about 60 have
   a swap that is grammatical in the same slot — `must`/`just`,
   `have`/`gave`, `say`/`saw`. The other 129 are `we`/`be` and `wind`/`bind`:
   "**Be** have made enormous strides" is not a sentence anyone hands in.

4. *Read them.* The 60 were flagged by a hand-written list of "plausible"
   word pairs — which was the same error one level up, judging pairs instead
   of sentences. `afford`/`accord` is a fine pair and
   "government is able to **accord** a suitable army" is not English. Read in
   context, 55 of the 60 fail on grammar or sense: "this is **add** remains",
   "years have **done** into history", "the noble **liking** and the noble
   dead", "**them** have been at a".

**Five passages survive**, all of them `must`/`just`, all where `just` works
as an adverb before a bare verb: "He who would search for pearls **just** dive
below", "We **just** support our rights". Those are held. It is the same
failure the short band's guard was built for, and at 5 in 2,589 it is the
whole of it here.

So the pool keeps 2,567 of 2,589. Culling 991 on measurement 1 or 2 would have
destroyed curated work to fix a problem that mostly isn't there — and the
thing that finally sorted it was reading the sentences, which no measurement
here could do. Each metric was a proxy for "would a person write this", and
each was wrong in the same direction: a dictionary, then a score, then a word
list, none of them an ear.

This does not undercut the short band's guard, and the difference is worth
being explicit about: there, candidates are free and thousands deep, so
refusing anything unproven costs nothing. Here the same rule would delete
work a person did by hand. **Adding demands proof of safety; removing demands
proof of harm** — which is why `cryptogram-guard.ts` grew an `--audit` mode
that keeps what it cannot verify rather than dropping it.

**It reuses more than it adds.** Deterministic per Eastern date like the rest;
`daily_progress` stores the partial mapping so a half-solved puzzle follows you
between devices; verification is exact rather than statistical, since the
server can simply compare the decoded text — the one game here where
`result_is_plausible` could be certain rather than persuaded.

**The catch:** it isn't a word game so much as a logic game about letters, and
Wordoku above carries the same caveat. Two of those and the site is something
else.

### Crossword
Blocked on something that isn't code: **clues**. Grid construction is
generatable; good clues need human authoring or a licensed corpus. The
generatable variant is a *fill-in* crossword (word bank, no clues), which is
a genuinely different and easier puzzle. Decide which one we actually want
before starting.

**Evaluated** (August 2026), and the block is softer than the paragraph above
says — because the corpus is already installed. `wordnet-db` has been a
dependency since the word build began: `build-words.mjs` reads `data.noun` from
it for the domains map. The same files carry **glosses**, which are modern
English definitions under a permissive licence, and nothing new needs
licensing or authoring.

Measured over the common tier: 52% of its 39,098 words have a gloss, and
**15,633 (40%) survive a mechanical filter** — between 12 and 90 characters,
and not containing the answer's own stem. A grid needs thirty to eighty words,
and unlike Cryptogram, where each day spends a passage, a clue bank is
per-word and every puzzle reuses it. Fifteen thousand clued words is not a
constraint on anything.

The bad glosses fail in ways that are filterable rather than fatal, which a
sample makes plain: `castle` came back as "interchanging the positions of the
king and a rook" and `dragon` as a gliding lizard — the wrong sense, fixed by
reading WordNet's own sense-frequency order instead of the first line found.
`island` came back as "a zone or area resembling an island", which the stem
filter already removes. `hammer` came back with a verb gloss for a noun, which
the `pos` column in the words table already knows enough to prevent. What is
left is the review sweep this project has done twice before, and it is
one-time.

**Confirmed (August 2026): sense order is enough, and the trap is off-by-one.**
Measured over the tier a daily would draw from (level<=20, 4-8 letters):
5,016 of 7,279 words carry a gloss (69%), and reading the *first* offset on
the index line gives a usable standalone clue for 30 of a 32-word spread
sample — `duck` is the bird, `guard` is a person who keeps watch, `envelope`
is a flat container for a letter. The two failures are stem leaks, which the
filter above already removes.

Worth writing down because it cost an afternoon: an `index.*` line is
`lemma pos synset_cnt p_cnt [ptr_symbol x p_cnt] sense_cnt tagsense_cnt` and
then the offsets **in sense order**, so sense 1 is the first offset after that
header — at `4 + p_cnt + 2`. Reaching for the last field of the line instead
yields the *rarest* sense of every word, and it does so plausibly: `duck`
comes back as a cotton fabric, `guard` as a basketball position, `justify` as
adjusting the spaces between words. That output looks exactly like a corpus
with bad sense ordering rather than like a parsing error, which is what makes
it worth a note here. `ladder-harvest.mjs` reads this correctly; a first
attempt at a definition harvest did not.

**The honest ceiling: this makes a quick crossword, not a cryptic or a themed
one.** Definitional clues, no wordplay, no misdirection, no Sunday theme.
Clue craft is most of what makes crosswords good and none of it is
generatable. Worth being clear about before anyone expects otherwise.

**And the fill-in variant is the weaker one, not the safer one.** It is fully
generatable, verifiable like any grid, and accessible — but the words are
handed to you, so solving is fitting by length and crossing and needs no
vocabulary at all. On the "is this a word game" axis it sits below Wordoku,
which at least asks you to know one word. The entry above treats fill-in as
the pragmatic choice; measured, it is the one that gives the least back.

### Ideas for a tenth game — proposed August 2026

Nine games, and eight of them are letter manipulation: Guess, Scramble, Hive,
Grid, Boxed, Squares, Ladder and Cryptogram all ask what letters do. Only
Weave touches meaning, and only as a label on a board that is still traced
letter by letter. Two axes of word knowledge are unused — **semantics** and
**sound** — which is the argument for the first four below over a tenth way
of rearranging letters.

None of these is measured yet except where noted.

**Bridge.** `SNOW · ? · BALL`: find the middle word that compounds both ways.
One-word answer, exactly verifiable, trivially accessible, and unlike anything
here. **Pool harvested** — see `scripts/bridge-harvest.mjs`.

*Difficulty is a hint budget, not a word band.* Easy grants three hints, hard
one, extreme none. Every tier draws from the whole pool, so difficulty and
supply are independent — which is the property the first design lacked.

A hint buys either the answer's **length** or its **next letter**, player's
choice, and both cost the same. That makes spending one a decision rather than
a dispenser: length is broad and cheap to reason from, a letter is narrow and
specific, and which you want depends on whether you are stuck for the shape of
the word or for the word itself.

**A hint applies to one prompt, not the board.** Three hints is not three
reveals across all five — it is three prompts you get help on, and two you do
not. That is the whole of the difficulty setting: at easy you can buy your way
through most of a board, at extreme you cannot buy anything, and in between the
question is which of the five is worth it. Spending early on one you would have
got anyway is how a hard board is lost.

Length is once per prompt — asking twice buys nothing — and letters turn over
left to right. `hintsUsed` goes on the record and into the result, the way
Weave already does it, so it can carry the leaderboard tiebreak.

That last part is the whole lesson of building it. The first design binned
prompts by the answer's *degree* — how many compounds it appears in — on the
reasoning that OUT is easy because it is the usual suspect. True, and useless
as a partition, because degree **is** prompt count: an answer in d compounds
pairs them into about (d/2)^2 prompts. Binning by degree bins by prompt count,
so the easy tier was defined by exactly the property that makes it repetitive,
and English only has two dozen words that productive. Easy came out as 2,414
prompts across 24 answers, and the runway arithmetic — counted in prompts —
called that healthy, because prompts are inflated by the property the tier
selects for. A measure that is a restatement of the thing it measures cannot
report a problem with it.

Degree survives as a weighting rather than a wall: a board can favour
productive answers without the pools being disjoint.

*Bands.* Ends and answers at 35, compounds at 55. Opening the answer band buys
nothing — bridge answers are common words already, and 55 turns 24 easy
answers into 26 — while opening the compound band takes the pool from 233
answers to 567, because what limits variety is which compounds happen to
exist. It costs quality: read twelve per tier and easy holds at 11, extreme at
10, hard drops to 8, where the junk is long compounds splitting by accident —
alliteration as all+iteration, reincarnation as rein+carnation. A minimum part
length would remove those and would also remove OUT, MAN and EGG, so the
answer is a review pass rather than a filter.

*The board.* The two ends are coloured differently and the answer takes from
both, so the bridge word reads as belonging to each side. On solve the slot
keeps **the answer only** — not the two words it formed. A setting turns those
on for anyone who wants the confirmation.

The blend has to be spatial rather than chromatic. Mixing two hues is the
obvious reading and it fails on the palettes that exist for people who cannot
use hue: under Monochrome a blend of two lightnesses is a third lightness
between them, which is the least distinguishable value on offer, and under the
red-green palette a mix can land near one of its parents. Splitting or grading
the answer tile left-to-right — the left end's treatment on the left, the
right end's on the right — says the same thing by position, and position
survives every palette. Same lesson as the Weave spangram, which went
invisible in Monochrome for exactly this reason.

Showing both formed words is filed as accessibility rather than decoration.
The colour pairing is invisible to a screen reader, so the ends need naming in
text regardless; for anyone who cannot see the pairing at all, the formed words
are the confirmation that the answer was right — and they also settle the case
where a solver reached a legal bridge the harvest did not have.

*Still open:* wiring into the daily pipeline, contract tests, and the client.

**Grouping.** Sixteen words, four groups of four. The `domains` column is
already in `words.csv`, so the categories exist without new data. The risk is
not supply, it is that mechanically-drawn groups are flat: what makes this
genre good is a word that looks like it belongs to the wrong group, and trap
quality is the thing to measure. Words sitting in two or more domains are the
raw material for that, and are countable today.

**Definition.** A gloss as the clue, guess the word, letters revealing as you
miss. Cheapest of the five and viable: 69% of the pool carries a gloss and the
leading sense is usable as-is about nine times in ten (measured under
Crossword above). The open question is not the corpus but the game — a clue
and a word is a single guess, so it needs something to make a puzzle of it,
whether that is a letter-reveal ladder, several clues sharing an answer
pattern, or a run of them against one board. Nearest to Crossword of anything
here, and worth deciding against that rather than on its own.

**Rhyme.** Find words that rhyme with today's word. The only idea here that
asks something no other game asks, and the only one needing a new dependency
(CMUdict, permissive). The risk is that rhyme is dialect-dependent, so
"correct" becomes arguable — which is the one thing the verification model
cannot absorb, since `result_is_plausible` has to agree with the player about
what counts.

**Growth.** Start from one letter and add a letter anywhere each turn, every
step a word: A, AT, CAT, CHAT, CHEAT, CHEATS. Reads like Ladder and plays
differently — Ladder substitutes at a fixed length, this one grows, so the
search space widens instead of staying flat. Deterministic, verifiable,
resumable, and most of the ladder's BFS and its verification shape transfer.
The letter-based one, included because the mechanic is genuinely new here even
though the axis is not.

### Sudoku (traditional) — not planned
Not a word game, shares zero infrastructure, and dilutes what the site is.
Superseded by Wordoku above.

## Older ideas, still open

- Color-blind accommodations — **done** (four palettes, WCAG AA verified)
- Stats pages — **done** (lifetime stats, plus global daily numbers)
- Theme expansion for Weave via corpora or community submissions
