// The answers, for every solver that answers with a list of words.
//
// Six do — Guess, Scramble, Hive, Boxed, Grid and Weave — and the four that
// answer from a rule or a board do not appear here at all. That distinction has
// its own test (e2e/solver-scope.spec.ts), written after the ladder solver
// printed several thousand unrelated words beneath its route, under a heading
// offering to show all 4,743 of them. The gate is an allowlist for that reason:
// a new game is silent by default rather than having to opt out.
//
// Three parts, and only the middle one is game-specific:
//
//   the header    how many, how sorted, and clear
//   `children`    whatever a game wants above the list — Boxed's recommended
//                 chain and its multi-word solutions, Hive's pangrams
//   the list      grouped by length or flat, every word a chip
//
// Featured sections come in as children rather than as props because there is
// no shape they share: a pangram is a word, a Boxed solution is an ordered
// chain of them drawn in five colours. Trying to describe both in one prop was
// what kept this code inside App.tsx.
//
// It knows nothing about boards. `hoverPropsFor` is a callback — the board that
// can draw a word hands over the handlers that draw it, and the panel just
// spreads them onto the chip. That is the seam that used to be missing: the
// trace state lived beside this list, which made Weave and Grid inseparable
// from a component that has nothing to do with either.
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { ArrowDown, ArrowUp, Eraser, Search, X } from 'lucide-react';
import WordChip from '@/solvers/WordChip';
import { byLength, type SortPref } from '@/solvers/resultOrder';

/** Past this many the list is capped until asked. Not a render budget — the
 *  browser copes — but a reading one: a wall of nine thousand words buries the
 *  Show-all control that would have explained it. */
export const CAP = 200;

const CHIP = 'bg-white/[0.04] border border-white/10 text-slate-300 hover:bg-white/[0.08] hover:border-white/20';

export default function ResultsPanel({
  results,
  words,
  sort,
  onSort,
  onClear,
  showAll,
  onShowAll,
  emptyNote,
  grouped,
  sortable = true,
  hoverPropsFor,
  renderWord,
  children,
}: {
  /** every answer, which is what the count and the Show-all button describe */
  results: string[];
  /** the ones to draw: capped, and with any featured words already removed */
  words: string[];
  sort: SortPref;
  onSort: (next: Partial<SortPref>) => void;
  onClear: () => void;
  showAll: boolean;
  onShowAll: (next: boolean) => void;
  /** what to say when there is nothing — the caller knows whether that means
   *  "you have not typed anything yet" or "those letters spell nothing", and
   *  those are different sentences */
  emptyNote: string;
  /** bucket by word length under a heading each */
  grouped: boolean;
  /** the pattern solver fixes its own length, so a length/A–Z switch there
   *  offers a choice between one thing and the same thing */
  sortable?: boolean;
  hoverPropsFor?: (word: string) => ButtonHTMLAttributes<HTMLButtonElement> | undefined;
  /** draw a word as something other than itself — the pattern solver tints the
   *  letters it already knew */
  renderWord?: (word: string) => ReactNode;
  children?: ReactNode;
}) {
  const chip = (w: string) => (
    <WordChip key={w} word={w} hoverProps={hoverPropsFor?.(w)} className={CHIP}>
      {renderWord?.(w)}
    </WordChip>
  );

  const grid = (ws: string[]) => (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">{ws.map(chip)}</div>
  );

  return (
    <>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-y-3">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-white/5 border border-white/10">
            <Search className="w-4 h-4 text-slate-300" />
          </div>
          <div>
            <p className="text-2xl font-bold leading-none">
              {results.length}
              <span className="text-base font-normal text-slate-400 ml-1.5">
                {results.length === 1 ? 'match' : 'matches'}
              </span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {sortable && (
            <div className="inline-flex rounded-lg bg-white/5 border border-white/10 p-0.5 gap-0.5">
              {(['length', 'alpha'] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => onSort({ key: k })}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors
                    ${sort.key === k ? 'bg-accent text-slate-950' : 'text-slate-400 hover:text-white'}`}
                >
                  {k === 'length' ? 'Length' : 'A–Z'}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => onSort({ dir: sort.dir === 'asc' ? 'desc' : 'asc' })}
            title={
              sort.key === 'alpha'
                ? sort.dir === 'asc'
                  ? 'A to Z — click for Z to A'
                  : 'Z to A — click for A to Z'
                : sort.dir === 'asc'
                  ? 'Shortest first — click for longest first'
                  : 'Longest first — click for shortest first'
            }
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-white bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
          >
            {sort.dir === 'asc' ? (
              <ArrowUp className="w-3.5 h-3.5" />
            ) : (
              <ArrowDown className="w-3.5 h-3.5" />
            )}
          </button>
          <button
            onClick={onClear}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
          >
            <Eraser className="w-3.5 h-3.5" />
            Clear
          </button>
        </div>
      </div>

      {results.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-10 text-center">
          <p className="text-slate-400">{emptyNote}</p>
        </div>
      ) : (
        <>
          {children}
          {grouped
            ? byLength(words).map(([len, ws]) => (
                <div key={len} className="mb-6">
                  <p className="mb-2.5 text-xs font-medium text-slate-400 uppercase tracking-wider">
                    {len} letters <span className="text-slate-600">· {ws.length}</span>
                  </p>
                  {grid(ws)}
                </div>
              ))
            : grid(words)}

          {results.length > CAP && (
            <button
              onClick={() => onShowAll(!showAll)}
              className="mt-5 mx-auto flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-amber-300 bg-amber-400/10 border border-amber-400/20 hover:bg-amber-400/20 transition-colors"
            >
              {showAll ? (
                <>
                  <X className="w-4 h-4" /> Show fewer
                </>
              ) : (
                <>
                  <ArrowDown className="w-4 h-4" /> Show all {results.length}
                </>
              )}
            </button>
          )}
        </>
      )}
    </>
  );
}
