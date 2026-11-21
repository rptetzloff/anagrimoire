// Fetches today's NYT Letter Boxed and Spelling Bee puzzles and generates
// daily guess-game words, writing data/letterboxed.json, data/spellingbee.json,
// and data/daily-words.json.
// Run by .github/workflows/daily-puzzle-data.yml on a daily schedule.
import { mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { generateWeave } from './weave.mjs';
import { generateSquare, GIVEN_TARGET } from './squares.mjs';
import { THEMES } from './themes.mjs';
import {
  generateCryptogram,
  generatePlayable,
  livePassages,
  TIER_BAND,
  TIER_VARIANTS,
} from './cryptogram.mjs';
import { generateLadder, livePairs, poolFor, TIER_PAR } from './ladder.mjs';
import {
  BOARD_SIZE,
  generateBoard,
  livePrompts,
  poolFor as bridgePoolFor,
  TIER_HINTS,
} from './bridge.mjs';
import { cycleOf, permutedIndex } from './walk.mjs';
import { shuffled, shuffledUntil } from './shuffle.mjs';
import { blockedSet, neverPublish as neverPublishSet } from './blocked.mjs';

const require = createRequire(import.meta.url);

// Seams for the test suite, invisible to the scheduled run: a pinned date so
// a contract test is deterministic, a redirected output directory so it never
// touches real data, and a switch to skip the NYT solver fetches so CI doesn't
// depend on nytimes.com being up.
const DATA_DIR = process.env.PUZZLES_DATA_DIR || 'data';
const SKIP_SOLVER_DATA = process.env.SKIP_SOLVER_DATA === '1';

// Mixed into every seed. The generator is public and the date is the only
// input, so without this, every future board is computable by anyone with a
// clone — the whole anti-transparency motive for the Postgres move. With it,
// determinism survives where it matters (the two scheduled runs agree, and a
// re-run reproduces the day) while outside reproduction dies. Empty string
// when unset, which is bit-for-bit the historical behaviour.
const SEED_SALT = process.env.PUZZLES_SEED_SALT || '';

const encodeAnswers = (p) =>
  Buffer.from(JSON.stringify({ spangram: p.spangram, words: p.words })).toString('base64');

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  Accept: 'text/html',
};

async function fetchGameData(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`${url} responded ${res.status}`);
  const html = await res.text();
  const match = html.match(/window\.gameData\s*=\s*(\{.+?\})\s*(?:;|<\/script>)/s);
  if (!match) throw new Error(`Could not locate window.gameData at ${url}`);
  return JSON.parse(match[1]);
}

await mkdir(DATA_DIR, { recursive: true });

if (!SKIP_SOLVER_DATA) {
// Letter Boxed
const lb = await fetchGameData('https://www.nytimes.com/puzzles/letter-boxed');
if (!Array.isArray(lb.sides) || lb.sides.length !== 4) {
  throw new Error(`Unexpected Letter Boxed sides: ${JSON.stringify(lb.sides)}`);
}
const lbOut = {
  date: lb.printDate ?? null,
  sides: lb.sides.map((s) => String(s).toLowerCase()),
  par: lb.par ?? null,
  fetchedAt: new Date().toISOString(),
};
await writeFile(`${DATA_DIR}/letterboxed.json`, JSON.stringify(lbOut, null, 2) + '\n');
console.log('Wrote letterboxed.json:', JSON.stringify(lbOut));

// Spelling Bee (letters only — no answers or pangrams)
const sb = await fetchGameData('https://www.nytimes.com/puzzles/spelling-bee');
const today = sb.today ?? sb;
if (!/^[a-z]$/i.test(String(today.centerLetter)) || !Array.isArray(today.outerLetters) || today.outerLetters.length !== 6) {
  throw new Error(`Unexpected Spelling Bee letters: ${JSON.stringify({ c: today.centerLetter, o: today.outerLetters })}`);
}
const sbOut = {
  date: today.printDate ?? null,
  center: String(today.centerLetter).toLowerCase(),
  outers: today.outerLetters.map((c) => String(c).toLowerCase()),
  fetchedAt: new Date().toISOString(),
};
await writeFile(`${DATA_DIR}/spellingbee.json`, JSON.stringify(sbOut, null, 2) + '\n');
console.log('Wrote spellingbee.json:', JSON.stringify(sbOut));

// NYT Strands (board letters and theme clue only — no answers)
const strandsRes = await fetch(`https://www.nytimes.com/svc/strands/v2/${
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date())
}.json`, { headers: HEADERS });
if (!strandsRes.ok) throw new Error(`Strands responded ${strandsRes.status}`);
const strands = await strandsRes.json();
if (
  !Array.isArray(strands.startingBoard) ||
  strands.startingBoard.length !== 8 ||
  !strands.startingBoard.every((r) => /^[a-z]{6}$/i.test(String(r)))
) {
  throw new Error(`Unexpected Strands board: ${JSON.stringify(strands.startingBoard)}`);
}
const strandsOut = {
  date: strands.printDate ?? null,
  clue: typeof strands.clue === 'string' ? strands.clue : null,
  board: strands.startingBoard.map((r) => String(r).toLowerCase()),
  fetchedAt: new Date().toISOString(),
};
await writeFile(`${DATA_DIR}/strands.json`, JSON.stringify(strandsOut, null, 2) + '\n');
console.log('Wrote strands.json:', JSON.stringify(strandsOut));
}

// Daily guess-game words: one per length 3-15, deterministic for the Eastern
// date so both scheduled runs pick identical words. Words are base64-encoded
// purely to avoid accidental spoilers in the raw file.
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}
function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Words we won't hand anyone as an answer. Applied to the pools puzzles are
// *built* from, never to the sets they're *validated* against: refusing to
// publish a word and refusing to accept one a player typed are different
// things, and only the first is ours to decide. See scripts/blocklist.mjs.
const blockedFromAnswers = blockedSet();

