import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Eye, Lightbulb, RefreshCw, Timer } from 'lucide-react';
import { gridNeighbors } from '@/solvers';
import {
  difficulty,
  onDifficultyChange,
  resolveDifficulty,
  type Difficulty,
} from '@/difficulty';
import { fetchDailyData, fetchPool } from '@/dailyData';
import DailyStats from '@/DailyStats';
import ShareButton from '@/ShareButton';
import { useRailSlot } from '@/railSlot';
import { InRail, RailPanel, WordChips } from '@/RailPanel';
import { GAME_NAME } from '@/games';
import { dailyIntent } from '@/routing/entry';
import { offerDailySwitch, reportDaily } from '@/dailyBus';
import DailyToggle from '@/DailyToggle';
import { usePrefs } from '@/prefs';
import { useDailySync } from '@/useDailySync';
import { buildShare, WEAVE_EMOJI } from '@/share';
import { usePalette } from '@/theme';
import { recordWeaveReveal, recordWeaveSolve } from '@/stats';
import type { NavKeys } from '@/storage';
import { formatElapsed, useUpTimer } from '@/useUpTimer';
import { store as siteStore } from '@/siteStorage';

export type WeaveGameHandle = { pressKey: (k: string) => void };

// the eight directions around the cursor, as [row delta, column delta]
const NUMPAD_DIRS: Record<string, [number, number]> = {
  '7': [-1, -1], '8': [-1, 0], '9': [-1, 1],
  '4': [0, -1], '6': [0, 1],
  '1': [1, -1], '2': [1, 0], '3': [1, 1],
};
const WASD_DIRS: Record<string, [number, number]> = {
  q: [-1, -1], w: [-1, 0], e: [-1, 1],
  a: [0, -1], d: [0, 1],
  z: [1, -1], s: [1, 0], x: [1, 1],
};

const WEAVE_KEY = 'anagrimoire:weave:v1';
const HINT_COST = 3;

type Answers = { spangram: { w: string; path: number[] }; words: { w: string; path: number[] }[] };
type WeaveRecord = {
  clue: string;
  cols: number;
  board: string[]; // rows of letters
  answersB64: string;
  found: string[]; // theme words found, may include the spangram
  hintWords: string[]; // banked non-theme dictionary words
  hintsUsed: number;
  hintTarget: string | null;
  revealed?: boolean;
  elapsedMs?: number;
};
type WeaveStore = {
  dailyMode: boolean;
  dailyDate: string;
  daily: WeaveRecord | null;
  practice: WeaveRecord | null;
  practiceSize: '6x8' | '8x10';
};

const DEFAULT_STORE: WeaveStore = {
  dailyMode: true,
  dailyDate: '',
  daily: null,
  practice: null,
  practiceSize: '6x8',
};

const WEAVE_LAYOUT: Record<number, { grid: string; cell: string }> = {
  6: { grid: 'grid-cols-6', cell: 'w-9 h-10 sm:w-11 sm:h-12 text-lg sm:text-xl' },
  7: { grid: 'grid-cols-7', cell: 'w-8 h-9 sm:w-10 sm:h-11 text-base sm:text-lg' },
  8: { grid: 'grid-cols-8', cell: 'w-8 h-9 sm:w-9 sm:h-10 text-base sm:text-lg' },
};

function sanitizeRecord(r: unknown): WeaveRecord | null {
  const rec = r as WeaveRecord | null;
  if (
    !rec ||
    typeof rec.clue !== 'string' ||
    // 6, 7 and 8 wide — easy, hard and extreme. Hard's 7-wide board was
    // rejected here and the game kept the previous one, so switching to hard
    // looked like the switch doing nothing at all.
    ![6, 7, 8].includes(rec.cols) ||
    !Array.isArray(rec.board) ||
    !rec.board.every((row) => typeof row === 'string' && row.length === rec.cols) ||
    typeof rec.answersB64 !== 'string'
  ) {
    return null;
  }
  return {
    clue: rec.clue,
    cols: rec.cols,
    board: rec.board,
    answersB64: rec.answersB64,
    found: Array.isArray(rec.found) ? rec.found.filter((w) => typeof w === 'string') : [],
    hintWords: Array.isArray(rec.hintWords) ? rec.hintWords.filter((w) => typeof w === 'string') : [],
    hintsUsed: typeof rec.hintsUsed === 'number' && rec.hintsUsed >= 0 ? rec.hintsUsed : 0,
    hintTarget: typeof rec.hintTarget === 'string' ? rec.hintTarget : null,
    revealed: rec.revealed === true,
    elapsedMs: typeof rec.elapsedMs === 'number' && rec.elapsedMs >= 0 ? rec.elapsedMs : 0,
  };
}

