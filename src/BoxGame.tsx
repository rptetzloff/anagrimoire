import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { CornerDownLeft, Delete, Eye, LifeBuoy, RefreshCw, RotateCcw, Timer } from 'lucide-react';
import { formatElapsed, useUpTimer } from '@/useUpTimer';
import {
  difficulty,
  onDifficultyChange,
  resolveDifficulty,
  type Difficulty,
} from '@/difficulty';
import type { LetterState } from '@/GuessGame';
import { fetchDailyData } from '@/dailyData';
import DailyStats from '@/DailyStats';
import MobileKeyInput from '@/MobileKeyInput';
import ShareButton from '@/ShareButton';
import { useRailSlot } from '@/railSlot';
import { InRail, RailPanel } from '@/RailPanel';
import { shuffled } from '@/shuffle';
import { GAME_NAME } from '@/games';
import { dailyIntent } from '@/routing/entry';
import { offerDailySwitch, reportDaily } from '@/dailyBus';
import DailyToggle from '@/DailyToggle';
import { usePrefs } from '@/prefs';
import { useDailySync } from '@/useDailySync';
import { buildShare } from '@/share';
import { recordBoxSolve } from '@/stats';
import { store as siteStore } from '@/siteStorage';

export type BoxGameHandle = { pressKey: (k: string) => void };

const BOX_KEY = 'anagrimoire:box:v1';

type BoxRecord = {
  sides: string[];
  /** fewest words the board can be solved in, from the feed. The generator
   *  publishes it and the board used to state a hardcoded 2 beside it — true
   *  of every board so far, and a claim nothing kept honest. */
  par?: number;
  chain: string[];
  invalid?: string[]; // rejected non-dictionary guesses
  revealed?: boolean; // gave up — the board is over, incomplete
  elapsedMs?: number;
};
type BoxStore = {
  dailyMode: boolean;
  dailyDate: string;
  daily: BoxRecord | null;
  practice: BoxRecord | null;
};

const DEFAULT_STORE: BoxStore = { dailyMode: true, dailyDate: '', daily: null, practice: null };

function sanitizeRecord(r: unknown): BoxRecord | null {
  const rec = r as BoxRecord | null;
  if (
    !rec ||
    !Array.isArray(rec.sides) ||
    rec.sides.length !== 4 ||
    !rec.sides.every((s) => typeof s === 'string' && /^[a-z]{3}$/.test(s)) ||
    !Array.isArray(rec.chain)
  ) {
    return null;
  }
  return {
    sides: rec.sides,
    // practice boards are built out of two chaining words, so they are par 2
    // by construction, same as the generated daily
    par: typeof rec.par === 'number' && rec.par >= 1 ? rec.par : 2,
    chain: rec.chain.filter((w) => typeof w === 'string'),
    invalid: Array.isArray(rec.invalid) ? rec.invalid.filter((w) => typeof w === 'string') : [],
    revealed: rec.revealed === true,
    elapsedMs: typeof rec.elapsedMs === 'number' && rec.elapsedMs >= 0 ? rec.elapsedMs : 0,
  };
}

// An incoming /daily/ or /play/ link decides which board is waiting; without one
// we keep whatever the player last had open.
function loadStore(): BoxStore {
  const store = readStore();
  const forced = dailyIntent('boxed');
  return forced === null ? store : { ...store, dailyMode: forced };
}

function readStore(): BoxStore {
  try {
    const raw = siteStore.getItem(BOX_KEY);
    if (!raw) return DEFAULT_STORE;
    const p = JSON.parse(raw);
    return {
      dailyMode: p?.dailyMode !== false,
      dailyDate: typeof p?.dailyDate === 'string' ? p.dailyDate : '',
      daily: sanitizeRecord(p?.daily),
      practice: sanitizeRecord(p?.practice),
    };
  } catch {
    return DEFAULT_STORE;
  }
}

