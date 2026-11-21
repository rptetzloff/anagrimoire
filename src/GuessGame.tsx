import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { RefreshCw, Search, Timer, Trophy } from 'lucide-react';
import { fetchDailyData } from '@/dailyData';
import {
  difficulty,
  onDifficultyChange,
  resolveDifficulty,
  type Difficulty,
} from '@/difficulty';
import DailyStats from '@/DailyStats';
import MobileKeyInput from '@/MobileKeyInput';
import ShareButton from '@/ShareButton';
import { useRailSlot } from '@/railSlot';
import { InRail, RailPanel } from '@/RailPanel';
import { GAME_NAME } from '@/games';
import { asRecord, asRecords, type GameRecord } from '@/guessRecord';
import { dailyIntent } from '@/routing/entry';
import { offerDailySwitch, reportDaily } from '@/dailyBus';
import DailyToggle from '@/DailyToggle';
import { usePrefs } from '@/prefs';
import { useDailySync } from '@/useDailySync';
import { buildShare, TILE_EMOJI } from '@/share';
import { usePalette } from '@/theme';
import { recordGuessFinish } from '@/stats';
import { formatElapsed, useUpTimer } from '@/useUpTimer';
import { store as siteStore } from '@/siteStorage';

export type LetterState = 'correct' | 'present' | 'absent';
export type GuessGameHandle = { pressKey: (k: string) => void };

const MAX_GUESSES = 6;
const PLAY_KEY = 'anagrimoire:play:v1';

type Stats = { played: number; won: number; streak: number; lastWinDate: string };
type PlayStore = {
  dailyMode: boolean;
  dailyDate: string;
  daily: Record<string, GameRecord>;
  practice: Record<string, GameRecord>;
  stats: Stats;
};

const DEFAULT_STORE: PlayStore = {
  dailyMode: true,
  dailyDate: '',
  daily: {},
  practice: {},
  stats: { played: 0, won: 0, streak: 0, lastWinDate: '' },
};

// An incoming /daily/ or /play/ link decides which board is waiting; without one
// we keep whatever the player last had open.
function loadStore(): PlayStore {
  const store = readStore();
  const forced = dailyIntent('pattern');
  return forced === null ? store : { ...store, dailyMode: forced };
}

function readStore(): PlayStore {
  try {
    const raw = siteStore.getItem(PLAY_KEY);
    if (!raw) return DEFAULT_STORE;
    const p = JSON.parse(raw);
    return {
      dailyMode: p?.dailyMode !== false,
      dailyDate: typeof p?.dailyDate === 'string' ? p.dailyDate : '',
      daily: asRecords(p?.daily),
      practice: asRecords(p?.practice),
      stats: {
        played: Number(p?.stats?.played) || 0,
        won: Number(p?.stats?.won) || 0,
        streak: Number(p?.stats?.streak) || 0,
        lastWinDate: typeof p?.stats?.lastWinDate === 'string' ? p.stats.lastWinDate : '',
      },
    };
  } catch {
    return DEFAULT_STORE;
  }
}

function scoreGuess(answer: string, guess: string): LetterState[] {
  const n = answer.length;
  const result: LetterState[] = Array(n).fill('absent');
  const counts: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    if (guess[i] === answer[i]) result[i] = 'correct';
    else counts[answer[i]] = (counts[answer[i]] ?? 0) + 1;
  }
  for (let i = 0; i < n; i++) {
    if (result[i] !== 'correct' && (counts[guess[i]] ?? 0) > 0) {
      result[i] = 'present';
      counts[guess[i]]--;
    }
  }
  return result;
}

