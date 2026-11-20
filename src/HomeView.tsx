// The front page, after the layout spec (November 2026). Until it existed "/"
// meant "wherever you left off", which is not a thing a URL can mean -- it
// rewrote itself the moment anything moved, and a visitor arriving from a
// search result or a shared card landed mid-game with no idea what the site
// was.
//
// A strip saying where you are with today -- the date, how many are done, a
// bar of them and the one to do next -- is the page's heading; the big
// masthead is gone, and the bar carries the name. Then today's puzzles, and
// down the right the boards, the solvers and what stays on your device. On a
// phone the right column follows the puzzles.
//
// Regulars who don't want a lobby can set Settings -> Site -> Start on to a
// game and never see this again.

import { useEffect, useState } from 'react';
import { ArrowRight, Trophy } from 'lucide-react';
import GameTile from '@/GameTile';
import { MODE_SLUG, pathOf, SLUG_NAME, type Slug } from '@/routes';
import { GAME_NAME } from '@/games';
import { difficulty, onDifficultyChange } from '@/difficulty';
import RouteLink from '@/RouteLink';
import DifficultyTabs from '@/DifficultyTabs';
import type { Difficulty } from '@/difficulty';
import { allDailyStatus, todayEt, type DailyState } from '@/dailyStatus';
import { fetchFriendNames } from '@/friends';
import { boardsToShow, fetchBoards, fetchDisplayName, BOARD_LABELS, type Boards } from '@/leaderboard';
import ScrollRow, { RowItem } from '@/ScrollRow';
import type { Go } from '@/SiteBar';
import type { Mode } from '@/storage';

// One line each, written for somebody who has never seen the game.
const BLURB: Record<Slug, string> = {
  guess: 'Guess the hidden word in six tries, one letter of feedback at a time.',
  scramble: 'A rack of letters and a clock. Find as many words as you can before it runs out.',
  hive: 'Seven letters, one compulsory. Build as many words as you can from them.',
  grid: 'A grid of letters against the clock — trace words through neighbouring cells.',
  boxed: 'Twelve letters around a square. Chain words together and use every one.',
  weave: 'Find the words hiding in the board, all on a theme you have to work out.',
  squares: 'Fill the grid so every row and every column spells a word.',
  cryptogram: 'A short passage with every letter swapped for another. Work out which is which.',
  ladder: 'Turn one word into another, changing a single letter at a time.',
  bridge: 'Find the word that joins both sides — SNOW · BALL · ROOM. Five a day.',
};

const NUMBER_WORD: Record<number, string> = {
  1: 'One',
  2: 'Two',
  3: 'Three',
  4: 'Four',
  5: 'Five',
  6: 'Six',
  7: 'Seven',
  8: 'Eight',
  9: 'Nine',
  10: 'Ten',
};

const STATE_LABEL: Record<DailyState, string> = {
  none: 'Not started',
  started: 'In progress',
  done: 'Finished',
};

const STATE_STYLE: Record<DailyState, string> = {
  none: 'text-slate-500',
  started: 'text-amber-300',
  done: 'text-emerald-300',
};

// green done, the accent in progress, as the spec draws the bar
const SEGMENT: Record<DailyState, string> = {
  none: 'bg-white/10',
  started: 'bg-accent',
  done: 'bg-emerald-400',
};

const CARD = 'rounded-2xl border border-white/10 bg-slate-900';
const LABEL = 'text-xs font-semibold text-slate-400 uppercase tracking-wider';

/** The puzzle day's date, which is not the calendar's between midnight and
 *  3am Eastern: it is the day the puzzles on screen belong to. */
