// The Cryptogram solver: a passage in, what the word shapes force out.
//
// Deduce, then offer. This never picks a reading: it settles what the shapes
// force and hands back the choices for what they don't, because a passage can
// have several readings where every word is real and only a person can tell
// which one means anything.
//
// Fourth solver surface out of App.tsx, and the cleanest cut of the four —
// none of its state is persisted, so unlike Bridge, Ladder and Squares there is
// no pair of strings left behind on App's save timer. The whole machine moves:
// the text, the picks, the index, the analysis and the hunches.
//
// Two guards disappeared in the move rather than being copied. Both read
// `mode !== 'cryptogram' || cryptogramPlay` and returned null, because a memo
// inside App runs on every render of every game. A component that only mounts
// on this surface does not need to ask.
//
// The rules live in @/cryptogramSolver, which the play surface imports too.
import { useMemo, useState } from 'react';
import { Eraser, X } from 'lucide-react';
import {
  analyse,
  buildPatternIndex,
  hunches,
  parseCryptogram,
  type InputMode,
} from '@/cryptogramSolver';

export default function CryptogramSolver({
  words,
  wordRank,
}: {
  /** the accept tier, wide on purpose — see the note on the index below */
  words: string[] | null;
  /** commonness, used only to order what each list offers first */
  wordRank: Map<string, number> | null;
}) {
  const [text, setText] = useState('');
  const [cryptoMode, setCryptoMode] = useState<InputMode>('letters');
  // Marks the player has settled by picking a reading; propagation takes these
  // as fixed and narrows everything else against them.
  //
  // Kept as the choices made, not as the letters they imply: a pick has to be
  // undoable on its own, and a flat token->letter map has forgotten which
  // choice put each letter there.
  const [cryptoPicks, setCryptoPicks] = useState<
    { key: string; tokens: string[]; plain: string }[]
  >([]);
  // words whose full candidate list the player has asked to see; keyed the way
  // analyse keys them, so a word keeps its state as the lists narrow
  const [cryptoOpen, setCryptoOpen] = useState<string[]>([]);

  // Words grouped by shape. A pass over the whole dictionary, which is why it
  // used to be guarded — mounting is the guard now.
  //
  // Search wide, rank narrow, and the two must not be confused. Searching the
  // common tier alone was tried and is a trap. It deduces far more, and some of
  // what it deduces is wrong: propagation is only sound while the candidate
  // lists are complete, so a passage using any word the tier lacks lets the
  // intersection eliminate the true letter and "prove" a false one. On a real
  // cryptogram it settled i as a. A solver that is confidently wrong is the
  // thing this whole design exists to avoid.
  //
  // So the search stays over everything, which keeps every deduction sound, and
  // the common tier only decides what each list offers first — which was the
  // actual complaint: `the` was buried behind `dye` and `ecu`.
  const patternIndex = useMemo(
    () => (words ? buildPatternIndex(words, wordRank ?? undefined) : null),
    [words, wordRank]
  );

  const cryptoWords = useMemo(
    () => (text.trim() ? parseCryptogram(text, cryptoMode) : []),
    [text, cryptoMode]
  );

  const cryptoPins = useMemo(() => {
    const pins: Record<string, string> = {};
    for (const p of cryptoPicks) p.tokens.forEach((t, i) => (pins[t] = p.plain[i]));
    return pins;
  }, [cryptoPicks]);

  const cryptoAnalysis = useMemo(
    () => (patternIndex && cryptoWords.length ? analyse(cryptoWords, patternIndex, cryptoPins) : null),
    [patternIndex, cryptoWords, cryptoPins]
  );

  const cryptoHunches = useMemo(
    () =>
      cryptoAnalysis
        ? hunches(cryptoAnalysis, wordRank ?? undefined)
            // Half the weight agreeing is the floor for saying anything. It was
            // set when a cold start put its top guess at 41% and wrong, and it
            // still holds: measured over 150 boards at their opening move, what
            // clears this bar is right 86% of the time and what falls below it
            // 41%. The bar is doing the work it was put there for — a row of
            // confident-looking noise is worse than an empty one.
            .filter((h) => h.share >= 0.5)
            .slice(0, 6)
        : [],
    [cryptoAnalysis, wordRank]
  );

  /** settle a word on one reading, which propagation then spreads. Choosing
   *  again for the same word replaces that choice rather than stacking a
   *  second one on top of it. */
  function pinWord(tokens: string[], plain: string) {
    const key = tokens.join(' ');
    setCryptoPicks((prev) => [...prev.filter((p) => p.key !== key), { key, tokens, plain }]);
  }

  return (
    <div className="mb-8 max-w-2xl mx-auto">
      <label htmlFor="crypto-in" className="block text-sm text-slate-300 mb-2">
        Paste a cryptogram. Every mark has to stand for the same letter throughout.
      </label>
      <textarea
        id="crypto-in"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setCryptoPicks([]);
          setCryptoOpen([]);
        }}
        rows={3}
        spellCheck={false}
        placeholder={cryptoMode === 'letters' ? 'WKH TXLFN EURZQ IRA' : '17 42 42 / 8 9 3'}
        className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-slate-200 placeholder:text-slate-600 text-sm font-mono"
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div role="group" aria-label="How the marks are written" className="inline-flex rounded-lg bg-white/5 border border-white/10 p-0.5 gap-0.5">
          {([['letters', 'Letters'], ['tokens', 'Numbers or symbols']] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => { setCryptoMode(id); setCryptoPicks([]); setCryptoOpen([]); }}
              aria-pressed={cryptoMode === id}
              className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-colors
                ${cryptoMode === id ? 'bg-accent text-slate-950' : 'text-slate-400 hover:text-white'}`}
            >
              {label}
            </button>
          ))}
        </div>
        {cryptoPicks.length > 1 && (
          <button
            onClick={() => setCryptoPicks([])}
            className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
          >
            <Eraser className="w-4 h-4" />
            Undo all
          </button>
        )}
      </div>

      {/* The way in when nothing is offered. On a cold start every word
          can still be thousands of readings, so there is nothing to click
          and nothing worth suggesting — but the person asking usually
          knows a letter already, and one is enough to start the cascade.
          Typed here it becomes an ordinary pick, undoable like the rest. */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label htmlFor="crypto-known" className="text-xs text-slate-500">
          Know one already?
        </label>
        <input
          id="crypto-known"
          defaultValue=""
          placeholder={cryptoMode === 'letters' ? 'K=e' : '17=e'}
          spellCheck={false}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            const raw = (e.target as HTMLInputElement).value;
            const m = raw.match(/^\s*(\S+)\s*=\s*([A-Za-z])\s*$/);
            if (!m) return;
            pinWord([cryptoMode === 'letters' ? m[1].toLowerCase() : m[1]], m[2].toLowerCase());
            (e.target as HTMLInputElement).value = '';
          }}
          className="w-24 px-2 h-8 rounded-lg bg-white/5 border border-white/10 text-slate-200 placeholder:text-slate-600 text-sm font-mono"
        />
        <span className="text-xs text-slate-600">then Enter</span>
      </div>

      {/* Each choice on its own, so a wrong turn costs one click rather
          than the whole session. */}
      {cryptoPicks.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500">Your picks:</span>
          {cryptoPicks.map((p) => (
            <button
              key={p.key}
              onClick={() => setCryptoPicks((prev) => prev.filter((q) => q.key !== p.key))}
              aria-label={`Undo ${p.plain}`}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-sm bg-emerald-400/15 text-emerald-300 hover:bg-rose-400/15 hover:text-rose-300 transition-colors"
            >
              {p.plain}
              <X className="w-3 h-3" />
            </button>
          ))}
        </div>
      )}

      {cryptoMode === 'tokens' && (
        <p className="mt-2 text-xs text-slate-500">
          Marks separated by spaces, words by a slash — nothing about &ldquo;17 42&rdquo;
          says whether that is one word or two.
        </p>
      )}

      {cryptoAnalysis && (
        <div className="mt-5" aria-live="polite">
          <p className="text-lg text-white leading-relaxed font-mono break-words">
            {cryptoWords
              .map((w) =>
                w
                  // the apostrophe inside a contraction is the passage's
                  // own punctuation, not a mark waiting to be solved, so
                  // it reads through rather than showing as a blank
                  .map((t) => (t === "'" ? "'" : (cryptoAnalysis.mapping[t] ?? '·')))
                  .join('')
              )
              .join(' ')}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            {cryptoAnalysis.contradiction
              ? 'No reading fits — one of your picks can’t be right. Undo them and try another.'
              : `${Object.keys(cryptoAnalysis.mapping).length} marks settled. A dot is a mark the shapes can’t pin yet.`}
          </p>
          {/* Guesses, and dressed as guesses. Everything above this line is
              proven; these are counted off the readings still standing, so
              they belong in their own row with their odds showing. */}
          {!cryptoAnalysis.contradiction && cryptoHunches.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500">Probably:</span>
              {cryptoHunches.map((h) => (
                <button
                  key={h.token}
                  onClick={() => pinWord([h.token], h.plain)}
                  className="inline-flex items-baseline gap-1 px-2 py-0.5 rounded-md text-sm bg-white/5 border border-dashed border-white/25 text-slate-300 hover:bg-amber-400/15 hover:text-accent transition-colors"
                >
                  <span className="font-mono text-xs text-slate-500">{h.token}</span>
                  <span>= {h.plain}</span>
                  <span className="text-[0.625rem] text-slate-500">
                    {Math.round(h.share * 100)}%
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Most-constrained first, and only words narrow enough to act
              on. A five-letter word with three thousand readings is not a
              choice, it is a wall — and listing it buries the word with
              four, which is where the deduction actually is. */}
          <div className="mt-4 space-y-2">
            {cryptoAnalysis.words
              .filter((w) => w.candidates.length > 1 && w.candidates.length <= 40)
              .sort((a, b) => a.candidates.length - b.candidates.length)
              .slice(0, 12)
              .map((w) => {
                const key = w.tokens.join(' ');
                const open = cryptoOpen.includes(key);
                // ten is enough to scan; the rest are a click away rather
                // than a number you can only look at
                const shown = open ? w.candidates : w.candidates.slice(0, 10);
                return (
                  <div key={key} className="flex flex-wrap items-baseline gap-2">
                    <span className="text-xs font-mono text-slate-500 shrink-0">
                      {w.tokens.join(cryptoMode === 'letters' ? '' : ' ')}
                    </span>
                    {shown.map((c) => (
                      <button
                        key={c}
                        onClick={() => pinWord(w.tokens, c)}
                        className="px-2 py-0.5 rounded-md text-sm bg-white/5 border border-white/10 text-slate-300 hover:bg-emerald-400/15 hover:text-emerald-300 transition-colors"
                      >
                        {c}
                      </button>
                    ))}
                    {w.candidates.length > 10 && (
                      <button
                        onClick={() =>
                          setCryptoOpen((prev) =>
                            open ? prev.filter((k) => k !== key) : [...prev, key]
                          )
                        }
                        className="px-2 py-0.5 rounded-md text-xs text-slate-500 hover:text-white hover:bg-white/10 transition-colors"
                      >
                        {open ? 'fewer' : `+${w.candidates.length - 10} more`}
                      </button>
                    )}
                  </div>
                );
              })}
          </div>

          {!cryptoAnalysis.contradiction &&
            cryptoAnalysis.words.every((w) => w.candidates.length === 1) && (
              <p className="mt-3 text-xs text-emerald-300">
                Every word has one reading left, so that is the answer.
              </p>
            )}
        </div>
      )}
    </div>
  );
}
