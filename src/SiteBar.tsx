// The shell: the bar across the top of every page, and on a phone a bar at the
// top and a row of tabs at the bottom (the layout spec, November 2026).
//
// Desktop: the logo, which goes home; Today, Games, Solvers and Boards; the
// quick-solve box where there is room for it; and on the right, the menu of
// your own things (stats, settings, keys, account) with Sign in beside it when
// signed out. A phone: the logo, the page's name (on a game, a tap switches
// game), the avatar; and Today, Games, Solvers, Boards and Me along the bottom.
//
// App decides what is in each list -- which games are shown, which views, who
// may see the report queue -- and hands the lists here. A menu with nothing in
// it is not drawn: someone who has hidden Solve has no Solvers menu, rather
// than one that opens onto nothing.
//
// It replaces a bar of game tabs that stopped fitting at the ninth game and
// was then a "game you are in plus a menu" below lg. That bar's lesson holds:
// one row, one height, however many games there are.
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { CalendarDays, ChevronDown, LayoutGrid, Search, Trophy, UserRound, X } from 'lucide-react';
import RouteLink from '@/RouteLink';
import GameTile from '@/GameTile';
import type { DailyState } from '@/dailyStatus';
import type { Slug } from '@/games';

export type Go = { to: string; onGo: () => void };

export type BarItem = {
  key: string;
  label: string;
  go: Go;
  icon?: ReactNode;
  /** a game's tile in place of an icon */
  tile?: Slug;
  /** a line under the label */
  note?: string;
  /** today's state of the game's daily, read when the list opens */
  status?: () => DailyState;
};

export type Section = 'today' | 'games' | 'solvers' | 'boards' | null;

export type BarProps = {
  home: Go;
  boards: Go;
  current: Section;
  /** the page's name, for the phone's bar */
  title: string;
  /** whether a tap on the phone's title opens the game switcher */
  titleSwitchesGame: boolean;
  games: BarItem[];
  solvers: BarItem[];
  me: BarItem[];
  /** the box: null when neither solver it opens is shown */
  quickSolve: ((text: string) => string | null) | null;
  /** signed out: the way in, beside the menu of your own things */
  signIn: Go | null;
  /** signed in: the letter on the avatar */
  you: { initial: string } | null;
  /** a panel (stats, settings, legal...) is open over the page: the phone's
   *  tabs step aside rather than sit under it, unusable */
  covered?: boolean;
};

// The same words Home's cards use, so a game is "Finished" in both places.
const STATUS_WORD: Record<DailyState, string> = { done: 'Finished', started: 'In progress', none: '' };
const STATUS_DOT: Record<DailyState, string> = { done: 'bg-emerald-400', started: 'bg-accent', none: 'bg-slate-700' };

function ItemRow({ item, onPick }: { item: BarItem; onPick: () => void }) {
  const status = item.status?.();
  return (
    <RouteLink
      to={item.go.to}
      onGo={() => {
        onPick();
        item.go.onGo();
      }}
      className="flex items-center gap-3 rounded-lg px-3 py-2 min-h-11 text-sm text-slate-200 hover:bg-white/10"
    >
      {item.tile ? <GameTile slug={item.tile} size="sm" /> : item.icon && (
        <span className="w-7 h-7 shrink-0 inline-flex items-center justify-center text-slate-400" aria-hidden="true">{item.icon}</span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{item.label}</span>
        {item.note && <span className="block text-xs text-slate-400">{item.note}</span>}
      </span>
      {status && (
        <span className="flex items-center gap-1.5 shrink-0 text-xs text-slate-400">
          {STATUS_WORD[status]}
          <span className={`w-2 h-2 rounded-full ${STATUS_DOT[status]}`} aria-hidden="true" />
        </span>
      )}
    </RouteLink>
  );
}

/** Close on a click or tap outside, or Escape, while open. */
function useDismiss(open: boolean, close: () => void, inside: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!inside.current?.contains(e.target as Node)) close();
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open, close, inside]);
}