function puzzleDay(): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${todayEt()}T12:00:00Z`));
}

export default function HomeView({
  modes,
  onOpen,
  boards,
  solvers,
}: {
  /** the games actually on show, in nav order */
  modes: Mode[];
  onOpen: (mode: Mode) => void;
  /** where "all the boards" goes */
  boards: Go;
  /** each shown game's solver; empty when Solve is hidden */
  solvers: { key: string; label: string; go: Go }[];
}) {
  const [status, setStatus] = useState<Record<string, DailyState>>({});
  useEffect(() => setStatus(allDailyStatus(modes)), [modes]);

  const stateOf = (m: Mode): DailyState => (status[m] as DailyState | undefined) ?? 'none';
  const done = modes.filter((m) => stateOf(m) === 'done').length;
  const started = modes.filter((m) => stateOf(m) === 'started').length;
  // Where to go next: the first game started and not finished, else the first
  // not started; nothing left, the boards.
  const next = modes.find((m) => stateOf(m) === 'started') ?? modes.find((m) => stateOf(m) === 'none') ?? null;
  const count = NUMBER_WORD[modes.length] ?? String(modes.length);

  return (
    <div className="text-left">
      {/* ---- today ---- */}
      <section aria-labelledby="today-heading"
               className={`${CARD} px-5 py-5 sm:px-7 sm:py-6 mb-8 flex flex-col sm:flex-row sm:items-center gap-5`}>
        <div className="min-w-0 flex-1">
          <p className={LABEL}>{puzzleDay()}</p>
          <h1 id="today-heading" className="mt-1.5 text-2xl sm:text-[1.75rem] font-bold text-white text-balance">
            {done === 0 && started === 0
              ? `${count} new puzzles today.`
              : done === modes.length
                ? `All ${modes.length} done. Well played.`
                : `${done} of ${modes.length} done. Keep going.`}
          </h1>
          {/* Counted, not written down: it said six for as long as there were
              seven, because a number in prose doesn't change when the code
              does. Shown before the first move of the day, which is when
              somebody new is reading it; a regular has seen it. */}
          {done === 0 && started === 0 && (
            <p className="mt-2 text-slate-300 max-w-xl">
              {count} word games, a fresh puzzle in each one every morning, and a
              solver behind every game for when you&apos;re properly stuck.
            </p>
          )}
          {modes.length > 0 && (
            <div role="img"
                 aria-label={`${done} of ${modes.length} finished${started ? `, ${started} in progress` : ''}`}
                 className="mt-3 flex gap-1 max-w-[26rem]">
              {modes.map((m) => <span key={m} className={`h-1.5 flex-1 rounded-full ${SEGMENT[stateOf(m)]}`} />)}
            </div>
          )}
        </div>
        {modes.length > 0 && (
          next ? (
            <RouteLink
              to={pathOf({ kind: 'game', view: 'play', slug: MODE_SLUG[next], daily: true })}
              onGo={() => onOpen(next)}
              className="shrink-0 inline-flex items-center justify-center gap-2 h-12 px-6 rounded-xl bg-accent text-slate-950 font-bold hover:brightness-110"
            >
              {stateOf(next) === 'started' ? 'Continue' : 'Play'} {GAME_NAME[next].short}
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </RouteLink>
          ) : (
            <RouteLink
              {...boards}
              className="shrink-0 inline-flex items-center justify-center gap-2 h-12 px-6 rounded-xl bg-accent text-slate-950 font-bold hover:brightness-110"
            >
              See the boards
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </RouteLink>
          )
        )}
      </section>

      <div className="grid gap-8 items-start lg:grid-cols-[minmax(0,1fr)_18.75rem]">
        {/* ---- today's puzzles ---- */}
        <section aria-labelledby="puzzles-heading" className="min-w-0">
          <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
            <h2 id="puzzles-heading" className={LABEL}>Today&apos;s puzzles</h2>
            <span className="text-xs text-slate-500">New each day about 3:15&nbsp;a.m. Eastern</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {modes.map((m) => {
              const slug = MODE_SLUG[m];
              const state = stateOf(m);
              return (
                <RouteLink
                  key={m}
                  to={pathOf({ kind: 'game', view: 'play', slug, daily: true })}
                  onGo={() => onOpen(m)}
                  className={`${CARD} block text-left p-4 hover:border-white/25 transition-colors`}
                >
                  <span className="flex items-start gap-3.5">
                    <GameTile slug={slug} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2 mb-1">
                        <span className="font-semibold text-white">{SLUG_NAME[slug]}</span>
                        <span className={`ml-auto text-xs font-semibold shrink-0 ${STATE_STYLE[state]}`}>
                          {STATE_LABEL[state]}
                        </span>
                      </span>
                      <span className="block text-sm text-slate-400">{BLURB[slug]}</span>
                    </span>
                  </span>
                </RouteLink>
              );
            })}
          </div>
        </section>

        {/* ---- the rail ---- */}
        <aside aria-label="Boards and solvers" className="min-w-0 space-y-4">
          {modes.length > 0 && <BoardsCard modes={modes} status={status} boards={boards} />}
          {solvers.length > 0 && (
            <section aria-labelledby="rail-solvers" className={`${CARD} p-4`}>
              <h2 id="rail-solvers" className={LABEL}>Stuck? Open a solver</h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {solvers.map((s) => (
                  <li key={s.key}>
                    <RouteLink
                      {...s.go}
                      className="inline-flex items-center rounded-full border border-white/20 px-3 py-1.5 text-[0.8125rem] text-slate-300 hover:text-white hover:border-white/40 transition-colors"
                    >
                      {s.label}
                    </RouteLink>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <p className="text-[0.8125rem] leading-relaxed text-slate-400">
            No account needed. Nothing you type into a solver leaves your device.
          </p>
        </aside>
      </div>
    </div>
  );
}

/** Today's boards, a card at a time, the ones you played first. */
function BoardsCard({ modes, status, boards: allBoards }: { modes: Mode[]; status: Record<string, DailyState>; boards: Go }) {
  // what's being looked at, which starts from what's being played
  const [boardLevel, setBoardLevel] = useState<Difficulty>(difficulty);
  useEffect(() => onDifficultyChange(() => setBoardLevel(difficulty())), []);
  const [boards, setBoards] = useState<Boards | null>(null);
  // so you can find yourself in the column; null when signed out or unnamed,
  // which is most people, and the boards read fine without it
  const [me, setMe] = useState<string | null>(null);
  // and your friends in theirs; empty for everyone else
  const [friends, setFriends] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let alive = true;
    fetchBoards(1, boardLevel).then((b) => alive && setBoards(b));
    fetchDisplayName().then((n) => alive && setMe(n));
    fetchFriendNames().then((f) => alive && setFriends(f));
    return () => {
      alive = false;
    };
  }, [boardLevel]);

  // Shown whenever the boards have loaded, not only when this difficulty has
  // entries. Hiding it took the tabs with it, so switching to a difficulty
  // nobody has played left no way back but a reload.
  if (!boards) return null;
  const shown = boardsToShow(boards, modes, status);
  return (
    <section aria-labelledby="rail-boards" className={`${CARD} p-4`}>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <h2 id="rail-boards" className={LABEL}>On the boards</h2>
        <DifficultyTabs value={boardLevel} onChange={setBoardLevel} label="Which difficulty's boards to show" />
      </div>
      {shown.length === 0 ? (
        <p className="text-sm text-slate-400">Nobody has finished a puzzle at this difficulty today. Be first.</p>
      ) : (
        <ScrollRow label="Today's boards">
          {shown.map((g) => {
            const rows = boards[g];
            const label = BOARD_LABELS[g];
            const myIndex = me ? rows.findIndex((r) => r.name === me) : -1;
            // your own line, kept even when the top three don't include it --
            // being 14th is still an answer to "how did I do?"
            const below = myIndex >= 3 ? rows[myIndex] : null;
            return (
              <RowItem key={g} width={shown.length > 1 ? 'w-[85%]' : 'w-full'}>
                <RouteLink
                  {...allBoards}
                  className="block h-full text-left rounded-xl border border-white/10 p-3.5 hover:border-white/25 transition-colors"
                >
                  <span className="flex items-center gap-2 mb-2 text-sm font-semibold text-white">
                    <Trophy className="w-4 h-4 text-accent shrink-0" aria-hidden="true" />
                    {label.label}
                  </span>
                  <ol className="space-y-1">
                    {rows.slice(0, 3).map((r, i) => {
                      // a word beside the colour, same as the (you) marker
                      const friend = i !== myIndex && friends.has(r.name.toLowerCase());
                      return (
                        <li
                          key={r.name}
                          className={`flex items-baseline gap-2 text-sm ${
                            i === myIndex
                              ? 'text-emerald-300 font-semibold'
                              : friend
                                ? 'text-sky-300'
                                : 'text-slate-300'
                          }`}
                        >
                          <span className="w-4 shrink-0 text-xs text-slate-500 tabular-nums">{i + 1}</span>
                          <span className="flex-1 min-w-0 truncate">
                            {r.name}
                            {i === myIndex && <span className="text-xs font-normal"> (you)</span>}
                            {friend && <span className="text-xs font-normal"> (friend)</span>}
                          </span>
                          <span className="tabular-nums shrink-0">{label.value(r.value)}</span>
                        </li>
                      );
                    })}
                    {below && (
                      <li className="flex items-baseline gap-2 text-sm text-emerald-300 font-semibold border-t border-white/10 pt-1 mt-1">
                        <span className="w-4 shrink-0 text-xs text-slate-500 tabular-nums">{myIndex + 1}</span>
                        <span className="flex-1 min-w-0 truncate">
                          {below.name}
                          <span className="text-xs font-normal"> (you)</span>
                        </span>
                        <span className="tabular-nums shrink-0">{label.value(below.value)}</span>
                      </li>
                    )}
                  </ol>
                </RouteLink>
              </RowItem>
            );
          })}
        </ScrollRow>
      )}
      <p className="mt-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <RouteLink {...allBoards} className="text-[0.8125rem] font-semibold text-accent hover:underline">
          All boards →
        </RouteLink>
        {!me && <span className="text-xs text-slate-500">Set a display name to take part.</span>}
      </p>
    </section>
  );
}
