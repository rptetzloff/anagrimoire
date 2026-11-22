import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from 'react';
import { Eye, RefreshCw, Timer } from 'lucide-react';
import { fetchDailyData, fetchPool } from '@/dailyData';
import { difficulty, isDifficulty, onDifficultyChange, type Difficulty } from '@/difficulty';
import MobileKeyInput from '@/MobileKeyInput';
import ShareButton from '@/ShareButton';
import { useRailSlot } from '@/railSlot';
import { InRail, RailPanel } from '@/RailPanel';
import { GAME_NAME } from '@/games';
import { buildShare } from '@/share';
import { dailyIntent } from '@/routing/entry';
import { offerDailySwitch, reportDaily } from '@/dailyBus';
import DailyToggle from '@/DailyToggle';
import { usePrefs } from '@/prefs';
import { formatElapsed, useUpTimer } from '@/useUpTimer';
import { recordCryptogramFinish } from '@/stats';
import { useDailySync } from '@/useDailySync';
import { store as siteStore } from '@/siteStorage';

export type CryptogramGameHandle = { pressKey: (k: string) => void };

const CRYPTOGRAM_KEY = 'anagrimoire:cryptogram:v1';

/** A board as it ships, plus what the player has worked out.
 *
 *  `reveals` is difficulty's gift — cipher letters already solved, which can't
 *  be changed. `mapping` is the player's own guesses. Both are keyed by the
 *  CIPHER letter (uppercase), because that's what's on screen and what a tap
 *  identifies; the value is the plaintext letter it stands for. */
type CryptogramRecord = {
  /** what the board shows, one entry per position. Cipher tokens plus, on an
   *  ungrouped board, the passage's own punctuation. A token is a string
   *  rather than a character because the cipher's alphabet needn't be letters
   *  — "17" and "★" are as ordinary here as "K". */
  tokens: string[];
  /** the cipher's own marks, which is the only way to tell them from the
   *  passage's punctuation once the alphabet stops being letters */
  alphabet: string[];
  /** the announced cipher, e.g. "Mixed, grouped" */
  label: string;
  /** word divisions stripped — the board reads in fives */
  grouped?: boolean;
  /** several tokens may mean the same letter, so "already used" stops being a
   *  reason to refuse one */
  homophonic?: boolean;
  reveals: Record<string, string>;
  answer: string; // base64 {text, author}
  mapping: Record<string, string>;
  solved?: boolean;
  revealed?: boolean;
  elapsedMs?: number;
};

type CryptogramStore = {
  dailyMode: boolean;
  dailyDate: string;
  practiceAt?: Difficulty;
  daily: Partial<Record<Difficulty, CryptogramRecord>>;
  practice: CryptogramRecord | null;
};

const DEFAULT_STORE: CryptogramStore = {
  dailyMode: true,
  dailyDate: '',
  daily: {},
  practice: null,
};

// Named so a screen reader has something to say: a bare glyph reads as
// nothing useful, and the board would be unplayable by ear without these.
// Mirrors SYMBOL_NAMES in scripts/cryptogram.mjs.
const SYMBOL_NAMES: Record<string, string> = {
  '★': 'star', '☂': 'umbrella', '☀': 'sun', '☾': 'moon', '♠': 'spade',
  '♣': 'club', '♥': 'heart', '♦': 'diamond', '✦': 'sparkle', '✚': 'cross',
  '⌂': 'house', '☯': 'yin yang', '⚑': 'flag', '⚙': 'gear', '⚡': 'bolt',
  '✿': 'flower', '❄': 'snowflake', '❖': 'lozenge', '➤': 'arrow', '⬢': 'hexagon',
  '◐': 'half circle', '◫': 'window', '⌘': 'loop', '⍟': 'circled star',
  '♪': 'note', '⚓': 'anchor',
};

/** what a screen reader should call a token */
const spoken = (token: string) => SYMBOL_NAMES[token] ?? token;

function sanitizeMap(m: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (m && typeof m === 'object') {
    for (const [k, v] of Object.entries(m as Record<string, unknown>)) {
      if (k && typeof v === 'string' && /^[a-z]$/.test(v)) out[k] = v;
    }
  }
  return out;
}

