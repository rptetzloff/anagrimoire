// A game's panel in the rail: a card with a label, an optional figure on the
// right of it, and whatever the game has to say. `InRail` puts it there.
import type { HTMLAttributes, ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function RailPanel({ label, figure, children }: { label: string; figure?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={label} className="rounded-2xl border border-white/10 bg-slate-900 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</h2>
        {figure && <span className="text-sm text-slate-300 tabular-nums">{figure}</span>}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Its children, drawn in the rail. */
export function InRail({ slot, children }: { slot: HTMLElement; children: ReactNode }) {
  return createPortal(children, slot);
}

/** Found words as chips, the notable ones marked: a long list scrolls inside
 *  the panel rather than stretching the rail. */
export function WordChips({ words, strong, chipProps }: {
  words: string[];
  strong?: (w: string) => boolean;
  /** extra props per chip -- Grid's hover-to-trace */
  chipProps?: (w: string) => HTMLAttributes<HTMLLIElement>;
}) {
  return (
    <ul className="flex flex-wrap gap-1.5 max-h-64 overflow-y-auto">
      {words.map((w) => (
        <li key={w}
            {...chipProps?.(w)}
            className={`px-2 py-0.5 rounded-md border text-sm tracking-wide ${
              strong?.(w)
                ? 'bg-emerald-400/25 border-emerald-300 text-emerald-100 font-semibold'
                : 'bg-emerald-400/10 border-emerald-400/30 text-emerald-200'
            }`}>
          {w}
        </li>
      ))}
    </ul>
  );
}