// generate a practice box from two chainable words covering 12 distinct
// letters; sides assigned so no consecutive pair shares one
function generateBox(commonWords: string[]): BoxRecord | null {
  const words = commonWords.filter((w) => w.length >= 4 && !/(.)\1/.test(w));
  const byFirst = new Map<string, string[]>();
  for (const w of words) {
    const g = byFirst.get(w[0]) ?? [];
    g.push(w);
    byFirst.set(w[0], g);
  }
  for (let attempt = 0; attempt < 500; attempt++) {
    const w1 = words[Math.floor(Math.random() * words.length)];
    const cands = (byFirst.get(w1[w1.length - 1]) ?? []).filter(
      (w2) => w2 !== w1 && new Set(w1 + w2).size === 12
    );
    if (!cands.length) continue;
    const w2 = cands[Math.floor(Math.random() * cands.length)];
    const letters = [...new Set(w1 + w2)];
    const adjacent = new Set<string>();
    for (const w of [w1, w2]) {
      for (let i = 1; i < w.length; i++) {
        adjacent.add(w[i - 1] + w[i]);
        adjacent.add(w[i] + w[i - 1]);
      }
    }
    const degree = (c: string) => letters.filter((x) => adjacent.has(c + x)).length;
    letters.sort((a, b) => degree(b) - degree(a));
    const sides: string[][] = [[], [], [], []];
    const bt = (i: number): boolean => {
      if (i === letters.length) return true;
      const c = letters[i];
      for (const s of shuffled([0, 1, 2, 3])) {
        if (sides[s].length >= 3) continue;
        if (sides[s].some((x) => adjacent.has(x + c))) continue;
        sides[s].push(c);
        if (bt(i + 1)) return true;
        sides[s].pop();
      }
      return false;
    };
    if (bt(0)) return { sides: sides.map((s) => s.join('')), chain: [] };
  }
  return null;
}

// each side gets its own hue so the four zones read at a glance; letter
// states (idle / in current word / used) are shades within the side's hue
const SIDE_TONES = [
  {
    idle: 'bg-sky-400/10 border-sky-400 text-sky-200 hover:bg-sky-400/20',
    current: 'bg-sky-400/20 border-sky-400/70 text-sky-100',
    used: 'bg-sky-400/40 border-sky-300 text-white',
  },
  {
    idle: 'bg-violet-400/10 border-violet-400 text-violet-200 hover:bg-violet-400/20',
    current: 'bg-violet-400/20 border-violet-400/70 text-violet-100',
    used: 'bg-violet-400/40 border-violet-300 text-white',
  },
  {
    idle: 'bg-rose-400/10 border-rose-400 text-rose-200 hover:bg-rose-400/20',
    current: 'bg-rose-400/20 border-rose-400/70 text-rose-100',
    used: 'bg-rose-400/40 border-rose-300 text-white',
  },
  {
    idle: 'bg-amber-400/10 border-amber-400 text-amber-200 hover:bg-amber-400/20',
    current: 'bg-amber-400/20 border-amber-400/70 text-amber-100',
    used: 'bg-amber-400/40 border-amber-300 text-white',
  },
];

// letter positions around the drawn square, per side (top, right, bottom, left)
const SIDE_POSITIONS: [number, number][][] = [
  [
    [24, 5],
    [50, 5],
    [76, 5],
  ],
  [
    [95, 24],
    [95, 50],
    [95, 76],
  ],
  [
    [24, 95],
    [50, 95],
    [76, 95],
  ],
  [
    [5, 24],
    [5, 50],
    [5, 76],
  ],
];

const BoxGame = forwardRef<
  BoxGameHandle,
  {
    standardWords: string[] | null;
    commonWords: string[] | null;
    /** the words this difficulty draws practice from */
    practiceWords: string[] | null;
    onLetterStates: (states: Record<string, LetterState>) => void;
    onReveal?: (sides: string[]) => void;
  }