// The curated pools — ladder pairs, bridge prompts, cryptogram passages — are
// harvested once and committed, and the blocklist is not. So a word added to
// the blocklist leaves every pool quietly stale, still holding entries nobody
// would harvest today, and nothing notices until a contract test happens to
// trip over one. That is how `chink` stayed a live ladder pair.
//
// So the blocklist is applied here as well as at harvest: the harvest keeps the
// pool clean, and this keeps a stale pool from publishing. Only `both`-scope
// words, because these are passages and prompts rather than answers, and
// `generation` is where the ordinary words live — Lincoln's "we may hasten or
// we may retard", Milton's "Thrones, Dominations", Pope on "your sex's earliest
// care". Dropping those would be the Scunthorpe trade one level up.
//
// It does not fix everything a stale pool can be wrong about. The ladder's par
// is measured over a graph the blocklist prunes, so a pair whose route ran
// through a newly blocked word has a par nobody can reach — filtering the ends
// cannot see that, and the contract test is what catches it.
const neverPublish = neverPublishSet();

/** A generation pool with the blocked words taken out. */
function answerPool(set) {
  const out = new Set();
  for (const w of set) if (!blockedFromAnswers.has(w)) out.add(w);
  return out;
}

function loadTierSet(files) {
  const set = new Set();
  for (const f of files) {
    for (const raw of require(`wordlist-english/${f}.json`)) {
      const w = String(raw).toLowerCase();
      if (/^[a-z]+$/.test(w)) set.add(w);
    }
  }
  return set;
}

const COMMON_FILES = ['english-words-10', 'english-words-20', 'english-words-35', 'american-words-10', 'american-words-20', 'american-words-35'];
const STANDARD_FILES = [...COMMON_FILES, 'english-words-40', 'english-words-50', 'english-words-55', 'american-words-40', 'american-words-50', 'american-words-55'];

const etDate =
  process.env.PUZZLES_DATE ||
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());

// the cryptogram walks its pool by day number, so the date becomes one
const epochDay = Math.floor(Date.parse(`${etDate}T12:00:00Z`) / 86_400_000);

// The curated passage pools, human holds excluded. Loaded whole: 2,590
// passages is a word list, not a corpus.
//
// Two pools, not one: easy and hard share the standard band, extreme plays the
// short one. Keeping them separate is what lets the short harvest land without
// moving anybody's puzzle — the standard pool is the same 2,590 entries in the
// same order, so the walk below deals it exactly as it did before.
const parsedPassages = JSON.parse(
  readFileSync(new URL('./cryptogram-passages.json', import.meta.url), 'utf8')
);
const passagePools = {
  standard: livePassages(parsedPassages, 'standard', neverPublish),
  short: livePassages(parsedPassages, 'short', neverPublish),
};
const passagePoolFor = (difficulty) => passagePools[TIER_BAND[difficulty]];

// The ladder pairs, split by par into the band each difficulty plays. Split
// once here rather than per day: the walk needs a stable pool size, and a pool
// that changed length between calls would deal repeats.
const ladderPairs = livePairs(
  JSON.parse(readFileSync(new URL('./ladder-pairs.json', import.meta.url), 'utf8')),
  neverPublish
);
const ladderPools = Object.fromEntries(
  Object.keys(TIER_PAR).map((d) => [d, poolFor(ladderPairs, d)])
);

// The bridge prompts. One pool for every difficulty — difficulty here is the
// hint budget, not the words — so unlike the ladder there is nothing to split.
// Loaded once, because the walk needs a stable pool length: a pool that
// changed size between calls would deal repeats.
const bridgePool = bridgePoolFor(
  livePrompts(
    JSON.parse(readFileSync(new URL('./bridge-prompts.json', import.meta.url), 'utf8')),
    neverPublish
  )
);

// Three difficulties, and they don't all mean the same thing. Guess, Hive,
// Boxed and Scramble vary by word tier; Grid varies only by what it accepts,
// so its board is the same at every level; Squares and Weave vary by shape,
// because a tier is meaningless to a dice grid or to hand-curated themes.
export const DIFFICULTIES = ['easy', 'hard', 'extreme'];

/** The band below each difficulty, so a difficulty can generate from what it
 *  alone adds. */
const PREVIOUS = { hard: 'easy', extreme: 'hard' };

const TIER_FILES = {
  easy: COMMON_FILES,
  hard: STANDARD_FILES,
  extreme: [
    ...STANDARD_FILES,
    'english-words-60',
    'english-words-70',
    'american-words-60',
    'american-words-70',
  ],
};

// Squares checks solution uniqueness against this, unfiltered on purpose: a
// square with a rude second solution is still a square with two solutions, and
// we want to know.
let uniquenessSet = null;
const uniquenessWords = () => (uniquenessSet ??= loadTierSet(STANDARD_FILES));

// How many words a hive board actually yields, which nothing used to check.
//
// Sampling 60 bases per difficulty found boards ranging from 6 findable words
// to 210, with about one in seven under twenty — at every difficulty, easy
// included. That's a thin puzzle arriving by chance rather than by design, and
// it has nothing to do with difficulty: seven letters' worth of words doesn't
// care whether the seed word was common or obscure.
//
// Counted against the list the game actually accepts, so the number here is
// the number a player can reach.
const HIVE_MIN_WORDS = 30;

let hiveIndex = null;
function hiveWordIndex() {
  if (hiveIndex) return hiveIndex;
  const bit = (c) => 1 << (c.charCodeAt(0) - 97);
  const words = [];
  for (const w of uniquenessWords()) {
    if (w.length < 4) continue;
    let mask = 0;
    for (const c of w) mask |= bit(c);
    // seven letters at most, or it can never fit on a board
    if (mask && (mask & (mask - 1)) !== 0) words.push({ mask, letters: mask });
  }
  hiveIndex = { words, bit };
  return hiveIndex;
}

