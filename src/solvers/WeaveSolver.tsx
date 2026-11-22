// The Weave solver's controls: a size, a board, and two dailies.
//
// Two, because one of them is not ours. "Today's NYT Strands" fills the board
// from the published puzzle and carries its theme; "Today's daily weave" fills
// it from ours. They share a status because a person can only be waiting on one
// of them at a time.
//
// The answers render in the shared ResultsPanel below — App computes results
// for every mode in one place, so what this owns is the half a person types
// into. Sibling of GridSolver; see the note there on why they are not one
// component.
import { CalendarDays } from 'lucide-react';
import TracedBoard, { type PathTrace } from '@/solvers/TracedBoard';
import type { WeaveSize } from '@/storage';

const SIZES = [
  { id: '6x8', label: '6×8' },
  { id: '8x10', label: '8×10' },
] as const;

export default function WeaveSolver({
  size,
  onSize,
  letters,
  cols,
  onLetters,
  osk,
  trace,
  onFillStrands,
  onFillWeave,
  todayStatus,
  strandsClue,
}: {
  size: WeaveSize;
  onSize: (s: WeaveSize) => void;
  letters: string[];
  cols: number;
  onLetters: (next: (prev: string[]) => string[]) => void;
  osk: boolean;
  trace: PathTrace;
  onFillStrands: () => void;
  onFillWeave: () => void;
  todayStatus: 'idle' | 'loading' | 'error';
  /** the NYT puzzle's theme, once one has been fetched */
  strandsClue: string | null;
}) {
  const fetching = todayStatus === 'loading';

  return (
    <div className="mb-8 text-center">
      <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2.5">
        Board size
      </label>
      <div className="mb-5 inline-flex rounded-lg bg-white/5 border border-white/10 p-0.5 gap-0.5">
        {SIZES.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => onSize(id)}
            className={`px-3 py-1.5 rounded-md text-sm font-semibold whitespace-nowrap transition-colors
              ${size === id ? 'bg-accent text-slate-950' : 'text-slate-400 hover:text-white'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">
        The board
      </label>
      <TracedBoard
        letters={letters}
        cols={cols}
        group="weave"
        gap="gap-1.5"
        osk={osk}
        trace={trace}
        onLetter={(i, c) => onLetters((prev) => prev.map((x, j) => (j === i ? c : x)))}
      />

      <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
        {[
          { label: "Today's NYT Strands", onClick: onFillStrands },
          { label: "Today's daily weave", onClick: onFillWeave },
        ].map((b) => (
          <button
            key={b.label}
            onClick={b.onClick}
            disabled={fetching}
            className="inline-flex items-center gap-1.5 px-4 h-10 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-50"
          >
            <CalendarDays className="w-4 h-4" />
            {fetching ? 'Fetching…' : b.label}
          </button>
        ))}
      </div>
      {todayStatus === 'error' && (
        <p className="mt-2 text-xs text-danger">
          Couldn&apos;t fetch today&apos;s puzzle — try again in a minute.
        </p>
      )}
      {strandsClue && (
        <p className="mt-2 text-sm text-amber-300">
          Theme: <span className="font-semibold">{strandsClue}</span>
        </p>
      )}
      <p className="mt-3 text-xs text-slate-500">
        Words are 3+ letters traced through adjacent cells (diagonals count), using each cell
        once. Hover a result to trace it on the board. Today&apos;s Strands becomes available
        here about 15 minutes after the NYT publishes it (3:00&nbsp;a.m. Eastern).
      </p>
    </div>
  );
}
