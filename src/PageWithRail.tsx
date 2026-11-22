// A feature page in the layout spec's shape (November 2026): which part of the
// site it is, its name and what it is for, then the page itself with a rail
// beside it -- the things you check rather than do: what you sent, the weeks
// gone, how anonymity works. Below 1024px the rail drops under the page.
import type { ReactNode } from 'react';
import RouteLink from '@/RouteLink';

export const RAIL_CARD = 'rounded-2xl border border-white/10 bg-slate-900 p-4';
export const RAIL_LABEL = 'text-xs font-semibold text-slate-400 uppercase tracking-wider';

export default function PageWithRail({ section, title, blurb, top, rail, wide = false, children }: {
  /** the bar menu it sits under: Together, Events */
  section: string;
  title: string;
  blurb?: ReactNode;
  /** above the title: a way back */
  top?: ReactNode;
  rail?: ReactNode;
  /** without a rail, use the whole width rather than a reading measure: a
   *  page of boards side by side, not a list */
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="py-2">
      {top}
      <header className="mb-6">
        <p className={RAIL_LABEL}>{section}</p>
        <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-white">{title}</h1>
        {blurb && <div className="mt-1.5 text-sm sm:text-base text-slate-400 max-w-2xl">{blurb}</div>}
      </header>
      <div className={`grid gap-7 items-start ${rail ? 'lg:grid-cols-[minmax(0,1fr)_18.75rem]' : ''}`}>
        <div className={`min-w-0 space-y-6 ${rail || wide ? '' : 'max-w-3xl'}`}>{children}</div>
        {rail && <aside className="min-w-0 space-y-4" aria-label={`${title}: more`}>{rail}</aside>}
      </div>
    </div>
  );
}

/** A card in the rail with a small-caps heading. */
export function RailCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section aria-label={label} className={RAIL_CARD}>
      <h2 className={RAIL_LABEL}>{label}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** A page's tabs, each a link to its own address with the open one marked. One
 *  line from a 320px phone up; at the largest text they wrap rather than spill. */
export function PageTabs<T extends string>({ label, tabs, current, link }: {
  label: string;
  tabs: readonly { id: T; label: string }[];
  current: T;
  link: (id: T) => { to: string; onGo: () => void };
}) {
  return (
    <nav aria-label={label} className="flex flex-wrap sm:inline-flex rounded-xl bg-slate-900 border border-white/10 p-1 gap-1">
      {tabs.map(({ id, label: name }) => (
        <RouteLink
          key={id}
          {...link(id)}
          current={current === id}
          className={`flex-auto sm:flex-none text-center px-1 min-[360px]:px-1.5 sm:px-3.5 py-1.5 rounded-lg text-xs min-[360px]:text-[0.8125rem] sm:text-sm font-semibold transition-colors
            ${current === id ? 'bg-accent text-slate-950' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}
        >
          {name}
        </RouteLink>
      ))}
    </nav>
  );
}