function previousEtDate(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

const GuessGame = forwardRef<
  GuessGameHandle,
  {
    length: number;
    commonWords: string[] | null;
    /** the words this difficulty draws practice from */
    practiceWords: string[] | null;
    fullWords: string[] | null;
    onLetterStates: (states: Record<string, LetterState>) => void;
    onReveal?: (clues: { length: number; known: string[]; contains: string; excluded: string }) => void;
  }
>(function GuessGame({ length, commonWords, fullWords, onLetterStates, onReveal, practiceWords }, ref) {
  const [store, setStore] = useState<PlayStore>(loadStore);
  const { practiceAllowed } = usePrefs();
  // pinned to the daily: someone who switched practice off shouldn't be left
  // looking at a practice board they can no longer leave
  useEffect(() => {
    if (!practiceAllowed && !store.dailyMode) setStore((prev) => ({ ...prev, dailyMode: true }));
  }, [practiceAllowed, store.dailyMode]);
  // the address bar says which board is open, and can ask for the other
  useEffect(() => reportDaily('pattern', store.dailyMode, store.dailyDate), [store.dailyMode, store.dailyDate]);
  useEffect(
    () => offerDailySwitch('pattern', (d) => setStore((prev) => ({ ...prev, dailyMode: d }))),
    []
  );
  const [dailyData, setDailyData] = useState<{ date: string; words: Record<string, string> } | null>(null);
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
    if (!first) setStore((prev) => ({ ...prev, practice: {} }));
  }, [practiceWords]);
  const [dailyError, setDailyError] = useState(false);
  const [current, setCurrent] = useState('');
  const [flash, setFlash] = useState('');
  const flashTimer = useRef<number | undefined>(undefined);
  const palette = usePalette();

  useEffect(() => {
    try {
      siteStore.setItem(PLAY_KEY, JSON.stringify(store));
    } catch {
      // best-effort persistence
    }
  }, [store]);

  // fetch today's daily words once
  useEffect(() => {
    let alive = true;
    fetchDailyData('pattern')
      .then((raw) => {
        if (!alive) return;
        const chosen = resolveDifficulty(raw, difficulty());
        if (!chosen.board) throw new Error('bad payload');
        setPlayedAt(chosen.difficulty);
        // the date lives at the top level; the board's own fields come from
        // whichever difficulty was resolved
        const d = { ...raw, ...chosen.board };
        if (typeof d?.date !== 'string' || typeof d?.words !== 'object') throw new Error('bad payload');
        setDailyData({ date: d.date, words: d.words });
        // a new day resets all daily boards; same-day boards whose answer no
        // longer matches the feed (e.g. the daily source changed) reset too
        setStore((prev) => {
          if (prev.dailyDate !== d.date) return { ...prev, dailyDate: d.date, daily: {} };
          const daily = { ...prev.daily };
          let changed = false;
          for (const [len, rec] of Object.entries(daily)) {
            if (d.words[len] !== rec.answer) {
              delete daily[len];
              changed = true;
            }
          }
          return changed ? { ...prev, daily } : prev;
        });
      })
      .catch(() => {
        if (alive) setDailyError(true);
      });
    return () => {
      alive = false;
    };
  }, [difficultyTick]);

  const commonSet = useMemo(() => (commonWords ? new Set(commonWords) : null), [commonWords]);
  const fullSetForLen = useMemo(
    () => (fullWords ? new Set(fullWords.filter((w) => w.length === length)) : null),
    [fullWords, length]
  );

  const dailyMode = store.dailyMode;
  const lenKey = String(length);

  function pickPracticeWord(): string | null {
    if (!commonWords || !commonSet) return null;
    // The band for the difficulty being played, so practising at a level
    // practises for it. Falls back to common while the band loads.
    const from = practiceWords?.length ? practiceWords : commonWords;
    const pool = from.filter(
      (w) => w.length === length && !(w.endsWith('s') && commonSet.has(w.slice(0, -1)))
    );
    if (!pool.length) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // ensure a game record exists for the active board
  useEffect(() => {
    if (dailyMode) {
      if (!dailyData || store.daily[lenKey]) return;
      const encoded = dailyData.words[lenKey];
      if (!encoded) return;
      setStore((prev) =>
        prev.daily[lenKey]
          ? prev
          : { ...prev, daily: { ...prev.daily, [lenKey]: { answer: encoded, guesses: [] } } }
      );
    } else {
      if (store.practice[lenKey] || !commonWords) return;
      const word = pickPracticeWord();
      if (!word) return;
      setStore((prev) =>
        prev.practice[lenKey]
          ? prev
          : { ...prev, practice: { ...prev.practice, [lenKey]: { answer: btoa(word), guesses: [] } } }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dailyMode, dailyData, commonWords, lenKey, store.daily, store.practice]);

  // Which lengths today's feed actually carries, read from the feed rather
  // than hardcoded: the daily stops at 12 because the pool of common words
  // that long runs thin — 82 at fifteen letters is under three months before
  // every one has been used — but the client shouldn't have to be told again
  // if that number ever moves.
  const dailyLengths = useMemo(
    () =>
      dailyData
        ? Object.keys(dailyData.words)
            .map(Number)
            .filter((n) => Number.isFinite(n))
            .sort((a, b) => a - b)
        : [],
    [dailyData]
  );
  const noDailyAtLength = dailyMode && !!dailyData && !dailyData.words[lenKey];

  const record = dailyMode ? store.daily[lenKey] : store.practice[lenKey];
  const answer = useMemo(() => {
    if (!record) return null;
    try {
      return atob(record.answer).toLowerCase();
    } catch {
      return null;
    }
  }, [record]);

  const guesses = useMemo(() => record?.guesses ?? [], [record]);
  const won = answer !== null && guesses.includes(answer);
  const lost = !won && guesses.length >= MAX_GUESSES;
  const playing = answer !== null && !won && !lost;

  // Each word length is its own board on the same date, so the length is the
  // variant that keeps today's 5- and 6-letter puzzles apart.
  const syncing = useDailySync({
    difficulty: playedAt,
    game: 'guess',
    variant: String(length),
    date: dailyData?.date ?? '',
    record: record ?? null,
    setRecord: (merged) =>
      setStore((prev) => {
        // through asRecord because this one comes off the wire: the other
        // device may be on a build that still writes `secret`
        const rec = asRecord(merged);
        return rec ? { ...prev, daily: { ...prev.daily, [lenKey]: rec } } : prev;
      }),
    summary:
      won || lost
        ? { won, guesses: guesses.length, timeMs: record?.elapsedMs ?? 0, length }
        : null,
    active: dailyMode,
  });

  // thinking time: counts while the board is visible and unfinished
  useUpTimer(playing, (delta) => {
    setStore((prev) => {
      const bucket = prev.dailyMode ? prev.daily : prev.practice;
      const rec = bucket[lenKey];
      if (!rec) return prev;
      const updated = {
        ...bucket,
        [lenKey]: { ...rec, elapsedMs: (rec.elapsedMs ?? 0) + delta },
      };
      return prev.dailyMode ? { ...prev, daily: updated } : { ...prev, practice: updated };
    });
  });

  // aggregate keyboard letter states, correct > present > absent
  useEffect(() => {
    if (!answer) {
      onLetterStates({});
      return;
    }
    const states: Record<string, LetterState> = {};
    const rank = { absent: 0, present: 1, correct: 2 };
    for (const g of guesses) {
      const score = scoreGuess(answer, g);
      for (let i = 0; i < g.length; i++) {
        const prev = states[g[i]];
        if (!prev || rank[score[i]] > rank[prev]) states[g[i]] = score[i];
      }
    }
    onLetterStates(states);
  }, [answer, guesses, onLetterStates]);

  function showFlash(msg: string) {
    setFlash(msg);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(''), 1600);
  }

  function finishDaily(didWin: boolean) {
    if (!dailyMode || !dailyData) return;
    setStore((prev) => {
      const s = prev.stats;
      const streak = didWin
        ? s.lastWinDate === previousEtDate(dailyData.date) || s.lastWinDate === dailyData.date
          ? s.streak + (s.lastWinDate === dailyData.date ? 0 : 1)
          : 1
        : 0;
      return {
        ...prev,
        stats: {
          played: s.played + 1,
          won: s.won + (didWin ? 1 : 0),
          streak,
          lastWinDate: didWin ? dailyData.date : s.lastWinDate,
        },
      };
    });
  }

  function submit() {
    if (!playing || !answer) return;
    if (current.length !== length) {
      showFlash('Not enough letters');
      return;
    }
    if (!fullSetForLen) {
      showFlash('Dictionary still loading…');
      return;
    }
    if (current !== answer && !fullSetForLen.has(current)) {
      showFlash('Not in dictionary');
      return;
    }
    const next = [...guesses, current];
    const didWin = current === answer;
    const done = didWin || next.length >= MAX_GUESSES;
    setStore((prev) => {
      const bucket = dailyMode ? prev.daily : prev.practice;
      const rec = bucket[lenKey];
      if (!rec) return prev;
      const updated = { ...bucket, [lenKey]: { ...rec, guesses: next } };
      return dailyMode ? { ...prev, daily: updated } : { ...prev, practice: updated };
    });
    setCurrent('');
    if (done) {
      recordGuessFinish(
        dailyMode,
        didWin,
        next.length,
        record?.elapsedMs ?? 0,
        dailyMode ? dailyData?.date ?? null : null,
        length
      );
      finishDaily(didWin);
    }
  }

  // translate the board's knowledge into solver clues
  function reveal() {
    if (!answer) return;
    const known = Array<string>(length).fill('');
    const present = new Set<string>();
    const absent = new Set<string>();
    for (const g of guesses) {
      const score = scoreGuess(answer, g);
      for (let i = 0; i < g.length; i++) {
        if (score[i] === 'correct') known[i] = g[i];
        else if (score[i] === 'present') present.add(g[i]);
        else absent.add(g[i]);
      }
    }
    // grays from duplicate letters aren't truly excluded
    for (const c of [...absent]) if (present.has(c) || known.includes(c)) absent.delete(c);
    // presents already locked into a green slot don't need a contains clue
    for (const c of [...present]) if (known.includes(c)) present.delete(c);
    onReveal?.({
      length,
      known,
      contains: [...present].sort().join(''),
      excluded: [...absent].sort().join(''),
    });
  }

  function newPracticeWord() {
    const word = pickPracticeWord();
    if (!word) return;
    setCurrent('');
    setStore((prev) => ({
      ...prev,
      practice: { ...prev.practice, [lenKey]: { answer: btoa(word), guesses: [] } },
    }));
  }

  function pressKey(k: string) {
    if (k === 'enter') {
      submit();
      return;
    }
    if (k === 'backspace') {
      setCurrent((c) => c.slice(0, -1));
      return;
    }
    if (/^[a-z]$/.test(k) && playing) {
      setCurrent((c) => (c.length < length ? c + k : c));
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

  const tileSize =
    length > 10
      ? 'w-6 h-8 text-sm sm:w-7 sm:h-9 sm:text-base'
      : length > 7
        ? 'w-8 h-10 text-lg sm:w-9 sm:h-11'
        : 'w-10 h-12 text-xl sm:w-12 sm:h-14 sm:text-2xl';

  const cellClass = (state: LetterState | 'pending' | 'empty') => {
    switch (state) {
      case 'correct':
        return 'bg-emerald-500/80 border-emerald-400 text-white';
      case 'present':
        return 'bg-amber-400/80 border-amber-300 text-ink';
      case 'absent':
        return 'bg-white/[0.04] border-white/10 text-slate-500';
      case 'pending':
        return 'bg-white/5 border-white/30 text-white';
      default:
        return 'bg-white/[0.02] border-white/10 text-transparent';
    }
  };

  // hold the board until the synced copy has merged — reconciling after
  // someone has typed a guess is worse than a moment of waiting
  const loading = (dailyMode ? !dailyData && !dailyError : !commonWords) || syncing;
  // Beside the board on a wide page, the game's own panel goes in the rail
  // (railSlot.ts); narrower, it is drawn here, where it always was.
  const rail = useRailSlot();
  const shareIt = () =>
    buildShare({
      game: `${GAME_NAME.pattern.full} (${length})`,
      slug: 'guess',
      daily: dailyMode,
      date: dailyData?.date,
      body: [
        won ? `${guesses.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`,
        '',
        // colours only — the letters stay secret
        ...guesses.map((g) =>
          scoreGuess(answer!, g)
            .map((st) => TILE_EMOJI[palette][st])
            .join('')
        ),
      ],
    });

  return (
    <div className="text-center">
      <DailyToggle
        daily={dailyMode}
        onChange={(d) => {
          setStore((prev) => ({ ...prev, dailyMode: d }));
        }}
      />

      {!rail && (
      <div className="mb-4 flex items-center justify-center gap-4 text-xs text-slate-400">
        {record && (
          <span className="inline-flex items-center gap-1.5 tabular-nums">
            <Timer className="w-3.5 h-3.5 text-slate-500" />
            {formatElapsed(record.elapsedMs ?? 0)}
          </span>
        )}
        {dailyMode && (
          <>
            <span className="inline-flex items-center gap-1.5">
              <Trophy className="w-3.5 h-3.5 text-accent" />
              Streak {store.stats.streak}
            </span>
            <span>Played {store.stats.played}</span>
            <span>Won {store.stats.won}</span>
            {dailyData && <span className="text-slate-500">{dailyData.date}</span>}
          </>
        )}
      </div>
      )}

      {loading && <p className="text-sm text-slate-400 py-8">Loading…</p>}
      {dailyMode && dailyError && (
        <p className="text-sm text-danger py-8">
          Couldn&apos;t fetch today&apos;s words — try Practice instead.
        </p>
      )}
      {/* A length with no daily used to render an empty board and no
          explanation, which reads as broken rather than as absent. */}
      {noDailyAtLength && !dailyError && (
        <p className="text-sm text-slate-400 py-8">
          No daily puzzle at {length} letters — today&apos;s run from{' '}
          {dailyLengths[0]} to {dailyLengths[dailyLengths.length - 1]}. Practice
          works at every length.
        </p>
      )}

      {answer && (
        <>
          <div className="relative flex flex-col items-center gap-1.5">
            {playing && <MobileKeyInput onKey={pressKey} label="Tap the board and type your guess" />}
            {Array.from({ length: MAX_GUESSES }, (_, row) => {
              const guess = guesses[row];
              const isCurrent = row === guesses.length && playing;
              const score = guess && answer ? scoreGuess(answer, guess) : null;
              return (
                <div key={row} className="flex gap-1.5">
                  {Array.from({ length }, (_, col) => {
                    const ch = guess ? guess[col] : isCurrent ? current[col] ?? '' : '';
                    const state = score ? score[col] : ch ? 'pending' : 'empty';
                    return (
                      <div
                        key={col}
                        className={`${tileSize} flex items-center justify-center font-bold uppercase rounded-lg border-2 transition-colors ${cellClass(state)}`}
                      >
                        {ch || '·'}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          <div className="h-6 mt-3">
            {flash && <p className="text-sm text-amber-300">{flash}</p>}
            {won && (
              <p className="text-sm text-emerald-300 font-semibold">
                Solved in {guesses.length}/{MAX_GUESSES} 🎉
              </p>
            )}
            {lost && (
              <p className="text-sm text-rose-300">
                The word was <span className="font-bold uppercase">{answer}</span>
              </p>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
            {!dailyMode && (
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={newPracticeWord}
                className="inline-flex items-center gap-1.5 px-4 h-10 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                New word
              </button>
            )}
            {!rail && (won || lost) && answer && <ShareButton build={shareIt} />}
            {/* hands the board's clues to the solver, so it goes with it */}
            {onReveal && guesses.length > 0 && (
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={reveal}
                title="Hand your clues to the solver"
                className="inline-flex items-center gap-1.5 px-4 h-10 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
              >
                <Search className="w-4 h-4" />
                Reveal
              </button>
            )}
          </div>

          {/* its own line, rather than trailing the buttons */}
          {dailyMode && (won || lost) && (
            <p className="mt-4 text-xs text-slate-500">
              Fresh words arrive about 15 minutes after 3:00&nbsp;a.m. Eastern.
            </p>
          )}

          {dailyMode && (won || lost) && dailyData && (
            <DailyStats level={playedAt} game="guess" date={dailyData.date} />
          )}
        </>
      )}
      {rail && !loading && (
        <InRail slot={rail}>
          <RailPanel
            label="Your game"
            figure={won ? `Solved in ${guesses.length}` : lost ? 'Not this time' : `Guess ${Math.min(guesses.length + 1, MAX_GUESSES)} of ${MAX_GUESSES}`}
          >
            <p className="flex items-center gap-1.5 text-sm text-slate-300 tabular-nums">
              <Timer className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
              {formatElapsed(record?.elapsedMs ?? 0)}
              {dailyMode && dailyData && <span className="ml-auto text-xs text-slate-500">{dailyData.date}</span>}
            </p>
            {/* the daily's counts: practice keeps none */}
            {dailyMode && (
              <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="flex flex-col-reverse">
                  <dt className="text-xs text-slate-400">Played</dt>
                  <dd className="text-xl font-bold text-white tabular-nums">{store.stats.played}</dd>
                </div>
                <div className="flex flex-col-reverse">
                  <dt className="text-xs text-slate-400">Streak</dt>
                  <dd className="text-xl font-bold text-white tabular-nums">{store.stats.streak}</dd>
                </div>
                <div className="flex flex-col-reverse">
                  <dt className="text-xs text-slate-400">Win %</dt>
                  <dd className="text-xl font-bold text-white tabular-nums">
                    {store.stats.played ? Math.round((store.stats.won / store.stats.played) * 100) : 0}
                  </dd>
                </div>
              </dl>
            )}
            {(won || lost) && answer && <div className="mt-3"><ShareButton build={shareIt} /></div>}
          </RailPanel>
        </InRail>
      )}
    </div>
  );
});

export default GuessGame;
