import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ChevronDown, CornerDownLeft, Delete, Flag, Play, RefreshCw, Search, Timer } from 'lucide-react';
import { findGridPath, gridNeighbors, solveGrid } from '@/solvers';
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
import { shuffled } from '@/shuffle';
import { dailyIntent } from '@/routing/entry';
import { offerDailySwitch, reportDaily } from '@/dailyBus';
import DailyToggle from '@/DailyToggle';
import { usePrefs } from '@/prefs';
import { useDailySync } from '@/useDailySync';
import { buildShare } from '@/share';
import { recordSprint } from '@/stats';
import { store as siteStore } from '@/siteStorage';
import { useRailSlot } from '@/railSlot';
import { InRail, RailPanel, WordChips } from '@/RailPanel';

export type GridGameHandle = { pressKey: (k: string) => void };

const GRID_KEY = 'anagrimoire:grid:v1';
const DURATION_MS = 3 * 60 * 1000;

// classic sixteen-dice letter distributions (q treated as a plain letter)
const GRID_DICE_4 = [
  'aaeegn', 'abbjoo', 'achops', 'affkps',
  'aoottw', 'cimotu', 'deilrx', 'delrvy',
  'distty', 'eeghnw', 'eeinsu', 'ehrtvw',
  'eiosst', 'elrtty', 'himnuq', 'hlnnrz',
];

// Big Boggle's twenty-five dice for 5x5 grids
/** Board size per difficulty. Three by three was measured and dropped — a
 *  median of 19 findable words, and a worst board of four. */
const GRID_SHAPE: Record<string, number> = { easy: 4, hard: 5, extreme: 5 };

const GRID_DICE_5 = [
  'aaafrs', 'aaeeee', 'aafirs', 'adennn', 'aeeeem',
  'aeegmu', 'aegmnn', 'afirsy', 'bjkqxz', 'ccnstw',
  'ceiilt', 'ceilpt', 'ceipst', 'ddlnor', 'dhhlor',
  'dhhnot', 'dhlnor', 'eiiitt', 'emottt', 'ensssu',
  'fiprsy', 'gorrvw', 'hiprry', 'nootuw', 'ooottu',
];

function diceFor(size: number): string[] {
  if (size === 5) return GRID_DICE_5;
  if (size === 3) {
    // sample nine of the classic sixteen dice
    return shuffled(GRID_DICE_4).slice(0, 9);
  }
  return GRID_DICE_4;
}

type GridRecord = {
  cells: string[];
  found: string[];
  invalid?: string[]; // rejected non-dictionary guesses
  endsAt: number | null; // null until the player presses Start
  finished: boolean;
};
type GridStore = {
  dailyMode: boolean;
  dailyDate: string;
  daily: GridRecord | null;
  practice: GridRecord | null;
};

const DEFAULT_STORE: GridStore = { dailyMode: true, dailyDate: '', daily: null, practice: null };

function sanitizeRecord(r: unknown): GridRecord | null {
  const rec = r as GridRecord | null;
  if (
    !rec ||
    !Array.isArray(rec.cells) ||
    ![9, 16, 25].includes(rec.cells.length) ||
    !rec.cells.every((c) => typeof c === 'string' && /^[a-z]$/.test(c)) ||
    !Array.isArray(rec.found)
  ) {
    return null;
  }
  return {
    cells: rec.cells,
    found: rec.found.filter((w) => typeof w === 'string'),
    invalid: Array.isArray(rec.invalid) ? rec.invalid.filter((w) => typeof w === 'string') : [],
    endsAt: typeof rec.endsAt === 'number' ? rec.endsAt : null,
    finished: rec.finished === true,
  };
}

// An incoming /daily/ or /play/ link decides which board is waiting; without one
// we keep whatever the player last had open.
function loadStore(): GridStore {
  const store = readStore();
  const forced = dailyIntent('grid');
  return forced === null ? store : { ...store, dailyMode: forced };
}