// An incoming /daily/ or /play/ link decides which board is waiting; without one
// we keep whatever the player last had open.
function loadStore(): WeaveStore {
  const store = readStore();
  const forced = dailyIntent('weave');
  return forced === null ? store : { ...store, dailyMode: forced };
}

function readStore(): WeaveStore {
  try {
    const raw = siteStore.getItem(WEAVE_KEY);
    if (!raw) return DEFAULT_STORE;
    const p = JSON.parse(raw);
    return {
      dailyMode: p?.dailyMode !== false,
      dailyDate: typeof p?.dailyDate === 'string' ? p.dailyDate : '',
      daily: sanitizeRecord(p?.daily),
      practice: sanitizeRecord(p?.practice),
      practiceSize: p?.practiceSize === '8x10' ? '8x10' : '6x8',
    };
  } catch {
    return DEFAULT_STORE;
  }
}

// same set of cells, in any order — a theme word only counts on its own tiles
function sameCells(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort((x, y) => x - y);
  const sb = [...b].sort((x, y) => x - y);
  return sa.every((v, i) => v === sb[i]);
}

function decodeAnswers(b64: string): Answers | null {
  try {
    const a = JSON.parse(atob(b64));
    if (!a?.spangram?.w || !Array.isArray(a?.words)) return null;
    return a as Answers;
  } catch {
    return null;
  }
}

type PuzzlePayload = { clue: string; cols: number; board: string[]; answers: string };

function toRecord(p: PuzzlePayload): WeaveRecord | null {
  return sanitizeRecord({
    clue: p.clue,
    cols: p.cols,
    board: p.board,
    answersB64: p.answers,
    found: [],
    hintWords: [],
    hintsUsed: 0,
    hintTarget: null,
    revealed: false,
    elapsedMs: 0,
  });
}

const WeaveGame = forwardRef<
  WeaveGameHandle,
  { standardWords: string[] | null; navKeys: NavKeys }
