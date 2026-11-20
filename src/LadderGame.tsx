// Word ladder: turn one word into another, changing a single letter at a
// time, every rung a real word.
//
// The board is a list, not a grid, which makes this the plainest game here and
// the easiest to play by ear: both ends are given, the rungs stack between
// them, and a screen reader reads it as what it is. Par is shown, because a
// ladder with no stated target is a maze and one that says five steps is a
// challenge.
//
// A wrong rung is refused rather than recorded. Every other guessing game here
// can hold a wrong answer — Guess keeps the row, Boxed collects rejects — but a
// ladder cannot: the next rung is measured against the last one, so accepting a
// non-word would leave the board in a state with no legal move out. The refusal
// says which rule was broken, because "no" without a reason is the thing that
// makes a player think the game is broken rather than their word.
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import DailyToggle from '@/DailyToggle';
import { CornerDownLeft, Delete, RotateCcw, Timer, Trophy } from 'lucide-react';
import { fetchDailyData, fetchPool } from '@/dailyData';
import { getDictionary, getDisplayFilter } from '@/dictionaries';
import { difficulty, onDifficultyChange, type Difficulty } from '@/difficulty';
import { store as siteStore } from '@/siteStorage';
import { offerDailySwitch, reportDaily } from '@/dailyBus';
import { dailyIntent } from '@/routing/entry';
import { useDailySync } from '@/useDailySync';
import { useUpTimer } from '@/useUpTimer';
import ShareButton from '@/ShareButton';
import { GAME_NAME } from '@/games';
import { buildShare } from '@/share';
import { recordLadderFinish } from '@/stats';
import { loadState } from '@/storage';
import { changedAt, isStep, shortestLadder } from '@/ladder';
import { LadderEntry, LadderWord } from '@/LadderRow';

export type LadderGameHandle = { pressKey: (k: string) => void };

const LADDER_KEY = 'anagrimoire:ladder:v1';

/** One board. `chain` is the rungs the player has committed, not including the
 *  first word — so a solved ladder has `chain.length` steps and matches par
 *  when it equals `par`. */
type LadderRecord = {
  from: string;
  to: string;
  par: number;
  chain: string[];
  solved?: boolean;
  revealed?: boolean;
  /** the route, once given up on — kept so it survives a reload */
  shown?: string[];
  elapsedMs?: number;
};

type LadderStore = {
  dailyMode: boolean;
  dailyDate: string;
  practiceAt?: Difficulty;
  daily: Partial<Record<Difficulty, LadderRecord>>;
  practice: LadderRecord | null;
};

const DEFAULT_STORE: LadderStore = { dailyMode: true, dailyDate: '', daily: {}, practice: null };

const word = (v: unknown): string =>
  typeof v === 'string' ? v.toLowerCase().replace(/[^a-z]/g, '') : '';

function sanitizeRecord(r: unknown): LadderRecord | null {
  const rec = r as LadderRecord | null;
  if (!rec) return null;
  const from = word(rec.from);
  const to = word(rec.to);
  if (!from || !to || from.length !== to.length || from === to) return null;
  if (!Number.isInteger(rec.par) || rec.par < 1) return null;
  return {
    from,
    to,
    par: rec.par,
    // a stored chain is only as good as its rungs: same length, letters only
    chain: Array.isArray(rec.chain) ? rec.chain.map(word).filter((w) => w.length === from.length) : [],
    solved: rec.solved === true,
    revealed: rec.revealed === true,
    shown: Array.isArray(rec.shown) ? rec.shown.map(word).filter(Boolean) : undefined,
    elapsedMs: typeof rec.elapsedMs === 'number' && rec.elapsedMs >= 0 ? rec.elapsedMs : 0,
  };
}