function readStore(): GridStore {
  try {
    const raw = siteStore.getItem(GRID_KEY);
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

// classic Boggle scoring
function wordScore(word: string): number {
  if (word.length <= 4) return 1;
  if (word.length === 5) return 2;
  if (word.length === 6) return 3;
  if (word.length === 7) return 5;
  return 11;
}

const GridGame = forwardRef<
  GridGameHandle,
  {
    standardWords: string[] | null;
    /** display filter: false hides a word from the missed list, nothing else */
    displayWord?: (w: string) => boolean;
    onLetterStates: (states: Record<string, LetterState>) => void;
    onReveal?: (cells: string[]) => void;
  }
>(function GridGame({ standardWords, displayWord, onLetterStates, onReveal }, ref) {
  const [store, setStore] = useState<GridStore>(loadStore);
  // Beside the board on a wide page, the game's own panel goes in the rail
  // (railSlot.ts); narrower, it is drawn here, where it always was.
  const rail = useRailSlot();
  const [playedAt, setPlayedAt] = useState<Difficulty>(difficulty);
  const [difficultyTick, setDifficultyTick] = useState(0);
  useEffect(
    () =>
      onDifficultyChange(() => {
        setDifficultyTick((n) => n + 1);
        // a different size now, and practice isn't recorded
        setStore((prev) => ({ ...prev, practice: null }));
      }),
    []
  );
  const { practiceAllowed } = usePrefs();
  // pinned to the daily: someone who switched practice off shouldn't be left
  // looking at a practice board they can no longer leave
  useEffect(() => {
    if (!practiceAllowed && !store.dailyMode) setStore((prev) => ({ ...prev, dailyMode: true }));
  }, [practiceAllowed, store.dailyMode]);
  // the address bar says which board is open, and can ask for the other
  useEffect(() => reportDaily('grid', store.dailyMode, store.dailyDate), [store.dailyMode, store.dailyDate]);
  useEffect(
    () => offerDailySwitch('grid', (d) => setStore((prev) => ({ ...prev, dailyMode: d }))),
    []
  );
  const [current, setCurrent] = useState('');
  const [flash, setFlash] = useState<{ text: string; good: boolean } | null>(null);
  const [dailyError, setDailyError] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const flashTimer = useRef<number | undefined>(undefined);

  // drag-to-trace path (cell indices); ref mirrors state for event handlers
  const [dragPath, setDragPath] = useState<number[]>([]);
  const dragPathRef = useRef<number[]>([]);
  const setPath = (p: number[]) => {
    dragPathRef.current = p;
    setDragPath(p);
  };

  // word-trace preview (hover / press-hold on a word chip)
  const [trace, setTrace] = useState<number[] | null>(null);
  const [tracePts, setTracePts] = useState<{ x: number; y: number }[]>([]);
  const [showMissed, setShowMissed] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!trace || !boardRef.current) {
      setTracePts([]);
      return;
    }
    const wrap = boardRef.current.getBoundingClientRect();
    setTracePts(
      trace.map((i) => {
        const r = boardRef.current!
          .querySelector(`[data-cell="${i}"]`)!
          .getBoundingClientRect();
        return { x: r.left + r.width / 2 - wrap.left, y: r.top + r.height / 2 - wrap.top };
      })
    );
  }, [trace]);

  useEffect(() => {
    try {
      siteStore.setItem(GRID_KEY, JSON.stringify(store));
    } catch {
      // best-effort persistence
    }
  }, [store]);

  // fetch today's grid once
  useEffect(() => {
    let alive = true;
    fetchDailyData('grid')
      .then((raw) => {
        if (!alive) return;
        const chosen = resolveDifficulty(raw, difficulty());
        if (!chosen.board) throw new Error('bad payload');
        setPlayedAt(chosen.difficulty);
        const d = { ...raw, ...chosen.board };
        const rec = sanitizeRecord({ cells: d.cells, found: [], endsAt: null, finished: false });
        if (!rec || typeof d.date !== 'string') throw new Error('bad payload');
        // reset when the date changes OR the cells differ (e.g. the daily
        // source changed mid-day)
        setStore((prev) => {
          const same =
            prev.dailyDate === d.date &&
            prev.daily &&
            prev.daily.cells.join('') === rec.cells.join('');
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

  function rollPracticeGrid(size = GRID_SHAPE[difficulty()]): GridRecord {
    const cells = shuffled(diceFor(size).map((d) => d[Math.floor(Math.random() * 6)]));
    return { cells, found: [], endsAt: null, finished: false };
  }

  // ensure a practice grid exists
  useEffect(() => {
    if (store.dailyMode || store.practice) return;
    setStore((prev) => (prev.practice ? prev : { ...prev, practice: rollPracticeGrid() }));
  }, [store.dailyMode, store.practice]);

  const record = store.dailyMode ? store.daily : store.practice;
  const running = !!record?.endsAt && !record.finished;
  const remaining = record?.endsAt ? Math.max(0, record.endsAt - now) : DURATION_MS;

  // tick while running
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [running]);

  // time's up
  useEffect(() => {
    if (running && remaining === 0) {
      setCurrent('');
      recordSprint(
        store.dailyMode,
        'grid',
        score,
        record?.found.length ?? 0,
        store.dailyMode ? store.dailyDate || null : null
      );
      updateRecord((r) => ({ ...r, finished: true }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, remaining]);

  // every path-reachable dictionary word; also serves as submit validation
  const answers = useMemo(() => {
    if (!standardWords || !record) return null;
    return solveGrid(standardWords, {
      cells: record.cells,
      cols: Math.round(Math.sqrt(record.cells.length)),
    });
  }, [standardWords, record]);
  const answersSet = useMemo(() => (answers ? new Set(answers) : null), [answers]);
  const standardSet = useMemo(
    () => (standardWords ? new Set(standardWords) : null),
    [standardWords]
  );
  const maxScore = useMemo(
    () => (answers ? answers.reduce((n, w) => n + wordScore(w), 0) : 0),
    [answers]
  );
  const score = useMemo(
    () => (record ? record.found.reduce((n, w) => n + wordScore(w), 0) : 0),
    [record]
  );

  const syncing = useDailySync({
    difficulty: playedAt,
    game: 'grid',
    date: store.dailyDate,
    record,
    setRecord: (merged) => setStore((prev) => ({ ...prev, daily: merged as GridRecord })),
    summary: record?.finished ? { score, words: record.found.length } : null,
    active: store.dailyMode,
  });

  // dim letters not on the grid once the game has started (not before — that
  // would leak the letters)
  useEffect(() => {
    if (!record || !record.endsAt) {
      onLetterStates({});
      return;
    }
    const present = new Set(record.cells);
    const states: Record<string, LetterState> = {};
    for (const c of 'abcdefghijklmnopqrstuvwxyz') {
      if (!present.has(c)) states[c] = 'absent';
    }
    onLetterStates(states);
  }, [record, onLetterStates]);

  function showFlash(text: string, good = false) {
    setFlash({ text, good });
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 1400);
  }

  function updateRecord(fn: (r: GridRecord) => GridRecord) {
    setStore((prev) => {
      const rec = prev.dailyMode ? prev.daily : prev.practice;
      if (!rec) return prev;
      const next = fn(rec);
      return prev.dailyMode ? { ...prev, daily: next } : { ...prev, practice: next };
    });
  }

  function start() {
    setNow(Date.now());
    updateRecord((r) => ({ ...r, endsAt: Date.now() + DURATION_MS }));
  }

  function submitWord(word: string) {
    if (!record || !running) return;
    if (!answersSet) {
      showFlash('Dictionary still loading…');
      return;
    }
    if (word.length < 3) {
      showFlash('Too short');
      return;
    }
    if (record.found.includes(word)) {
      showFlash('Already found');
      return;
    }
    if (!answersSet.has(word)) {
      // distinguish a non-word from a real word with no path on this grid
      if (standardSet && !standardSet.has(word)) {
        updateRecord((r) =>
          r.invalid?.includes(word) ? r : { ...r, invalid: [...(r.invalid ?? []), word] }
        );
        showFlash('Not in dictionary');
      } else {
        showFlash('No path for that word');
      }
      return;
    }
    updateRecord((r) => ({ ...r, found: [word, ...r.found] }));
    showFlash(`+${wordScore(word)}`, true);
  }

  function submit() {
    const word = current;
    setCurrent('');
    submitWord(word);
  }

  // drag-to-trace handlers (mouse and touch via pointer events)
  function cellAt(x: number, y: number): number | null {
    const el = document.elementFromPoint(x, y)?.closest('[data-cell]');
    return el ? Number(el.getAttribute('data-cell')) : null;
  }

  function onBoardPointerDown(e: React.PointerEvent) {
    if (!running) return;
    const i = cellAt(e.clientX, e.clientY);
    if (i === null) return;
    e.preventDefault();
    setCurrent('');
    setPath([i]);
  }

  function onBoardPointerMove(e: React.PointerEvent) {
    const prev = dragPathRef.current;
    if (!prev.length || !record) return;
    const i = cellAt(e.clientX, e.clientY);
    if (i === null) return;
    const last = prev[prev.length - 1];
    if (i === last) return;
    // retracing onto the previous cell backtracks
    if (prev.length >= 2 && i === prev[prev.length - 2]) {
      setPath(prev.slice(0, -1));
      return;
    }
    if (prev.includes(i)) return;
    const size = Math.round(Math.sqrt(record.cells.length));
    if (!gridNeighbors(size, size)[last].includes(i)) return;
    setPath([...prev, i]);
  }

  function endDrag() {
    const path = dragPathRef.current;
    if (!path.length || !record) return;
    setPath([]);
    if (path.length === 1) {
      // a plain tap types the letter
      pressKey(record.cells[path[0]]);
      return;
    }
    submitWord(path.map((i) => record.cells[i]).join(''));
  }

  function pressKey(k: string) {
    if (!record || record.finished) return;
    if (k === 'enter') {
      submit();
      return;
    }
    if (k === 'backspace') {
      setCurrent((c) => c.slice(0, -1));
      return;
    }
    if (!running) return;
    if (/^[a-z]$/.test(k) && record.cells.includes(k)) {
      setCurrent((c) => (c.length < record.cells.length ? c + k : c));
    }
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

  // finish the drag even when the pointer is released off the board
  useEffect(() => {
    const up = () => endDrag();
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  });

  // reset trace preview and accordion when the board changes
  useEffect(() => {
    setTrace(null);
    setShowMissed(false);
  }, [record?.cells]);

  function traceHandlers(word: string) {
    const show = () => {
      if (!record) return;
      setTrace(findGridPath(record.cells, Math.round(Math.sqrt(record.cells.length)), word));
    };
    const hide = () => setTrace(null);
    return {
      onMouseEnter: show,
      onMouseLeave: hide,
      onPointerDown: show, // press-hold on touch
      onPointerUp: hide,
      onPointerCancel: hide,
    };
  }

  function newPracticeGrid(size?: number) {
    setCurrent('');
    const n = size ?? Math.round(Math.sqrt(store.practice?.cells.length ?? 16));
    setStore((prev) => ({ ...prev, practice: rollPracticeGrid(n) }));
  }

  const loading = (store.dailyMode ? !record && !dailyError : !record) || syncing;
  const mmss = `${Math.floor(remaining / 60000)}:${String(
    Math.floor((remaining % 60000) / 1000)
  ).padStart(2, '0')}`;

  return (
    <div className="text-center">
      <DailyToggle
        daily={store.dailyMode}
        onChange={(d) => {
          setCurrent('');
          setStore((prev) => ({ ...prev, dailyMode: d }));
        }}
      />

      {/* practice grid size */}
      {/* No size buttons. Practice is the daily generated on the fly, so its
          board comes from the difficulty like the daily's does. */}

      {loading && <p className="text-sm text-slate-400 py-8">Loading…</p>}
      {store.dailyMode && dailyError && !record && (
        <p className="text-sm text-danger py-8">
          Couldn&apos;t fetch today&apos;s grid — try Practice instead.
        </p>
      )}

      {record && (
        <>
          {/* timer + score */}
          <div className="mb-4 flex items-center justify-center gap-5 text-sm">
            <span
              className={`inline-flex items-center gap-1.5 font-bold text-xl tabular-nums
                ${running && remaining < 30000 ? 'text-danger' : 'text-white'}`}
            >
              <Timer className="w-4 h-4 text-slate-400" />
              {mmss}
            </span>
            <span className="text-slate-400">
              {score}
              {record.finished && ` / ${maxScore}`} pts
            </span>
            <span className="text-slate-400">
              {record.found.length}
              {record.finished && answers && ` / ${answers.length}`} words
            </span>
            {store.dailyMode && store.dailyDate && (
              <span className="text-xs text-slate-500">{store.dailyDate}</span>
            )}
          </div>

          {/* entry */}
          {running ? (
            <div className="relative mb-4 mx-auto max-w-sm h-12 px-4 rounded-xl bg-white/5 border-2 border-white/10 flex items-center justify-center overflow-hidden">
              <MobileKeyInput onKey={pressKey} />
              <span className="text-2xl font-bold tracking-[0.2em] uppercase text-white whitespace-nowrap">
                {dragPath.length ? (
                  <span className="text-emerald-300">
                    {dragPath.map((i) => record.cells[i]).join('')}
                  </span>
                ) : (
                  current
                )}
                <span className="text-accent animate-pulse">|</span>
              </span>
            </div>
          ) : (
            <div className="mb-4 h-12 flex items-center justify-center">
              {record.finished ? (
                <span className="text-sm font-semibold text-emerald-300">
                  Time! You found {record.found.length} of {answers?.length ?? '?'} words.
                </span>
              ) : (
                <span className="text-sm text-slate-400">
                  Three minutes on the clock — chain adjacent letters into words.
                </span>
              )}
            </div>
          )}

          {/* the grid — face-down until the clock starts; drag across cells to
              trace a word, release to submit (a plain tap types the letter) */}
          <div ref={boardRef} className="relative w-fit mx-auto">
            <div
              onPointerDown={onBoardPointerDown}
              onPointerMove={onBoardPointerMove}
              className={`grid gap-2 touch-none select-none ${
                record.cells.length === 9
                  ? 'grid-cols-3'
                  : record.cells.length === 25
                    ? 'grid-cols-5'
                    : 'grid-cols-4'
              }`}
            >
              {record.cells.map((c, i) => (
                <button
                  key={i}
                  data-cell={i}
                  disabled={!running}
                  className={`${record.cells.length === 25 ? 'w-9 h-10 sm:w-11 sm:h-12 text-lg sm:text-xl' : 'w-11 h-12 sm:w-12 sm:h-14 text-xl sm:text-2xl'} rounded-xl border-2 font-bold uppercase transition-colors
                    ${!record.endsAt
                      ? 'bg-white/5 border-white/15 text-slate-500'
                      : trace?.includes(i)
                        ? 'bg-sky-400/30 border-sky-300 text-white'
                        : dragPath.includes(i)
                          ? 'bg-emerald-400/30 border-emerald-300 text-white'
                          : 'bg-amber-400/10 border-amber-400/40 text-amber-200 hover:bg-amber-400/20'}`}
                >
                  {record.endsAt ? c : '?'}
                </button>
              ))}
            </div>
            {tracePts.length > 1 && (
              <svg className="absolute inset-0 w-full h-full pointer-events-none">
                <polyline
                  points={tracePts.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke="rgb(var(--trace) / 0.9)"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx={tracePts[0].x} cy={tracePts[0].y} r="6" fill="rgb(var(--trace))" />
              </svg>
            )}
          </div>

          {/* controls */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
            {!record.endsAt && (
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={start}
                className="inline-flex items-center gap-1.5 px-5 h-10 rounded-lg text-sm font-semibold bg-accent text-slate-950 shadow-lg shadow-accent/30 hover:brightness-110 transition-colors"
              >
                <Play className="w-4 h-4" />
                Start
              </button>
            )}
            {running && (
              <>
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
                  onClick={submit}
                  className="inline-flex items-center gap-1.5 px-4 h-10 rounded-lg text-sm font-semibold bg-amber-400/15 border border-amber-400/30 text-amber-200 hover:bg-amber-400/25 transition-colors"
                >
                  <CornerDownLeft className="w-4 h-4" />
                  Enter
                </button>
                {!store.dailyMode && (
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => newPracticeGrid()}
                    title="Give up — new grid, fresh clock"
                    className="inline-flex items-center gap-1.5 px-4 h-10 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
                  >
                    <Flag className="w-4 h-4" />
                    Quit
                  </button>
                )}
              </>
            )}
            {record.finished && (
              <>
                {!rail && <ShareButton
                  build={() =>
                    buildShare({
                      game: `Grid ${Math.round(Math.sqrt(record.cells.length))}×${Math.round(Math.sqrt(record.cells.length))}`,
                      slug: 'grid',
                      daily: store.dailyMode,
                      date: store.dailyDate,
                      body: [
                        `${score}/${maxScore} pts`,
                        `${record.found.length}/${answers?.length ?? 0} words`,
                      ],
                    })
                  }
                />}
                {/* nothing to reveal into when the solver is hidden */}
                {onReveal && (
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => onReveal(record.cells)}
                    className="inline-flex items-center gap-1.5 px-4 h-10 rounded-lg text-sm font-semibold bg-amber-400/15 border border-amber-400/30 text-amber-200 hover:bg-amber-400/25 transition-colors"
                  >
                    <Search className="w-4 h-4" />
                    Reveal all in solver
                  </button>
                )}
                {!store.dailyMode && (
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => newPracticeGrid()}
                    className="inline-flex items-center gap-1.5 px-4 h-10 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" />
                    New grid
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
          </div>

          {/* found words */}
          {!rail && record.found.length > 0 && (
            <div className="mt-3 max-w-md mx-auto">
              <div className="flex flex-wrap justify-center gap-1.5">
                {[...record.found].sort().map((w) => (
                  <span
                    key={w}
                    {...traceHandlers(w)}
                    title="Hover to trace on the board"
                    className={`px-2.5 py-1 rounded-lg border text-sm tracking-wide cursor-pointer select-none
                      ${w.length >= 7
                        ? 'bg-emerald-400/25 border-emerald-300 text-emerald-100 font-semibold'
                        : 'bg-emerald-400/10 border-emerald-400/30 text-emerald-200'}`}
                  >
                    {w}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* rejected non-words */}
          {!rail && (record.invalid?.length ?? 0) > 0 && (
            <div className="mt-4 max-w-md mx-auto">
              <p className="mb-2 text-xs font-medium text-slate-500 uppercase tracking-wider text-center">
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

          {/* missed words, revealed after time is up — through the display
              filter, which is the only place it applies in this game: your own
              found words are your own */}
          {record.finished && answers && (() => {
            const missed = answers.filter(
              (w) => !record.found.includes(w) && (displayWord?.(w) ?? true)
            );
            return missed.length > 0 && (
            <div className="mt-4 max-w-md mx-auto">
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setShowMissed((v) => !v)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-300/90 uppercase tracking-wider hover:text-rose-200 transition-colors"
              >
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform ${showMissed ? 'rotate-180' : ''}`}
                />
                Missed words · {missed.length}
              </button>
              {showMissed && (
                <div className="mt-2.5 flex flex-wrap justify-center gap-1.5 max-h-64 overflow-y-auto">
                  {missed.map((w) => (
                      <span
                        key={w}
                        {...traceHandlers(w)}
                        title="Hover to trace on the board"
                        className="px-2.5 py-1 rounded-lg border text-sm tracking-wide cursor-pointer select-none bg-rose-400/10 border-rose-400/30 text-rose-300"
                      >
                        {w}
                      </span>
                    ))}
                </div>
              )}
            </div>
          );
          })()}

          {store.dailyMode && record.finished && store.dailyDate && (
            <div>
              <DailyStats level={playedAt} game="grid" date={store.dailyDate} />
            </div>
          )}

          <p className="mt-5 text-xs text-slate-500">
            Words are 3+ letters traced through adjacent cells (diagonals count), using each
            cell once. Scoring: 3–4 letters 1&nbsp;pt, 5 letters 2, 6 letters 3, 7 letters 5,
            8+ letters 11. Scored against the word list for the difficulty you&apos;re playing.
            {store.dailyMode && ' A fresh daily grid arrives about 15 minutes after 3:00 a.m. Eastern.'}
          </p>
        </>
      )}
      {rail && record && (
        <InRail slot={rail}>
          <RailPanel label="Found" figure={`${record.found.length} ${record.found.length === 1 ? 'word' : 'words'} · ${score} pts`}>
            {record.found.length > 0 ? (
              <WordChips
                words={[...record.found].sort()}
                strong={(w) => w.length >= 7}
                chipProps={(w) => ({ ...traceHandlers(w), title: 'Hover to trace on the board', style: { cursor: 'pointer', userSelect: 'none' } })}
              />
            ) : (
              <p className="text-sm text-slate-400">{running ? 'Nothing yet. Type or trace a word.' : 'Start the clock to play.'}</p>
            )}
            {record.finished && (
              <div className="mt-3">
                <ShareButton build={() => buildShare({
                      game: `Grid ${Math.round(Math.sqrt(record.cells.length))}×${Math.round(Math.sqrt(record.cells.length))}`,
                      slug: 'grid',
                      daily: store.dailyMode,
                      date: store.dailyDate,
                      body: [`${score}/${maxScore} pts`, `${record.found.length}/${answers?.length ?? 0} words`],
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

export default GridGame;