/** Words findable on this board: every letter on the board, and the centre. */
function hiveWordCount(letters, center) {
  const { words, bit } = hiveWordIndex();
  let board = 0;
  for (const c of letters) board |= bit(c);
  const need = bit(center);
  let n = 0;
  for (const w of words) if ((w.mask & ~board) === 0 && (w.mask & need) !== 0) n++;
  return n;
}

// Daily box for play mode: our own generated Letter Boxed-style puzzle.
// Built from two chainable words covering exactly 12 distinct letters, with
// sides assigned so no consecutive pair shares a side — which guarantees a
// two-word solution exists. Deterministic per Eastern date.
function assignSides(w1, w2, rng) {
  const letters = [...new Set(w1 + w2)];
  const adjacent = new Set();
  for (const w of [w1, w2]) {
    for (let i = 1; i < w.length; i++) {
      adjacent.add(w[i - 1] + w[i]);
      adjacent.add(w[i] + w[i - 1]);
    }
  }
  // most-constrained letters first
  const degree = (c) => letters.filter((x) => adjacent.has(c + x)).length;
  letters.sort((a, b) => degree(b) - degree(a));
  const sides = [[], [], [], []];
  const bt = (i) => {
    if (i === letters.length) return true;
    const c = letters[i];
    const order = shuffled([0, 1, 2, 3], rng);
    for (const s of order) {
      if (sides[s].length >= 3) continue;
      if (sides[s].some((x) => adjacent.has(x + c))) continue;
      sides[s].push(c);
      if (bt(i + 1)) return true;
      sides[s].pop();
    }
    return false;
  };
  return bt(0) ? sides.map((s) => s.join('')) : null;
}

/** Everything a difficulty draws from, built once and reused.
 *
 *  These used to be module-level constants off the common tier, which was fine
 *  while there was one difficulty and wrong the moment there were three. */
const poolCache = new Map();

/** How many candidates a length needs to go a year without repeating itself. */
const YEAR = 365;

// Every seven-letter word in the widest list, the blocked ones included: what
// a dealt rack must not spell. The widest rather than the difficulty's own,
// because a rack that reads as a word gives something away whether or not
// that difficulty accepts it; unfiltered, because the one a rack must least
// spell is a blocked one.
let sevensCache = null;
function allSevens() {
  sevensCache ??= new Set([...loadTierSet(TIER_FILES.extreme)].filter((w) => w.length === 7));
  return sevensCache;
}

function poolsFor(difficulty) {
  const cached = poolCache.get(difficulty);
  if (cached) return cached;

  // Everything the difficulty accepts...
  const cumulative = answerPool(loadTierSet(TIER_FILES[difficulty]));

  // ...but generate from the band it *adds*, not the whole nested pool.
  // Cumulative pools make a mockery of the ladder: extreme is 35% easy words,
  // so a third of extreme puzzles would land on one. Measured, that's exactly
  // what happened — the first extreme run drew "cat" for three letters while
  // easy drew "coo".
  const easier = difficulty === 'easy' ? null : answerPool(loadTierSet(TIER_FILES[PREVIOUS[difficulty]]));
  const answers = easier
    ? new Set([...cumulative].filter((w) => !easier.has(w)))
    : cumulative;

  // no 's' in the hive — plurals would flood the answer list
  const hiveBases = [...answers]
    .filter((w) => w.length >= 7 && new Set(w).size === 7 && !w.includes('s'))
    .sort();
  if (!hiveBases.length) throw new Error(`No pangram bases for ${difficulty} hive`);

  const rackBases = [...answers].filter((w) => w.length === 7).sort();
  if (!rackBases.length) throw new Error(`No seven-letter rack bases for ${difficulty}`);

  const boxWords = [...answers].filter((w) => w.length >= 4 && !/(.)\1/.test(w)).sort();
  const boxByFirst = new Map();
  for (const w of boxWords) {
    const g = boxByFirst.get(w[0]) ?? [];
    g.push(w);
    boxByFirst.set(w[0], g);
  }

  const pools = { answers, cumulative, hiveBases, rackBases, boxWords, boxByFirst };
  poolCache.set(difficulty, pools);
  return pools;
}

// Shape rather than tier. Squares takes letters away instead of growing the
// grid, because 6x6 double word squares don't exist in any usable number —
// measured at 0 out of 3 against all 22,418 six-letter words. Weave stops at
// 8x10 because a theme carries about 91 letters and 10x12 needs 120.
const SQUARE_SHAPE = {
  easy: { size: 4, given: 8 },
  hard: { size: 5, given: 10 },
  extreme: { size: 5, given: 6 },
};
const WEAVE_SHAPE = { easy: [6, 8], hard: [7, 9], extreme: [8, 10] };

const GRID_DICE = [
  'aaeegn', 'abbjoo', 'achops', 'affkps',
  'aoottw', 'cimotu', 'deilrx', 'delrvy',
  'distty', 'eeghnw', 'eeinsu', 'ehrtvw',
  'eiosst', 'elrtty', 'himnuq', 'hlnnrz',
];

// The twenty-five-die set, matching src/GridGame.tsx. Grid varies by board
// size — 4x4 then 5x5 — and by the list it's scored against, which is the
// dial that separates hard from extreme since both are 5x5. Three by three was
// measured and dropped: a median of 19 findable words and a worst board of 4,
// which isn't a hard puzzle but an empty one.
const GRID_DICE_5 = [
  'aaafrs', 'aaeeee', 'aafirs', 'adennn', 'aeeeem',
  'aeegmu', 'aegmnn', 'afirsy', 'bjkqxz', 'ccnstw',
  'ceiilt', 'ceilpt', 'ceipst', 'ddlnor', 'dhhlor',
  'dhhnot', 'dhlnor', 'eiiitt', 'emottt', 'ensssu',
  'fiprsy', 'gorrvw', 'hiprry', 'nootuw', 'ooottu',
];

