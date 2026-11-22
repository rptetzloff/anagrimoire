import { forwardRef, Fragment, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { Eye, RefreshCw, Timer } from 'lucide-react';
import { fetchDailyData, fetchPool } from '@/dailyData';
import {
  difficulty,
  isDifficulty,
  onDifficultyChange,
  type Difficulty,
} from '@/difficulty';
import MobileKeyInput from '@/MobileKeyInput';
import ShareButton from '@/ShareButton';
import { useRailSlot } from '@/railSlot';
import { InRail, RailPanel } from '@/RailPanel';
import { GAME_NAME } from '@/games';
import { buildShare, TILE_EMOJI } from '@/share';
import { usePalette } from '@/theme';
import { dailyIntent } from '@/routing/entry';
import { offerDailySwitch, reportDaily } from '@/dailyBus';
import DailyToggle from '@/DailyToggle';
import { usePrefs } from '@/prefs';
import { formatElapsed, useUpTimer } from '@/useUpTimer';
import { recordSquaresFinish } from '@/stats';
import { useDailySync } from '@/useDailySync';
import { store as siteStore } from '@/siteStorage';

export type SquaresGameHandle = { pressKey: (k: string) => void };

// The key overlay sits on the focused cell, not on a box of its own and not
// over the board. Other games have one entry box to tap, so theirs lives
// there; here the cell you're typing into is the thing you tap, so the overlay
// follows the cursor. Tap another cell and you hit its button, the cursor
// moves, and the overlay moves with it. It unmounts while the site's own
// keyboard is open, which is what stops both keyboards appearing at once.

export type SquareSize = 4 | 5;

const SQUARES_KEY = 'anagrimoire:squares:v1';
// the pool is shared by both sites, so it takes no dev- prefix

/** A board as it ships: `cells` holds the letters shown at the start and null
 *  everywhere the player types. `entries` is what they've typed. */
type SquareRecord = {
  size: SquareSize;
  cells: (string | null)[];
  entries: string[];
  answer: string; // base64 {rows}
  /** written once the board comes out right, so anything that isn't holding a
   *  dictionary — the home page, stats — can still tell it was finished */
  solved?: boolean;
  revealed?: boolean;
  elapsedMs?: number;
};

type SquaresStore = {
  dailyMode: boolean;
  dailyDate: string;
  /** practice only — the daily's size comes from its difficulty */
  size: SquareSize;
  /** which difficulty the practice board was drawn for, so switching
   *  difficulty redraws even when hard and extreme are the same size */
  practiceAt?: Difficulty;
  // Keyed by difficulty rather than by size, because hard and extreme are both
  // 5x5: keying by size meant one silently replaced the other, and it was
  // extreme that won.
  daily: Partial<Record<Difficulty, SquareRecord>>;
  practice: SquareRecord | null;
};

const DEFAULT_STORE: SquaresStore = {
  dailyMode: true,
  dailyDate: '',
  size: 4,
  daily: {},
  practice: null,
};

function sanitizeRecord(r: unknown): SquareRecord | null {
  const rec = r as SquareRecord | null;
  if (!rec || (rec.size !== 4 && rec.size !== 5)) return null;
  const n = rec.size * rec.size;
  if (!Array.isArray(rec.cells) || rec.cells.length !== n) return null;
  return {
    size: rec.size,
    cells: rec.cells.map((c) => (typeof c === 'string' && /^[a-z]$/.test(c) ? c : null)),
    entries: Array.isArray(rec.entries)
      ? Array.from({ length: n }, (_, i) =>
          typeof rec.entries[i] === 'string' && /^[a-z]$/.test(rec.entries[i]) ? rec.entries[i] : ''
        )
      : Array(n).fill(''),
    answer: typeof rec.answer === 'string' ? rec.answer : '',
    solved: rec.solved === true,
    revealed: rec.revealed === true,
    elapsedMs: typeof rec.elapsedMs === 'number' && rec.elapsedMs >= 0 ? rec.elapsedMs : 0,
  };
}

// An incoming /daily/ or /play/ link decides which board is waiting; without one
// we keep whatever the player last had open.
function loadStore(): SquaresStore {
  const store = readStore();
  const forced = dailyIntent('squares');
  return forced === null ? store : { ...store, dailyMode: forced };
}

function readStore(): SquaresStore {
  try {
    const raw = siteStore.getItem(SQUARES_KEY);
    if (!raw) return DEFAULT_STORE;
    const p = JSON.parse(raw);
    // Boards were keyed by size before difficulty existed. 4x4 was easy and
    // 5x5 was hard, so a half-played board carries over rather than vanishing.
    const daily: Partial<Record<Difficulty, SquareRecord>> = {};
    for (const [key, level] of [
      ['easy', 'easy'],
      ['hard', 'hard'],
      ['extreme', 'extreme'],
      ['4', 'easy'],
      ['5', 'hard'],
    ] as [string, Difficulty][]) {
      if (daily[level]) continue;
      const rec = sanitizeRecord(p?.daily?.[key]);
      if (rec) daily[level] = rec;
    }
    return {
      dailyMode: p?.dailyMode !== false,
      dailyDate: typeof p?.dailyDate === 'string' ? p.dailyDate : '',
      size: p?.size === 5 ? 5 : 4,
      practiceAt: isDifficulty(p?.practiceAt) ? p.practiceAt : undefined,
      daily,
      practice: sanitizeRecord(p?.practice),
    };
  } catch {
    return DEFAULT_STORE;
  }
}

/** the letter in a cell, whether it was given or typed */
function letterAt(rec: SquareRecord, i: number): string {
  return rec.cells[i] ?? rec.entries[i] ?? '';
}

function rowsOf(rec: SquareRecord): string[] {
  const n = rec.size;
  return Array.from({ length: n }, (_, r) =>
    Array.from({ length: n }, (_, c) => letterAt(rec, r * n + c)).join('')
  );
}

function colsOf(rec: SquareRecord): string[] {
  const n = rec.size;
  return Array.from({ length: n }, (_, c) =>
    Array.from({ length: n }, (_, r) => letterAt(rec, r * n + c)).join('')
  );
}

/** A line is right when it's full and in the dictionary. Anything short of
 *  full is simply unfinished — flagging it red while someone is still typing
 *  would be nagging, not helping. */
type LineState = 'empty' | 'partial' | 'good' | 'bad';

function barTone(s: LineState): string {
  // the semantic tokens, not emerald/rose 400: those are fills meant to carry
  // dark text, and against the light theme's page they measure 1.84 and 2.57 —
  // under the 3:1 that 1.4.11 wants of something conveying state on its own.
  return s === 'good' ? 'bg-success' : s === 'bad' ? 'bg-danger' : 'bg-white/25';
}

function lineState(word: string, size: number, dict: Set<string> | null): LineState {
  if (!word) return 'empty';
  if (word.length < size) return 'partial';
  if (!dict) return 'partial';
  return dict.has(word) ? 'good' : 'bad';
}

const SquaresGame = forwardRef<
  SquaresGameHandle,
  {
    standardWords: string[] | null;
    onReveal?: (rows: string[]) => void;
  }
>(function SquaresGame({ standardWords }, ref) {
  const [store, setStore] = useState<SquaresStore>(loadStore);
  // Beside the board on a wide page, the game's own panel goes in the rail
  // (railSlot.ts); narrower, it is drawn here, where it always was.
  const rail = useRailSlot();
  // The difficulty this board actually is — the one asked for, unless the feed
  // predates difficulty and only the easy board exists.
  const [playedAt, setPlayedAt] = useState<Difficulty>(difficulty);
  const [difficultyTick, setDifficultyTick] = useState(0);
  // The setting itself. `playedAt` is the difficulty of the *daily* board and
  // is only set when that fetch resolves — practice has no daily to wait for,
  // so keying it off playedAt left it on whatever the daily last resolved to.
  const [level, setLevel] = useState<Difficulty>(difficulty);
  useEffect(
    () =>
      onDifficultyChange(() => {
        setLevel(difficulty());
        setDifficultyTick((n) => n + 1);
      }),
    []
  );
  const { practiceAllowed } = usePrefs();
  const palette = usePalette();
  // pinned to the daily: someone who switched practice off shouldn't be left
  // looking at a practice board they can no longer leave
  useEffect(() => {
    if (!practiceAllowed && !store.dailyMode) setStore((prev) => ({ ...prev, dailyMode: true }));
  }, [practiceAllowed, store.dailyMode]);
  // the address bar says which board is open, and can ask for the other
  useEffect(() => reportDaily('squares', store.dailyMode, store.dailyDate), [store.dailyMode, store.dailyDate]);
  useEffect(
    () => offerDailySwitch('squares', (d) => setStore((prev) => ({ ...prev, dailyMode: d }))),
    []
  );

  // Not 0: if the top-left is a given letter, typing does nothing and the
  // board looks broken until you happen to click an empty cell.
  const [cursor, setCursor] = useState(0);
  const [dailyError, setDailyError] = useState(false);
  const [pool, setPool] = useState<Record<string, SquareRecord[]> | null>(null);

  useEffect(() => {
    try {
      siteStore.setItem(SQUARES_KEY, JSON.stringify(store));
    } catch {
      // best-effort persistence
    }
  }, [store]);

  // today's boards
  useEffect(() => {
    let alive = true;
    fetchDailyData('squares')
      .then((raw) => {
        if (!alive) return;
        const d = raw;
        if (typeof d?.date !== 'string') throw new Error('bad payload');
        const want = difficulty();
        // `boards`, keyed by size, was the shape before difficulty existed and
        // the generator no longer writes it. byDifficulty is all there is.
        const chosen = d.byDifficulty?.[want] as SquareRecord | undefined;
        const level: Difficulty = chosen ? want : 'easy';
        const board = chosen ?? d.byDifficulty?.easy;
        if (!board) throw new Error('bad payload');
        setPlayedAt(level);
        const fresh = sanitizeRecord({ ...board, entries: [] });
        if (!fresh) throw new Error('bad payload');
        setStore((prev) => {
          const daily = prev.dailyDate === d.date ? { ...prev.daily } : {};
          // keep progress only when it's the same board we already had
          const held = daily[level];
          if (!held || held.cells.join('') !== fresh.cells.join('')) daily[level] = fresh;
          return { ...prev, dailyDate: d.date, daily };
        });
      })
      .catch(() => {
        if (alive) setDailyError(true);
      });
    return () => {
      alive = false;
    };
  }, [difficultyTick]);

  // the practice pool, fetched once
  useEffect(() => {
    let alive = true;
    fetchPool('squares')
      .then((d) => {
        // byDifficulty when the feed has it, the old size keys otherwise
        if (alive && (d?.byDifficulty || d?.pool)) setPool(d.byDifficulty ?? d.pool);
      })
      .catch(() => {
        // practice stays unavailable until the pool loads
      });
    return () => {
      alive = false;
    };
  }, []);

  function drawPractice(size: SquareSize, avoid?: string): SquareRecord | null {
    // Practice follows the difficulty too — picking Extreme and then getting an
    // easy board to practise on is the setting not meaning anything. Falls back
    // to the size keys for a pool generated before difficulty existed.
    const options = pool?.[level] ?? pool?.[String(size)];
    if (!options?.length) return null;
    const fresh = options.filter((p) => p.cells.join('') !== avoid);
    const from = fresh.length ? fresh : options;
    const pick = from[Math.floor(Math.random() * from.length)];
    return sanitizeRecord({ ...pick, entries: [] });
  }

  // make sure a practice board exists once the pool is here
  useEffect(() => {
    if (store.dailyMode || !pool) return;
    const from = pool[level] ?? pool[String(store.size)];
    if (!from?.length) return;
    const want = pool[level] ? from[0].size : store.size;
    // Stop when the board we hold is the one we want. The previous guard also
    // required pool[playedAt] to exist, which it doesn't for a pool generated
    // before difficulty — so it never stopped, and practice redrew on every
    // render for ever.
    const wrong =
      !store.practice || store.practice.size !== want || store.practiceAt !== level;
    if (!wrong) return;
    const board = drawPractice(want);
    if (board) setStore((prev) => ({ ...prev, practice: board, practiceAt: level }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.dailyMode, store.practice, store.size, pool, level]);

  const record = store.dailyMode ? store.daily[playedAt] ?? null : store.practice;
  // The board's own size, never store.size: that flips the instant you press
  // 5×5, while the record is still the old board until the new one arrives.
  // Rendering n² cells against the old board's bars pushed the last column off
  // the grid and up a row.
  const n = record?.size ?? store.size;
  const dict = useMemo(
    () => (standardWords ? new Set(standardWords.filter((w) => w.length === n)) : null),
    [standardWords, n]
  );

  // Seat the cursor on a cell that accepts letters whenever the board changes
  // — switching size, drawing a new practice square, or the daily arriving.
  const boardKey = record ? `${store.dailyMode}:${store.size}:${record.cells.join('')}` : '';
  useEffect(() => {
    if (!record) return;
    const first = record.cells.findIndex((c) => c === null);
    if (first >= 0) setCursor(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardKey]);

  const rows = record ? rowsOf(record) : [];
  const cols = record ? colsOf(record) : [];
  const rowStates = rows.map((w) => lineState(w, n, dict));
  const colStates = cols.map((w) => lineState(w, n, dict));
  // A revealed board reads as correct in every line, because revealing writes
  // the answer into it. Without this it counts as a solve, and "Revealed" can
  // never be anything but zero.
  const solved =
    !!record &&
    !record.revealed &&
    rowStates.every((s) => s === 'good') &&
    colStates.every((s) => s === 'good');
  const done = solved || !!record?.revealed;

  // Memoised because it now closes over the difficulty being played: without
  // this the finish effect below would take a new function every render and
  // the linter would be right to complain.
  const update = useCallback((fn: (r: SquareRecord) => SquareRecord) => {
    setStore((prev) => {
      const cur = prev.dailyMode ? prev.daily[playedAt] : prev.practice;
      if (!cur) return prev;
      const next = fn(cur);
      return prev.dailyMode
        ? { ...prev, daily: { ...prev.daily, [playedAt]: next } }
        : { ...prev, practice: next };
    });
  }, [playedAt]);

  useEffect(() => {
    if (!record) return;
    // The persisted flag doubles as the guard: a board counts once, and a
    // reload of a finished board doesn't count it again.
    if (solved && !record.solved) {
      update((r) => ({ ...r, solved: true }));
      recordSquaresFinish(
        store.dailyMode,
        true,
        n,
        record.elapsedMs ?? 0,
        store.dailyMode ? store.dailyDate : null
      );
    }
  }, [solved, record, n, store.dailyMode, store.dailyDate, update]);

  useDailySync({
    difficulty: playedAt,
    game: 'squares',
    // the 4x4 and the 5x5 are separate puzzles on the same day, so they need
    // separate rows rather than fighting over one
    variant: String(n),
    date: store.dailyDate,
    record: (record as unknown as Record<string, unknown>) ?? null,
    setRecord: (merged) =>
      setStore((prev) => {
        const cur = prev.daily[playedAt];
        if (!cur) return prev;
        const next = sanitizeRecord({ ...cur, ...merged });
        return next ? { ...prev, daily: { ...prev.daily, [playedAt]: next } } : prev;
      }),
    summary: done
      ? { solved: !record?.revealed, size: n, timeMs: record?.elapsedMs ?? 0 }
      : null,
    active: store.dailyMode,
  });

  // the record accumulates its own time, so a board picked up tomorrow carries
  // yesterday's minutes rather than starting from zero
  useUpTimer(!!record && !done, (delta) =>
    update((r) => ({ ...r, elapsedMs: (r.elapsedMs ?? 0) + delta }))
  );

  /** the next cell the player can actually type in */
  function step(from: number, dir: 1 | -1): number {
    if (!record) return from;
    const total = n * n;
    for (let k = 1; k <= total; k++) {
      const i = (from + dir * k + total * 2) % total;
      if (record.cells[i] === null) return i;
    }
    return from;
  }

  function pressKey(k: string) {
    if (!record || done) return;
    if (k === 'backspace') {
      if (record.cells[cursor] === null && record.entries[cursor]) {
        update((r) => {
          const entries = [...r.entries];
          entries[cursor] = '';
          return { ...r, entries };
        });
      } else {
        const prev = step(cursor, -1);
        setCursor(prev);
        update((r) => {
          const entries = [...r.entries];
          entries[prev] = '';
          return { ...r, entries };
        });
      }
      return;
    }
    if (/^[a-z]$/.test(k)) {
      if (record.cells[cursor] !== null) return;
      update((r) => {
        const entries = [...r.entries];
        entries[cursor] = k;
        return { ...r, entries };
      });
      setCursor((c) => step(c, 1));
    }
  }

  useImperativeHandle(ref, () => ({ pressKey }));

  // physical keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'Backspace') pressKey('backspace');
      else if (/^[a-zA-Z]$/.test(e.key)) pressKey(e.key.toLowerCase());
      else if (e.key.startsWith('Arrow')) {
        const r = Math.floor(cursor / n);
        const c = cursor % n;
        const to =
          e.key === 'ArrowLeft' ? r * n + Math.max(0, c - 1)
          : e.key === 'ArrowRight' ? r * n + Math.min(n - 1, c + 1)
          : e.key === 'ArrowUp' ? Math.max(0, r - 1) * n + c
          : Math.min(n - 1, r + 1) * n + c;
        setCursor(to);
      } else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function reveal() {
    if (!record) return;
    try {
      const answer = JSON.parse(atob(record.answer))?.rows as string[];
      if (!Array.isArray(answer)) return;
      update((r) => ({
        ...r,
        entries: answer.join('').split(''),
        revealed: true,
      }));
      if (!record.revealed && !record.solved) {
        recordSquaresFinish(
          store.dailyMode,
          false,
          n,
          record.elapsedMs ?? 0,
          store.dailyMode ? store.dailyDate : null
        );
      }
    } catch {
      // a board with no readable answer just can't be revealed
    }
  }

  function newPractice() {
    const board = drawPractice(store.size, store.practice?.cells.join(''));
    if (board) setStore((prev) => ({ ...prev, practice: board }));
  }

  // Grid's *play* board metrics — and Grid does shrink at 25 cells, which I
  // wrongly said it didn't. It has to: at 320px with the largest text a 5×5 of
  // the bigger cells is 333px wide, and the page clips horizontal overflow, so
  // the last column isn't scrolled off, it's gone.
  const cell =
    `${n === 4 ? 'w-11 h-12 sm:w-12 sm:h-14 text-xl sm:text-2xl' : 'w-9 h-10 sm:w-11 sm:h-12 text-lg sm:text-xl'} ` +
    'flex items-center justify-center rounded-xl border-2 font-bold uppercase transition-colors';

  return (
    <div className="text-center">
      <DailyToggle
        daily={store.dailyMode}
        onChange={(d) => setStore((prev) => ({ ...prev, dailyMode: d }))}
      />

      {/* Hidden everywhere. Practice is the daily generated on the fly and not
          recorded, so its size comes from the difficulty just as the daily's
          does. The markup stays because the solver still reaches for it. */}
      <div className="mb-3 hidden flex-wrap items-center justify-center gap-2">
        <div className="inline-flex rounded-xl bg-white/5 border border-white/10 p-1 gap-1">
          {([4, 5] as SquareSize[]).map((s) => (
            <button
              key={s}
              onClick={() => {
                setStore((prev) => ({ ...prev, size: s }));
                setCursor(0);
              }}
              className={`px-3 h-9 rounded-lg text-sm font-semibold transition-colors
                ${store.size === s
                  ? 'bg-accent text-slate-950 shadow-lg shadow-accent/30'
                  : 'text-slate-300 hover:bg-white/10'}`}
            >
              {s}×{s}
            </button>
          ))}
        </div>
      </div>

      {record && !rail && (
        <div className="mb-5 flex items-center justify-center">
          <span className="inline-flex items-center gap-1.5 text-sm text-slate-400 tabular-nums">
            <Timer className="w-4 h-4" />
            {formatElapsed(record.elapsedMs ?? 0)}
          </span>
        </div>
      )}

      {!record && (
        <p className="text-sm text-slate-400 py-8">
          {dailyError && store.dailyMode
            ? "Couldn't load today's squares — try again later."
            : 'Loading…'}
        </p>
      )}

      {record && (
        <>
          {/* One grid, n+1 columns wide: the last column carries each row's
              indicator so it sits beside the line it judges. A strip of row
              states under the board reads as columns, which is exactly the
              wrong thing for it to say. */}
          <div
            className="grid gap-2 w-fit mx-auto"
            style={{ gridTemplateColumns: `repeat(${n}, auto) 0.375rem` }}
          >
            {colStates.map((s, c) => (
              <div
                key={`col-${c}`}
                aria-hidden
                style={{ gridRow: 1, gridColumn: c + 1 }}
                className={`h-1.5 rounded-full ${barTone(s)}`}
              />
            ))}

            {Array.from({ length: n }, (_, r) => (
              <Fragment key={`r-${r}`}>
                {Array.from({ length: n }, (_, c) => {
                  const i = r * n + c;
                  const given = record.cells[i] !== null;
                  const focused = i === cursor && !done;
                  const letter = letterAt(record, i);
                  return (
                    <div
                      key={i}
                      className="relative"
                      style={{ gridRow: r + 2, gridColumn: c + 1 }}
                    >
                    <button
                      onClick={() => !given && setCursor(i)}
                      aria-label={`row ${r + 1} column ${c + 1}${
                        given ? `, ${letter}, given` : letter ? `, ${letter}` : ', empty'
                      }`}
                      // Filled vs outline, not two tints: `white` and `black`
                      // are theme tokens that invert, so bg-white/20 against
                      // bg-black/20 collapses to the same colour in light mode.
                      className={`${cell} ${
                        given
                          ? 'bg-white/45 border-white/50 text-white cursor-default'
                          : focused
                            ? 'bg-amber-400/15 border-amber-400 text-accent'
                            : 'bg-transparent border-white/60 text-accent hover:bg-white/10'
                      }`}
                    >
                      {letter}
                    </button>
                    </div>
                  );
                })}
                <div
                  aria-hidden
                  style={{ gridRow: r + 2, gridColumn: n + 1 }}
                  className={`w-1.5 h-full rounded-full ${barTone(rowStates[r])}`}
                />
              </Fragment>
            ))}

            {/* One overlay for the board, parked on the cursor's cell. It has
                to be moved rather than re-rendered per cell: a fresh input
                isn't focused, and Android closes the keyboard the moment the
                focused element goes away — so every letter shut it. Row 1 is
                the column bars, hence the +2. */}
            {!done && (
              <div
                className="relative"
                style={{ gridRow: Math.floor(cursor / n) + 2, gridColumn: (cursor % n) + 1 }}
              >
                <MobileKeyInput onKey={pressKey} label="Type a letter" />
              </div>
            )}
          </div>

          <p className="sr-only" aria-live="polite">
            {rowStates.filter((s) => s === 'good').length +
              colStates.filter((s) => s === 'good').length}{' '}
            of {n * 2} lines are words
            {rowStates.some((s) => s === 'bad') || colStates.some((s) => s === 'bad')
              ? `, ${rowStates.filter((s) => s === 'bad').length + colStates.filter((s) => s === 'bad').length} full but not words`
              : ''}
          </p>

          <p className="mt-4 text-sm text-slate-400" aria-live="polite">
            {done
              ? record.revealed
                ? 'Revealed — the answer is on the board.'
                : `Solved in ${formatElapsed(record.elapsedMs ?? 0)}.`
              : 'Every row and every column has to be a word.'}
          </p>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {!rail && done && (
              <ShareButton
                build={() =>
                  buildShare({
                    game: `${GAME_NAME.squares.full} (${n}×${n})`,
                    slug: 'squares',
                    daily: store.dailyMode,
                    date: store.dailyDate,
                    body: [
                      record.revealed
                        ? 'Revealed'
                        : `Solved in ${formatElapsed(record.elapsedMs ?? 0)}`,
                      // The grid is the puzzle's shape, not a record of play —
                      // it is the same for everyone today. Under "Revealed" a
                      // wall of filled cells would read as "I did all these",
                      // so it only goes out with a genuine solve.
                      ...(record.revealed ? [] : Array.from({ length: n }, (_, r) =>
                        Array.from({ length: n }, (_, c) =>
                          record.cells[r * n + c] !== null
                            ? TILE_EMOJI[palette].absent
                            : TILE_EMOJI[palette].correct
                        ).join('')
                      )),
                    ],
                  })
                }
              />
            )}
            {!store.dailyMode && (
              <button
                onClick={newPractice}
                className="inline-flex items-center gap-1.5 px-4 h-10 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                New square
              </button>
            )}
            {!done && (
              <button
                onClick={reveal}
                className="inline-flex items-center gap-1.5 px-4 h-10 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
              >
                <Eye className="w-4 h-4" />
                Reveal
              </button>
            )}
          </div>


        </>
      )}
      {rail && record && (
        <InRail slot={rail}>
          <RailPanel
            label="Your square"
            figure={`${rowStates.filter((s) => s === 'good').length + colStates.filter((s) => s === 'good').length} / ${n * 2} words`}
          >
            <p className="flex items-center gap-1.5 text-sm text-slate-300 tabular-nums">
              <Timer className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
              {formatElapsed(record.elapsedMs ?? 0)}
              {store.dailyMode && store.dailyDate && <span className="ml-auto text-xs text-slate-500">{store.dailyDate}</span>}
            </p>
            <p className="mt-2 text-xs text-slate-400">
              {done
                ? record.revealed ? 'Revealed.' : 'Solved.'
                : 'Lines that read as words, across and down.'}
            </p>
            {done && (
              <div className="mt-3">
                <ShareButton
                  build={() =>
                  buildShare({
                    game: `${GAME_NAME.squares.full} (${n}×${n})`,
                    slug: 'squares',
                    daily: store.dailyMode,
                    date: store.dailyDate,
                    body: [
                      record.revealed
                        ? 'Revealed'
                        : `Solved in ${formatElapsed(record.elapsedMs ?? 0)}`,
                      // The grid is the puzzle's shape, not a record of play —
                      // it is the same for everyone today. Under "Revealed" a
                      // wall of filled cells would read as "I did all these",
                      // so it only goes out with a genuine solve.
                      ...(record.revealed ? [] : Array.from({ length: n }, (_, r) =>
                        Array.from({ length: n }, (_, c) =>
                          record.cells[r * n + c] !== null
                            ? TILE_EMOJI[palette].absent
                            : TILE_EMOJI[palette].correct
                        ).join('')
                      )),
                    ],
                  })
                }
                />
              </div>
            )}
          </RailPanel>
        </InRail>
      )}
    </div>
  );
});

export default SquaresGame;