function sanitizeRecord(r: unknown): CryptogramRecord | null {
  const rec = r as CryptogramRecord | null;
  if (!rec || !Array.isArray(rec.tokens) || !rec.tokens.length) return null;
  if (!Array.isArray(rec.alphabet) || !rec.alphabet.length) return null;
  return {
    tokens: rec.tokens.map(String),
    alphabet: rec.alphabet.map(String),
    label: typeof rec.label === 'string' ? rec.label : 'Cryptogram',
    grouped: rec.grouped === true,
    homophonic: rec.homophonic === true,
    reveals: sanitizeMap(rec.reveals),
    answer: typeof rec.answer === 'string' ? rec.answer : '',
    mapping: sanitizeMap(rec.mapping),
    solved: rec.solved === true,
    revealed: rec.revealed === true,
    elapsedMs: typeof rec.elapsedMs === 'number' && rec.elapsedMs >= 0 ? rec.elapsedMs : 0,
  };
}

function loadStore(): CryptogramStore {
  const store = readStore();
  const forced = dailyIntent('cryptogram');
  return forced === null ? store : { ...store, dailyMode: forced };
}

function readStore(): CryptogramStore {
  try {
    const raw = siteStore.getItem(CRYPTOGRAM_KEY);
    if (!raw) return DEFAULT_STORE;
    const p = JSON.parse(raw);
    const daily: Partial<Record<Difficulty, CryptogramRecord>> = {};
    for (const level of ['easy', 'hard', 'extreme'] as Difficulty[]) {
      const rec = sanitizeRecord(p?.daily?.[level]);
      if (rec) daily[level] = rec;
    }
    return {
      dailyMode: p?.dailyMode !== false,
      dailyDate: typeof p?.dailyDate === 'string' ? p.dailyDate : '',
      practiceAt: isDifficulty(p?.practiceAt) ? p.practiceAt : undefined,
      daily,
      practice: sanitizeRecord(p?.practice),
    };
  } catch {
    return DEFAULT_STORE;
  }
}

/** What the player has decided a cipher letter stands for: their own guess, or
 *  the reveal difficulty handed them. Reveals win — they can't be overwritten,
 *  so there's no state where the two disagree. */
function solutionFor(rec: CryptogramRecord): Record<string, string> {
  return { ...rec.mapping, ...rec.reveals };
}

/** Is this one of the cipher's marks, or the passage's own punctuation? Once
 *  the alphabet stops being letters a token's shape can't answer that — "★"
 *  and "," are both one non-alphanumeric character — so the board says which
 *  are its. */
function isCipherToken(rec: CryptogramRecord, token: string): boolean {
  return rec.alphabet.includes(token);
}

/** The passage as it currently reads. Unassigned tokens come back as null so
 *  the renderer can draw a blank rather than a guess at one. */
function decodedAt(rec: CryptogramRecord, i: number): string | null {
  const token = rec.tokens[i];
  if (!isCipherToken(rec, token)) return token;
  return solutionFor(rec)[token] ?? null;
}

/** Just the letters, in order. Compared letters-only with the answer, because
 *  a grouped board has no punctuation to line up and an ungrouped board's
 *  punctuation is ours rather than the player's. */
function plainLetters(rec: CryptogramRecord): string {
  return rec.tokens
    .map((t, i) => (isCipherToken(rec, t) ? (decodedAt(rec, i) ?? ' ') : ''))
    .join('');
}

function answerOf(rec: CryptogramRecord): { text: string; author: string } | null {
  try {
    const a = JSON.parse(atob(rec.answer));
    return typeof a?.text === 'string' ? { text: a.text, author: String(a.author ?? '') } : null;
  } catch {
    return null;
  }
}

/** The cipher tokens this passage actually uses. A 50–100 letter passage
 *  touches about twenty of them, so asking for the whole alphabet would be
 *  asking for tokens that never appear. */
function usedTokens(rec: CryptogramRecord): string[] {
  return [...new Set(rec.tokens.filter((t) => isCipherToken(rec, t)))].sort();
}

