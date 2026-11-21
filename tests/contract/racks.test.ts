// A Scramble rack as dealt must not read as a word: the full-rack word is the
// bonus, and a rack that spells one hands it over before the clock starts.
//
// The generator shuffled racks with sort(() => rng() - 0.5), which leaves a
// seven-letter word in order about one day in 42 per difficulty. 2026-11-20 is
// a day it did: the dev feed's easy rack was p-r-o-s-p-e-r. That day is pinned
// here, so this fails on the old shuffle and holds the rule on the new one.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const require = createRequire(import.meta.url);

const DATE = '2026-11-20';

// The widest list the generator loads (its TIER_FILES.extreme) -- the one it
// refuses racks against, at every difficulty.
const WIDEST = [
  'english-words-10', 'english-words-20', 'english-words-35',
  'american-words-10', 'american-words-20', 'american-words-35',
  'english-words-40', 'english-words-50', 'english-words-55',
  'american-words-40', 'american-words-50', 'american-words-55',
  'english-words-60', 'english-words-70', 'american-words-60', 'american-words-70',
];

let dir: string;
const racks: { feed: string; difficulty: string; letters: string }[] = [];

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'anagrimoire-racks-'));
  await run('node', ['scripts/fetch-puzzles.mjs'], {
    env: { ...process.env, SKIP_SOLVER_DATA: '1', PUZZLES_DATE: DATE, PUZZLES_DATA_DIR: dir },
    maxBuffer: 10 * 1024 * 1024,
  });
  for (const variant of ['', 'dev-']) {
    const feed = JSON.parse(await readFile(join(dir, `${variant}daily-scramble.json`), 'utf8'));
    for (const [difficulty, board] of Object.entries(feed.byDifficulty as Record<string, { letters: string[] }>)) {
      racks.push({ feed: `${variant}daily-scramble`, difficulty, letters: board.letters.join('') });
    }
  }
}, 180_000);

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe(`the racks dealt for ${DATE}`, () => {
  it('are all there: two feeds, three difficulties', () => {
    expect(racks).toHaveLength(6);
  });

  it('do not spell a word, in any list the generator knows', () => {
    const sevens = new Set<string>();
    for (const f of WIDEST) {
      for (const raw of require(`wordlist-english/${f}.json`) as string[]) {
        const w = String(raw).toLowerCase();
        if (w.length === 7) sevens.add(w);
      }
    }
    const spelled = racks.filter((r) => sevens.has(r.letters));
    expect(spelled, spelled.map((r) => `${r.feed} ${r.difficulty}: ${r.letters}`).join(', ')).toEqual([]);
  });
});