const GRID_SHAPE = { easy: 4, hard: 5, extreme: 5 };

// Two independent daily sets: production, and a dev-salted set for
// dev.anagrimoire.com/localhost so testing never spoils the production
// puzzles. Everything stays deterministic per Eastern date.
// Easy keeps the seed it has always had, so shipping difficulty doesn't
// change the puzzle anyone is already playing — only hard and extreme are new.
// Without this, republishing mid-day would swap today's board out from under
// whoever is on it.
const diffSalt = (d) => (d === 'easy' ? '' : `-${d}`);

const dailyWeaveClues = new Set();
const dailyCryptogramTexts = new Set();
const dailyLadderPairs = new Set();
const dailyBridgePrompts = new Set();
for (const variant of ['', 'dev']) {
  const salt = variant ? `-${variant}` : '';
  const prefix = variant ? 'dev-' : '';
  const stamp = new Date().toISOString();

  // guess words: one per length 3-12. Each length is its own daily stream, so
  // what matters is depth per length rather than the total: at 13, 14 and 15
  // the common tier holds 558, 199 and 82 words, and 82 is under three months
  // before every fifteen-letter daily has been used. Twelve still has 1,065,
  // which is three years. Cutting lower would cost words and buy nothing —
  // below 12 the thinnest stream becomes length 3, not the long end.
  const guessByDifficulty = {};
  for (const difficulty of DIFFICULTIES) {
    // Salted per difficulty. Without it the same seed draws the same index
    // from three nested pools and lands on the same word more often than
    // chance would.
    const rng = mulberry32(xmur3(`${SEED_SALT}anagrimoire-guess-${etDate}${salt}${diffSalt(difficulty)}`)());
    const { answers, cumulative } = poolsFor(difficulty);
    const words = {};
    for (let len = 3; len <= 12; len++) {
      // skip simple plurals whose stem is also a word
      const at = (set) =>
        [...set]
          .filter((w) => w.length === len && !(w.endsWith('s') && set.has(w.slice(0, -1))))
          .sort(); // Set iteration order is insertion order — sort for determinism
      // The band first. Three-letter words are the one place it runs dry —
      // 154 hard-only and 148 extreme-only, under five months before repeating
      // — because short words are almost all common ones. There the ladder
      // widens rather than repeat itself, which is the honest trade.
      let pool = at(answers);
      if (pool.length < YEAR) pool = at(cumulative);
      if (pool.length === 0) throw new Error(`No ${difficulty} words of length ${len}`);
      words[len] = Buffer.from(pool[Math.floor(rng() * pool.length)]).toString('base64');
    }
    // wrapped in { words } so every byDifficulty entry has the same field
    // names as the top level — the client merges one over the other, and a
    // variant shaped differently silently leaves the easy board in place
    guessByDifficulty[difficulty] = { words };
  }
  await writeFile(
    `${DATA_DIR}/${prefix}daily-words.json`,
    JSON.stringify(
      {
        date: etDate,
        byDifficulty: guessByDifficulty,
        fetchedAt: stamp,
      },
      null,
      2
    ) + '\n'
  );
  console.log(`Wrote data/${prefix}daily-words.json for ${etDate}`);

  // hive: seeded from a pangram so it is always completable
  const hiveByDifficulty = {};
  for (const difficulty of DIFFICULTIES) {
    const hiveRng = mulberry32(xmur3(`${SEED_SALT}anagrimoire-hive-${etDate}${salt}${diffSalt(difficulty)}`)());
    const { hiveBases } = poolsFor(difficulty);
    // Keep looking until the board is worth playing. The centre matters as
    // much as the letters — the same seven letters can yield 9 words with one
    // centre and 90 with another — so every centre is tried before the base is
    // given up on.
    let picked = null;
    let best = null;
    for (let attempt = 0; attempt < 300 && !picked; attempt++) {
      const base = hiveBases[Math.floor(hiveRng() * hiveBases.length)];
      const letters = [...new Set(base)];
      for (const center of shuffled(letters, hiveRng)) {
        const count = hiveWordCount(letters, center);
        if (!best || count > best.count) best = { letters, center, count };
        if (count >= HIVE_MIN_WORDS) {
          picked = { letters, center, count };
          break;
        }
      }
    }
    // Three hundred bases without one is not a thin day, it's a broken pool —
    // but a puzzle nobody can play is worse than a thin one, so take the best
    // seen and say so.
    if (!picked) {
      picked = best;
      console.warn(
        `hive ${difficulty}: no board reached ${HIVE_MIN_WORDS} words; using ${best.count}`
      );
    }
    const outers = shuffled(picked.letters.filter((c) => c !== picked.center), hiveRng);
    hiveByDifficulty[difficulty] = { center: picked.center, outers };
    hiveByDifficulty[difficulty].words = picked.count;
  }
  await writeFile(
    `${DATA_DIR}/${prefix}daily-hive.json`,
    JSON.stringify(
      { date: etDate, byDifficulty: hiveByDifficulty, fetchedAt: stamp },
      null,
      2
    ) + '\n'
  );
  console.log(
    `Wrote data/${prefix}daily-hive.json: ` +
      DIFFICULTIES.map(
        (d) =>
          `${hiveByDifficulty[d].center}/${hiveByDifficulty[d].outers.join('')} (${hiveByDifficulty[d].words}w)`
      ).join(' ')
  );

  // box: two chainable words covering exactly 12 distinct letters
  const boxByDifficulty = {};
  for (const difficulty of DIFFICULTIES) {
    const boxRng = mulberry32(xmur3(`${SEED_SALT}anagrimoire-box-${etDate}${salt}${diffSalt(difficulty)}`)());
    const { boxWords, boxByFirst } = poolsFor(difficulty);
    let boxSides = null;
    for (let attempt = 0; attempt < 2000 && !boxSides; attempt++) {
      const w1 = boxWords[Math.floor(boxRng() * boxWords.length)];
      const cands = (boxByFirst.get(w1[w1.length - 1]) ?? []).filter(
        (w2) => w2 !== w1 && new Set(w1 + w2).size === 12
      );
      if (!cands.length) continue;
      const w2 = cands[Math.floor(boxRng() * cands.length)];
      boxSides = assignSides(w1, w2, boxRng);
    }
    if (!boxSides) throw new Error(`Could not generate a ${difficulty} daily box`);
    boxByDifficulty[difficulty] = { sides: boxSides, par: 2 };
  }
  await writeFile(
    `${DATA_DIR}/${prefix}daily-box.json`,
    JSON.stringify(
      { date: etDate, byDifficulty: boxByDifficulty, fetchedAt: stamp },
      null,
      2
    ) + '\n'
  );
  console.log(
    `Wrote data/${prefix}daily-box.json: ` +
      DIFFICULTIES.map((d) => boxByDifficulty[d].sides.join('/')).join('  ')
  );

  // scramble rack: shuffled seven-letter word, full-rack bonus guaranteed
  const scrambleByDifficulty = {};
  for (const difficulty of DIFFICULTIES) {
    const scrambleRng = mulberry32(
      xmur3(`${SEED_SALT}anagrimoire-scramble-${etDate}${salt}${diffSalt(difficulty)}`)()
    );
    const { rackBases } = poolsFor(difficulty);
    const sevens = allSevens();
    const rackBase = rackBases[Math.floor(scrambleRng() * rackBases.length)];
    scrambleByDifficulty[difficulty] = {
      // dealt so the rack does not read as a word (shuffle.mjs): shuffled with
      // sort(), it was its own answer about one day in 42
      letters: shuffledUntil(rackBase.split(''), (d) => sevens.has(d.join('')), scrambleRng),
    };
  }
  await writeFile(
    `${DATA_DIR}/${prefix}daily-scramble.json`,
    JSON.stringify(
      {
        date: etDate,
        byDifficulty: scrambleByDifficulty,
        fetchedAt: stamp,
      },
      null,
      2
    ) + '\n'
  );
  console.log(
    `Wrote data/${prefix}daily-scramble.json: ` +
      DIFFICULTIES.map((d) => scrambleByDifficulty[d].letters.join('')).join(' ')
  );

  // 4x4 grid from the classic dice (q treated as a plain letter)
  const gridRng = mulberry32(xmur3(`${SEED_SALT}anagrimoire-grid-${etDate}${salt}`)());
  const gridByDifficulty = {};
  for (const difficulty of DIFFICULTIES) {
    const gridRng = mulberry32(
      xmur3(`${SEED_SALT}anagrimoire-grid-${etDate}${salt}${diffSalt(difficulty)}`)()
    );
    const dice = GRID_SHAPE[difficulty] === 5 ? GRID_DICE_5 : GRID_DICE;
    gridByDifficulty[difficulty] = {
      cells: shuffled(dice.map((d) => d[Math.floor(gridRng() * 6)]), gridRng),
    };
  }
  await writeFile(
    `${DATA_DIR}/${prefix}daily-grid.json`,
    JSON.stringify(
      {
        date: etDate,
        byDifficulty: gridByDifficulty,
        fetchedAt: stamp,
      },
      null,
      2
    ) + '\n'
  );
  console.log(
    `Wrote data/${prefix}daily-grid.json: ` +
      DIFFICULTIES.map((d) => `${Math.round(Math.sqrt(gridByDifficulty[d].cells.length))}x`).join(' ')
  );

  // weave: themed 6x8 tiling puzzle (Strands-style); answers ship base64d
  // to avoid casual spoilers
  // Weave varies by board size, not by word tier — its words come from
  // hand-curated themes, so there is no tier to widen. 10x12 was the obvious
  // extreme and doesn't exist: a theme carries about 91 letters and 120 cells
  // need 120.
  const weaveByDifficulty = {};
  for (const difficulty of DIFFICULTIES) {
    const [cols, rows] = WEAVE_SHAPE[difficulty];
    const weaveRng = mulberry32(xmur3(`${SEED_SALT}anagrimoire-weave-${etDate}${salt}${diffSalt(difficulty)}`)());
    const weave = generateWeave(weaveRng, cols, rows, THEMES);
    if (!weave) throw new Error(`Could not generate a ${difficulty} daily weave`);
    dailyWeaveClues.add(weave.clue);
    weaveByDifficulty[difficulty] = {
      clue: weave.clue,
      cols,
      board: weave.board,
      answers: encodeAnswers(weave),
    };
  }
  await writeFile(
    `${DATA_DIR}/${prefix}daily-weave.json`,
    JSON.stringify(
      {
        date: etDate,
        byDifficulty: weaveByDifficulty,
        fetchedAt: stamp,
      },
      null,
      2
    ) + '\n'
  );
  console.log(
    `Wrote data/${prefix}daily-weave.json: ` +
      DIFFICULTIES.map((d) => `${weaveByDifficulty[d].cols}w ${weaveByDifficulty[d].clue}`).join(' | ')
  );

  // squares: one 4x4 and one 5x5 a day. `cells` is the board as the player
  // first sees it, so the client renders without decoding anything; the
  // answer rides along base64'd for the reveal button, same as weave.
  // Squares varies by shape too, and by how much of it you're shown. 6x6
  // isn't an option — order-6 double word squares are scarce enough that the
  // generator found none in 3 attempts against all 22,418 six-letter words —
  // so extreme keeps the 5x5 grid and takes letters away. That also fixes the
  // spread: at 10 givens a line could hold 4 or even 5 of them, which hands
  // over a whole word.
  const squareBoards = {};
  const squaresByDifficulty = {};
  for (const difficulty of DIFFICULTIES) {
    const { size: n, given } = SQUARE_SHAPE[difficulty];
    const sqRng = mulberry32(
      xmur3(`${SEED_SALT}anagrimoire-squares-${etDate}${salt}${diffSalt(difficulty)}`)()
    );
    // built from the easy tier at every difficulty: these words are the answer
    // and have to be guessable, whatever the shape asks of you
    const sq = generateSquare(
      sqRng,
      n,
      [...poolsFor('easy').answers],
      [...uniquenessWords()],
      given
    );
    if (!sq) throw new Error(`Could not generate a ${difficulty} daily square`);
    const flat = sq.rows.join('').split('');
    const board = {
      size: n,
      cells: flat.map((ch, i) => (sq.given.includes(i) ? ch : null)),
      answer: Buffer.from(JSON.stringify({ rows: sq.rows })).toString('base64'),
    };
    squaresByDifficulty[difficulty] = board;
    // The legacy shape is keyed by size, and hard and extreme are both 5x5 —
    // so writing every difficulty here let extreme overwrite hard, and a
    // client reading boards[5] got the 6-given board while hard became
    // unreachable. Sizes keep meaning what they always meant: 4x4 easy,
    // 5x5 hard.
    if (difficulty !== 'extreme') squareBoards[n] = board;
  }
  await writeFile(
    `${DATA_DIR}/${prefix}daily-squares.json`,
    JSON.stringify(
      { date: etDate, byDifficulty: squaresByDifficulty, fetchedAt: stamp },
      null,
      2
    ) + '\n'
  );
  console.log(
    `Wrote data/${prefix}daily-squares.json: ` +
      DIFFICULTIES.map((d) => {
        const b = squaresByDifficulty[d];
        return `${d} ${b.size}x${b.size} ${b.cells.filter(Boolean).length} given`;
      }).join(', ')
  );

  // cryptogram: a passage per difficulty under a fresh substitution cipher.
  // The passage pick walks ONE permutation per cycle with the difficulties
  // offset a third of the pool apart — same-day difficulties can never
  // collide, and no difficulty repeats a passage inside a pool-sized window:
  // seven years for easy and hard, and a little under a year for extreme,
  // whose short band is 350 passages rather than 2,590. Extreme cannot collide
  // with the other two at all now, since it is reading a different pool.
  // The cipher and reveals are then seeded per date and difficulty like every
  // other game.
  const cryptogramByDifficulty = {};
  DIFFICULTIES.forEach((difficulty, di) => {
    const passagePool = passagePoolFor(difficulty);
    const position = epochDay + di * Math.floor(passagePool.length / 3);
    const cycle = cycleOf(position, passagePool.length);
    // seeded by the cycle, not the date: every day in a cycle must deal the
    // same permutation or the no-repeat walk is just random picks again
    const cycleRng = mulberry32(
      xmur3(`${SEED_SALT}anagrimoire-cryptogram-cycle-${cycle}${salt}`)()
    );
    const passage = passagePool[permutedIndex(cycleRng, passagePool.length, position)];
    dailyCryptogramTexts.add(passage.text);
    const rng = mulberry32(
      xmur3(`${SEED_SALT}anagrimoire-cryptogram-${etDate}${salt}${diffSalt(difficulty)}`)()
    );
    // which cipher today is, drawn from the tier's own pool — the board
    // announces it, so the variety is something a player can learn to use
    const options = TIER_VARIANTS[difficulty];
    const chosen = Math.floor(rng() * options.length);
    // The day's passage is fixed by the walk, so when a cipher cannot make a
    // board worth solving out of it the only thing left to change is the
    // cipher. generatePlayable re-deals first, so this is rare — two passages
    // in the short band, and none anywhere else.
    let board = null;
    for (let i = 0; i < options.length && !board; i++) {
      board = generatePlayable(passage, rng, options[(chosen + i) % options.length]);
    }
    cryptogramByDifficulty[difficulty] = board ?? generateCryptogram(passage, rng, options[chosen]);
  });
  await writeFile(
    `${DATA_DIR}/${prefix}daily-cryptogram.json`,
    JSON.stringify(
      { date: etDate, byDifficulty: cryptogramByDifficulty, fetchedAt: stamp },
      null,
      2
    ) + '\n'
  );
  console.log(
    `Wrote data/${prefix}daily-cryptogram.json: ` +
      DIFFICULTIES.map((d) => {
        const b = cryptogramByDifficulty[d];
        return `${d} ${b.label}, ${b.tokens.length} tokens, ${Object.keys(b.reveals).length} revealed`;
      }).join(' | ')
  );

  // ladder: a pair per difficulty, walked out of that difficulty's own pool.
  // Each band is its own walk because they are separate pools — a pair is in
  // exactly one band, by its par — so there is no offset to keep them apart
  // and no way for two difficulties to collide.
  //
  // No answer is published, because there isn't one to publish. A ladder is
  // checked by rule rather than against a stored route, so the feed carries
  // what the player can already see: both ends, and the number of steps.
  const ladderByDifficulty = {};
  DIFFICULTIES.forEach((difficulty) => {
    const pool = ladderPools[difficulty];
    const cycle = cycleOf(epochDay, pool.length);
    const cycleRng = mulberry32(
      xmur3(`${SEED_SALT}anagrimoire-ladder-cycle-${difficulty}-${cycle}${salt}`)()
    );
    const pair = pool[permutedIndex(cycleRng, pool.length, epochDay)];
    dailyLadderPairs.add(`${pair.a} ${pair.b}`);
    ladderByDifficulty[difficulty] = generateLadder(pair);
  });
  // bridge: five prompts a difficulty, walked out of the one pool. All three
  // deal from the same prompts — difficulty is the hint budget, not the words —
  // so each difficulty gets its own walk offset to keep the boards apart. The
  // offset is a whole board's worth, so two difficulties cannot overlap even
  // when the walk skips for a repeated answer.
  //
  // The answers ride along in the payload. A bridge is checked by rule, like a
  // ladder, so the server does not need them to mark a board — but a hint has
  // to know the word before the player does, and hints are client-side.
  const bridgeByDifficulty = {};
  // shared across the day's three boards, so a difficulty cannot land on an
  // answer another one already spent
  const spentToday = new Set();
  DIFFICULTIES.forEach((difficulty, tier) => {
    const cycle = cycleOf(epochDay, bridgePool.length);
    const cycleRng = mulberry32(
      xmur3(`${SEED_SALT}anagrimoire-bridge-cycle-${cycle}${salt}`)()
    );
    const board = generateBoard(
      bridgePool,
      cycleRng,
      epochDay * BOARD_SIZE * DIFFICULTIES.length + tier * BOARD_SIZE,
      { exclude: spentToday }
    );
    for (const m of board.answers) spentToday.add(m);
    for (const p of board.prompts) dailyBridgePrompts.add(`${p.x} ${p.y}`);
    bridgeByDifficulty[difficulty] = {
      prompts: board.prompts,
      answers: Buffer.from(JSON.stringify(board.answers)).toString('base64'),
      hints: TIER_HINTS[difficulty],
    };
  });
  await writeFile(
    `${DATA_DIR}/${prefix}daily-bridge.json`,
    JSON.stringify({ date: etDate, byDifficulty: bridgeByDifficulty, fetchedAt: stamp }, null, 2) +
      '\n'
  );
  console.log(
    `Wrote data/${prefix}daily-bridge.json: ` +
      DIFFICULTIES.map((d) => {
        const b = bridgeByDifficulty[d];
        return `${d} ${b.prompts.length} prompts, ${b.hints} hints`;
      }).join(' | ')
  );

  await writeFile(
    `${DATA_DIR}/${prefix}daily-ladder.json`,
    JSON.stringify({ date: etDate, byDifficulty: ladderByDifficulty, fetchedAt: stamp }, null, 2) +
      '\n'
  );
  console.log(
    `Wrote data/${prefix}daily-ladder.json: ` +
      DIFFICULTIES.map((d) => {
        const b = ladderByDifficulty[d];
        return `${d} ${b.from}->${b.to} in ${b.par}`;
      }).join(' | ')
  );
}

