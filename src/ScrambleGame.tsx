import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { CornerDownLeft, Delete, Flag, Play, RefreshCw, Search, Shuffle, Timer } from 'lucide-react';
import { solveDescramble } from '@/solvers';
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
import { shuffledUntil } from '@/shuffle';
import { useRailSlot } from '@/railSlot';
import { InRail, RailPanel, WordChips } from '@/RailPanel';
import { GAME_NAME } from '@/games';
import { dailyIntent } from '@/routing/entry';
import { offerDailySwitch, reportDaily } from '@/dailyBus';
import DailyToggle from '@/DailyToggle';
import { usePrefs } from '@/prefs';
import { useDailySync } from '@/useDailySync';
import { buildShare } from '@/share';
import { recordSprint } from '@/stats';
import { store as siteStore } from '@/siteStorage';

export type ScrambleGameHandle = { pressKey: (k: string) => void };

const SCRAMBLE_KEY = 'anagrimoire:scramble:v1';
const DURATION_MS = 3 * 60 * 1000;

type ScrambleRecord = {
  rack: string[];
  found: string[];
  invalid?: string[]; // rejected non-dictionary guesses
  endsAt: number | null; // null until the player presses Start
  finished: boolean;
};
type ScrambleStore = {
  dailyMode: boolean;
  dailyDate: string;
  daily: ScrambleRecord | null;
  practice: ScrambleRecord | null;
};

const DEFAULT_STORE: ScrambleStore = {
  dailyMode: true,
  dailyDate: '',
  daily: null,
  practice: null,
};

function sanitizeRecord(r: unknown): ScrambleRecord | null {
  const rec = r as ScrambleRecord | null;
  if (
    !rec ||
    !Array.isArray(rec.rack) ||
    rec.rack.length !== 7 ||
    !rec.rack.every((c) => typeof c === 'string' && /^[a-z]$/.test(c)) ||
    !Array.isArray(rec.found)
  ) {
    return null;
  }
  return {
    rack: rec.rack,
    found: rec.found.filter((w) => typeof w === 'string'),
    invalid: Array.isArray(rec.invalid) ? rec.invalid.filter((w) => typeof w === 'string') : [],
    endsAt: typeof rec.endsAt === 'number' ? rec.endsAt : null,
    finished: rec.finished === true,
  };
}

// An incoming /daily/ or /play/ link decides which board is waiting; without one
// we keep whatever the player last had open.
function loadStore(): ScrambleStore {
  const store = readStore();
  const forced = dailyIntent('descramble');
  return forced === null ? store : { ...store, dailyMode: forced };
}

