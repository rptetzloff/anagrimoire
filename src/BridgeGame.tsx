// Bridge: five prompts a day, each `X · ? · Y`, and the answer is the word
// that joins to both — SNOW · BALL · ROOM.
//
// The rule is spelling and nothing more: X+M and M+Y have to be words, which
// means the board can mark itself without holding an answer, and a player who
// finds a bridge the pool never knew about is right. src/bridge.ts owns that
// rule so the board, the solver and Learn cannot disagree about it.
//
// Difficulty is the hint budget — three, one, none — and a hint is spent on
// one prompt rather than on the board. Three hints is three prompts you get
// help on and two you do not, which is the whole of the setting: at easy you
// can buy your way through most of a board, at extreme you cannot buy
// anything, and in between the question is which of the five is worth it.
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import DailyToggle from '@/DailyToggle';
import { CornerDownLeft, Lightbulb, Ruler, Timer, Trophy } from 'lucide-react';
import { fetchDailyData, fetchPool } from '@/dailyData';
import { getDictionary } from '@/dictionaries';
import { difficulty, onDifficultyChange, type Difficulty } from '@/difficulty';
import { store as siteStore } from '@/siteStorage';
import { offerDailySwitch, reportDaily } from '@/dailyBus';
import { dailyIntent } from '@/routing/entry';
import { useDailySync } from '@/useDailySync';
import { formatElapsed, useUpTimer } from '@/useUpTimer';
import ShareButton from '@/ShareButton';
import { useRailSlot } from '@/railSlot';
import { InRail, RailPanel } from '@/RailPanel';
import { GAME_NAME } from '@/games';
import { buildShare } from '@/share';
import { recordBridgeFinish } from '@/stats';
import { revealed, spend, NO_HINTS, type PromptHints, type Prompt } from '@/bridge';
import MobileKeyInput from '@/MobileKeyInput';
import BridgeRow from '@/BridgeRow';

export type BridgeGameHandle = { pressKey: (k: string) => void };

const BRIDGE_KEY = 'anagrimoire:bridge:v1';

/** One board. `entries` runs parallel to `prompts`: the word the player has
 *  committed at each slot, or '' for one they have not. `hints` likewise. */
type BridgeRecord = {
  prompts: Prompt[];
  /** the published answers, for the hints — never shown unspent */
  answers: string[];
  budget: number;
  entries: string[];
  hints: PromptHints[];
  spent: number;
  revealed?: boolean;
  elapsedMs?: number;
};

type BridgeStore = {
  dailyMode: boolean;
  dailyDate: string;
  daily: Partial<Record<Difficulty, BridgeRecord>>;
  practice: BridgeRecord | null;
  /** the difficulty the held practice board was dealt at, so changing tier
   *  deals a new one instead of leaving you on the old tier's board */
  practiceAt?: Difficulty;
};

const DEFAULT_STORE: BridgeStore = { dailyMode: true, dailyDate: '', daily: {}, practice: null };

const word = (v: unknown): string =>
  typeof v === 'string' ? v.toLowerCase().replace(/[^a-z]/g, '') : '';

const decodeAnswers = (raw: unknown): string[] => {
  if (typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(atob(raw));
    return Array.isArray(parsed) ? parsed.map(word) : [];
  } catch {
    return [];
  }
};

function sanitizeRecord(r: unknown): BridgeRecord | null {
  const rec = r as BridgeRecord | null;
  if (!rec || !Array.isArray(rec.prompts) || !rec.prompts.length) return null;
  const prompts = rec.prompts
    .map((p) => ({ x: word(p?.x), y: word(p?.y) }))
    .filter((p) => p.x && p.y);
  if (prompts.length !== rec.prompts.length) return null;
  const n = prompts.length;
  const answers = Array.isArray(rec.answers) ? rec.answers.map(word) : [];
  return {
    prompts,
    answers,
    budget: Number.isInteger(rec.budget) && rec.budget >= 0 ? rec.budget : 0,
    entries: Array.from({ length: n }, (_, i) => word(rec.entries?.[i])),
    hints: Array.from({ length: n }, (_, i) => ({
      length: rec.hints?.[i]?.length === true,
      letters:
        Number.isInteger(rec.hints?.[i]?.letters) && rec.hints[i].letters >= 0
          ? rec.hints[i].letters
          : 0,
    })),
    spent: Number.isInteger(rec.spent) && rec.spent >= 0 ? rec.spent : 0,
    revealed: rec.revealed === true,
    elapsedMs: typeof rec.elapsedMs === 'number' && rec.elapsedMs >= 0 ? rec.elapsedMs : 0,
  };
}

