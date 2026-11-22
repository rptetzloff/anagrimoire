import { DIFFICULTIES, DIFFICULTY_LABEL, type Difficulty } from '@/difficulty';

/** Difficulty tabs for the places that only *show* results.
 *
 *  These are deliberately not the difficulty you're playing. Looking at the
 *  extreme board and finding your daily had switched to extreme would be a
 *  trap — so this is view-local state, starting from what you play and
 *  changing nothing but what's on screen. The switch above a board is the one
 *  that decides what you get; this one only decides what you read.
 */
export default function DifficultyTabs({
  value,
  onChange,
  label,
}: {
  value: Difficulty;
  onChange: (next: Difficulty) => void;
  /** describes the tabs for anyone not seeing them */
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex flex-wrap rounded-lg bg-white/5 border border-white/10 p-0.5 gap-0.5"
    >
      {DIFFICULTIES.map((id) => (
        <button
          key={id}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onChange(id)}
          aria-pressed={value === id}
          className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors
            ${value === id
              ? 'bg-accent text-slate-950'
              : 'text-slate-400 hover:text-white hover:bg-white/10'}`}
        >
          {DIFFICULTY_LABEL[id]}
        </button>
      ))}
    </div>
  );
}