>(function WeaveGame({ standardWords, navKeys }, ref) {
  const [store, setStore] = useState<WeaveStore>(loadStore);
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
  useEffect(() => reportDaily('weave', store.dailyMode, store.dailyDate), [store.dailyMode, store.dailyDate]);
  useEffect(
    () => offerDailySwitch('weave', (d) => setStore((prev) => ({ ...prev, dailyMode: d }))),
    []
  );
  const [pool, setPool] = useState<Record<string, PuzzlePayload[]> | null>(null);
  // The difficulty this board actually is. Usually the one asked for, but a
  // feed generated before difficulty existed only has the easy board, and a
  // result has to be recorded as what was played rather than what was wanted.
  const [playedAt, setPlayedAt] = useState<Difficulty>(difficulty);
  // Changing difficulty means a different board, so the feed has to be read
  // again. A storage write re-renders nothing on its own.
  const [difficultyTick, setDifficultyTick] = useState(0);
  // the setting itself — practice has no daily fetch to learn it from
  const [level, setLevel] = useState<Difficulty>(difficulty);
  useEffect(
    () =>
      onDifficultyChange(() => {
        setLevel(difficulty());
        setDifficultyTick((n) => n + 1);
        // practice is redrawn rather than kept: it's a different difficulty's
        // board now, and practice isn't recorded
        setStore((prev) => ({ ...prev, practice: null }));
      }),
    []
  );
  const [dailyError, setDailyError] = useState(false);
  const [flash, setFlash] = useState<{ text: string; good: boolean } | null>(null);
  const flashTimer = useRef<number | undefined>(undefined);
  const palette = usePalette();

  useEffect(() => {
    try {
      siteStore.setItem(WEAVE_KEY, JSON.stringify(store));
    } catch {
      // best-effort persistence
    }
  }, [store]);

  // fetch today's puzzle once
  useEffect(() => {
    let alive = true;
    fetchDailyData('weave')
      .then((raw) => {
        if (!alive) return;
        const chosen = resolveDifficulty(raw, difficulty());
        if (!chosen.board) throw new Error('bad payload');
        setPlayedAt(chosen.difficulty);
        // the date lives at the top level; the board's own fields come from
        // whichever difficulty was resolved
        const d = { ...raw, ...chosen.board };
        const rec = toRecord(d);
        if (!rec || typeof d.date !== 'string') throw new Error('bad payload');
        // reset on date change or a different board (content-aware)
        setStore((prev) => {
          const same =
            prev.dailyDate === d.date &&
            prev.daily &&
            prev.daily.board.join('') === rec.board.join('');
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

  // fetch the practice pool once
  useEffect(() => {
    let alive = true;
    fetchPool('weave')
      .then((d) => {
        // byDifficulty when the feed has it, the old size keys otherwise
        if (alive && (d?.byDifficulty || d?.pool)) setPool(d.byDifficulty ?? d.pool);
      })
      .catch(() => {
        // practice unavailable until the pool loads
      });
    return () => {
      alive = false;
    };
  }, []);

  function pickPractice(size: '6x8' | '8x10', avoidBoard?: string) {
    // Practice follows the difficulty, falling back to the size keys for a
    // pool generated before difficulty existed.
    const from = pool?.[level] ?? pool?.[size];
    if (!from?.length) return null;
    const options = from.filter((p) => p.board.join('') !== avoidBoard);
    const pick = (options.length ? options : from)[
      Math.floor(Math.random() * (options.length ? options.length : from.length))
    ];
    return toRecord(pick);
  }

  // ensure a practice puzzle exists once the pool is loaded
  useEffect(() => {
    if (store.dailyMode || store.practice || !pool) return;
    const rec = pickPractice(store.practiceSize);
    if (rec) setStore((prev) => (prev.practice ? prev : { ...prev, practice: rec }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.dailyMode, store.practice, pool, store.practiceSize]);

  const record = store.dailyMode ? store.daily : store.practice;
  const answers = useMemo(() => (record ? decodeAnswers(record.answersB64) : null), [record]);
  const cells = useMemo(() => (record ? record.board.join('').split('') : []), [record]);
  const cols = record?.cols ?? 6;
  const rows = cols ? cells.length / cols : 0;

  const standardSet = useMemo(
    () => (standardWords ? new Set(standardWords) : null),
    [standardWords]
  );

  // cell -> lock kind for found words
  const locked = useMemo(() => {
    const m = new Map<number, 'theme' | 'span'>();
    if (!answers || !record) return m;
    for (const { w, path } of answers.words) {
      if (record.revealed || record.found.includes(w)) for (const i of path) m.set(i, 'theme');
    }
    if (record.revealed || record.found.includes(answers.spangram.w)) {
      for (const i of answers.spangram.path) m.set(i, 'span');
    }
    return m;
  }, [answers, record]);

  const hintCells = useMemo(() => {
    if (!answers || !record?.hintTarget) return new Set<number>();
    const target =
      answers.words.find((x) => x.w === record.hintTarget) ??
      (answers.spangram.w === record.hintTarget ? answers.spangram : null);
    return new Set(target?.path ?? []);
  }, [answers, record]);

  const solvedAll =
    !!answers && !!record && record.found.length >= answers.words.length + 1;
  const complete = solvedAll || !!record?.revealed;

  const syncing = useDailySync({
    difficulty: playedAt,
    game: 'weave',
    date: store.dailyDate,
    record,
    setRecord: (merged) => setStore((prev) => ({ ...prev, daily: merged as WeaveRecord })),
    summary: complete
      ? {
          solved: solvedAll,
          timeMs: solvedAll ? record?.elapsedMs ?? 0 : 0,
          hints: record?.hintsUsed ?? 0,
        }
      : null,
    active: store.dailyMode,
  });

  // after completion, draw every word's path as a line overlay
  const boardWrapRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const [solutionLines, setSolutionLines] = useState<{ pts: { x: number; y: number }[]; span: boolean }[]>([]);
  useLayoutEffect(() => {
    if (!complete || !answers || !boardWrapRef.current) {
      setSolutionLines([]);
      return;
    }
    const wrap = boardWrapRef.current.getBoundingClientRect();
    const measure = (path: number[]) =>
      path.map((i) => {
        const r = boardWrapRef.current!
          .querySelector(`[data-wcell="${i}"]`)!
          .getBoundingClientRect();
        return { x: r.left + r.width / 2 - wrap.left, y: r.top + r.height / 2 - wrap.top };
      });
    setSolutionLines([
      ...answers.words.map((w) => ({ pts: measure(w.path), span: false })),
      { pts: measure(answers.spangram.path), span: true },
    ]);
  }, [complete, answers]);

  useUpTimer(!!record && !complete, (delta) =>
    updateRecord((r) => ({ ...r, elapsedMs: (r.elapsedMs ?? 0) + delta }))
  );

  // drag-to-trace
  const [dragPath, setDragPath] = useState<number[]>([]);
  const dragPathRef = useRef<number[]>([]);
  const setPath = (p: number[]) => {
    dragPathRef.current = p;
    setDragPath(p);
  };

  function showFlash(text: string, good = false) {
    setFlash({ text, good });
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 1600);
  }

  function updateRecord(fn: (r: WeaveRecord) => WeaveRecord) {
    setStore((prev) => {
      const rec = prev.dailyMode ? prev.daily : prev.practice;
      if (!rec) return prev;
      const next = fn(rec);
      return prev.dailyMode ? { ...prev, daily: next } : { ...prev, practice: next };
    });
  }

  function cellAt(x: number, y: number): number | null {
    const el = document.elementFromPoint(x, y)?.closest('[data-wcell]');
    return el ? Number(el.getAttribute('data-wcell')) : null;
  }

  function onBoardPointerDown(e: React.PointerEvent) {
    if (!record || complete) return;
    const i = cellAt(e.clientX, e.clientY);
    if (i === null || locked.has(i)) return;
    e.preventDefault();
    // preventDefault blocks the focus a click would normally give the board,
    // so take it explicitly — that keeps the keyboard route available
    boardRef.current?.focus();
    setCursor(i);
    setKeyPath([]);
    setPath([i]);
  }

  function onBoardPointerMove(e: React.PointerEvent) {
    const prev = dragPathRef.current;
    if (!prev.length || !record) return;
    const i = cellAt(e.clientX, e.clientY);
    if (i === null || locked.has(i)) return;
    const last = prev[prev.length - 1];
    if (i === last) return;
    if (prev.length >= 2 && i === prev[prev.length - 2]) {
      setPath(prev.slice(0, -1));
      return;
    }
    if (prev.includes(i)) return;
    if (!gridNeighbors(rows, cols)[last].includes(i)) return;
    setPath([...prev, i]);
  }

  // shared by pointer drags and keyboard traces
  function submitPath(path: number[]) {
    if (!record || !answers || path.length < 3) return;
    const word = path.map((i) => cells[i]).join('');
    if (record.found.includes(word)) {
      showFlash('Already found');
      return;
    }
    // a theme word must be traced on its own cells — the same word spelled
    // elsewhere on the board is just a regular word
    const isSpan = word === answers.spangram.w && sameCells(path, answers.spangram.path);
    const isTheme = answers.words.some((x) => x.w === word && sameCells(path, x.path));
    if (isSpan || isTheme) {
      if (record.found.length + 1 >= answers.words.length + 1) {
        recordWeaveSolve(
          store.dailyMode,
          record.elapsedMs ?? 0,
          record.hintsUsed,
          store.dailyMode ? store.dailyDate || null : null
        );
      }
      updateRecord((r) => ({
        ...r,
        found: [...r.found, word],
        hintTarget: r.hintTarget === word ? null : r.hintTarget,
      }));
      showFlash(isSpan ? 'Spangram! 🎉' : 'Theme word!', true);
      return;
    }
    if (word.length >= 4 && standardSet?.has(word)) {
      if (record.hintWords.includes(word)) {
        showFlash('Already found');
        return;
      }
      updateRecord((r) => ({ ...r, hintWords: [...r.hintWords, word] }));
      const bank = record.hintWords.length + 1 - record.hintsUsed * HINT_COST;
      showFlash(`Nice word — hint progress ${Math.min(bank, HINT_COST)}/${HINT_COST}`, true);
      return;
    }
    showFlash('Not a theme word');
  }

  function endDrag() {
    const path = dragPathRef.current;
    setPath([]);
    if (path.length) submitPath(path);
  }

  useEffect(() => {
    const up = () => endDrag();
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  });

  // Keyboard tracing: move a cursor with the arrow keys, Enter/Space to
  // start a word, then keep stepping — arrows for the four straight
  // directions, or the number pad's ring (7 8 9 / 4 6 / 1 2 3) for all eight
  // including diagonals. You still have to find the word on the board.
  const [cursor, setCursor] = useState(0);
  const [keyPath, setKeyPath] = useState<number[]>([]);

  // a new board starts the cursor over again
  useEffect(() => {
    setCursor(0);
    setKeyPath([]);
  }, [record?.board]);

  const stepFrom = (from: number, dr: number, dc: number): number | null => {
    const r = Math.floor(from / cols) + dr;
    const c = (from % cols) + dc;
    if (r < 0 || r >= rows || c < 0 || c >= cols) return null;
    return r * cols + c;
  };

  function move(dr: number, dc: number) {
    const from = keyPath.length ? keyPath[keyPath.length - 1] : cursor;
    const to = stepFrom(from, dr, dc);
    if (to === null) return;
    setCursor(to);
    if (!keyPath.length) return;
    // stepping back onto the previous cell undoes it
    if (keyPath.length >= 2 && to === keyPath[keyPath.length - 2]) {
      setKeyPath((p) => p.slice(0, -1));
      return;
    }
    if (keyPath.includes(to) || locked.has(to)) return;
    setKeyPath((p) => [...p, to]);
  }

  function pressKey(k: string) {
    if (complete || !record) return;
    if (k === 'enter') {
      if (keyPath.length >= 3) {
        submitPath(keyPath);
        setKeyPath([]);
      } else if (!keyPath.length && !locked.has(cursor)) {
        setKeyPath([cursor]);
      }
      return;
    }
    if (k === 'backspace') {
      if (keyPath.length <= 1) {
        setKeyPath([]);
        return;
      }
      setCursor(keyPath[keyPath.length - 2]);
      setKeyPath(keyPath.slice(0, -1));
      return;
    }
    if (k === 'escape') setKeyPath([]);
  }

  useImperativeHandle(ref, () => ({ pressKey }));

  const ring = navKeys === 'wasd' ? WASD_DIRS : NUMPAD_DIRS;

  // the chosen key ring plus arrows, as [row delta, column delta]
  const KEY_DIRS: Record<string, [number, number]> = {
    ...ring,
    ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
  };

  // which key reaches each cell adjacent to the cursor — shown as a corner
  // pill so the next move is always visible rather than memorized
  const navHints = useMemo(() => {
    const m = new Map<number, string>();
    for (const [key, [dr, dc]] of Object.entries(ring)) {
      const r = Math.floor(cursor / cols) + dr;
      const c = (cursor % cols) + dc;
      if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
      m.set(r * cols + c, key.toUpperCase());
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, navKeys, cols, rows]);

  function onBoardKeyDown(e: React.KeyboardEvent) {
    if (e.ctrlKey || e.metaKey || e.altKey || complete) return;
    const dir = KEY_DIRS[e.key.length === 1 ? e.key.toLowerCase() : e.key];
    if (dir) {
      e.preventDefault();
      move(dir[0], dir[1]);
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      pressKey('enter');
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      pressKey('backspace');
    } else if (e.key === 'Escape') {
      pressKey('escape');
    }
  }

  // the letters currently under the cursor path, for display and for
  // screen readers
  const activePath = dragPath.length ? dragPath : keyPath;
  const activeWord = activePath.map((i) => cells[i]).join('');

  const hintBank = record ? record.hintWords.length - record.hintsUsed * HINT_COST : 0;
  const canHint =
    !!record && !!answers && !complete && !record.hintTarget && hintBank >= HINT_COST;

  function useHint() {
    if (!canHint || !answers || !record) return;
    const target =
      answers.words.find((x) => !record.found.includes(x.w))?.w ??
      (!record.found.includes(answers.spangram.w) ? answers.spangram.w : null);
    if (!target) return;
    updateRecord((r) => ({ ...r, hintsUsed: r.hintsUsed + 1, hintTarget: target }));
  }

  function reveal() {
    if (!record || complete) return;
    recordWeaveReveal(
      store.dailyMode,
      record.hintsUsed,
      store.dailyMode ? store.dailyDate || null : null
    );
    updateRecord((r) => ({ ...r, revealed: true, hintTarget: null }));
  }

  function newPractice() {
    const rec = pickPractice(store.practiceSize, record?.board.join(''));
    if (rec) setStore((prev) => ({ ...prev, practice: rec }));
  }

  const loading = (store.dailyMode ? !record && !dailyError : !record) || syncing;
  // Three widths now — 6, 7 and 8 for easy, hard and extreme. Written out per
  // width rather than computed, because Tailwind generates classes by reading
  // the source: a template-built `grid-cols-${n}` is a class that never exists.
  // Cells shrink as the board widens so eight of them still fit a 320px screen.
  const { grid: gridCols, cell: cellSize } =
    WEAVE_LAYOUT[cols] ?? WEAVE_LAYOUT[6];

  return (
    <div className="text-center">
      <DailyToggle
        daily={store.dailyMode}
        onChange={(d) => {
          setStore((prev) => ({ ...prev, dailyMode: d }));
        }}
      />

      {/* No practice size picker. Practice is the daily generated on the fly
          and not recorded, so its shape comes from the difficulty like the
          daily's does — a second control here would disagree with the first. */}

      {loading && <p className="text-sm text-slate-400 py-8">Loading…</p>}
      {store.dailyMode && dailyError && !record && (
        <p className="text-sm text-danger py-8">
          Couldn&apos;t fetch today&apos;s puzzle — try Practice instead.
        </p>
      )}

      {record && answers && (
        <>
          {/* clue */}
          <div className="mb-4 mx-auto max-w-sm rounded-xl bg-amber-400/10 border border-amber-400/25 px-4 py-3">
            <p className="text-[0.625rem] font-semibold text-accent uppercase tracking-wider">
              Today&apos;s theme
            </p>
            <p className="text-lg font-semibold text-amber-200">{record.clue}</p>
          </div>

          {/* progress */}
          {!rail && (
          <div className="mb-4 flex items-center justify-center gap-4 text-xs text-slate-400">
            <span className="inline-flex items-center gap-1.5 tabular-nums">
              <Timer className="w-3.5 h-3.5 text-slate-500" />
              {formatElapsed(record.elapsedMs ?? 0)}
            </span>
            <span>
              {record.found.length} / {answers.words.length + 1} found
            </span>
            {record.hintsUsed > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <Lightbulb className="w-3.5 h-3.5 text-slate-500" />
                {record.hintsUsed} hint{record.hintsUsed === 1 ? '' : 's'}
              </span>
            )}
            {store.dailyMode && store.dailyDate && (
              <span className="text-slate-500">{store.dailyDate}</span>
            )}
          </div>
          )}

          {/* the traced letters are visible on the board itself; this only
              announces them to screen readers */}
          <p className="sr-only" aria-live="polite">
            {activeWord}
          </p>

          {/* the board */}
          <div ref={boardWrapRef} className="relative w-fit mx-auto">
          {/* one tab stop for the whole board: the cells are driven by the
              cursor rather than being 48 separate stops */}
          <div
            ref={boardRef}
            role="application"
            tabIndex={complete ? -1 : 0}
            aria-label={
              `Weave board. Arrow keys or ${
                navKeys === 'wasd' ? 'Q W E A D Z S X' : 'the number pad ring'
              } move the cursor, Enter starts a word and submits it, Backspace steps back.`
            }
            onKeyDown={onBoardKeyDown}
            onPointerDown={onBoardPointerDown}
            onPointerMove={onBoardPointerMove}
            className={`grid gap-1.5 touch-none select-none rounded-xl ${gridCols}`}
          >
            {cells.map((c, i) => {
              const lock = locked.get(i);
              const onPath = activePath.includes(i);
              return (
                <button
                  key={i}
                  data-wcell={i}
                  // index.css rings this cell while the board holds focus
                  data-wcursor={i === cursor ? '' : undefined}
                  tabIndex={-1}
                  disabled={complete}
                  className={`${cellSize} relative rounded-lg border-2 font-bold uppercase transition-colors
                    ${lock === 'span'
                      ? 'bg-amber-400/50 border-amber-300 text-white'
                      : lock === 'theme'
                        ? 'bg-sky-400/40 border-sky-300 text-white'
                        : onPath
                          ? 'bg-emerald-400/30 border-emerald-300 text-white'
                          : 'bg-white/5 border-white/55 text-white hover:bg-white/10'}
                    ${hintCells.has(i) && !lock ? 'ring-2 ring-emerald-300/80' : ''}`}
                >
                  {c}
                  {navHints.has(i) && (
                    <span
                      data-navkey=""
                      aria-hidden="true"
                      className="absolute -top-1.5 -right-1.5 min-w-[1rem] h-4 px-1 flex items-center justify-center rounded-full bg-slate-900 border border-white/40 text-[0.5625rem] font-mono font-bold leading-none text-slate-200"
                    >
                      {navHints.get(i)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {solutionLines.length > 0 && (
            <svg className="absolute inset-0 w-full h-full pointer-events-none">
              {solutionLines.map((line, i) => (
                <polyline
                  key={i}
                  points={line.pts.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke={line.span ? 'rgb(var(--span) / 0.85)' : 'rgb(var(--trace) / 0.7)'}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
            </svg>
          )}
          </div>

          {/* controls */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
            {!rail && <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={useHint}
              disabled={!canHint}
              title={`Find ${HINT_COST} non-theme words to earn a hint`}
              className="inline-flex items-center gap-1.5 px-4 h-10 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-40"
            >
              <Lightbulb className="w-4 h-4" />
              Hint {Math.min(Math.max(hintBank, 0), HINT_COST)}/{HINT_COST}
            </button>}
            {!rail && complete && (
              <ShareButton
                build={() => {
                  const e = WEAVE_EMOJI[palette];
                  // one mark per word in the order they were found — never
                  // the board, which would give the shape away
                  const marks = record.found
                    .map((w) => (w === answers.spangram.w ? e.span : e.theme))
                    .join('');
                  // deliberately no clue: working out the theme is half the
                  // puzzle, so posting it would spoil the board
                  return buildShare({
                    game: GAME_NAME.weave.full,
                    slug: 'weave',
                    daily: store.dailyMode,
                    date: store.dailyDate,
                    body: [
                      marks + e.hint.repeat(record.hintsUsed),
                      solvedAll
                        ? `Solved in ${formatElapsed(record.elapsedMs ?? 0)}`
                        : 'Revealed',
                    ],
                  });
                }}
              />
            )}
            {!complete && (
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={reveal}
                title="Give up and show the full solution"
                className="inline-flex items-center gap-1.5 px-4 h-10 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
              >
                <Eye className="w-4 h-4" />
                Reveal
              </button>
            )}
            {!store.dailyMode && (
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={newPractice}
                className="inline-flex items-center gap-1.5 px-4 h-10 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                New puzzle
              </button>
            )}
          </div>

          <div className="h-6 mt-3">
            {flash && (
              <p className={`text-sm font-medium ${flash.good ? 'text-emerald-300' : 'text-amber-300'}`}>
                {flash.text}
              </p>
            )}
            {!flash && complete && (
              <p className={`text-sm font-semibold ${solvedAll ? 'text-emerald-300' : 'text-slate-400'}`}>
                {solvedAll
                  ? `Solved in ${formatElapsed(record.elapsedMs ?? 0)} · ${
                      record.hintsUsed === 0
                        ? 'no hints'
                        : `${record.hintsUsed} hint${record.hintsUsed === 1 ? '' : 's'}`
                    } 🎉`
                  : 'Revealed 🔍'}
              </p>
            )}
          </div>

          {/* found theme words */}
          {!rail && record.found.length > 0 && (
            <div className="mt-2 flex flex-wrap justify-center gap-1.5 max-w-md mx-auto">
              {record.found.map((w) => (
                <span
                  key={w}
                  className={`px-2.5 py-1 rounded-lg border text-sm tracking-wide
                    ${w === answers.spangram.w
                      ? 'bg-amber-400/20 border-amber-400/40 text-amber-200 font-semibold'
                      : 'bg-sky-400/15 border-sky-400/30 text-sky-200'}`}
                >
                  {w}
                </span>
              ))}
            </div>
          )}

          {store.dailyMode && complete && store.dailyDate && (
            <div>
              <DailyStats level={playedAt} game="weave" date={store.dailyDate} />
            </div>
          )}

          <p className="mt-5 text-xs text-slate-500">
            Drag to trace the themed words — or tab to the board and steer with the arrow
            keys, using{' '}
            {navKeys === 'wasd' ? 'Q W E / A D / Z S X' : '7 8 9 / 4 6 / 1 2 3'} for
            diagonals; Enter starts a word and submits it. Every letter is used exactly
            once, and the spangram spans the board. Other dictionary words (4+ letters)
            build toward hints.
            {store.dailyMode && ' A fresh daily puzzle arrives about 15 minutes after 3:00 a.m. Eastern.'}
          </p>
        </>
      )}
      {rail && record && answers && (
        <InRail slot={rail}>
          <RailPanel label="Your progress" figure={`${record.found.length} / ${answers.words.length + 1} found`}>
            <p className="flex items-center gap-1.5 text-sm text-slate-300 tabular-nums">
              <Timer className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
              {formatElapsed(record.elapsedMs ?? 0)}
              {store.dailyMode && store.dailyDate && <span className="ml-auto text-xs text-slate-500">{store.dailyDate}</span>}
            </p>
            {record.hintsUsed > 0 && (
              <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-slate-400">
                <Lightbulb className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                {record.hintsUsed} hint{record.hintsUsed === 1 ? '' : 's'} used
              </p>
            )}
            {record.found.length > 0 && (
              <div className="mt-3">
                <WordChips words={record.found} strong={(w) => w === answers.spangram.w} />
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={useHint}
                disabled={!canHint}
                title={`Find ${HINT_COST} non-theme words to earn a hint`}
                className="inline-flex items-center gap-1.5 px-4 h-10 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-40"
              >
                <Lightbulb className="w-4 h-4" />
                Hint {Math.min(Math.max(hintBank, 0), HINT_COST)}/{HINT_COST}
              </button>
              {complete && <ShareButton build={() => {
                  const e = WEAVE_EMOJI[palette];
                  // one mark per word in the order they were found — never
                  // the board, which would give the shape away
                  const marks = record.found
                    .map((w) => (w === answers.spangram.w ? e.span : e.theme))
                    .join('');
                  // deliberately no clue: working out the theme is half the
                  // puzzle, so posting it would spoil the board
                  return buildShare({
                    game: GAME_NAME.weave.full,
                    slug: 'weave',
                    daily: store.dailyMode,
                    date: store.dailyDate,
                    body: [
                      marks + e.hint.repeat(record.hintsUsed),
                      solvedAll
                        ? `Solved in ${formatElapsed(record.elapsedMs ?? 0)}`
                        : 'Revealed',
                    ],
                  });
                }} />}
            </div>
          </RailPanel>
        </InRail>
      )}
    </div>
  );
});

export default WeaveGame;
