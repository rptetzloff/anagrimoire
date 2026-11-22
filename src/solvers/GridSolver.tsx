// The Grid solver's controls: a size, a board, and today's puzzle.
//
// The answers are not here — they render in the shared ResultsPanel below,
// because App computes results for every mode in one place. What this owns is
// the half a person types into.
//
// Sibling of WeaveSolver, and deliberately not merged with it. The two draw the
// same board through TracedBoard, but a grid is square with three presets and
// one daily, and a weave is a rectangle with two sizes and two dailies, one of
// which is somebody else's puzzle. Folding them together means a component
// whose props are mostly about which of the two it is.
import { CalendarDays } from 'lucide-react';
import TracedBoard, { type PathTrace } from '@/solvers/TracedBoard';
import type { GridPreset } from '@/storage';

const PRESETS = [
  { id: '3x3', label: '3×3' },
  { id: '4x4', label: '4×4' },
  { id: '5x5', label: '5×5' },
] as const;

export default function GridSolver({
  preset,
  onPreset,
  letters,
  cols,
  onLetters,
  osk,
  trace,
  onFillToday,
  todayStatus,
}: {
  preset: GridPreset;
  onPreset: (p: GridPreset) => void;
  letters: string[];
  cols: number;
  onLetters: (next: (prev: string[]) => string[]) => void;
  osk: boolean;
  trace: PathTrace;
  onFillToday: () => void;
  todayStatus: 'idle' | 'loading' | 'error';
}) {
  return (
    <div className="mb-8 text-center">
      <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2.5">
        Grid size
      </label>
      <div className="mb-5 inline-flex rounded-lg bg-white/5 border border-white/10 p-0.5 gap-0.5">
        {PRESETS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => onPreset(id)}
            className={`px-3 py-1.5 rounded-md text-sm font-semibold whitespace-nowrap transition-colors
              ${preset === id ? 'bg-accent text-slate-950' : 'text-slate-400 hover:text-white'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">
        The grid
      </label>
      <TracedBoard
        letters={letters}
        cols={cols}
        group="grid"
        gap="gap-2"
        osk={osk}
        trace={trace}
        onLetter={(i, c) => onLetters((prev) => prev.map((x, j) => (j === i ? c : x)))}
      />

      <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={onFillToday}
          disabled={todayStatus === 'loading'}
          className="inline-flex items-center gap-1.5 px-4 h-10 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-50"
        >
          <CalendarDays className="w-4 h-4" />
          {todayStatus === 'loading' ? 'Fetching…' : "Today's daily grid"}
        </button>
      </div>
      {todayStatus === 'error' && (
        <p className="mt-2 text-xs text-danger">
          Couldn&apos;t fetch today&apos;s grid — try again in a minute.
        </p>
      )}
      <p className="mt-3 text-xs text-slate-500">
        Words are 3+ letters traced through adjacent cells (diagonals count), using each cell
        once. Hover a result to trace it on the board.
      </p>
    </div>
  );
}