/** One line in, a solver out. A problem is said under the box, in words, and
 *  the box keeps what was typed so it can be fixed rather than retyped. */
function QuickSolveBox({ go, onDone, wide = false }: {
  go: (text: string) => string | null;
  onDone?: () => void;
  wide?: boolean;
}) {
  const [text, setText] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const id = useId();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const why = go(text);
    setProblem(why);
    if (!why) {
      setText('');
      onDone?.();
    }
  };
  return (
    <form role="search" onSubmit={submit} className={`relative ${wide ? 'w-full' : 'w-60'}`}>
      <label className="field flex items-center gap-2 h-10 px-3 rounded-lg bg-slate-900 border border-white/15">
        <Search className="w-4 h-4 shrink-0 text-slate-400" aria-hidden="true" />
        <span className="sr-only">Quick solve</span>
        <input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setProblem(null);
          }}
          placeholder="Quick solve: c?a?t"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="search"
          aria-describedby={problem ? id : undefined}
          aria-invalid={problem ? true : undefined}
          className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-slate-400 outline-none"
        />
      </label>
      {problem && (
        <p id={id} role="alert"
           className={`${wide ? 'mt-2' : 'absolute top-full mt-2 right-0 w-72 z-50 shadow-2xl'} rounded-lg border border-white/15 bg-slate-900 px-3 py-2 text-xs text-slate-200`}>
          {problem}
        </p>
      )}
    </form>
  );
}

/** A button that opens a list of links beneath it. A disclosure rather than an
 *  ARIA menu: the items are ordinary links, reached with Tab. */
