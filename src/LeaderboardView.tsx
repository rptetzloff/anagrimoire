import { useEffect, useState } from 'react';
import { Flag, Grid3x3, Hexagon, KeyRound, LayoutGrid, Puzzle, Shuffle, Square, Table2 } from 'lucide-react';
import { Combine } from 'lucide-react';
import LadderIcon from '@/LadderIcon';
import {
  BOARD_LABELS,
  fetchBoards,
  fetchDisplayName,
  WINDOWS,
  type BoardGame,
  type Boards,
  type BoardScope,
} from '@/leaderboard';
import { formatElapsed } from '@/useUpTimer';
import { difficulty, onDifficultyChange, type Difficulty } from '@/difficulty';
import DifficultyTabs from '@/DifficultyTabs';
import { fetchFriendNames } from '@/friends';
import ReportDialog from '@/ReportDialog';
import { reportPlayer } from '@/reports';

const ICONS: Record<BoardGame, typeof Grid3x3> = {
  guess: Grid3x3,
  hive: Hexagon,
  scramble: Shuffle,
  grid: LayoutGrid,
  box: Square,
  weave: Puzzle,
  squares4: Table2,
  squares5: Table2,
  cryptogram: KeyRound,
  ladder: LadderIcon,
  bridge: Combine,
};

// Order is data, not a listing. As a plain array this silently omitted every
// game added after it was written — ladder and bridge both had boards in the
// database, ranked players on them, and no way to see either. A Record is
// exhaustive, so the compiler asks about the next one.
const ORDER_RANK: Record<BoardGame, number> = {
  guess: 0,
  scramble: 1,
  hive: 2,
  grid: 3,
  box: 4,
  weave: 5,
  squares4: 6,
  squares5: 7,
  cryptogram: 8,
  ladder: 9,
  bridge: 10,
};
const ORDER = (Object.keys(ORDER_RANK) as BoardGame[]).sort((a, b) => ORDER_RANK[a] - ORDER_RANK[b]);