// No props: unlike the other games this one needs no dictionary. A cryptogram
// is deduced from the shape of the words, and the answer ships with the board.
const CryptogramGame = forwardRef<CryptogramGameHandle, object>(
  function CryptogramGame(_props, ref) {
    const [store, setStore] = useState<CryptogramStore>(loadStore);
    // Beside the board on a wide page, the game's own panel goes in the rail
    // (railSlot.ts); narrower, it is drawn here, where it always was.
    const rail = useRailSlot();
    const [playedAt, setPlayedAt] = useState<Difficulty>(difficulty);
    const [difficultyTick, setDifficultyTick] = useState(0);
    const [level, setLevel] = useState<Difficulty>(difficulty);
    useEffect(
      () =>
        onDifficultyChange(() => {
          setLevel(difficulty());
          setDifficultyTick((n) => n + 1);
        }),
      []
    );
    const { practiceAllowed, highlightMatches } = usePrefs();

    useEffect(() => {
      if (!practiceAllowed && !store.dailyMode) setStore((prev) => ({ ...prev, dailyMode: true }));
    }, [practiceAllowed, store.dailyMode]);
    useEffect(() => reportDaily('cryptogram', store.dailyMode, store.dailyDate), [store.dailyMode, store.dailyDate]);
    useEffect(
      () => offerDailySwitch('cryptogram', (d) => setStore((prev) => ({ ...prev, dailyMode: d }))),
      []
    );

    /** which cipher letter the keyboard is aimed at */
    // The *position* the player is on, not just which mark. A mark repeats,
    // and tapping its third copy has to leave the cursor on the third copy —
    // deriving the position from the mark always found the first one, which
    // made a tap somewhere else jump the cursor across the board.
    const [cursorAt, setCursorAt] = useState(-1);
    const [dailyError, setDailyError] = useState(false);
    const [pool, setPool] = useState<Record<string, CryptogramRecord[]> | null>(null);

    useEffect(() => {
      try {
        siteStore.setItem(CRYPTOGRAM_KEY, JSON.stringify(store));
      } catch {
        // best-effort persistence
      }
    }, [store]);

    // today's passage
    useEffect(() => {
      let alive = true;
      fetchDailyData('cryptogram')
        .then((raw) => {
          if (!alive) return;
          const d = raw;
          if (typeof d?.date !== 'string') throw new Error('bad payload');
          const want = difficulty();
          const chosen = d.byDifficulty?.[want] as CryptogramRecord | undefined;
          const at: Difficulty = chosen ? want : 'easy';
          const board = chosen ?? d.byDifficulty?.easy;
          const fresh = sanitizeRecord({ ...board, mapping: {} });
          if (!fresh) throw new Error('bad payload');
          setPlayedAt(at);
          setStore((prev) => {
            const daily = prev.dailyDate === d.date ? { ...prev.daily } : {};
            const held = daily[at];
            // keep progress only when it's the same passage we already had
            if (!held || held.tokens.join(' ') !== fresh.tokens.join(' ')) daily[at] = fresh;
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
      fetchPool('cryptogram')
        .then((d) => {
          if (alive && d?.byDifficulty) setPool(d.byDifficulty);
        })
        .catch(() => {
          // practice stays unavailable until the pool loads
        });
      return () => {
        alive = false;
      };
    }, []);

    const drawPractice = useCallback(
      (avoid?: string): CryptogramRecord | null => {
        const options = pool?.[level];
        if (!options?.length) return null;
        const fresh = options.filter((p) => p.tokens.join(' ') !== avoid);
        const from = fresh.length ? fresh : options;
        return sanitizeRecord({ ...from[Math.floor(Math.random() * from.length)], mapping: {} });
      },
      [pool, level]
    );

    useEffect(() => {
      if (store.dailyMode || !pool) return;
      if (store.practice && store.practiceAt === level) return;
      const board = drawPractice();
      if (board) setStore((prev) => ({ ...prev, practice: board, practiceAt: level }));
    }, [store.dailyMode, store.practice, store.practiceAt, pool, level, drawPractice]);

    const record = store.dailyMode ? store.daily[playedAt] ?? null : store.practice;
    const answer = useMemo(() => (record ? answerOf(record) : null), [record]);
    const cipherTokens = useMemo(() => (record ? usedTokens(record) : []), [record]);
    /** which mark the keyboard is aimed at, from where the cursor sits */
    const selected = record && cursorAt >= 0 ? (record.tokens[cursorAt] ?? null) : null;

    /** move to a mark, landing on its first copy — what the keyboard does when
     *  it advances, since there's no better copy to prefer */
    const seat = useCallback(
      (token: string | null) => setCursorAt(token && record ? record.tokens.indexOf(token) : -1),
      [record]
    );

    // Solved when the passage reads as the answer. Case-blind, because a
    // cipher has no case to get right — the capitals are ours.
    const solved =
      !!record &&
      !record.revealed &&
      !!answer &&
      plainLetters(record).toLowerCase() === answer.text.replace(/[^A-Za-z]/g, '').toLowerCase();
    const done = solved || !!record?.revealed;

    // seat the keyboard on the first unsolved letter whenever the board changes
    useEffect(() => {
      if (!record) return;
      const first = cipherTokens.find((t: string) => !record.reveals[t]);
      seat(first ?? null);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [record?.tokens]);

    const update = useCallback(
      (fn: (r: CryptogramRecord) => CryptogramRecord) => {
        setStore((prev) => {
          const cur = prev.dailyMode ? prev.daily[playedAt] : prev.practice;
          if (!cur) return prev;
          const next = fn(cur);
          return prev.dailyMode
            ? { ...prev, daily: { ...prev.daily, [playedAt]: next } }
            : { ...prev, practice: next };
        });
      },
      [playedAt]
    );

    useEffect(() => {
      if (!record) return;
      if (solved && !record.solved) {
        update((r) => ({ ...r, solved: true }));
        recordCryptogramFinish(
          store.dailyMode,
          true,
          record.elapsedMs ?? 0,
          store.dailyMode ? store.dailyDate : null
        );
      }
    }, [solved, record, store.dailyMode, store.dailyDate, update]);

    useDailySync({
      difficulty: playedAt,
      game: 'cryptogram',
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
        ? { solved: !record?.revealed, timeMs: record?.elapsedMs ?? 0 }
        : null,
      active: store.dailyMode,
    });

    useUpTimer(!!record && !done, (delta) =>
      update((r) => ({ ...r, elapsedMs: (r.elapsedMs ?? 0) + delta }))
    );

    /** the next cipher token the player can still assign */
    const step = useCallback(
      (from: string | null, dir: 1 | -1): string | null => {
        if (!record || !cipherTokens.length) return from;
        const open = cipherTokens.filter((t: string) => !record.reveals[t]);
        if (!open.length) return null;
        const at = from ? open.indexOf(from) : -1;
        const next = (at + dir + open.length * 2) % open.length;
        return open[next];
      },
      [record, cipherTokens]
    );

    const pressKey = useCallback(
      (k: string) => {
        if (!record || done || !selected) return;
        if (k === 'backspace') {
          update((r) => {
            const mapping = { ...r.mapping };
            delete mapping[selected];
            return { ...r, mapping };
          });
          return;
        }
        if (/^[a-z]$/.test(k)) {
          update((r) => {
            const mapping = { ...r.mapping };
            // A substitution is a bijection, so a plaintext letter can only
            // stand behind one cipher token. Assigning it here takes it from
            // wherever it was, rather than letting the board hold an
            // impossible reading.
            //
            // Except on a homophonic board, where several tokens genuinely do
            // mean the same letter — there, stealing would make the puzzle
            // unsolvable rather than tidy.
            if (!r.homophonic) {
              for (const [token, plain] of Object.entries(mapping)) {
                if (plain === k) delete mapping[token];
              }
            }
            mapping[selected] = k;
            return { ...r, mapping };
          });
          seat(step(selected, 1));
        }
      },
      [record, done, selected, update, step, seat]
    );

    useImperativeHandle(ref, () => ({ pressKey }));

    // physical keyboard
    useEffect(() => {
      const onKey = (e: KeyboardEvent) => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        if (e.key === 'Backspace') pressKey('backspace');
        else if (/^[a-zA-Z]$/.test(e.key)) pressKey(e.key.toLowerCase());
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') seat(step(selected, -1));
        else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') seat(step(selected, 1));
        else return;
        e.preventDefault();
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [pressKey, step, seat, selected]);

    function reveal() {
      if (!record || !answer) return;
      // Fill the mapping from the answer itself rather than writing the text
      // in: the board stays a solved cipher, so every letter still lines up
      // with the letter it stands for.
      const mapping: Record<string, string> = {};
      const letters = answer.text.replace(/[^A-Za-z]/g, '').toLowerCase();
      let at = 0;
      for (const token of record.tokens) {
        if (isCipherToken(record, token)) mapping[token] = letters[at++];
      }
      update((r) => ({ ...r, mapping, revealed: true }));
      if (!record.revealed && !record.solved) {
        recordCryptogramFinish(
          store.dailyMode,
          false,
          record.elapsedMs ?? 0,
          store.dailyMode ? store.dailyDate : null
        );
      }
    }

    function newPractice() {
      const board = drawPractice(store.practice?.tokens.join(' '));
      if (board) setStore((prev) => ({ ...prev, practice: board }));
    }

    // Which plaintext letters are spoken for, so the player can see at a glance
    // what's left — the paper-and-pencil habit of crossing off the alphabet.
    const usedPlain = useMemo(() => {
      const s = new Set<string>();
      if (record) for (const v of Object.values(solutionFor(record))) s.add(v);
      return s;
    }, [record]);

    // What wraps as a unit. Ordinarily a word, so a passage never breaks
    // inside one; on a grouped board there are no words to keep together, so
    // it's the traditional block of five — which is also the only thing
    // stopping the board reading as one unbroken string of letters.
    const chunks = useMemo(() => {
      if (!record) return [];
      const out: number[][] = [];
      let current: number[] = [];
      record.tokens.forEach((token, i) => {
        if (record.grouped) {
          current.push(i);
          if (current.length === 5) {
            out.push(current);
            current = [];
          }
        } else if (token === ' ') {
          out.push(current);
          current = [];
        } else {
          current.push(i);
        }
      });
      if (current.length) out.push(current);
      return out.filter((c) => c.length);
    }, [record]);

    return (
      <div className="text-center">
        <DailyToggle
          daily={store.dailyMode}
          onChange={(d) => setStore((prev) => ({ ...prev, dailyMode: d }))}
        />

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
              ? "Couldn't load today's cryptogram — try again later."
              : 'Loading…'}
          </p>
        )}

        {record && (
          <>
            {/* The passage. Each letter is a column: the solution on top, the
                cipher letter beneath it in small type — you are filling in the
                answer, and the code is the label. */}
            {/* which cipher this is — announced, because an unnamed shift is
                only a substitution solved the slow way, and the variety would
                be invisible */}
            <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
              {record.label}
            </p>

            <div className="flex flex-wrap justify-center gap-x-3 gap-y-3 max-w-2xl mx-auto">
              {chunks.map((chunk, ci) => (
                <span key={ci} className="inline-flex">
                  {chunk.map((i) => {
                    const token = record.tokens[i];
                    const cipher = isCipherToken(record, token);
                    const given = cipher && !!record.reveals[token];
                    const shown = decodedAt(record, i);
                    const picked = cipher && token === selected && !done;
                    // One cell carries the cursor and the key overlay even
                    // though a mark repeats: mounting an invisible input over
                    // every copy would stack five of them on one board.
                    const here = picked && i === cursorAt;
                    // Lighting up the other copies is the setting. The marks
                    // are printed either way, so this spares the scanning
                    // rather than telling you anything — but a mark's spread
                    // at a glance is part of frequency work, which is why it
                    // is a choice.
                    const active = highlightMatches ? picked : here;
                    if (!cipher) {
                      return (
                        <span
                          key={i}
                          className="inline-flex flex-col items-center justify-end w-3 text-lg text-slate-300"
                        >
                          <span className="h-7 flex items-end">{token}</span>
                          <span className="h-4" />
                        </span>
                      );
                    }
                    return (
                      <span key={i} className="relative inline-flex">
                      <button
                        onClick={() => !given && !done && setCursorAt(i)}
                        aria-label={`${spoken(token)}${
                          shown ? `, solved as ${shown}` : ', unsolved'
                        }${given ? ', given' : ''}`}
                        // wide enough for "17" or "56"; a single glyph still
                        // centres inside it
                        className={`inline-flex flex-col items-center min-w-6 px-0.5 rounded-md transition-colors ${
                          done
                            ? ''
                            : active
                              ? 'bg-amber-400/20'
                              : given
                                ? ''
                                : 'hover:bg-white/10'
                        }`}
                      >
                        <span
                          className={`h-7 flex items-center text-lg font-bold uppercase border-b-2 w-5 justify-center ${
                            given
                              ? 'text-white border-white/50'
                              : shown
                                ? 'text-accent border-white/40'
                                : 'text-transparent border-white/25'
                          }`}
                        >
                          {shown ?? ' '}
                        </span>
                        <span
                          className={`h-4 text-[0.625rem] font-semibold tracking-wider tabular-nums ${
                            active ? 'text-accent' : 'text-slate-500'
                          }`}
                        >
                          {token}
                        </span>
                      </button>
                      {/* The tap target for the phone's keyboard, on the
                          selected token and nowhere else. It is an invisible
                          input filling its positioned parent, so it must have
                          one — mounted loose it covers the whole board and
                          swallows every click. */}
                      {here && <MobileKeyInput onKey={pressKey} label="Type a letter" />}
                      </span>
                    );
                  })}
                </span>
              ))}
            </div>

            {done && answer && (
              <p className="mt-5 text-sm text-slate-400">
                — {answer.author}
              </p>
            )}

            <p className="sr-only" aria-live="polite">
              {done
                ? record.revealed
                  ? 'Revealed.'
                  : 'Solved!'
                : `${Object.keys(solutionFor(record)).length} of ${cipherTokens.length} worked out`}
            </p>

            {/* Which plaintext letters are spoken for — the paper-and-pencil
                habit of crossing off the alphabet. Hidden on a homophonic
                board, where a letter being used says nothing about whether
                it can be used again. */}
            {/* The tracker above is a row of glyphs whose whole meaning is
                struck-through or not, which is why each letter is aria-hidden
                — read aloud it is twenty-six letters and no information. But
                hiding it left nothing in its place, so the crossing-off a
                sighted player gets for free was simply unavailable. This is
                the same fact as a sentence. Not a live region: it changes on
                every keystroke, and narrating the alphabet each time would
                bury the board. */}
            {!record.homophonic && (
              <p className="sr-only">
                {usedPlain.size
                  ? `Plaintext letters used: ${[...usedPlain]
                      .sort()
                      .map((l) => l.toUpperCase())
                      .join(', ')}.`
                  : 'No plaintext letters used yet.'}
              </p>
            )}
            {!rail && !record.homophonic && (
              <div className="mt-6 flex flex-wrap justify-center gap-1 max-w-md mx-auto">
                {'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((l) => (
                  <span
                    key={l}
                    aria-hidden
                    className={`w-5 text-xs font-semibold uppercase ${
                      usedPlain.has(l.toLowerCase()) ? 'text-slate-600 line-through' : 'text-slate-400'
                    }`}
                  >
                    {l}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              {!store.dailyMode && (
                <button
                  onClick={newPractice}
                  className="inline-flex items-center gap-1.5 px-4 h-10 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  New passage
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
              {!rail && done && (
                <ShareButton
                  build={() =>
                    buildShare({
                      game: GAME_NAME.cryptogram.full,
                      slug: 'cryptogram',
                      daily: store.dailyMode,
                      date: store.dailyDate,
                      // The passage is the answer, so nothing about it can go
                      // out — not a letter of it, and not its author, who is
                      // half the puzzle's reward. Time and whether you needed
                      // the reveal is the whole honest report.
                      body: [
                        record.revealed
                          ? 'Revealed'
                          : `Solved in ${formatElapsed(record.elapsedMs ?? 0)}`,
                      ],
                    })
                  }
                />
              )}
            </div>

          </>
        )}
        {rail && record && (
          <InRail slot={rail}>
            <RailPanel label="Your passage" figure={done ? (record.revealed ? 'Revealed' : 'Solved') : `${Object.keys(solutionFor(record)).length} / ${cipherTokens.length} letters`}>
              <p className="flex items-center gap-1.5 text-sm text-slate-300 tabular-nums">
                <Timer className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                {formatElapsed(record.elapsedMs ?? 0)}
                {store.dailyMode && store.dailyDate && <span className="ml-auto text-xs text-slate-500">{store.dailyDate}</span>}
              </p>
              {done && (
                <div className="mt-3">
                  <ShareButton
                    build={() =>
                    buildShare({
                      game: GAME_NAME.cryptogram.full,
                      slug: 'cryptogram',
                      daily: store.dailyMode,
                      date: store.dailyDate,
                      // The passage is the answer, so nothing about it can go
                      // out — not a letter of it, and not its author, who is
                      // half the puzzle's reward. Time and whether you needed
                      // the reveal is the whole honest report.
                      body: [
                        record.revealed
                          ? 'Revealed'
                          : `Solved in ${formatElapsed(record.elapsedMs ?? 0)}`,
                      ],
                    })
                  }
                  />
                </div>
              )}
            </RailPanel>
            {/* the crossed-off alphabet, beside the passage rather than under it */}
            {!record.homophonic && (
              <RailPanel label="Letters used" figure={`${usedPlain.size} / 26`}>
                <div className="flex flex-wrap gap-1" aria-hidden>
                  {'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((l) => (
                    <span
                      key={l}
                      className={`w-5 text-center text-sm font-semibold uppercase ${
                        usedPlain.has(l.toLowerCase()) ? 'text-slate-600 line-through' : 'text-slate-300'
                      }`}
                    >
                      {l}
                    </span>
                  ))}
                </div>
              </RailPanel>
            )}
          </InRail>
        )}
      </div>
    );
  }
);

export default CryptogramGame;
