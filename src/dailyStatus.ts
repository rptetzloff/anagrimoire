// "Which of today's six have I touched?" — read from the same localStorage the
// games write, so it works signed out. The account copy would only tell us
// about devices, and the question is about today.
//
// Three states, and the middle one is doing honest work: Hive has no finish
// line -- it is over when you say it is -- so it reports "started" until it is
// given up on. Better a status that admits what it knows than one that calls a
// half-finished hive done.
//
// ~~and Weave's completion needs the puzzle rather than the save file~~ Wrong,
// corrected 2026-09-20. It needs the answers, and the save file carries them:
// the record holds answersB64, which is what the board itself counts against.
// Weave was read as Hive for that reason, so a Weave solved the honest way sat
// at "started" until it was revealed -- which is the one thing somebody who
// finished it will not do.

import type { Mode } from '@/storage';
import { store as siteStore } from '@/siteStorage';

export type DailyState = 'none' | 'started' | 'done';

/** the daily rolls at 3am Eastern; noon UTC lands on the right calendar day
 *  either side of the boundary without pulling in a timezone library */
export function todayEt(): string {
  return new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

type Store = {
  dailyDate?: string;
  daily?: unknown;
};

function read(key: string): Store | null {
  try {
    const raw = siteStore.getItem(key);
    return raw ? (JSON.parse(raw) as Store) : null;
  } catch {
    return null;
  }
}

const rec = (s: Store | null) => (s?.daily ?? null) as Record<string, unknown> | null;
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

// Guess keeps one record per word length, so today is "played" if any board is.
function guessState(s: Store | null): DailyState {
  const boards = Object.values((s?.daily ?? {}) as Record<string, { secret?: string; guesses?: unknown }>);
  let started: DailyState = 'none';
  for (const b of boards) {
    const guesses = arr(b?.guesses) as string[];
    if (!guesses.length) continue;
    started = 'started';
    let secret = '';
    try {
      secret = atob(String(b?.secret ?? ''));
    } catch {
      secret = '';
    }
    if (guesses.length >= 6 || (secret && guesses[guesses.length - 1] === secret)) return 'done';
  }
  return started;
}

function boxState(s: Store | null): DailyState {
  const r = rec(s);
  if (!r) return 'none';
  const chain = arr(r.chain) as string[];
  const invalid = arr(r.invalid);
  if (r.revealed === true) return 'done';
  if (!chain.length && !invalid.length) return 'none';
  // solved when the chain has used every letter on the box
  const letters = new Set(arr(r.sides).join('').toLowerCase().split(''));
  if (letters.size) {
    const used = new Set(chain.join('').toLowerCase().split(''));
    if ([...letters].every((c) => used.has(c))) return 'done';
  }
  return 'started';
}

function sprintState(s: Store | null): DailyState {
  const r = rec(s);
  if (!r) return 'none';
  if (r.finished === true) return 'done';
  return arr(r.found).length || r.endsAt ? 'started' : 'none';
}

// no finish line we can see from here — see the note at the top
function openState(s: Store | null): DailyState {
  const r = rec(s);
  if (!r) return 'none';
  if (r.revealed === true) return 'done';
  return arr(r.found).length ? 'started' : 'none';
}

// Solved when every theme word and the spangram are found -- the same count
// WeaveGame calls complete. An answer key that will not decode reads as
// not-yet-solved rather than as done: a status that cannot see the finish line
// must not claim it was crossed.
function weaveState(s: Store | null): DailyState {
  const r = rec(s);
  if (!r) return 'none';
  if (r.revealed === true) return 'done';
  const found = arr(r.found);
  if (!found.length) return 'none';
  try {
    const answers = JSON.parse(atob(String(r.answersB64 ?? ''))) as { words?: unknown };
    if (Array.isArray(answers.words) && found.length >= answers.words.length + 1) return 'done';
  } catch {
    // an unreadable key is not a finished board
  }
  return 'started';
}

// Squares keeps one record per size, so today counts as touched if either
// board has been. `solved` is written by the game itself — this module holds
// no dictionary and couldn't judge a finished square on its own.
function squaresState(s: Store | null): DailyState {
  const boards = Object.values((s?.daily ?? {}) as Record<string, Record<string, unknown>>);
  let state: DailyState = 'none';
  for (const b of boards) {
    if (!b) continue;
    if (b.solved === true || b.revealed === true) return 'done';
    if (arr(b.entries).some((e) => e)) state = 'started';
  }
  return state;
}

// One record per difficulty, like squares, but the play is a mapping rather
// than a row of entries: touched means a single letter has been assigned.
function cryptogramState(s: Store | null): DailyState {
  const boards = Object.values((s?.daily ?? {}) as Record<string, Record<string, unknown>>);
  let state: DailyState = 'none';
  for (const b of boards) {
    if (!b) continue;
    if (b.solved === true || b.revealed === true) return 'done';
    if (b.mapping && Object.keys(b.mapping).length) state = 'started';
  }
  return state;
}

// One record per difficulty like squares and cryptogram, and "started" is a
// rung committed rather than a letter typed — a ladder in progress is a list
// of words, so its length is the whole story.
function ladderState(s: Store | null): DailyState {
  const boards = Object.values((s?.daily ?? {}) as Record<string, Record<string, unknown>>);
  let state: DailyState = 'none';
  for (const b of boards) {
    if (!b) continue;
    if (b.solved === true || b.revealed === true) return 'done';
    if (Array.isArray(b.chain) && b.chain.length) state = 'started';
  }
  return state;
}

// A bridge board is done when every prompt is answered or the player gave up,
// and started at the first one found — the same shape as the ladder, counting
// entries rather than rungs.
function bridgeState(s: Store | null): DailyState {
  const boards = Object.values((s?.daily ?? {}) as Record<string, Record<string, unknown>>);
  let state: DailyState = 'none';
  for (const b of boards) {
    if (!b) continue;
    const entries = Array.isArray(b.entries) ? (b.entries as string[]) : [];
    const filled = entries.filter((e) => e).length;
    const prompts = Array.isArray(b.prompts) ? b.prompts.length : 0;
    if (b.revealed === true || (prompts > 0 && filled === prompts)) return 'done';
    if (filled) state = 'started';
  }
  return state;
}

const READERS: Record<Mode, { key: string; state: (s: Store | null) => DailyState }> = {
  bridge: { key: 'anagrimoire:bridge:v1', state: bridgeState },
  ladder: { key: 'anagrimoire:ladder:v1', state: ladderState },
  squares: { key: 'anagrimoire:squares:v1', state: squaresState },
  cryptogram: { key: 'anagrimoire:cryptogram:v1', state: cryptogramState },
  pattern: { key: 'anagrimoire:play:v1', state: guessState },
  bee: { key: 'anagrimoire:hive:v1', state: openState },
  boxed: { key: 'anagrimoire:box:v1', state: boxState },
  descramble: { key: 'anagrimoire:scramble:v1', state: sprintState },
  grid: { key: 'anagrimoire:grid:v1', state: sprintState },
  weave: { key: 'anagrimoire:weave:v1', state: weaveState },
};

export function dailyStatus(mode: Mode): DailyState {
  const { key, state } = READERS[mode];
  const store = read(key);
  // a store from yesterday describes yesterday's puzzle
  if (!store || store.dailyDate !== todayEt()) return 'none';
  return state(store);
}

export function allDailyStatus(modes: Mode[]): Record<string, DailyState> {
  return Object.fromEntries(modes.map((m) => [m, dailyStatus(m)]));
}
