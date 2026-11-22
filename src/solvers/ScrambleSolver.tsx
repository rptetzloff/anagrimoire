// The Scramble solver's controls: a rack of letters and what to do with them.
//
// The answers render in the shared ResultsPanel below — App computes results
// for every mode in one place — so what this owns is the rack.
//
// The two options are not symmetric and the layout says so. "Use every letter"
// is a mode: on, the only answers are full-rack anagrams and a minimum length
// is meaningless, which is why the selector disappears rather than greying out.
// A disabled control invites you to work out why it is disabled.
import { CalendarDays } from 'lucide-react';
import LetterChipInput from '@/solvers/LetterChipInput';

const MIN_LENGTHS = [2, 3, 4, 5, 6, 7];

export default function ScrambleSolver({
  rack,
  onRack,
  maxLen,
  useAll,
  onUseAll,
  minLength,
  onMinLength,
  osk,
  onFillToday,
  todayStatus,
}: {
  rack: string;
  onRack: (v: string) => void;
  maxLen: number;
  useAll: boolean;
  onUseAll: (v: boolean) => void;
  minLength: number;
  onMinLength: (n: number) => void;
  osk: boolean;
  onFillToday: () => void;
  todayStatus: 'idle' | 'loading' | 'error';
}) {
  return (
    <div className="mb-8">
      <section className="mb-5">
        <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2.5 text-center">
          Your letters <span className="text-accent normal-case">(use ? for a blank tile)</span>
        </label>
        <LetterChipInput
          value={rack}
          onChange={onRack}
          ariaLabel="Letters to descramble"
          placeholder="e.g. aetrsn?"
          maxLen={maxLen}
          allowWildcard
          tone="amber"
          osk={osk}
        />
      </section>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={onFillToday}
          disabled={todayStatus === 'loading'}
          className="inline-flex items-center gap-1.5 px-4 h-10 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-50"
        >
          <CalendarDays className="w-4 h-4" />
          {todayStatus === 'loading' ? 'Fetching…' : "Today's daily rack"}
        </button>
        <button
          onClick={() => onUseAll(!useAll)}
          className={`inline-flex items-center gap-1.5 px-4 h-10 rounded-lg text-sm font-semibold transition-all duration-150 border
            ${useAll
              ? 'bg-accent text-slate-950 border-accent shadow-lg shadow-accent/30'
              : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'}`}
        >
          Use every letter
        </button>
        {!useAll && (
          <label className="inline-flex items-center gap-2 text-sm text-slate-300">
            Min length
            <select
              value={minLength}
              onChange={(e) => onMinLength(Number(e.target.value))}
              className="h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-sm font-semibold text-white outline-none focus:border-amber-400 [&>option]:bg-slate-900"
            >
              {MIN_LENGTHS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {todayStatus === 'error' && (
        <p className="mt-2 text-xs text-danger text-center">
          Couldn&apos;t fetch today&apos;s rack — try again in a minute.
        </p>
      )}
    </div>
  );
}
