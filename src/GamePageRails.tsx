// The rails either side of a game (the layout spec, November 2026; built in
// Amherst Games first and ported by hand).
//
// Left: the games, the one on screen marked -- the way between them without
// the bar's menu. It lists the side of the site you are on: today's games with
// their state while playing, the solvers while solving, the lessons while
// learning, so a click keeps you on the same side rather than throwing a
// solver back to a daily.
//
// Right, while playing: this game's board at the difficulty being played, top
// three and you, the way to the full boards, and reporting this puzzle. What
// the game itself has to say -- your progress, its hints, sharing -- moves here
// game by game in the next step.
import { useEffect, useState, type ReactNode } from 'react';
import { ArrowRight, Trophy } from 'lucide-react';
import RouteLink from '@/RouteLink';
import GameTile from '@/GameTile';
import { BOARD_LABELS, fetchBoards, fetchDisplayName, type BoardGame, type Boards } from '@/leaderboard';
import { allDailyStatus, type DailyState } from '@/dailyStatus';
import type { Mode } from '@/storage';
import type { Difficulty } from '@/difficulty';
import type { Slug } from '@/games';
import type { Go } from '@/SiteBar';

export type RailGame = {
  key: string;
  slug: Slug;
  label: string;
  current: boolean;
  go: Go;
};

const STATUS_WORD: Record<DailyState, string> = { done: 'Finished', started: 'In progress', none: 'Not started' };
// green done, the accent in progress, as on Home's bar of the day
const STATUS_DOT: Record<DailyState, string> = { done: 'bg-emerald-400', started: 'bg-accent', none: 'bg-white/15' };
const CARD = 'rounded-2xl border border-white/10 bg-slate-900 p-4';
const LABEL = 'text-xs font-semibold text-slate-400 uppercase tracking-wider';

/** The games down the left. `daily` is given only for the daily list, whose
 *  states are read here, and again every few seconds, because the game being played
 *  writes its own save and says nothing to anyone -- the dot beside it would
 *  otherwise stay grey after the first word. */
export function GameRail({ heading, games, daily }: {
  heading: string;
  games: RailGame[];
  /** the games whose daily state to show, keyed as `games` are */
  daily?: Mode[];
}) {
  // keyed on the names, not the array, which is a new one every render
  const dailyKey = daily?.join(',') ?? '';
  const [states, setStates] = useState<Record<string, DailyState>>({});
  const current = games.find((g) => g.current)?.key;
  useEffect(() => {
    if (!dailyKey) return;
    const modes = dailyKey.split(',') as Mode[];
    const read = () => setStates(allDailyStatus(modes));
    read();
    // ten small localStorage reads; cheap enough to repeat, and cheaper than
    // threading a callback through every game
    const t = window.setInterval(read, 3000);
    return () => window.clearInterval(t);
    // `current` too: arriving on another game is when its dot most needs to be right
  }, [dailyKey, current]);

  return (
    <nav aria-label={heading}>
      <h2 className={`${LABEL} px-3 mb-2`}>{heading}</h2>
      <ul className="space-y-0.5">
        {games.map((g) => {
          const state = dailyKey ? (states[g.key] ?? 'none') : null;
          return (
            <li key={g.key}>
              <RouteLink
                {...g.go}
                current={g.current}
                // the state in words beside the dot's colour, as the link's own
                // name: a visually hidden span after the label read as
                // "Hive , In progress" -- it is absolutely positioned, so
                // Chromium counts it a separate box and puts a space before it
                label={state ? `${g.label}, ${STATUS_WORD[state]}` : undefined}
                className={`flex items-center gap-2.5 rounded-lg px-3 h-10 text-sm transition-colors ${
                  g.current ? 'bg-accent text-slate-950 font-semibold' : 'text-slate-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                <GameTile slug={g.slug} size="sm" />
                <span className="flex-1 min-w-0 truncate">{g.label}</span>
                {state && (
                  <span className={`w-2 h-2 rounded-full shrink-0 ${g.current ? 'bg-slate-950' : STATUS_DOT[state]}`} aria-hidden="true" />
                )}
              </RouteLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** This game's board(s) at this difficulty, and what to do about the puzzle. */
export function GameSide({ boards: which, level, levelWord, allBoards, report }: {
  boards: BoardGame[];
  level: Difficulty;
  levelWord: string;
  allBoards: Go;
  /** reporting this puzzle, which knows which puzzle it is */
  report: ReactNode;
}) {
  const [boards, setBoards] = useState<Boards | null>(null);
  // so you can find yourself in the column; null signed out or unnamed
  const [me, setMe] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetchBoards(1, level).then((b) => alive && setBoards(b));
    fetchDisplayName().then((n) => alive && setMe(n));
    return () => {
      alive = false;
    };
  }, [level]);

  return (
    <div className="space-y-4">
      {which.map((g) => {
        const rows = boards?.[g] ?? [];
        const label = BOARD_LABELS[g];
        const mine = me ? rows.findIndex((r) => r.name === me) : -1;
        // your own line, kept when the top three don't include it
        const below = mine >= 3 ? rows[mine] : null;
        return (
          <section key={g} aria-labelledby={`side-${g}`} className={CARD}>
            <h2 id={`side-${g}`} className={`${LABEL} flex items-center gap-2`}>
              <Trophy className="w-3.5 h-3.5 text-accent shrink-0" aria-hidden="true" />
              {label.label} board · {levelWord}
            </h2>
            {boards && rows.length === 0 && (
              <p className="mt-2 text-sm text-slate-400">Nobody has finished this one today. Be first.</p>
            )}
            {rows.length > 0 && (
              <ol className="mt-2 space-y-1">
                {rows.slice(0, 3).map((r, i) => (
                  <li key={r.name} className={`flex items-baseline gap-2 text-sm ${i === mine ? 'text-emerald-300 font-semibold' : 'text-slate-300'}`}>
                    <span className="w-4 shrink-0 text-xs text-slate-500 tabular-nums">{i + 1}</span>
                    <span className="flex-1 min-w-0 truncate">
                      {r.name}
                      {i === mine && <span className="text-xs font-normal"> (you)</span>}
                    </span>
                    <span className="tabular-nums shrink-0">{label.value(r.value)}</span>
                  </li>
                ))}
                {below && (
                  <li className="flex items-baseline gap-2 text-sm text-emerald-300 font-semibold border-t border-white/10 pt-1 mt-1">
                    <span className="w-4 shrink-0 text-xs text-slate-500 tabular-nums">{mine + 1}</span>
                    <span className="flex-1 min-w-0 truncate">{below.name}<span className="text-xs font-normal"> (you)</span></span>
                    <span className="tabular-nums shrink-0">{label.value(below.value)}</span>
                  </li>
                )}
              </ol>
            )}
            <RouteLink {...allBoards} className="mt-3 inline-flex items-center gap-1.5 text-[0.8125rem] font-semibold text-accent hover:underline">
              Full board <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </RouteLink>
          </section>
        );
      })}
      <div>{report}</div>
    </div>
  );
}