function readStore(): BridgeStore {
  try {
    const raw = siteStore.getItem(BRIDGE_KEY);
    if (!raw) return DEFAULT_STORE;
    const p = JSON.parse(raw) as Partial<BridgeStore>;
    const daily: Partial<Record<Difficulty, BridgeRecord>> = {};
    for (const [k, v] of Object.entries(p.daily ?? {})) {
      const rec = sanitizeRecord(v);
      if (rec) daily[k as Difficulty] = rec;
    }
    return {
      dailyMode: p.dailyMode !== false,
      dailyDate: typeof p.dailyDate === 'string' ? p.dailyDate : '',
      daily,
      practice: sanitizeRecord(p.practice),
      // without this the tier is forgotten on reload and the seeding effect
      // deals a fresh board every time the page opens, throwing away a
      // half-finished practice bridge
      practiceAt: p.practiceAt,
    };
  } catch {
    return DEFAULT_STORE;
  }
}

const fromFeed = (b: Record<string, unknown> | undefined): BridgeRecord | null =>
  sanitizeRecord({
    prompts: (b?.prompts as Prompt[]) ?? [],
    answers: decodeAnswers(b?.answers),
    budget: (b?.hints as number) ?? 0,
    entries: [],
    hints: [],
    spent: 0,
  });