>(function BoxGame({ standardWords, commonWords, onLetterStates, onReveal, practiceWords }, ref) {
  const [store, setStore] = useState<BoxStore>(loadStore);
  // Beside the board on a wide page, the game's own panel goes in the rail
  // (railSlot.ts); narrower, it is drawn here, where it always was.
  const rail = useRailSlot();
  const { practiceAllowed } = usePrefs();
  // pinned to the daily: someone who switched practice off shouldn't be left
  // looking at a practice board they can no longer leave
  useEffect(() => {
    if (!practiceAllowed && !store.dailyMode) setStore((prev) => ({ ...prev, dailyMode: true }));
  }, [practiceAllowed, store.dailyMode]);
  // the address bar says which board is open, and can ask for the other
  useEffect(() => reportDaily('boxed', store.dailyMode, store.dailyDate), [store.dailyMode, store.dailyDate]);
  useEffect(
    () => offerDailySwitch('boxed', (d) => setStore((prev) => ({ ...prev, dailyMode: d }))),
    []
  );
  const [current, setCurrent] = useState('');
  const [flash, setFlash] = useState<{ text: string; good: boolean } | null>(null);
  // The difficulty this board actually is. Usually the one asked for, but a
  // feed generated before difficulty existed only has the easy board, and a
  // result has to be recorded as what was played rather than what was wanted.
  const [playedAt, setPlayedAt] = useState<Difficulty>(difficulty);
  // Changing difficulty means a different board, so the feed has to be read
  // again. A storage write re-renders nothing on its own.
  const [difficultyTick, setDifficultyTick] = useState(0);
  useEffect(() => onDifficultyChange(() => setDifficultyTick((n) => n + 1)), []);

  // Clear the practice board when a new word band arrives, not when the
  // setting changes. The setting changes first and the band loads after, so
  // clearing on the change regenerated from the pool we were about to
  // replace — every level drew from the one below it.
  const practicePool = useRef<string[] | null>(null);
  useEffect(() => {
    if (!practiceWords || practicePool.current === practiceWords) return;
    const first = practicePool.current === null;
    practicePool.current = practiceWords;
    if (!first) setStore((prev) => ({ ...prev, practice: null }));
  }, [practiceWords]);
  const [dailyError, setDailyError] = useState(false);
  const flashTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    try {
      siteStore.setItem(BOX_KEY, JSON.stringify(store));
    } catch {
      // best-effort persistence
    }
  }, [store]);

  // fetch today's generated box once
  useEffect(() => {
    let alive = true;
    fetchDailyData('boxed')
      .then((raw) => {
        if (!alive) return;
        const chosen = resolveDifficulty(raw, difficulty());
        if (!chosen.board) throw new Error('bad payload');
        setPlayedAt(chosen.difficulty);
        // the date lives at the top level; the board's own fields come from
        // whichever difficulty was resolved
        const d = { ...raw, ...chosen.board };
        const rec = sanitizeRecord({ sides: d.sides, par: d.par, chain: [] });
        if (!rec || typeof d.date !== 'string') throw new Error('bad payload');
        // reset when the date changes OR the sides differ (e.g. the daily
        // source changed mid-day)
        setStore((prev) => {
          const same =
            prev.dailyDate === d.date &&
            prev.daily &&
            prev.daily.sides.join('') === rec.sides.join('');
          return same ? prev : { ...prev, dailyDate: d.date, daily: rec };
        });
      })
      .catch(() => {
        if (alive) setDailyError(true);
      });
    return () => {
      alive = false;
    };
  }, [difficultyTick]);

  // ensure a practice box exists once the dictionary is ready
  useEffect(() => {
    if (store.dailyMode || store.practice || !commonWords) return;
    const box = generateBox(practiceWords?.length ? practiceWords : commonWords);
    if (box) setStore((prev) => (prev.practice ? prev : { ...prev, practice: box }));
  }, [store.dailyMode, store.practice, commonWords, practiceWords]);

  const record = store.dailyMode ? store.daily : store.practice;

  const sideOf = useMemo(() => {
    const m = new Map<string, number>();
    record?.sides.forEach((side, i) => {
      for (const c of side) m.set(c, i);
    });
    return m;
  }, [record]);

  const standardSet = useMemo(
    () => (standardWords ? new Set(standardWords) : null),
    [standardWords]
  );

  const chain = useMemo(() => record?.chain ?? [], [record]);
  const committedCovered = useMemo(() => {
    const s = new Set<string>();
    for (const w of chain) for (const c of w) s.add(c);
    return s;
  }, [chain]);
  const solved = committedCovered.size === 12;
  const done = solved || !!record?.revealed;

  const syncing = useDailySync({
    difficulty: playedAt,
    game: 'box',
    date: store.dailyDate,
    record,
    setRecord: (merged) => setStore((prev) => ({ ...prev, daily: merged as BoxRecord })),
    // a revealed board still syncs its state, so the other device knows not to
    // hand you the same puzzle again — it just has no numbers worth averaging
    // the winning chain rides along with the result. Boxed is the one game you
    // can restart after finishing, and the row keeps its result when you do —
    // so the board in `state` stops being evidence for the score, and the
    // result has to carry its own.
    summary: solved
      ? { words: chain.length, timeMs: record?.elapsedMs ?? 0, chain }
      : null,
    active: store.dailyMode,
  });

  // thinking time: counts while the box is visible and unfinished
  useUpTimer(!!record && !done, (delta) =>
    updateRecord((r) => ({ ...r, elapsedMs: (r.elapsedMs ?? 0) + delta }))
  );

  // hover / press-hold a committed word to trace its chords on the box;
  // the current entry draws live as you type
  const [trace, setTrace] = useState<string | null>(null);
  useEffect(() => {
    setTrace(null);
  }, [record?.sides]);
  const letterPos = useMemo(() => {
    const m = new Map<string, [number, number]>();
    record?.sides.forEach((side, s) => {
      side.split('').forEach((c, j) => m.set(c, SIDE_POSITIONS[s][j]));
    });
    return m;
  }, [record?.sides]);

  function traceHandlers(word: string) {
    const show = () => setTrace(word);
    const hide = () => setTrace(null);
    return {
      onMouseEnter: show,
      onMouseLeave: hide,
      onPointerDown: show,
      onPointerUp: hide,
      onPointerCancel: hide,
    };
  }

  // the next word must start with the last letter of the previous one
  const lockedLen = chain.length > 0 ? 1 : 0;

  // keep the locked first letter in sync with the chain
  useEffect(() => {
    if (done) return;
    const lockChar = chain.length ? chain[chain.length - 1].slice(-1) : '';
    setCurrent((c) => (lockChar && !c.startsWith(lockChar) ? lockChar : c));
  }, [chain, done]);

  // dim non-box letters on the on-screen keyboard
  useEffect(() => {
    if (!record) {
      onLetterStates({});
      return;
    }
    const states: Record<string, LetterState> = {};
    for (const c of 'abcdefghijklmnopqrstuvwxyz') {
      if (!sideOf.has(c)) states[c] = 'absent';
    }
    onLetterStates(states);
  }, [record, sideOf, onLetterStates]);

  function showFlash(text: string, good = false) {
    setFlash({ text, good });
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 1600);
  }

  function updateRecord(fn: (r: BoxRecord) => BoxRecord) {
    setStore((prev) => {
      const rec = prev.dailyMode ? prev.daily : prev.practice;
      if (!rec) return prev;
      const next = fn(rec);
      return prev.dailyMode ? { ...prev, daily: next } : { ...prev, practice: next };
    });
  }

  function submit() {
    if (!record || done) return;
    if (!standardSet) {
      showFlash('Dictionary still loading…');
      return;
    }
    const word = current;
    if (word.length < 3) {
      showFlash('Too short');
      return;
    }
    if (chain.includes(word)) {
      showFlash('Already played');
      return;
    }
    if (!standardSet.has(word)) {
      updateRecord((r) =>
        r.invalid?.includes(word) ? r : { ...r, invalid: [...(r.invalid ?? []), word] }
      );
      showFlash('Not in dictionary');
      return;
    }
    const nextChain = [...chain, word];
    const nextCovered = new Set(nextChain.join(''));
    updateRecord((r) => ({ ...r, chain: nextChain }));
    setCurrent(word.slice(-1));
    if (nextCovered.size === 12) {
      setCurrent('');
      recordBoxSolve(
        store.dailyMode,
        nextChain.length,
        record.elapsedMs ?? 0,
        store.dailyMode ? store.dailyDate || null : null
      );
      showFlash(`Solved in ${nextChain.length} word${nextChain.length === 1 ? '' : 's'}! 🎉`, true);
    } else {
      showFlash(`+${new Set(word).size} letters`, true);
    }
  }

  function pressKey(k: string) {
    if (!record || done) return;
    if (k === 'enter') {
      submit();
      return;
    }
    if (k === 'backspace') {
      if (current.length > lockedLen) {
        setCurrent((c) => c.slice(0, -1));
      } else if (chain.length) {
        // un-commit the previous word for editing
        const prev = chain[chain.length - 1];
        updateRecord((r) => ({ ...r, chain: r.chain.slice(0, -1) }));
        setCurrent(prev);
      }
      return;
    }
    if (!/^[a-z]$/.test(k)) return;
    const side = sideOf.get(k);
    if (side === undefined) return;
    const last = current.slice(-1);
    if (last && sideOf.get(last) === side) {
      showFlash('Same side');
      return;
    }
    setCurrent((c) => (c.length < 24 ? c + k : c));
  }

  useImperativeHandle(ref, () => ({ pressKey }));

  // physical keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'Enter') pressKey('enter');
      else if (e.key === 'Backspace') pressKey('backspace');
      else if (/^[a-zA-Z]$/.test(e.key)) pressKey(e.key.toLowerCase());
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  function restart() {
    setCurrent('');
    updateRecord((r) => ({ ...r, chain: [] }));
  }

  function newPracticeBox() {
    if (!commonWords) return;
    const box = generateBox(practiceWords?.length ? practiceWords : commonWords);
    if (!box) return;
    setCurrent('');
    setStore((prev) => ({ ...prev, practice: box }));
  }

  const loading =
    (store.dailyMode ? !record && !dailyError : !record || !commonWords) || syncing;
  const lastChar = current.slice(-1);

  return (
    <div className="text-center">
      <DailyToggle
        daily={store.dailyMode}
        onChange={(d) => {
          setCurrent('');
          setStore((prev) => ({ ...prev, dailyMode: d }));
        }}
      />

      {loading && <p className="text-sm text-slate-400 py-8">Loading…</p>}
      {store.dailyMode && dailyError && !record && (
        <p className="text-sm text-danger py-8">
          Couldn&apos;t fetch today&apos;s box — try Practice instead.
        </p>
      )}

      {record && (
        <>
          {!rail && (
          <div className="mb-3 flex items-center justify-center gap-4 text-xs text-slate-400">
            <span className="inline-flex items-center gap-1.5 tabular-nums">
              <Timer className="w-3.5 h-3.5 text-slate-500" />
              {formatElapsed(record.elapsedMs ?? 0)}
            </span>
            <span>
              {committedCovered.size} / 12 letters
            </span>
            <span className="text-slate-500">Solvable in {record.par ?? 2}</span>
            {store.dailyMode && store.dailyDate && (
              <span className="text-slate-500">{store.dailyDate}</span>
            )}
          </div>
          )}

          {/* committed chain — extra clearance when the entry box between it
              and the board is gone (finished) */}
          <div className={`${done ? 'mb-7' : 'mb-2'} flex flex-wrap items-center justify-center gap-1.5 text-sm`}>
            {chain.map((w, i) => (
              <span key={i} className="text-emerald-300">
                <span
                  {...traceHandlers(w)}
                  title="Hover to trace on the box"
                  className="cursor-pointer select-none hover:text-emerald-200 underline decoration-dotted decoration-emerald-500/40 underline-offset-2"
                >
                  {w}
                </span>
                {(!done || i < chain.length - 1) && <span className="text-slate-600"> →</span>}
              </span>
            ))}
          </div>
          {/* current entry */}
          {!done && (
            <div className="relative mb-6 mx-auto max-w-sm h-12 px-4 rounded-xl bg-white/5 border-2 border-white/10 flex items-center justify-center overflow-hidden">
              <span className="text-xl font-bold tracking-[0.15em] uppercase text-white whitespace-nowrap">
                {current}
                <span className="text-accent animate-pulse">|</span>
              </span>
              <MobileKeyInput onKey={pressKey} />
            </div>
          )}

          {/* the box */}
          <div className="relative w-full max-w-[18rem] aspect-square mx-auto">
            <div className="absolute inset-12 rounded-xl border-2 border-white/15 bg-white/[0.02]" />
            {(() => {
              // hovered word takes priority; otherwise the live entry draws
              const word = trace ?? (current.length >= 2 ? current : null);
              if (!word) return null;
              const pts = word
                .split('')
                .map((c) => letterPos.get(c))
                .filter((p): p is [number, number] => !!p);
              if (pts.length < 2) return null;
              const live = !trace;
              return (
                <svg
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  className="absolute inset-0 w-full h-full pointer-events-none"
                >
                  <polyline
                    points={pts.map(([x, y]) => `${x},${y}`).join(' ')}
                    fill="none"
                    stroke={live ? 'rgb(var(--span) / 0.65)' : 'rgb(var(--trace) / 0.9)'}
                    strokeWidth="3"
                    vectorEffect="non-scaling-stroke"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray={live ? '6 5' : undefined}
                  />
                  <circle cx={pts[0][0]} cy={pts[0][1]} r="1.6" fill={live ? 'rgb(var(--span))' : 'rgb(var(--trace))'} />
                </svg>
              );
            })()}
            {record.sides.map((side, s) =>
              side.split('').map((c, j) => {
                const [x, y] = SIDE_POSITIONS[s][j];
                const used = committedCovered.has(c);
                const inCurrent = current.includes(c);
                const isLast = c === lastChar;
                const sameSide = !done && lastChar !== '' && sideOf.get(lastChar) === s;
                return (
                  <button
                    key={c}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pressKey(c)}
                    disabled={done}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 w-10 h-12 rounded-lg border-2 text-xl font-bold uppercase transition-colors
                      ${isLast
                        ? `${SIDE_TONES[s].used} ring-2 ring-white/90`
                        : used
                          ? SIDE_TONES[s].used
                          : inCurrent
                            ? SIDE_TONES[s].current
                            : SIDE_TONES[s].idle}
                      ${sameSide && !isLast ? 'opacity-40' : ''}`}
                    style={{ left: `${x}%`, top: `${y}%` }}
                  >
                    {c}
                  </button>
                );
              })
            )}
          </div>

          {/* controls */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-2.5">
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pressKey('backspace')}
              aria-label="Delete letter"
              className="inline-flex items-center justify-center w-11 h-10 rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
            >
              <Delete className="w-4 h-4" />
            </button>
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={restart}
              aria-label="Restart"
              className="inline-flex items-center justify-center w-11 h-10 rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={submit}
              className="inline-flex items-center gap-1.5 px-4 h-10 rounded-lg text-sm font-semibold bg-amber-400/15 border border-amber-400/30 text-amber-200 hover:bg-amber-400/25 transition-colors"
            >
              <CornerDownLeft className="w-4 h-4" />
              Enter
            </button>
          </div>

          {/* second row: board-level actions, so nothing squishes on mobile */}
          <div className="mt-2.5 flex flex-wrap items-center justify-center gap-2.5">
            {!store.dailyMode && (
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={newPracticeBox}
                className="inline-flex items-center gap-1.5 px-4 h-10 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                New box
              </button>
            )}
            {!rail && done && (
              <ShareButton
                build={() =>
                  buildShare({
                    game: GAME_NAME.boxed.full,
                    slug: 'boxed',
                    daily: store.dailyMode,
                    date: store.dailyDate,
                    body: [
                      // word count and time only; the chain itself is the answer
                      solved
                        ? `Solved in ${chain.length} word${chain.length === 1 ? '' : 's'} · ${formatElapsed(record.elapsedMs ?? 0)}`
                        : 'Revealed',
                    ],
                  })
                }
              />
            )}
            {/* Both of these end up in the solver, so they go when the solver
                is hidden — a give-up that shows nothing isn't giving up. */}
            {onReveal && (
              <>
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onReveal(record.sides)}
              title="Peek at the solver — your board keeps going"
              className="inline-flex items-center gap-1.5 px-4 h-10 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
            >
              <LifeBuoy className="w-4 h-4" />
              Help
            </button>
            {!done && (
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  // persist synchronously — onReveal unmounts this component
                  // before a state-driven save could run
                  const next = store.dailyMode
                    ? { ...store, daily: { ...record, revealed: true } }
                    : { ...store, practice: { ...record, revealed: true } };
                  try {
                    siteStore.setItem(BOX_KEY, JSON.stringify(next));
                  } catch {
                    // best-effort persistence
                  }
                  setStore(next);
                  onReveal(record.sides);
                }}
                title="Give up — ends this board unfinished and shows the solutions"
                className="inline-flex items-center gap-1.5 px-4 h-10 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
              >
                <Eye className="w-4 h-4" />
                Reveal
              </button>
            )}
              </>
            )}
          </div>

          <div className="h-6 mt-3">
            {flash && (
              <p className={`text-sm font-medium ${flash.good ? 'text-emerald-300' : 'text-amber-300'}`}>
                {flash.text}
              </p>
            )}
            {!flash && done && (
              <p className={`text-sm font-semibold ${solved ? 'text-emerald-300' : 'text-slate-400'}`}>
                {solved
                  ? `Solved in ${chain.length} word${chain.length === 1 ? '' : 's'} 🎉`
                  : 'Revealed 🔍'}
              </p>
            )}
          </div>

          {!rail && (record.invalid?.length ?? 0) > 0 && (
            <div className="mt-3 max-w-md mx-auto">
              <p className="mb-2 text-xs font-medium text-slate-500 uppercase tracking-wider">
                Not in dictionary <span className="text-slate-600">· {record.invalid!.length}</span>
              </p>
              <div className="flex flex-wrap justify-center gap-1.5">
                {[...record.invalid!].sort().map((w) => (
                  <span
                    key={w}
                    className="px-2.5 py-1 rounded-lg border text-sm tracking-wide bg-amber-400/10 border-amber-400/30 text-amber-300"
                  >
                    {w}
                  </span>
                ))}
              </div>
            </div>
          )}

          {store.dailyMode && done && store.dailyDate && (
            <div>
              <DailyStats level={playedAt} game="box" date={store.dailyDate} />
            </div>
          )}

          <p className="mt-4 text-xs text-slate-500">
            Chain words to use all twelve letters — each word starts with the previous
            word&apos;s last letter, and consecutive letters can&apos;t share a side.
            {store.dailyMode && ' A fresh daily box arrives about 15 minutes after 3:00 a.m. Eastern.'}
          </p>
        </>
      )}
      {rail && record && (
        <InRail slot={rail}>
          <RailPanel label="Your box" figure={`${committedCovered.size} / 12 letters`}>
            <p className="flex items-center gap-1.5 text-sm text-slate-300 tabular-nums">
              <Timer className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
              {formatElapsed(record.elapsedMs ?? 0)}
              {store.dailyMode && store.dailyDate && <span className="ml-auto text-xs text-slate-500">{store.dailyDate}</span>}
            </p>
            <p className="mt-2 text-xs text-slate-400">
              {chain.length} {chain.length === 1 ? 'word' : 'words'} so far · solvable in {record.par ?? 2}
            </p>
            {done && (
              <div className="mt-3">
                <ShareButton build={() => buildShare({
                      game: GAME_NAME.boxed.full,
                      slug: 'boxed',
                      daily: store.dailyMode,
                      date: store.dailyDate,
                      // word count and time only; the chain itself is the answer
                      body: [
                        solved
                          ? `Solved in ${chain.length} word${chain.length === 1 ? '' : 's'} · ${formatElapsed(record.elapsedMs ?? 0)}`
                          : 'Revealed',
                      ],
                    })} />
              </div>
            )}
          </RailPanel>
          {(record.invalid?.length ?? 0) > 0 && (
            <RailPanel label="Not in dictionary" figure={record.invalid!.length}>
              <ul className="flex flex-wrap gap-1.5">
                {[...record.invalid!].sort().map((w) => (
                  <li key={w} className="px-2 py-0.5 rounded-md border text-sm tracking-wide bg-amber-400/10 border-amber-400/30 text-amber-300">{w}</li>
                ))}
              </ul>
            </RailPanel>
          )}
        </InRail>
      )}
    </div>
  );
});

export default BoxGame;