// shared practice pool for weave: pre-generated boards in both sizes,
// refreshed daily, used by both sites. Both variants' daily themes are
// held out so practice never spoils a daily puzzle.
const poolRng = mulberry32(xmur3(`${SEED_SALT}anagrimoire-weave-pool-${etDate}`)());
const poolThemes = THEMES.filter((t) => !dailyWeaveClues.has(t.clue));
// Keyed by difficulty, and by the shape that difficulty means, so a player on
// hard gets hard practice. The old size keys ride along for a client that
// predates difficulty — 6x8 was what practice always drew.
const pool = { '6x8': [], '7x9': [], '8x10': [] };
const weavePoolByDifficulty = { easy: [], hard: [], extreme: [] };
for (const [difficulty, count] of [['easy', 20], ['hard', 20], ['extreme', 20]]) {
  const [cols, rows] = WEAVE_SHAPE[difficulty];
  const key = `${cols}x${rows}`;
  const used = new Set();
  for (let i = 0; i < count; i++) {
    // prefer themes not yet in this size's pool for variety
    const fresh = poolThemes.filter((t) => !used.has(t.clue));
    const p =
      (fresh.length && generateWeave(poolRng, cols, rows, fresh)) ||
      generateWeave(poolRng, cols, rows, poolThemes);
    if (!p) throw new Error(`Could not generate pool weave ${key} #${i}`);
    used.add(p.clue);
    const board = { clue: p.clue, cols, board: p.board, answers: encodeAnswers(p) };
    pool[key].push(board);
    weavePoolByDifficulty[difficulty].push(board);
  }
}
await writeFile(
  `${DATA_DIR}/weave-pool.json`,
  JSON.stringify(
    {
      date: etDate,
      pool,
      byDifficulty: weavePoolByDifficulty,
      fetchedAt: new Date().toISOString(),
    },
    null,
    2
  ) + '\n'
);
console.log(
  `Wrote data/weave-pool.json: ` +
    DIFFICULTIES.map((d) => `${d} ${weavePoolByDifficulty[d].length}`).join(', ')
);

