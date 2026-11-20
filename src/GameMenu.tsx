// The game bar below lg: the game you are in, and a menu holding the rest.
//
// Nine tabs cannot be a row at phone widths. Wrapping them was the obvious fix
// and the wrong one — the bar is sticky, so two or three rows of tabs is two
// or three rows of every screen in the site, permanently, to show eight games
// you are not playing. One row, one height, and the count stops mattering.
import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import RouteLink from '@/RouteLink';
import { GAME_NAME } from '@/games';
import type { Mode } from '@/storage';

type ModeRow = { id: Mode; blurb: string };

export default function GameMenu({
  modes,
  icons,
  current,
  href,
  onGo,
}: {
  modes: ModeRow[];
  icons: Record<Mode, LucideIcon>;
  /** null at home, where no game is the current one */
  current: Mode | null;
  href: (id: Mode) => string;
  onGo: (id: Mode) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  // Escape closes and gives the button back the focus it took, and a click
  // outside closes without stealing it. Both are what a menu is expected to
  // do, and neither happens for free on a div.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  const here = modes.find((m) => m.id === current);
  const Here = here ? icons[here.id] : null;

  return (
    <div ref={wrap} className="relative">
      <button
        ref={button}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-slate-300 hover:text-white hover:bg-white/5 transition-colors"
      >
        {Here && <Here className="w-4 h-4" />}
        {/* at home there is no current game, so the control names itself */}
        <span>{here ? GAME_NAME[here.id].short : 'Games'}</span>
        <ChevronDown
          className={`w-4 h-4 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* A disclosure holding links, not a menu widget: role="menu" would
          promise arrow-key navigation between items, and a role whose keyboard
          contract is not kept is worse than no role at all. Tab walks them,
          which is what a list of links should do. */}
      {open && (
        <div
          aria-label="Games"
          className="absolute left-1/2 -translate-x-1/2 top-full mt-1 w-[min(20rem,calc(100vw-1rem))] max-h-[70vh] overflow-y-auto rounded-xl border border-white/15 bg-slate-900 shadow-2xl p-1.5 z-50"
        >
          {modes.map((m) => {
            const Icon = icons[m.id];
            const active = m.id === current;
            return (
              <RouteLink
                key={m.id}
                to={href(m.id)}
                onGo={() => {
                  onGo(m.id);
                  setOpen(false);
                }}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  active
                    ? 'bg-accent text-slate-950 font-semibold'
                    : 'text-slate-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="font-medium">{GAME_NAME[m.id].full}</span>
                <span className="ml-auto text-xs text-slate-500 truncate hidden sm:block">
                  {m.blurb}
                </span>
              </RouteLink>
            );
          })}
        </div>
      )}
    </div>
  );
}
