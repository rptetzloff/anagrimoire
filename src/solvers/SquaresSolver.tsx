// The Squares solver: a part-filled grid in, every word square that completes it out.
//
// Third of the solver surfaces out of App.tsx. What stays behind is the size
// and the letters, because both are persisted with the rest of the solver state
// on a shared timer. What comes here is everything about filling a square: the
// search, the grid, and how a completed square is drawn.
//
// The rules live in @/squares, which the play surface imports too — the piece
// the two surfaces legitimately share, and the reason this is a sibling of
// SquaresGame rather than a part of it.
import { useMemo } from 'react';
import Tile from '@/Tile';
import { solveSquare } from '@/squares';
import type { SquareSolverSize } from '@/storage';

/** Letters are held in a 25-slot array indexed row*5+col regardless of size, so
 *  dropping to 4×4 and back does not throw away what was typed. Every read of
 *  the array goes through this, which is the only reason that works. */
const slotOf = (i: number, n: SquareSolverSize) => Math.floor(i / n) * 5 + (i % n);

export default function SquaresSolver({
  size,
  letters,
  onSize,
  onLetters,
  words,
  osk,
}: {
  size: SquareSolverSize;
  letters: string[];
  onSize: (n: SquareSolverSize) => void;
  onLetters: (next: (prev: string[]) => string[]) => void;
  words: string[];
  /** on-screen keyboard active: tiles suppress the device keyboard */
  osk: boolean;
}) {
  // Capped at six answers. A sparse grid has thousands and nobody reads past
  // the first few, but the cap is also what makes `exhausted` meaningful: it
  // separates "no square fits" from "stopped looking", which are different
  // answers and used to read the same.
  const fill = useMemo(() => {
    const grid = Array.from({ length: size * size }, (_, i) => letters[slotOf(i, size)] || null);
    return solveSquare(words, grid, size, 6);
  }, [size, letters, words]);

  return (
    <div className="mb-8 text-center">
      <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2.5">
        Grid size
      </label>
      <div className="mb-5 inline-flex rounded-lg bg-white/5 border border-white/10 p-0.5 gap-0.5">
        {([4, 5] as SquareSolverSize[]).map((sz) => (
          <button
            key={sz}
            onClick={() => onSize(sz)}
            className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-colors
              ${size === sz ? 'bg-accent text-slate-950' : 'text-slate-400 hover:text-white'}`}
          >
            {sz}×{sz}
          </button>
        ))}
      </div>

      <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2.5">
        Known letters
      </label>
      <div className="w-fit mx-auto">
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${size}, auto)` }}>
          {Array.from({ length: size * size }, (_, i) => {
            const slot = slotOf(i, size);
            return (
              <Tile
                key={slot}
                index={i}
                group="squares"
                osk={osk}
                value={letters[slot]}
                state={letters[slot] ? 'known' : 'empty'}
                size="sm"
                onChange={(c) => onLetters((prev) => prev.map((x, j) => (j === slot ? c : x)))}
              />
            );
          })}
        </div>
      </div>

      <p className="mt-4 text-sm text-slate-400">
        Leave a cell blank and we&apos;ll fill it. Every row and every column comes out a word.
      </p>

      {fill && (
        <div className="mt-6">
          {fill.solutions.length === 0 ? (
            <p className="text-sm text-slate-400">
              {fill.exhausted
                ? 'No square fits those letters.'
                : 'Gave up looking — pin down another letter or two and try again.'}
            </p>
          ) : (
            <>
              <p className="text-sm text-slate-400 mb-4">
                {fill.solutions.length}
                {fill.exhausted ? '' : '+'} {fill.solutions.length === 1 ? 'square' : 'squares'} fit
              </p>
              <div className="flex flex-wrap justify-center gap-5">
                {fill.solutions.map((rows, k) => (
                  <div
                    key={k}
                    className="grid gap-1"
                    style={{ gridTemplateColumns: `repeat(${size}, auto)` }}
                  >
                    {rows.flatMap((w, r) =>
                      w.split('').map((ch, c) => {
                        // typed letters read solid, filled-in ones read accent —
                        // the answer is only useful if you can see which half
                        // of it you supplied
                        const typed = !!letters[r * 5 + c];
                        return (
                          <span
                            key={`${r}-${c}`}
                            className={`w-7 h-8 flex items-center justify-center rounded-md border text-sm font-bold uppercase
                              ${typed
                                ? 'bg-white/15 border-white/25 text-white'
                                : 'bg-transparent border-white/10 text-accent'}`}
                          >
                            {ch}
                          </span>
                        );
                      })
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