// shared practice pool for squares, same idea: pre-generated boards in both
// sizes so the browser never has to run the search itself.
const sqPoolRng = mulberry32(xmur3(`${SEED_SALT}anagrimoire-squares-pool-${etDate}`)());
// Same shapes the daily uses, so practice at a difficulty is practice for it.
// The size keys stay for a client that predates difficulty.
const squaresPool = { 4: [], 5: [] };
const squaresPoolByDifficulty = { easy: [], hard: [], extreme: [] };
for (const [difficulty, count] of [['easy', 20], ['hard', 12], ['extreme', 12]]) {
  const { size: n, given } = SQUARE_SHAPE[difficulty];
  const seen = new Set();
  for (let i = 0; i < count; i++) {
    const sq = generateSquare(
      sqPoolRng,
      n,
      [...poolsFor('easy').answers],
      [...uniquenessWords()],
      given
    );
    if (!sq) throw new Error(`Could not generate pool square ${n}x${n} #${i}`);
    const key = sq.rows.join('/');
    if (seen.has(key)) continue;
    seen.add(key);
    const flat = sq.rows.join('').split('');
    const board = {
      size: n,
      cells: flat.map((ch, j) => (sq.given.includes(j) ? ch : null)),
      answer: Buffer.from(JSON.stringify({ rows: sq.rows })).toString('base64'),
    };
    squaresPool[n].push(board);
    squaresPoolByDifficulty[difficulty].push(board);
  }
}
await writeFile(
  `${DATA_DIR}/squares-pool.json`,
  JSON.stringify(
    {
      date: etDate,
      pool: squaresPool,
      byDifficulty: squaresPoolByDifficulty,
      fetchedAt: new Date().toISOString(),
    },
    null,
    2
  ) + '\n'
);
console.log(
  `Wrote data/squares-pool.json: ` +
    DIFFICULTIES.map((d) => `${d} ${squaresPoolByDifficulty[d].length}`).join(', ')
);

