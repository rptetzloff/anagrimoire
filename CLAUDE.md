# House rules

Twelve rules, so they get applied rather than rediscovered. Short on purpose.

## Measure, don't assert

If a claim can be checked against the running thing, check it before writing
it down. Every serious bug here looked fine in the source: the nav bar grew a
second row, a solver printed the entire dictionary under its answer, Learn
swallowed a keypress — all of it typechecked, linted, and passed the suite of
the day. Reading the code would not have found any of them.

Corollary: a test that reads the source proves the source, not the behaviour.
Keep both.

## Don't jump to conclusions

The failure mode this repo actually suffers from is not being wrong about hard
things. It is taking a plausible reading and stating it as established, when
the check was one command away.

Examples, all from one week: a run marked `cancelled` was reported as work that
had stopped — the jobs were still going. A suite piped through `tail` was
reported green — the pipe ate both the summary line and the exit code, so red
and green looked identical. `npm audit`'s suggested fix version was read as the
cost of fixing, and talked us out of a one-line upgrade that closed everything.
A report link was described as being on every game when it was silently absent
from six of them.

So: **if a claim is checkable in one command, run the command before saying the
thing.** When it isn't checkable, say which kind of claim it is. "The run list
says cancelled" and "the work stopped" are different sentences, and collapsing
them is how a wrong answer arrives sounding confident.

Two habits that follow. Never pipe a command whose exit code matters — `set -o
pipefail`, or don't pipe. And a tool's own report of what it did is a claim, not
evidence: `npm audit fix` said it made no breaking changes in the same run that
broke the build.

## Docs are part of the change, not a follow-up

Every PR checks the documents that make claims about the thing, and updates the
ones the change made wrong: the readme, the security policy, the roadmap, the
About and FAQ panel, and the privacy policy and terms in `src/LegalDocs.tsx`.
Most changes touch two or three. Checking all of them is cheap; finding out
months later which one went stale is not, and by then the wrong version has
been read.

This is a rule because nothing else catches it. A claim written when it was true
does not announce that it stopped being true — no test fails, no build breaks,
no page renders wrong. One pass found the privacy page describing the dailies as
static files from GitHub, months after they started coming from Supabase first,
so a reader with no account was told about the wrong company seeing their
address; the readme offering to autofill today's puzzle from "every solver" when
five of ten could; and three separate surfaces promising that a reporter's email
address was deleted with the report, while nothing deleted it.

The security policy is the one that must not drift. Its "known, not a
vulnerability" list exists to tell a researcher not to report something, so an
entry left there after the fix ships does not merely mislead — it suppresses the
report. The terms had a live example of the same failure pointing the other way:
they asked people to report security problems as public GitHub issues, which
publishes the hole to everyone before there is a fix.

Where a claim can be checked mechanically, prefer that to diligence. The accept-
tier counts, the word-list version stamped into every band, the palette contrast
floors and the assertion that a reporter's address never reaches an owner-facing
surface are all tests for exactly this reason. Prose mostly cannot be, which is
what the pass is for.

Not every document says the same thing, and forcing them to match makes both
worse. The readme is for someone deciding whether to run or fork it; the About
panel is for someone deciding whether to trust it; the privacy page is for
someone deciding what they are handing over. Same facts, three questions. What
they may not do is disagree.

## Comments explain why, never what

When a value was chosen by measurement, record the number **and** the rejected
alternative. "ΔE 79 dark / 61 light from rose" is worth more than the hex.

## Reversals stay visible

When a decision is overturned, mark the old one and say what changed. Do not
quietly edit it away. The trail is why the conclusion is trustworthy — a
document that only ever agreed with itself is not evidence of anything.

## State the limit of the claim

Say what a thing does *not* do, in the same breath. If a guarantee has an
exception, the exception ships next to it. When a claim stops being true,
rewrite it deliberately rather than deleting it.

## Tests assert rules, and fail on the old code

Where a rule can be read out of an artifact, assert it against the artifact.
Verify a new test fails before the fix, by reverting — a test that never
failed has proved nothing, and this repo has shipped several that could not.

A number pinned in two suites is wrong in one of them the day it moves. Exact
counts live in the layer closest to the artifact (`tests/unit/`); every other
layer asserts the relation — distinct, ordered, subset — not the snapshot.

## Derived data stays derived

If it can be rebuilt from sources, rebuild it; never store it and hand-edit.
Stored derivations last exactly until the source is regenerated — the plurals
were lost that way twice. And two lists that must agree are one list read
twice: the `slur` flag is read out of the blocklist, not kept beside it. When
two tiers look like the same judgement from two directions, check — scope
`both` and flag `slur` were not.

## The controls above a board are a ladder

Every game climbs it in the same order: surface (solve / play / learn), then
what the board is built from (`Difficulty` when playing, `Word list` when
solving — one rung, two dialects, never both), then which board (daily /
practice), then the game and its own parameters.

The first rungs are shared, rendered once by `App` for whichever game is on
screen. That does not make them consistent: `Word list` used to render *among*
the game blocks, so it landed above the board for five games and below the
first control for the other five, decided by where each game's JSX happened to
sit. Source order is not render order — measure the page.

`e2e/control-order.spec.ts` holds the rule. A new game placed wrongly turns it
red; nothing else will notice, because both orders type check and both render.

## Colour and theme

All colour through CSS variables in `index.css`; never a literal in a
component. axe checks *text* contrast only, so anything it cannot see — tile
fills against the page ground, palette-to-palette drift — gets its own ΔE
floor in `tests/unit/palettes.test.ts`. Every theme × palette combination
holds WCAG AA, because a pair that passes in one can fail in another.

## Dependencies default to none

A new runtime dependency needs a reason in the PR. After any install,
`npm ci --dry-run` has to come back clean before committing the lockfile.

~~vitest stays on 3.x~~ **Overturned 2026-09-20.** The @vitest/mocker path
traversal (GHSA-82fw-gwwq-j7x9) is fixed in 4.1.11 and in no 3.x release, so
staying put meant keeping an open advisory for a pin with no remaining reason.
The upgrade needed no config change -- `vitest.config.ts` already used the
`projects` API 4 keeps -- and the whole suite passed on it unchanged. `npm
audit` offered vitest 5 as the fix, which is the same misreading this file
already records two sections up: the advisory's first patched version was
4.1.11, and 4.1.11 is what closed it.

## Commits and branches

A subject line stating what the change makes true — no conventional-commit
prefixes, no ticket refs. The body is as long as the reasoning needs,
including what was measured and what was rejected.

### Development happens on `dev`. Every PR is `dev` into `main`.

No topic branches — the whole history is "from rptetzloff/dev", and a branch
between you and `dev` buys a second CI run for nothing. Run whichever suite can
catch the change locally before pushing; CI is for confirming, not discovering.
(This paragraph said "~15 minutes a run" until sharding took it to about six,
which is the rule two sections up catching itself.) The word-list rebuild workflow builds
from `main`: a change to that pipeline either lands on `main` before the
dispatch, or the rebuilt files are generated locally and shipped in the same
PR — which also collapses the two-dispatch dance into one.

## Files

Extract when a file stops being readable, not at a line count. Known
exception: `App.tsx` is far past that and is being reduced by extraction
(`GameMenu`, `LadderRow`, …), not by a rewrite.

---

*Repo-specific facts — the games, the schema, what shipped and why — live in
`ROADMAP.md` and in the module headers, not here. The rules are the same in
every repo; the examples are this one's, because a rule with no scar attached
gets skipped.*