const BridgeGame = forwardRef<BridgeGameHandle>(function BridgeGame(_props, ref) {
  // Beside the board on a wide page, the game's own panel goes in the rail
  // (railSlot.ts); narrower, it is drawn here, where it always was.
  const rail = useRailSlot();
  const [store, setStore] = useState<BridgeStore>(() => {
    const s = readStore();
    const forced = dailyIntent('bridge');
    return forced === null ? s : { ...s, dailyMode: forced };
  });
  const [playedAt, setPlayedAt] = useState<Difficulty>(difficulty());
  const [dailyError, setDailyError] = useState(false);
  const [at, setAt] = useState(0);
  const [entry, setEntry] = useState('');
  const [refusal, setRefusal] = useState('');
  const [spoken, setSpoken] = useState('');
  const [words, setWords] = useState<Set<string> | null>(null);
  const [pool, setPool] = useState<BridgeRecord[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const record = store.dailyMode ? store.daily[playedAt] : store.practice;
  const solvedCount = record ? record.entries.filter((e) => e).length : 0;
  const done = !!record && (record.revealed || solvedCount === record.prompts.length);

  useEffect(() => reportDaily('bridge', store.dailyMode, store.dailyDate), [store.dailyMode, store.dailyDate]);
  useEffect(
    () => offerDailySwitch('bridge', (d) => setStore((prev) => ({ ...prev, dailyMode: d }))),
    []
  );

  useEffect(() => {
    try {
      siteStore.setItem(BRIDGE_KEY, JSON.stringify(store));
    } catch {
      // best-effort persistence
    }
  }, [store]);

  // The dictionary a typed word is checked against. Wider than the band the
  // harvest built from, deliberately: refusing to publish a word and refusing
  // to accept one a player found are different decisions, and only the first
  // is ours. A bridge the pool never knew about is still a bridge.
  useEffect(() => {
    let alive = true;
    getDictionary('standard')
      .then((list) => {
        if (alive) setWords(new Set(list));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => onDifficultyChange(() => setPlayedAt(difficulty())), []);

  // today's board
  useEffect(() => {
    let alive = true;
    fetchDailyData('bridge')
      .then((raw) => {
        if (!alive) return;
        if (typeof raw?.date !== 'string') throw new Error('bad payload');
        const want = difficulty();
        const chosen = raw.byDifficulty?.[want] as Record<string, unknown> | undefined;
        const level: Difficulty = chosen ? want : 'easy';
        const fresh = fromFeed(chosen ?? (raw.byDifficulty?.easy as Record<string, unknown>));
        if (!fresh) throw new Error('bad payload');
        setPlayedAt(level);
        setStore((prev) => {
          const daily = prev.dailyDate === raw.date ? { ...prev.daily } : {};
          const held = daily[level];
          // keep progress only when it is the same board we already had
          const same =
            held &&
            held.prompts.length === fresh.prompts.length &&
            held.prompts.every((p, i) => p.x === fresh.prompts[i].x && p.y === fresh.prompts[i].y);
          if (!same) daily[level] = fresh;
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

  // practice boards from the shared pool
  useEffect(() => {
    let alive = true;
    fetchPool('bridge')
      .then((raw) => {
        if (!alive) return;
        const list = ((raw?.byDifficulty?.[difficulty()] ?? []) as Record<string, unknown>[])
          .map(fromFeed)
          .filter((b): b is BridgeRecord => !!b);
        setPool(list);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [playedAt]);

  const update = useCallback(
    (fn: (r: BridgeRecord) => BridgeRecord) =>
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
    game: 'bridge',
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
      ? { solved: solvedCount, timeMs: record?.elapsedMs ?? 0, hints: record?.spent ?? 0 }
      : null,
    active: store.dailyMode,
  });

  useUpTimer(!!record && !done, (delta) =>
    update((r) => ({ ...r, elapsedMs: (r.elapsedMs ?? 0) + delta }))
  );

  // a board ends once
  const recorded = useRef(false);
  useEffect(() => {
    if (!done || !record || recorded.current) return;
    recorded.current = true;
    recordBridgeFinish({
      solved: solvedCount,
      of: record.prompts.length,
      hints: record.spent,
      timeMs: record.elapsedMs ?? 0,
      revealed: !!record.revealed,
    });
  }, [done, record, solvedCount]);
  useEffect(() => {
    recorded.current = false;
  }, [store.dailyDate, playedAt, store.dailyMode]);

  const submit = useCallback(() => {
    const candidate = word(entry);
    if (!record || done || !candidate) return;
    const prompt = record.prompts[at];
    if (!prompt) return;
    if (record.entries[at]) {
      setRefusal('Already found.');
      return;
    }
    if (candidate.length < 3) {
      setRefusal('Three letters or more.');
      return;
    }
    if (!words) {
      setRefusal('Still loading the word list.');
      return;
    }
    if (!words.has(prompt.x + candidate)) {
      setRefusal(`${prompt.x}${candidate} is not a word.`);
      return;
    }
    if (!words.has(candidate + prompt.y)) {
      setRefusal(`${candidate}${prompt.y} is not a word.`);
      return;
    }
    setRefusal('');
    setEntry('');
    const filled = record.entries.filter((e) => e).length + 1;
    setSpoken(
      filled === record.prompts.length
        ? `${candidate}. All ${filled} found.`
        : `${candidate}. ${filled} of ${record.prompts.length}.`
    );
    update((r) => {
      const entries = [...r.entries];
      entries[at] = candidate;
      return { ...r, entries };
    });
    // move to the next prompt still open, so play runs on without a click
    const next = record.prompts.findIndex((_, i) => i !== at && !record.entries[i]);
    if (next >= 0) setAt(next);
  }, [entry, record, done, at, words, update]);

  useImperativeHandle(ref, () => ({
    pressKey: (k: string) => {
      if (k === 'Enter') submit();
      else if (k === 'Backspace') setEntry((e) => e.slice(0, -1));
      else if (/^[a-zA-Z]$/.test(k)) setEntry((e) => e + k.toLowerCase());
    },
  }));

  const buyHint = (kind: 'length' | 'letter') => {
    if (!record || done) return;
    if (record.spent >= record.budget) return;
    const answer = record.answers[at] ?? '';
    if (!answer || record.entries[at]) return;
    const next = spend(answer, record.hints[at], kind);
    if (!next) {
      setRefusal(kind === 'length' ? 'The length is already showing.' : 'No more letters to turn over.');
      return;
    }
    setRefusal('');
    const shown = revealed(answer, next);
    setSpoken(
      kind === 'length'
        ? `${answer.length} letters.`
        : `Starts with ${shown.prefix.split('').join(' ')}.`
    );
    update((r) => {
      const hints = [...r.hints];
      hints[at] = next;
      return { ...r, hints, spent: r.spent + 1 };
    });
  };

  const reveal = () => update((r) => ({ ...r, revealed: true }));

  const newPractice = useCallback(() => {
    if (!pool?.length) return;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    setStore((prev) => ({ ...prev, practice: { ...pick, entries: pick.prompts.map(() => ''), hints: pick.prompts.map(() => ({ ...NO_HINTS })), spent: 0, elapsedMs: 0, revealed: false }, practiceAt: playedAt }));
    setAt(0);
    setEntry('');
    setRefusal('');
    setSpoken('');
  }, [pool, playedAt, setStore]);

  // Deal the first practice board — see the twin of this in LadderGame. Bridge
  // was worse off than Ladder: it had no control that sets dailyMode false at
  // all, so the only way in was a /play/bridge link, and that landed on a
  // permanent loading line because nothing dealt a board.
  //
  // Guarded on what we hold rather than on practice being null: newPractice
  // picks at random, so an unguarded effect deals a new bridge every render.
  useEffect(() => {
    if (store.dailyMode || !pool?.length) return;
    if (store.practice && store.practiceAt === playedAt) return;
    newPractice();
  }, [store.dailyMode, store.practice, store.practiceAt, pool, playedAt, newPractice]);

  // Bridge had no control for this at all — not a text link, not a pill. Its
  // practice mode was reachable only by a /play/bridge link, and that landed on
  // a loading line with no way back. Rendered in every branch below for the
  // same reason it is here at all.
  const toggle = (
    <DailyToggle
      daily={store.dailyMode}
      onChange={(d) => {
        setStore((prev) => ({ ...prev, dailyMode: d }));
        setAt(0);
        setEntry('');
        setRefusal('');
      }}
    />
  );

  if (dailyError && store.dailyMode && !record) {
    return (
      <div className="max-w-md mx-auto">
        {toggle}
        <p className="text-center text-sm text-danger">
          Couldn&apos;t fetch today&apos;s bridges — try again in a minute.
        </p>
      </div>
    );
  }
  if (!record)
    return (
      <div className="max-w-md mx-auto">
        {toggle}
        <p className="text-center text-sm text-slate-400">
          {store.dailyMode ? 'Loading today’s bridges…' : 'Dealing a practice bridge…'}
        </p>
      </div>
    );

  const left = Math.max(0, record.budget - record.spent);
  const current = record.prompts[at];
  const shown = revealed(record.answers[at] ?? '', record.hints[at] ?? NO_HINTS);

  return (
    <div className="max-w-md mx-auto">
      {toggle}
      {!rail && (
      <div className="mb-3 flex items-center justify-center gap-4 text-xs text-slate-400">
        <span className="inline-flex items-center gap-1.5 tabular-nums">
          <Timer className="w-3.5 h-3.5 text-slate-500" />
          {Math.floor((record.elapsedMs ?? 0) / 60000)}:
          {String(Math.floor(((record.elapsedMs ?? 0) % 60000) / 1000)).padStart(2, '0')}
        </span>
        <span>
          {solvedCount} / {record.prompts.length} found
        </span>
        {record.budget > 0 && (
          <span className="inline-flex items-center gap-1">
            <Lightbulb className="w-3.5 h-3.5 text-slate-500" />
            {left} left
          </span>
        )}
        {store.dailyMode && store.dailyDate && (
          <span className="text-slate-500">{store.dailyDate}</span>
        )}
      </div>
      )}

      <ol className="space-y-2" aria-label="bridges">
        {record.prompts.map((p, i) => {
          const got = record.entries[i];
          return (
            <li key={`${p.x}-${p.y}`}>
              <BridgeRow
                prompt={p}
                answer={got}
                shown={revealed(record.answers[i] ?? '', record.hints[i] ?? NO_HINTS)}
                picked={i === at && !done}
                onPick={!done && !got ? () => setAt(i) : undefined}
              />
            </li>
          );
        })}
      </ol>

      {!done && current && (
        <div className="relative mt-4">
          <label htmlFor="bridge-entry" className="sr-only">
            the word that joins {current.x} and {current.y}
          </label>
          <input
            id="bridge-entry"
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
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder={shown.length ? '·'.repeat(shown.length) : 'the joining word'}
            className="w-full text-center text-lg font-bold uppercase tracking-widest rounded-lg bg-white/5 border-2 border-amber-400/60 text-white px-3 py-1.5 focus:border-amber-400"
          />
          <MobileKeyInput onKey={(k) => (k === 'enter' ? submit() : k === 'backspace' ? setEntry((e) => e.slice(0, -1)) : setEntry((e) => e + k))} label="Type the joining word" />
        </div>
      )}

      <p aria-live="polite" className="mt-2 min-h-[1.25rem] text-center text-xs text-amber-300">
        {refusal}
      </p>
      <p className="sr-only" aria-live="polite">
        {spoken}
      </p>

      {!done && (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          <button
            onClick={submit}
            className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg bg-accent text-slate-950 text-sm font-semibold"
          >
            <CornerDownLeft className="w-4 h-4" />
            Add
          </button>
          {record.budget > 0 && (
            <>
              <button
                onClick={() => buyHint('length')}
                disabled={left === 0}
                title="Spend a hint on this prompt's length"
                className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg bg-white/5 border border-white/10 text-slate-300 text-sm hover:bg-white/10 disabled:opacity-40"
              >
                <Ruler className="w-4 h-4" />
                Length
              </button>
              <button
                onClick={() => buyHint('letter')}
                disabled={left === 0}
                title="Spend a hint on the next letter of this prompt"
                className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg bg-white/5 border border-white/10 text-slate-300 text-sm hover:bg-white/10 disabled:opacity-40"
              >
                <Lightbulb className="w-4 h-4" />
                Letter
              </button>
            </>
          )}
          <button
            onClick={reveal}
            className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg bg-white/5 border border-white/10 text-slate-400 text-sm hover:bg-white/10"
          >
            Give up
          </button>
        </div>
      )}

      {done && (
        <div className="mt-4 text-center">
          <p className="text-sm font-semibold text-emerald-300 inline-flex items-center gap-1.5">
            <Trophy className="w-4 h-4" />
            {record.revealed
              ? `Gave up on ${record.prompts.length - solvedCount}.`
              : `All ${solvedCount} found${record.spent ? `, ${record.spent} hint${record.spent === 1 ? '' : 's'} spent` : ''}.`}
          </p>
          {record.revealed && (
            <ol className="mt-3 space-y-1 text-sm text-slate-300">
              {record.prompts.map((p, i) => (
                <li key={`${p.x}-${p.y}`} className="uppercase tracking-wide">
                  {p.x} · <span className="text-accent font-bold">{record.entries[i] || record.answers[i]}</span> · {p.y}
                </li>
              ))}
            </ol>
          )}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            {!rail && <ShareButton
              build={() => buildShare({
                game: GAME_NAME.bridge.full,
                slug: 'bridge',
                daily: store.dailyMode,
                date: store.dailyDate,
                body: [
                  `${solvedCount}/${record.prompts.length}${record.spent ? ` · ${record.spent} hint${record.spent === 1 ? '' : 's'}` : ''}`,
                ],
              })}
            />}
            {!store.dailyMode && (
              <button
                onClick={newPractice}
                className="inline-flex items-center gap-1.5 px-4 h-10 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10"
              >
                New board
              </button>
            )}
          </div>
        </div>
      )}
      {rail && (
        <InRail slot={rail}>
          <RailPanel label="Your board" figure={`${solvedCount} / ${record.prompts.length} found`}>
            <p className="flex items-center gap-1.5 text-sm text-slate-300 tabular-nums">
              <Timer className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
              {formatElapsed(record.elapsedMs ?? 0)}
              {store.dailyMode && store.dailyDate && <span className="ml-auto text-xs text-slate-500">{store.dailyDate}</span>}
            </p>
            {record.budget > 0 && (
              <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-slate-400">
                <Lightbulb className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                {left} {left === 1 ? 'hint' : 'hints'} left
              </p>
            )}
            {done && (
              <div className="mt-3">
                <ShareButton
                  build={() => buildShare({
                game: GAME_NAME.bridge.full,
                slug: 'bridge',
                daily: store.dailyMode,
                date: store.dailyDate,
                body: [
                  `${solvedCount}/${record.prompts.length}${record.spent ? ` · ${record.spent} hint${record.spent === 1 ? '' : 's'}` : ''}`,
                ],
              })}
                />
              </div>
            )}
          </RailPanel>
        </InRail>
      )}
    </div>
  );
});

export default BridgeGame;