// shared practice pool for cryptogram: both variants' daily passages are held
// out so practice never spoils a daily, same as weave's themes.
const cgPoolRng = mulberry32(xmur3(`${SEED_SALT}anagrimoire-cryptogram-pool-${etDate}`)());
const cryptogramPoolByDifficulty = { easy: [], hard: [], extreme: [] };
for (const difficulty of DIFFICULTIES) {
  // practice draws from the same band the difficulty plays, or extreme would
  // rehearse on passages half again as long as the ones it serves
  const cgPoolPassages = passagePoolFor(difficulty).filter((p) => !dailyCryptogramTexts.has(p.text));
  const used = new Set();
  const options = TIER_VARIANTS[difficulty];
  for (let i = 0; i < 10; i++) {
    // walk the tier's variants in turn rather than drawing at random, so a
    // practice pool of ten always covers every cipher the tier can serve
    const variant = options[i % options.length];
    let board = null;
    while (!board) {
      let p;
      do {
        p = cgPoolPassages[Math.floor(cgPoolRng() * cgPoolPassages.length)];
      } while (used.has(p.text));
      used.add(p.text);
      // Practice, unlike the daily, is not tied to one passage — so when a
      // cipher cannot make a board out of this one, draw another passage
      // rather than another cipher. Changing the cipher here would quietly
      // drop it from the pool, and covering every cipher is the point.
      board = generatePlayable(p, cgPoolRng, variant);
    }
    cryptogramPoolByDifficulty[difficulty].push(board);
  }
}
await writeFile(
  `${DATA_DIR}/cryptogram-pool.json`,
  JSON.stringify(
    {
      date: etDate,
      byDifficulty: cryptogramPoolByDifficulty,
      fetchedAt: new Date().toISOString(),
    },
    null,
    2
  ) + '\n'
);
console.log(
  `Wrote data/cryptogram-pool.json: ` +
    DIFFICULTIES.map((d) => `${d} ${cryptogramPoolByDifficulty[d].length}`).join(', ')
);