function readStore(): LadderStore {
  try {
    const raw = siteStore.getItem(LADDER_KEY);
    if (!raw) return DEFAULT_STORE;
    const p = JSON.parse(raw) as Partial<LadderStore>;
    const daily: Partial<Record<Difficulty, LadderRecord>> = {};
    for (const [k, v] of Object.entries(p.daily ?? {})) {
      const rec = sanitizeRecord(v);
      if (rec) daily[k as Difficulty] = rec;
    }
    return {
      dailyMode: p.dailyMode !== false,
      dailyDate: typeof p.dailyDate === 'string' ? p.dailyDate : '',
      practiceAt: p.practiceAt,
      daily,
      practice: sanitizeRecord(p.practice),
    };
  } catch {
    return DEFAULT_STORE;
  }
}

const LadderGame = forwardRef<LadderGameHandle>(function LadderGame(_props, ref) {
  const [store, setStore] = useState<LadderStore>(() => {
    const s = readStore();
    const forced = dailyIntent('ladder');
    return forced === null ? s : { ...s, dailyMode: forced };
  });
  const [playedAt, setPlayedAt] = useState<Difficulty>(difficulty());
  const [dailyError, setDailyError] = useState(false);
  const [entry, setEntry] = useState('');
  const [refusal, setRefusal] = useState('');
  // what a screen reader is told; the visible board is the sighted equivalent
  const [spoken, setSpoken] = useState('');
  const [words, setWords] = useState<Set<string> | null>(null);
  const [pool, setPool] = useState<LadderRecord[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const record = store.dailyMode ? store.daily[playedAt] : store.practice;
  const done = !!record && (record.solved || record.revealed);

  useEffect(() => reportDaily('ladder', store.dailyMode, store.dailyDate), [store.dailyMode, store.dailyDate]);
  useEffect(
    () => offerDailySwitch('ladder', (d) => setStore((prev) => ({ ...prev, dailyMode: d }))),
    []
  );

  useEffect(() => {
    try {
      siteStore.setItem(LADDER_KEY, JSON.stringify(store));
    } catch {
      // best-effort persistence
    }
  }, [store]);

  // the rungs a player may step through: the common tier, minus whatever the
  // filter hides. Accepting a word someone typed is a different question from
  // publishing one, so this only ever narrows what Reveal will *show*.
  useEffect(() => {
    let alive = true;
    Promise.all([getDictionary('common'), getDisplayFilter(loadState().wordFilter)])
      .then(([list, ok]) => {
        if (alive) setWords(new Set(list.filter((w) => ok(w))));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => onDifficultyChange(() => setPlayedAt(difficulty())), []);

  // today's pair
  useEffect(() => {
    let alive = true;
    fetchDailyData('ladder')
      .then((raw) => {
        if (!alive) return;
        if (typeof raw?.date !== 'string') throw new Error('bad payload');
        const want = difficulty();
        const chosen = raw.byDifficulty?.[want] as LadderRecord | undefined;
        const at: Difficulty = chosen ? want : 'easy';
        const fresh = sanitizeRecord({ ...(chosen ?? raw.byDifficulty?.easy), chain: [] });
        if (!fresh) throw new Error('bad payload');
        setPlayedAt(at);
        setStore((prev) => {
          const daily = prev.dailyDate === raw.date ? { ...prev.daily } : {};
          const held = daily[at];
          // keep progress only when it is the same pair we already had
          if (!held || held.from !== fresh.from || held.to !== fresh.to) daily[at] = fresh;
          return { ...prev, dailyDate: raw.date as string, daily };
        });
      })
      .catch(() => {
        if (alive) setDailyError(true);
      });
    return () => {
      alive = false;
    };
  }, [playedAt]);

  // practice boards, drawn from the shared pool
  useEffect(() => {
    let alive = true;
    fetchPool('ladder')
      .then((raw) => {
        if (!alive) return;
        const list = (raw?.byDifficulty?.[difficulty()] ?? []) as LadderRecord[];
        setPool(list.map((b) => sanitizeRecord({ ...b, chain: [] })).filter(Boolean) as LadderRecord[]);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [playedAt]);

  const update = useCallback(
    (fn: (r: LadderRecord) => LadderRecord) =>
      setStore((prev) => {
        if (prev.dailyMode) {
          const cur = prev.daily[playedAt];
          if (!cur) return prev;
          return { ...prev, daily: { ...prev.daily, [playedAt]: fn(cur) } };
        }
        return prev.practice ? { ...prev, practice: fn(prev.practice) } : prev;
      }),
    [playedAt]
  );

  useDailySync({
    difficulty: playedAt,
    game: 'ladder',
    date: store.dailyDate,
    record: (record as unknown as Record<string, unknown>) ?? null,
    setRecord: (merged) =>
      setStore((prev) => {
        const cur = prev.daily[playedAt];
        if (!cur) return prev;
        const next = sanitizeRecord({ ...cur, ...merged });
        return next ? { ...prev, daily: { ...prev.daily, [playedAt]: next } } : prev;
      }),
    summary: done ? { solved: !record?.revealed, timeMs: record?.elapsedMs ?? 0 } : null,
    active: store.dailyMode,
  });

  useUpTimer(!!record && !done, (delta) =>
    update((r) => ({ ...r, elapsedMs: (r.elapsedMs ?? 0) + delta }))
  );

  /** the rung a new word is measured against */
  const last = record ? (record.chain.length ? record.chain[record.chain.length - 1] : record.from) : '';

  /** Why a word cannot be the next rung, or null if it can.
   *
   *  Ordered so the message names the first thing a player would notice. A
   *  wrong length is a typo, a repeat is a loop, and "not a word" comes last
   *  because it is the one that needs the dictionary. */
  const refuse = useCallback(
    (candidate: string): string | null => {
      if (!record) return 'No board yet.';
      if (candidate.length !== record.from.length)
        return `${record.from.length} letters — ${candidate} has ${candidate.length}.`;
      if (candidate === last) return 'That is the rung you are on.';
      if (record.chain.includes(candidate) || candidate === record.from)
        return 'Already used — a ladder cannot revisit a rung.';
      if (!isStep(last, candidate)) return `Change exactly one letter of ${last}.`;
      if (words && !words.has(candidate)) return `${candidate} is not in the word list.`;
      return null;
    },
    [record, last, words]
  );

  const submit = useCallback(() => {
    const candidate = word(entry);
    if (!record || done || !candidate) return;
    const why = refuse(candidate);
    if (why) {
      setRefusal(why);
      return;
    }
    setRefusal('');
    setEntry('');
    // The refusal line is the only thing this game ever said out loud, so a
    // screen reader heard every rejected word and never heard an accepted one
    // — the chain grew in silence, and solving it was silent too. Rungs land
    // in a list that is not live, and a live region cleared to empty announces
    // nothing. So success gets a voice of its own.
    const at = record.chain.length + 1;
    setSpoken(
      candidate === record.to
        ? `${candidate}. Solved in ${at} ${at === 1 ? 'step' : 'steps'}, par is ${record.par}.`
        : `${candidate} accepted, ${at} of ${record.par}.`
    );
    update((r) => {
      const chain = [...r.chain, candidate];
      return { ...r, chain, solved: candidate === r.to };
    });
  }, [entry, record, done, refuse, update]);

  useImperativeHandle(ref, () => ({
    pressKey: (k: string) => {
      if (k === 'Enter') submit();
      else if (k === 'Backspace') setEntry((e) => e.slice(0, -1));
      else if (/^[a-zA-Z]$/.test(k)) setEntry((e) => e + k.toLowerCase());
    },
  }));

  const stepBack = () => {
    const at = Math.max(0, (record?.chain.length ?? 0) - 1);
    setSpoken(`Rung removed, ${at} of ${record?.par ?? 0}.`);
    update((r) => ({ ...r, chain: r.chain.slice(0, -1), solved: false }));
  };

  const reveal = () => {
    if (!record || !words) return;
    const route = shortestLadder(record.from, record.to, words);
    update((r) => ({ ...r, revealed: true, shown: route ?? undefined }));
  };

  const newPractice = useCallback(() => {
    if (!pool?.length) return;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    setStore((prev) => ({ ...prev, practice: { ...pick, chain: [] }, practiceAt: playedAt }));
    setEntry('');
    setRefusal('');
    setSpoken('');
  }, [pool, playedAt, setStore]);

  // Deal the first practice board. Nothing did, and that made practice mode
  // unreachable rather than merely empty: `record` is null with no practice
  // board, `!record` returns the loading line below, and the "Another ladder"
  // button that calls this renders *after* that return. No board, so no button;
  // no button, so no board.
  //
  // Guarded on what we already hold, not run whenever practice is null:
  // newPractice picks at random, so an effect depending on `store.practice`
  // without a stop condition deals a new ladder on every render forever.
  // Squares shipped exactly that bug, which is why its guard has a comment too.
  useEffect(() => {
    if (store.dailyMode || !pool?.length) return;
    if (store.practice && store.practiceAt === playedAt) return;
    newPractice();
  }, [store.dailyMode, store.practice, store.practiceAt, pool, playedAt, newPractice]);

  const steps = record?.chain.length ?? 0;
  const solved = !!record?.solved;

  // A board ends once. Recording on the transition rather than on every render
  // is what keeps a reload from counting the same ladder twice.
  const counted = useRef(false);
  useEffect(() => {
    if (!record || !done || counted.current) return;
    counted.current = true;
    recordLadderFinish(
      store.dailyMode,
      !record.revealed,
      record.chain.length,
      record.par,
      record.elapsedMs ?? 0,
      store.dailyMode ? store.dailyDate : null
    );
  }, [record, done, store.dailyMode, store.dailyDate]);
  useEffect(() => {
    counted.current = false;
  }, [record?.from, record?.to, store.dailyMode]);

  // Rung three, and it renders in every branch below — including the waits.
  // A control that disappears while the board is loading is a control you
  // cannot use to leave a board that never loads, which is exactly how
  // practice was stuck.
  const toggle = (
    <DailyToggle
      daily={store.dailyMode}
      onChange={(d) => {
        setStore((prev) => ({ ...prev, dailyMode: d }));
        setEntry('');
        setRefusal('');
      }}
    />
  );

  if (dailyError && store.dailyMode) {
    return (
      <div className="max-w-md mx-auto">
        {toggle}
        <p className="text-center text-sm text-slate-400">
          Today&apos;s ladder could not be loaded. Try again shortly.
        </p>
      </div>
    );
  }

  if (!record) {
    // Two different waits, and saying "today's" during the practice one was
    // both wrong and the only thing on screen while practice was stuck.
    return (
      <div className="max-w-md mx-auto">
        {toggle}
        <p className="text-center text-sm text-slate-400">
          {store.dailyMode ? 'Loading today’s ladder…' : 'Dealing a practice ladder…'}
        </p>
      </div>
    );
  }

  const rungs = record.revealed && record.shown ? record.shown.slice(1, -1) : record.chain;

  return (
    <div className="max-w-md mx-auto">
      {toggle}
      <div className="mb-3 flex items-center justify-center gap-4 text-xs text-slate-400">
        <span className="inline-flex items-center gap-1.5 tabular-nums">
          <Timer className="w-3.5 h-3.5 text-slate-500" />
          {Math.floor((record.elapsedMs ?? 0) / 60000)}:
          {String(Math.floor(((record.elapsedMs ?? 0) % 60000) / 1000)).padStart(2, '0')}
        </span>
        <span>
          {steps} / {record.par} steps
        </span>
        {store.dailyMode && store.dailyDate && (
          <span className="text-slate-500">{store.dailyDate}</span>
        )}
      </div>

      <ol className="space-y-1.5" aria-label={`ladder from ${record.from} to ${record.to}`}>
        <li>
          <LadderWord word={record.from} tone="end" />
        </li>
        {rungs.map((w, i) => (
          <li key={`${w}-${i}`}>
            {/* the letter that moved is the whole content of a step, and on a
                row of boxes it is the one thing worth pointing at */}
            <LadderWord word={w} tone="rung" changed={changedAt(i === 0 ? record.from : rungs[i - 1], w)} />
          </li>
        ))}
        {!done && (
          <li>
            {/* Boxes for the eye, a real input for everything else. The input
                keeps its own label, value and Enter handling and simply sits
                on top at zero opacity — so typing, the phone keyboard and the
                screen reader all carry on working, and none of them has to
                know the row became a row of boxes. */}
            <LadderEntry length={record.from.length} value={entry}>
            <label htmlFor="ladder-rung" className="sr-only">
              next rung, one letter from {last}
            </label>
            <input
              id="ladder-rung"
              ref={inputRef}
              value={entry}
              onChange={(e) => {
                setEntry(word(e.target.value));
                setRefusal('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submit();
                }
              }}
              maxLength={record.from.length}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              className="absolute inset-0 w-full h-full opacity-0 cursor-text"
            />
            </LadderEntry>
          </li>
        )}
        {/* the last rung IS the target once solved, and a revealed route ends
            on it too — printing the target again would double it */}
        {rungs[rungs.length - 1] !== record.to && (
          <li>
            <LadderWord word={record.to} tone="end" />
          </li>
        )}
      </ol>

      <p aria-live="polite" className="mt-2 min-h-[1.25rem] text-center text-xs text-amber-300">
        {refusal}
      </p>
      <p className="sr-only" aria-live="polite">
        {spoken}
      </p>

      {!done && (
        <div className="mt-2 flex items-center justify-center gap-2">
          <button
            onClick={submit}
            className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg bg-accent text-slate-950 text-sm font-semibold"
          >
            <CornerDownLeft className="w-4 h-4" />
            Add rung
          </button>
          <button
            onClick={stepBack}
            disabled={!record.chain.length}
            className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg bg-white/5 border border-white/10 text-slate-300 text-sm font-semibold disabled:opacity-40"
          >
            <Delete className="w-4 h-4" />
            Undo
          </button>
          <button
            onClick={reveal}
            className="px-3 h-9 rounded-lg bg-white/5 border border-white/10 text-slate-400 text-sm font-semibold"
          >
            Reveal
          </button>
        </div>
      )}

      {done && (
        <div className="mt-3 text-center">
          <p className="text-sm font-semibold text-white">
            {record.revealed ? (
              record.shown ? (
                `The shortest is ${record.shown.length - 1} steps.`
              ) : (
                'No ladder found in the word list.'
              )
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <Trophy className="w-4 h-4 text-accent" />
                {steps === record.par
                  ? `Par — ${steps} steps.`
                  : `Solved in ${steps}, par is ${record.par}.`}
              </span>
            )}
          </p>
          {solved && (
            <ShareButton
              build={() =>
                buildShare({
                  game: GAME_NAME.ladder.full,
                  slug: 'ladder',
                  daily: store.dailyMode,
                  date: store.dailyDate,
                  // the ends are on the board and the rungs are the answer, so
                  // the share says how far, never how
                  body: [`${steps} step${steps === 1 ? '' : 's'}${steps === record.par ? ' — par' : ''}`],
                })
              }
            />
          )}
        </div>
      )}

      {!store.dailyMode && (
        <div className="mt-4 text-center">
          <button
            onClick={newPractice}
            disabled={!pool?.length}
            className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg bg-white/5 border border-white/10 text-slate-300 text-sm font-semibold disabled:opacity-40"
          >
            <RotateCcw className="w-4 h-4" />
            Another ladder
          </button>
        </div>
      )}

    </div>
  );
});

export default LadderGame;