function readStore(): ScrambleStore {
  try {
    const raw = siteStore.getItem(SCRAMBLE_KEY);
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

function wordScore(word: string, rackSize: number): number {
  return (word.length === 3 ? 1 : word.length) + (word.length === rackSize ? 7 : 0);
}

const ScrambleGame = forwardRef<
  ScrambleGameHandle,
  {
    standardWords: string[] | null;
    commonWords: string[] | null;
    /** the words this difficulty draws practice from */
    practiceWords: string[] | null;
    onLetterStates: (states: Record<string, LetterState>) => void;
    onReveal?: (letters: string) => void;
  }
>(function ScrambleGame({ standardWords, commonWords, onLetterStates, onReveal, practiceWords }, ref) {
  const [store, setStore] = useState<ScrambleStore>(loadStore);
  const { practiceAllowed } = usePrefs();
  // pinned to the daily: someone who switched practice off shouldn't be left
  // looking at a practice board they can no longer leave
  useEffect(() => {
    if (!practiceAllowed && !store.dailyMode) setStore((prev) => ({ ...prev, dailyMode: true }));
  }, [practiceAllowed, store.dailyMode]);
  // the address bar says which board is open, and can ask for the other
  useEffect(() => reportDaily('descramble', store.dailyMode, store.dailyDate), [store.dailyMode, store.dailyDate]);
  useEffect(
    () => offerDailySwitch('descramble', (d) => setStore((prev) => ({ ...prev, dailyMode: d }))),
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
  const [now, setNow] = useState(() => Date.now());
  const flashTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    try {
      siteStore.setItem(SCRAMBLE_KEY, JSON.stringify(store));
    } catch {
      // best-effort persistence
    }
  }, [store]);

  // fetch today's rack once
  useEffect(() => {
    let alive = true;
    fetchDailyData('descramble')
      .then((raw) => {
        if (!alive) return;
        const chosen = resolveDifficulty(raw, difficulty());
        if (!chosen.board) throw new Error('bad payload');
        setPlayedAt(chosen.difficulty);
        // the date lives at the top level; the board's own fields come from
        // whichever difficulty was resolved
        const d = { ...raw, ...chosen.board };
        const rec = sanitizeRecord({ rack: d.letters, found: [], endsAt: null, finished: false });
        if (!rec || typeof d.date !== 'string') throw new Error('bad payload');
        // reset when the date changes OR the rack differs (e.g. the daily
        // source changed mid-day); racks compare as multisets since shuffling
        // reorders the stored copy
        setStore((prev) => {
          const same =
            prev.dailyDate === d.date &&
            prev.daily &&
            [...prev.daily.rack].sort().join('') === [...rec.rack].sort().join('');
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

  function makePracticeRack(): ScrambleRecord | null {
    if (!commonWords) return null;
    // The band for the difficulty being played, so practising at a level
    // practises for it. Falls back to common while the band loads.
    const from = practiceWords?.length ? practiceWords : commonWords;
    const bases = from.filter((w) => w.length === 7);
    if (!bases.length) return null;
    const base = bases[Math.floor(Math.random() * bases.length)];
    const sevens = new Set(bases);
    return {
      // dealt so it does not read as a word (shuffle.ts)
      rack: shuffledUntil(base.split(''), (d) => sevens.has(d.join(''))),
      found: [],
      endsAt: null,
      finished: false,
    };
  }

  // ensure a practice rack exists once the dictionary is ready
  useEffect(() => {
    if (store.dailyMode || store.practice || !commonWords) return;
    const rack = makePracticeRack();
    if (rack) setStore((prev) => (prev.practice ? prev : { ...prev, practice: rack }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.dailyMode, store.practice, commonWords]);

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
        'scramble',
        score,
        record?.found.length ?? 0,
        store.dailyMode ? store.dailyDate || null : null
      );
      updateRecord((r) => ({ ...r, finished: true }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, remaining]);

  const answers = useMemo(() => {
    if (!standardWords || !record) return null;
    return solveDescramble(standardWords, {
      letters: record.rack,
      wildcards: 0,
      useAll: false,
      minLength: 3,
    });
  }, [standardWords, record]);
  const answersSet = useMemo(() => (answers ? new Set(answers) : null), [answers]);
  const maxScore = useMemo(() => {
    if (!answers || !record) return 0;
    return answers.reduce((n, w) => n + wordScore(w, record.rack.length), 0);
  }, [answers, record]);

  const score = useMemo(() => {
    if (!record) return 0;
    return record.found.reduce((n, w) => n + wordScore(w, record.rack.length), 0);
  }, [record]);

  const syncing = useDailySync({
    difficulty: playedAt,
    game: 'scramble',
    date: store.dailyDate,
    record,
    setRecord: (merged) => setStore((prev) => ({ ...prev, daily: merged as ScrambleRecord })),
    summary: record?.finished ? { score, words: record.found.length } : null,
    active: store.dailyMode,
  });

  // dim letters not on the rack — but only once the game has started, so the
  // on-screen keyboard doesn't leak the letters before the clock runs
  useEffect(() => {
    if (!record || !record.endsAt) {
      onLetterStates({});
      return;
    }
    const rackSet = new Set(record.rack);
    const states: Record<string, LetterState> = {};
    for (const c of 'abcdefghijklmnopqrstuvwxyz') {
      if (!rackSet.has(c)) states[c] = 'absent';
    }
    onLetterStates(states);
  }, [record, onLetterStates]);

  function showFlash(text: string, good = false) {
    setFlash({ text, good });
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 1400);
  }

  function updateRecord(fn: (r: ScrambleRecord) => ScrambleRecord) {
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

  function submit() {
    if (!record || !running) return;
    if (!answersSet) {
      showFlash('Dictionary still loading…');
      return;
    }
    const word = current;
    setCurrent('');
    if (word.length < 3) {
      showFlash('Too short');
      return;
    }
    if (record.found.includes(word)) {
      showFlash('Already found');
      return;
    }
    if (!answersSet.has(word)) {
      updateRecord((r) =>
        r.invalid?.includes(word) ? r : { ...r, invalid: [...(r.invalid ?? []), word] }
      );
      showFlash('Not in dictionary');
      return;
    }
    updateRecord((r) => ({ ...r, found: [word, ...r.found] }));
    showFlash(
      word.length === record.rack.length
        ? `Full rack! +${wordScore(word, record.rack.length)}`
        : `+${wordScore(word, record.rack.length)}`,
      true
    );
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
    if (!/^[a-z]$/.test(k)) return;
    // respect rack multiplicity while typing
    const inRack = record.rack.filter((c) => c === k).length;
    const inCurrent = current.split('').filter((c) => c === k).length;
    if (inCurrent >= inRack) {
      showFlash(inRack === 0 ? 'Not on the rack' : 'No more of that letter');
      return;
    }
    setCurrent((c) => c + k);
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

  function shuffleRack() {
    // moves something, and does not land on a word: a Shuffle that deals the
    // answer has played the bonus for you
    updateRecord((r) => ({
      ...r,
      rack: shuffledUntil(r.rack, (d) => d.join('') === r.rack.join('') || !!answersSet?.has(d.join(''))),
    }));
  }

  function newPracticeRack() {
    const rack = makePracticeRack();
    if (!rack) return;
    setCurrent('');
    setStore((prev) => ({ ...prev, practice: rack }));
  }

  const loading =
    (store.dailyMode ? !record && !dailyError : !record || !commonWords) || syncing;
  const mmss = `${Math.floor(remaining / 60000)}:${String(
    Math.floor((remaining % 60000) / 1000)
  ).padStart(2, '0')}`;

  // rack letters not yet consumed by the current entry
  const remainingRack = useMemo(() => {
    if (!record) return [];
    const used: Record<string, number> = {};
    for (const c of current) used[c] = (used[c] ?? 0) + 1;
    return record.rack.map((c) => {
      if ((used[c] ?? 0) > 0) {
        used[c]--;
        return { c, spent: true };
      }
      return { c, spent: false };
    });
  }, [record, current]);

  // Beside the board on a wide page, the game's own panel goes in the rail
  // (railSlot.ts); narrower, it is drawn here, where it always was. The clock
  // and score stay with the rack, which is where the eye is while it runs.
  const rail = useRailSlot();
  const shareIt = () =>
    buildShare({
      game: GAME_NAME.descramble.full,
      slug: 'scramble',
      daily: store.dailyMode,
      date: store.dailyDate,
      body: [`${score}/${maxScore} pts`, `${record?.found.length ?? 0}/${answers?.length ?? 0} words`],
    });
  const longest = answers && answers.length ? Math.max(...answers.map((w) => w.length)) : 0;

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
          Couldn&apos;t fetch today&apos;s rack — try Practice instead.
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
              <span className="text-2xl font-bold tracking-[0.2em] uppercase text-white whitespace-nowrap">
                {current}
                <span className="text-accent animate-pulse">|</span>
              </span>
              <MobileKeyInput onKey={pressKey} />
            </div>
          ) : (
            <div className="mb-4 h-12 flex items-center justify-center">
              {record.finished ? (
                <span className="text-sm font-semibold text-emerald-300">
                  Time! You found {record.found.length} of {answers?.length ?? '?'} words.
                </span>
              ) : (
                <span className="text-sm text-slate-400">
                  Three minutes on the clock — find every word you can.
                </span>
              )}
            </div>
          )}

          {/* the rack — letters stay face-down until the clock starts */}
          <div className="flex justify-center gap-2">
            {remainingRack.map(({ c, spent }, i) => (
              <button
                key={i}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pressKey(c)}
                disabled={!running}
                className={`w-10 h-12 sm:w-12 sm:h-14 rounded-xl border-2 text-xl sm:text-2xl font-bold uppercase transition-colors
                  ${!record.endsAt
                    ? 'bg-white/5 border-white/15 text-slate-500'
                    : spent
                      ? 'bg-white/[0.02] border-white/5 text-slate-600'
                      : 'bg-amber-400/10 border-amber-400/40 text-amber-200 hover:bg-amber-400/20'}`}
              >
                {record.endsAt ? c : '?'}
              </button>
            ))}
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
                  onClick={shuffleRack}
                  aria-label="Shuffle rack"
                  className="inline-flex items-center justify-center w-11 h-10 rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
                >
                  <Shuffle className="w-4 h-4" />
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
                    onClick={newPracticeRack}
                    title="Give up — new rack, fresh clock"
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
                {!rail && <ShareButton build={shareIt} />}
                {/* nothing to reveal into when the solver is hidden */}
                {onReveal && (
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => onReveal(record.rack.join(''))}
                    className="inline-flex items-center gap-1.5 px-4 h-10 rounded-lg text-sm font-semibold bg-amber-400/15 border border-amber-400/30 text-amber-200 hover:bg-amber-400/25 transition-colors"
                  >
                    <Search className="w-4 h-4" />
                    Reveal all in solver
                  </button>
                )}
                {!store.dailyMode && (
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={newPracticeRack}
                    className="inline-flex items-center gap-1.5 px-4 h-10 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" />
                    New rack
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
                    className={`px-2.5 py-1 rounded-lg border text-sm tracking-wide
                      ${w.length === record.rack.length
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
          {(record.invalid?.length ?? 0) > 0 && (
            <div className="mt-4 max-w-md mx-auto">
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

          {store.dailyMode && record.finished && store.dailyDate && (
            <div>
              <DailyStats level={playedAt} game="scramble" date={store.dailyDate} />
            </div>
          )}

          <p className="mt-5 text-xs text-slate-500">
            Words are 3+ letters from the rack (each letter once). 3-letter words score 1,
            longer words their length; using the whole rack is +7. Scored against the
            word list for the difficulty you&apos;re playing.
            {store.dailyMode && ' A fresh daily rack arrives about 15 minutes after 3:00 a.m. Eastern.'}
          </p>
          {rail && (
            <InRail slot={rail}>
              <RailPanel label="Found" figure={`${record.found.length} ${record.found.length === 1 ? 'word' : 'words'}`}>
                {record.found.length > 0 ? (
                  <WordChips words={[...record.found].sort()} strong={(w) => w.length === record.rack.length} />
                ) : (
                  <p className="text-sm text-slate-400">
                    {running ? 'Nothing yet. Type a word and press Enter.' : record.finished ? 'Nothing found this time.' : 'Start the clock to play.'}
                  </p>
                )}
                {record.finished && <div className="mt-3"><ShareButton build={shareIt} /></div>}
              </RailPanel>
              {longest > 0 && (
                <RailPanel label="Longest possible">
                  <p className="text-sm text-slate-300">
                    {longest} letters
                    {/* the word itself only once the clock is done: shown
                        while it runs, it is the answer to the bonus */}
                    {record.finished ? (
                      <>
                        :{' '}
                        <span className="font-semibold uppercase tracking-wide text-white">
                          {answers!.filter((w) => w.length === longest).slice(0, 3).join(', ')}
                        </span>
                      </>
                    ) : (
                      <span className="text-slate-500"> · shown when the clock stops</span>
                    )}
                  </p>
                </RailPanel>
              )}
            </InRail>
          )}
        </>
      )}
    </div>
  );
});

export default ScrambleGame;