// shared practice pool for the bridge: ten boards a difficulty, with today's
// prompts held out so practice never spoils a daily — same as weave's themes,
// the cryptogram passages and the ladder pairs.
const bridgePoolRng = mulberry32(xmur3(`${SEED_SALT}anagrimoire-bridge-pool-${etDate}`)());
const bridgePoolByDifficulty = { easy: [], hard: [], extreme: [] };
for (const difficulty of DIFFICULTIES) {
  const available = bridgePool.filter((p) => !dailyBridgePrompts.has(`${p.x} ${p.y}`));
  for (let i = 0; i < 10; i++) {
    // a practice board is drawn rather than walked: it is not a daily, so it
    // has nothing to keep in step, and it only has to hold the same rule —
    // five prompts, five different answers
    const answers = new Set();
    const prompts = [];
    while (prompts.length < BOARD_SIZE) {
      const pick = available[Math.floor(bridgePoolRng() * available.length)];
      if (answers.has(pick.m)) continue;
      answers.add(pick.m);
      prompts.push(pick);
    }
    bridgePoolByDifficulty[difficulty].push({
      prompts: prompts.map((p) => ({ x: p.x, y: p.y })),
      answers: Buffer.from(JSON.stringify(prompts.map((p) => p.m))).toString('base64'),
      hints: TIER_HINTS[difficulty],
    });
  }
}
await writeFile(
  `${DATA_DIR}/bridge-pool.json`,
  JSON.stringify(
    { date: etDate, byDifficulty: bridgePoolByDifficulty, fetchedAt: new Date().toISOString() },
    null,
    2
  ) + '\n'
);
console.log(
  'Wrote data/bridge-pool.json: ' +
    DIFFICULTIES.map((d) => `${d} ${bridgePoolByDifficulty[d].length}`).join(', ')
);

// shared practice pool for the ladder: both variants' daily pairs are held out
// so practice never spoils a daily, same as weave's themes and the cryptogram
// passages.
const ladderPoolRng = mulberry32(xmur3(`${SEED_SALT}anagrimoire-ladder-pool-${etDate}`)());
const ladderPoolByDifficulty = { easy: [], hard: [], extreme: [] };
for (const difficulty of DIFFICULTIES) {
  const available = ladderPools[difficulty].filter(
    (p) => !dailyLadderPairs.has(`${p.a} ${p.b}`)
  );
  const used = new Set();
  for (let i = 0; i < 10; i++) {
    let pair;
    do {
      pair = available[Math.floor(ladderPoolRng() * available.length)];
    } while (used.has(`${pair.a} ${pair.b}`));
    used.add(`${pair.a} ${pair.b}`);
    ladderPoolByDifficulty[difficulty].push(generateLadder(pair));
  }
}
await writeFile(
  `${DATA_DIR}/ladder-pool.json`,
  JSON.stringify(
    { date: etDate, byDifficulty: ladderPoolByDifficulty, fetchedAt: new Date().toISOString() },
    null,
    2
  ) + '\n'
);
console.log(
  `Wrote data/ladder-pool.json: ` +
    DIFFICULTIES.map((d) => `${d} ${ladderPoolByDifficulty[d].length}`).join(', ')
);