function DropMenu({ label, items, active, align = 'left', button, extra, top }: {
  label: string;
  items: BarItem[];
  active: boolean;
  align?: 'left' | 'right';
  button?: ReactNode;
  extra?: BarItem;
  /** something above the list: the Solvers menu carries the quick-solve box */
  top?: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const id = useId();
  const close = () => setOpen(false);
  useDismiss(open, close, wrap);
  if (items.length === 0) return null;
  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        aria-label={button ? label : undefined}
        onClick={() => setOpen((o) => !o)}
        className={button ? 'rounded-full' : `inline-flex items-center gap-1.5 h-10 px-3 rounded-lg text-sm font-medium transition-colors ${
          active ? 'bg-white/10 text-white' : 'text-slate-300 hover:text-white hover:bg-white/5'
        }`}
      >
        {button ?? (
          <>
            {label}
            <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
          </>
        )}
      </button>
      {open && (
        <div id={id}
             className={`absolute top-full mt-2 z-50 w-80 max-h-[70vh] overflow-y-auto rounded-xl border border-white/15 bg-slate-900 p-1.5 shadow-2xl ${
               align === 'right' ? 'right-0' : 'left-0'
             }`}>
          {top && <div className="p-1.5 pb-2.5">{top(close)}</div>}
          <ul aria-label={label}>
            {items.map((i) => (
              <li key={i.key}>
                <ItemRow item={i} onPick={close} />
              </li>
            ))}
          </ul>
          {extra && (
            <div className="mt-1 pt-1 border-t border-white/10">
              <ItemRow item={extra} onPick={close} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function YouButton({ you, size }: { you: NonNullable<BarProps['you']>; size: 'sm' | 'md' }) {
  return (
    <span aria-hidden="true"
          className={`inline-flex items-center justify-center rounded-full border border-white/20 bg-slate-900 font-bold text-white ${
            size === 'md' ? 'w-10 h-10 text-sm' : 'w-8 h-8 text-xs'
          }`}>
      {you.initial}
    </span>
  );
}

/** A phone's sheet: the same list, up from the bottom. */
function Sheet({ title, items, extra, top, onClose }: {
  title: string;
  items: BarItem[];
  extra?: BarItem;
  top?: ReactNode;
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useDismiss(true, onClose, panel);
  useEffect(() => {
    panel.current?.querySelector<HTMLElement>('input, a, button:not([aria-label="Close"])')?.focus();
  }, []);
  return (
    <div className="md:hidden fixed inset-0 z-[55] bg-black/50" role="presentation">
      <div ref={panel} role="dialog" aria-modal="true" aria-label={title}
           className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-2xl border-t border-white/15 bg-slate-900 p-3 pb-6 shadow-2xl">
        <div className="flex items-center justify-between px-2 pb-2">
          <h2 className="text-sm font-semibold text-white">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close"
                  className="w-10 h-10 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-white/10">
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
        {top && <div className="px-2 pb-3">{top}</div>}
        <ul aria-label={title}>
          {items.map((i) => (
            <li key={i.key}>
              <ItemRow item={i} onPick={onClose} />
            </li>
          ))}
        </ul>
        {extra && (
          <div className="mt-1 pt-1 border-t border-white/10">
            <ItemRow item={extra} onPick={onClose} />
          </div>
        )}
      </div>
    </div>
  );
}

type Tab = 'games' | 'solvers' | 'me';

export default function SiteBar(p: BarProps) {
  const [sheet, setSheet] = useState<Tab | null>(null);
  const boardsItem: BarItem = { key: 'boards', label: 'All the boards', go: p.boards, icon: <Trophy className="w-4 h-4" /> };
  const meItems: BarItem[] = [
    ...(p.signIn ? [{ key: 'sign-in', label: 'Sign in', go: p.signIn, icon: <UserRound className="w-4 h-4" /> }] : []),
    ...p.me,
  ];
  const navLink = (active: boolean) =>
    `inline-flex items-center h-10 px-3 rounded-lg text-sm font-medium transition-colors ${
      active ? 'bg-white/10 text-white' : 'text-slate-300 hover:text-white hover:bg-white/5'
    }`;
  const meLabel = p.you ? 'You: your stats, settings and account' : 'Your stats and settings';

  return (
    <>
      {/* ---- desktop ---- */}
      <header className="hidden md:block sticky top-0 z-40 h-16 bg-slate-950/90 backdrop-blur border-b border-white/10">
        <div className="max-w-6xl mx-auto h-full px-4 lg:px-6 flex items-center gap-4 lg:gap-6">
          <RouteLink {...p.home} label="Anagrimoire, home" className="flex items-center gap-2.5 shrink-0 rounded-lg">
            <img src="/logo.png" alt="" width={512} height={512} className="w-9 h-9 rounded-lg" />
            <span className="text-lg font-bold tracking-tight text-white whitespace-nowrap">Anagrimoire</span>
          </RouteLink>
          <nav aria-label="Site" className="flex items-center gap-1 min-w-0">
            <RouteLink {...p.home} className={navLink(p.current === 'today')}>Today</RouteLink>
            <DropMenu label="Games" items={p.games} active={p.current === 'games'} extra={boardsItem} />
            {/* The box sits in this menu as well as the bar: below lg the bar
                has no room for it, and this is where someone looking for a
                solver will already be. */}
            <DropMenu label="Solvers" items={p.solvers} active={p.current === 'solvers'}
                      top={p.quickSolve ? (close) => <QuickSolveBox go={p.quickSolve!} onDone={close} wide /> : undefined} />
            <RouteLink {...p.boards} className={navLink(p.current === 'boards')}>Boards</RouteLink>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {p.quickSolve && <div className="hidden lg:block"><QuickSolveBox go={p.quickSolve} /></div>}
            <DropMenu label={meLabel} items={p.me} active={false} align="right"
                      button={p.you ? <YouButton you={p.you} size="md" /> : (
                        // Signed out, stats, settings and keys are still
                        // somebody's: they live in this browser.
                        <span className="w-10 h-10 inline-flex items-center justify-center rounded-full border border-white/15 text-slate-300 hover:text-white">
                          <UserRound className="w-4 h-4" aria-hidden="true" />
                        </span>
                      )} />
            {p.signIn && (
              <RouteLink {...p.signIn}
                         className="inline-flex items-center h-10 px-4 rounded-lg border border-white/20 text-sm font-semibold text-white whitespace-nowrap hover:bg-white/5">
                Sign in
              </RouteLink>
            )}
          </div>
        </div>
      </header>

      {/* ---- phone: the top ---- */}
      <header className="md:hidden sticky top-0 z-40 h-14 bg-slate-950/90 backdrop-blur border-b border-white/10">
        <div className="h-full px-3 flex items-center gap-2">
          <RouteLink {...p.home} label="Anagrimoire, home" className="shrink-0 rounded-lg">
            <img src="/logo.png" alt="" width={512} height={512} className="w-9 h-9 rounded-lg" />
          </RouteLink>
          <div className="flex-1 min-w-0 flex justify-center">
            {p.titleSwitchesGame && p.games.length > 1 ? (
              <button type="button" onClick={() => setSheet('games')} aria-label={`${p.title}: switch game`}
                      className="inline-flex items-center gap-1 max-w-full h-10 px-2 rounded-lg text-base font-semibold text-white">
                <span className="truncate">{p.title}</span>
                <ChevronDown className="w-4 h-4 shrink-0 text-slate-400" aria-hidden="true" />
              </button>
            ) : (
              <span className="truncate text-base font-semibold text-white">{p.title}</span>
            )}
          </div>
          {p.you ? (
            <button type="button" onClick={() => setSheet('me')} aria-label={meLabel} className="shrink-0 rounded-full">
              <YouButton you={p.you} size="sm" />
            </button>
          ) : p.signIn ? (
            <RouteLink {...p.signIn} className="shrink-0 inline-flex items-center h-9 px-3 rounded-lg border border-white/20 text-sm font-semibold text-white">
              Sign in
            </RouteLink>
          ) : <span className="w-9" />}
        </div>
      </header>

      {/* ---- phone: the tabs ---- */}
      {!p.covered && (
      <nav aria-label="Site" className="md:hidden fixed bottom-0 inset-x-0 z-40 h-16 bg-slate-950/95 backdrop-blur border-t border-white/10">
        <ul className="h-full flex">
          <li className="flex-1">
            <RouteLink {...p.home} className={tabClass(p.current === 'today')}>
              <CalendarDays className="w-5 h-5" aria-hidden="true" />
              Today
            </RouteLink>
          </li>
          {p.games.length > 0 && (
            <TabButton label="Games" icon={<LayoutGrid className="w-5 h-5" aria-hidden="true" />} active={p.current === 'games'}
                       onClick={() => setSheet('games')} />
          )}
          {p.solvers.length > 0 && (
            <TabButton label="Solvers" icon={<Search className="w-5 h-5" aria-hidden="true" />} active={p.current === 'solvers'}
                       onClick={() => setSheet('solvers')} />
          )}
          <li className="flex-1">
            <RouteLink {...p.boards} className={tabClass(p.current === 'boards')}>
              <Trophy className="w-5 h-5" aria-hidden="true" />
              Boards
            </RouteLink>
          </li>
          <TabButton label="Me" icon={<UserRound className="w-5 h-5" aria-hidden="true" />} active={false}
                     onClick={() => setSheet('me')} />
        </ul>
      </nav>
      )}

      {sheet === 'games' && <Sheet title="Games" items={p.games} extra={boardsItem} onClose={() => setSheet(null)} />}
      {sheet === 'solvers' && (
        <Sheet title="Solvers" items={p.solvers} onClose={() => setSheet(null)}
               top={p.quickSolve ? <QuickSolveBox go={p.quickSolve} onDone={() => setSheet(null)} wide /> : undefined} />
      )}
      {sheet === 'me' && <Sheet title="You" items={meItems} onClose={() => setSheet(null)} />}
    </>
  );
}

const tabClass = (active: boolean) =>
  `relative h-full w-full flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
    active ? 'text-accent' : 'text-slate-400 hover:text-white'
  }`;

function TabButton({ label, icon, active, onClick }: {
  label: string; icon: ReactNode; active: boolean; onClick: () => void;
}) {
  return (
    <li className="flex-1">
      <button type="button" onClick={onClick} className={tabClass(active)}>
        {icon}
        {label}
      </button>
    </li>
  );
}