function Board({
  game,
  rows,
  me,
  friends,
  onReport,
}: {
  game: BoardGame;
  rows: Boards[BoardGame];
  me: string | null;
  friends: Set<string>;
  onReport: (name: string) => void;
}) {
  if (!rows.length) return null;
  const { label, value, detail } = BOARD_LABELS[game];
  const Icon = ICONS[game];
  return (
    // Focusable on purpose, though nothing here is clickable: inside a dialog
    // a screen reader speaks what focus lands on, and static text is where
    // focus never lands — Tab went from the toggles straight past every
    // result. No aria-label, so focus reads the card's actual contents.
    <div
      tabIndex={0}
      className="rounded-2xl bg-slate-900 border border-white/10 p-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400/70"
    >
      <h4 className="flex items-center gap-2 text-sm font-semibold text-white mb-2">
        <Icon className="w-3.5 h-3.5 text-accent" />
        {label}
      </h4>
      <ol className="space-y-1">
        {rows.map((r, i) => {
          const mine = me !== null && r.name.toLowerCase() === me.toLowerCase();
          // a word beside the colour, so the distinction survives any palette
          const friend = !mine && friends.has(r.name.toLowerCase());
          return (
            <li
              key={r.name}
              className={`flex items-baseline gap-2 text-sm rounded-md px-2 py-1 ${
                mine
                  ? 'bg-amber-400/10 text-amber-100'
                  : friend
                    ? 'bg-sky-400/10 text-sky-200'
                    : 'text-slate-300'
              }`}
            >
              <span className="w-5 shrink-0 text-xs text-slate-500 tabular-nums">{i + 1}</span>
              <span className="flex-1 min-w-0 truncate font-medium">
                {r.name}
                {friend && <span className="text-xs font-normal text-sky-300/80"> (friend)</span>}
              </span>
              <span className="tabular-nums shrink-0">{value(r.value)}</span>
              {r.detail !== null && (
                <span className="text-xs text-slate-500 tabular-nums shrink-0 hidden sm:inline">
                  {game === 'weave' ||
                  game === 'squares4' ||
                  game === 'squares5' ||
                  game === 'cryptogram'
                    ? formatElapsed(r.detail)
                    : detail(r.detail)}
                </span>
              )}
              {/* Not on your own row — reporting yourself is the one case
                  that can't be what the button is for. Always rendered
                  otherwise rather than revealed on hover: a control that
                  appears only under a pointer is a control a touch screen
                  and a screen reader never find. */}
              {!mine && (
                <button
                  onClick={() => onReport(r.name)}
                  aria-label={`Report ${r.name}`}
                  title={`Report ${r.name}`}
                  className="shrink-0 p-1 -m-1 rounded text-slate-600 hover:text-rose-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent transition-colors"
                >
                  <Flag className="w-3 h-3" aria-hidden="true" />
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export default function LeaderboardView({ signedIn }: { signedIn: boolean }) {
  const [level, setLevel] = useState<Difficulty>(difficulty);
  useEffect(() => onDifficultyChange(() => setLevel(difficulty())), []);
  const [days, setDays] = useState<number>(1);
  const [scope, setScope] = useState<BoardScope>('global');
  const [boards, setBoards] = useState<Boards | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [me, setMe] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setState('loading');
    fetchBoards(days, level, scope).then((b) => {
      if (!alive) return;
      setBoards(b);
      setState(b ? 'ready' : 'error');
    });
    return () => {
      alive = false;
    };
  }, [days, level, scope]);

  // who counts as a friend on these boards; empty when signed out
  const [friends, setFriends] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    fetchDisplayName().then((n) => alive && setMe(n));
    fetchFriendNames().then((f) => alive && setFriends(f));
    return () => {
      alive = false;
    };
  }, [signedIn]);

  const played = boards ? ORDER.filter((g) => boards[g].length) : [];

  // One dialog for the whole view rather than one per row — the boards can
  // run to hundreds of names, and every one of them would otherwise carry a
  // mounted modal waiting to be opened.
  const [reporting, setReporting] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <div
          role="group"
          aria-label="How many days the boards cover"
          className="inline-flex flex-wrap justify-center max-w-full rounded-lg bg-white/5 border border-white/10 p-0.5 gap-0.5"
        >
          {WINDOWS.map((w) => (
            <button
              key={w.days}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setDays(w.days)}
              aria-pressed={days === w.days}
              className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-colors
                ${days === w.days ? 'bg-accent text-slate-950' : 'text-slate-400 hover:text-white'}`}
            >
              {w.label}
            </button>
          ))}
        </div>

        {/* the friends scope needs someone to be — signed out, there's only one board */}
        {signedIn && (
          <div
            role="group"
            aria-label="Whose results the boards show"
            className="inline-flex rounded-lg bg-white/5 border border-white/10 p-0.5 gap-0.5"
          >
            {(['global', 'friends'] as const).map((s) => (
              <button
                key={s}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setScope(s)}
                aria-pressed={scope === s}
                className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-colors
                  ${scope === s ? 'bg-accent text-slate-950' : 'text-slate-400 hover:text-white'}`}
              >
                {s === 'global' ? 'Everyone' : 'Friends'}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <DifficultyTabs value={level} onChange={setLevel} label="Which difficulty's boards" />
      </div>

      {state === 'loading' && <p className="text-sm text-slate-400 py-6 text-center">Loading…</p>}
      {state === 'error' && (
        <p className="text-sm text-slate-400 py-6 text-center">Couldn&apos;t load the boards.</p>
      )}
      {state === 'ready' && !played.length && (
        <p className="text-sm text-slate-400 py-6 text-center">
          {scope === 'friends'
            ? 'Nothing from your circle for this stretch. Invite links live under Account — and your own dailies count here too.'
            : 'Nothing here yet for this stretch. Boards only count players who’ve set a display name.'}
        </p>
      )}

      {reporting && (
        <ReportDialog
          subject="this player"
          detail={`${reporting} — we look the name up ourselves, so it can't be reported as something it isn't.`}
          onSend={(reason, email) => reportPlayer(reporting, reason, email)}
          onClose={() => setReporting(null)}
        />
      )}

      {state === 'ready' && played.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-2 items-start">
          {played.map((g) => (
            <Board key={g} game={g} rows={boards![g]} me={me} friends={friends} onReport={setReporting} />
          ))}
        </div>
      )}

      <p className="text-xs text-slate-500 pt-1">
        {scope === 'friends' ? 'Dailies only, just your circle.' : 'Dailies only, top ten.'}{' '}
        {me === null
          ? 'Set a display name under Account to take part — without one you don’t appear.'
          : `You appear as ${me}.`}{' '}
        Multi-day boards count how often you played as well as how well, so turning up
        counts for something.
      </p>
    </div>
  );
}
