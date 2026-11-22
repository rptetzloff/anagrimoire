import { useEffect, useMemo, useState } from 'react';
import { Grid3x3, Hexagon, KeyRound, LayoutGrid, Puzzle, Shuffle, Square, Table2 } from 'lucide-react';
import {
  combineStats,
  fetchSyncedStats,
  loadStats,
  SQUARE_STAT_SIZES,
  type StatsStore,
} from '@/stats';
import { formatElapsed } from '@/useUpTimer';
import PageWithRail, { PageTabs, RailCard } from '@/PageWithRail';
import HistoryView from '@/HistoryView';
import LeaderboardView from '@/LeaderboardView';

import type { StatsTab as StatsView } from '@/routes';
import { store as siteStore } from '@/siteStorage';

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-slate-900 border border-white/10 px-3 py-2.5">
      <p className="text-xl font-bold text-white tabular-nums leading-tight">{value}</p>
      <p className="text-xs text-slate-400">{label}</p>
    </div>
  );
}

function Section({
  Icon,
  title,
  children,
}: {
  Icon: typeof Grid3x3;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title}>
      <h2 className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
        <Icon className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
        {title}
      </h2>
      {children}
    </section>
  );
}

function pct(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((100 * part) / whole)}%` : '—';
}

function avg(total: number, count: number): string {
  return count > 0 ? String(Math.round(total / count)) : '—';
}

function time(ms: number | null): string {
  return ms === null ? '—' : formatElapsed(ms);
}

const TABS = [
  { id: 'overall', label: 'Overall' },
  { id: 'daily', label: 'Daily' },
  { id: 'practice', label: 'Practice' },
  { id: 'history', label: 'History' },
  { id: 'boards', label: 'Boards' },
] as const;

/** Your stats and everybody's boards: a page under Boards (the layout spec,
 *  November 2026). It was a panel over the game; reading a season's numbers
 *  is not a glance, and the boards want the width. */
export default function StatsPage({
  signedIn,
  view,
  tabLink,
}: {
  signedIn: boolean;
  /** the open tab, which is the address */
  view: StatsView;
  tabLink: (v: StatsView) => { to: string; onGo: () => void };
}) {
  const [localStore] = useState(loadStats);
  const [synced, setSynced] = useState<StatsStore | null>(null);
  const [syncState, setSyncState] = useState<'local' | 'loading' | 'synced' | 'error'>(
    signedIn ? 'loading' : 'local'
  );

  // signed in: replace the local view with baseline + event-log replay
  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    fetchSyncedStats().then((s) => {
      if (!alive) return;
      if (s) {
        setSynced(s);
        setSyncState('synced');
      } else {
        setSyncState('error');
      }
    });
    return () => {
      alive = false;
    };
  }, [signedIn]);

  const store = synced ?? localStore;
  const stats = useMemo(
    () =>
      view === 'overall' || view === 'history' || view === 'boards'
        ? combineStats(store.daily, store.practice)
        : store[view],
    [store, view]
  );

  // Guess's daily streak lives in the play store, maintained by GuessGame
  const [streak] = useState(() => {
    try {
      return Number(JSON.parse(siteStore.getItem('anagrimoire:play:v1') ?? '{}')?.stats?.streak) || 0;
    } catch {
      return 0;
    }
  });

  const maxDist = Math.max(1, ...stats.guess.dist);
  const anyPlay =
    stats.guess.played +
      stats.hive.words +
      stats.scramble.sprints +
      stats.grid.sprints +
      stats.box.solved +
      stats.weave.solved +
      stats.weave.revealed +
      SQUARE_STAT_SIZES.reduce(
        (t, k) => t + stats.squares[k].solved + stats.squares[k].revealed,
        0
      ) +
      stats.cryptogram.solved +
      stats.cryptogram.revealed >
    0;

  const totals = view !== 'history' && view !== 'boards';
  const blurb =
    view === 'history' ? 'Your dailies, day by day.'
    : view === 'boards' ? 'How everyone who opted in is doing.'
    : syncState === 'local' ? 'Lifetime totals, stored only in this browser.'
    : syncState === 'loading' ? 'Lifetime totals — syncing from your account…'
    : syncState === 'synced' ? 'Lifetime totals, synced to your account.'
    : "Couldn't reach your account — showing this browser's totals.";
  // A glance down every game, beside the detail: how much of each you have
  // played, so the long page below has a map. Ladder and Bridge are here
  // although the page has no section for them yet: stats.ts records both.
  const byGame: [string, number, string][] = [
    ['Guess the Word', stats.guess.played, 'played'],
    ['Hive', stats.hive.words, 'words'],
    ['Scramble', stats.scramble.sprints, 'sprints'],
    ['Grid', stats.grid.sprints, 'sprints'],
    ['Boxed', stats.box.solved, 'solved'],
    ['Word Squares', SQUARE_STAT_SIZES.reduce((t, k) => t + stats.squares[k].solved, 0), 'solved'],
    ['Weave', stats.weave.solved, 'solved'],
    ['Cryptogram', stats.cryptogram.solved, 'solved'],
    ['Word Ladder', stats.ladder.solved, 'solved'],
    ['Bridge', stats.bridge.found, 'found'],
  ];

  return (
    <PageWithRail
      section="Boards"
      title={view === 'boards' ? 'The boards' : 'Your stats'}
      blurb={blurb}
      wide={view === 'boards'}
      rail={
        totals && anyPlay ? (
          <RailCard label="By game">
            <ul className="divide-y divide-white/10 -my-1.5">
              {byGame.map(([name, n, what]) => (
                <li key={name} className="py-1.5 flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-slate-200">{name}</span>
                  <span className="text-slate-400 tabular-nums">{n} {what}</span>
                </li>
              ))}
            </ul>
          </RailCard>
        ) : undefined
      }
    >
        <PageTabs label="Stats" tabs={TABS} current={view} link={tabLink} />

        {view === 'history' && <HistoryView signedIn={signedIn} />}
        {view === 'boards' && <LeaderboardView signedIn={signedIn} />}

        {view !== 'history' && view !== 'boards' && !anyPlay && (
          <p className="text-sm text-slate-400">
            {view === 'overall'
              ? 'Nothing recorded yet — finish a game in any Play mode and it lands here.'
              : `No ${view} games recorded yet.`}
          </p>
        )}

        {view !== 'history' && view !== 'boards' && anyPlay && (
          <div className="space-y-6">
            <Section Icon={Grid3x3} title="Guess the word">
              <div className="grid grid-cols-4 gap-2">
                <Stat label="Played" value={stats.guess.played} />
                <Stat label="Win rate" value={pct(stats.guess.won, stats.guess.played)} />
                {view === 'practice' ? (
                  <Stat label="Won" value={stats.guess.won} />
                ) : (
                  <Stat label="Daily streak" value={streak} />
                )}
                <Stat label="Fastest win" value={time(stats.guess.bestTimeMs)} />
              </div>
              {stats.guess.won > 0 && (
                <div className="mt-2.5 space-y-1">
                  {stats.guess.dist.map((n, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs tabular-nums">
                      <span className="w-3 text-slate-500">{i + 1}</span>
                      <div className="flex-1 h-4 rounded bg-white/[0.03]">
                        {n > 0 && (
                          <div
                            className="h-4 rounded bg-emerald-400/40 border border-emerald-400/50 flex items-center justify-end px-1.5 text-[0.625rem] text-emerald-100 min-w-fit"
                            style={{ width: `${(100 * n) / maxDist}%` }}
                          >
                            {n}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Section Icon={Hexagon} title="Hive">
              <div className="grid grid-cols-4 gap-2">
                <Stat label="Words found" value={stats.hive.words} />
                <Stat label="Pangrams" value={stats.hive.pangrams} />
                <Stat label="Genius" value={stats.hive.genius} />
                <Stat label="Queen Bee" value={stats.hive.queenBee} />
              </div>
            </Section>

            <Section Icon={Shuffle} title="Scramble sprints">
              <div className="grid grid-cols-4 gap-2">
                <Stat label="Sprints" value={stats.scramble.sprints} />
                <Stat label="Best score" value={stats.scramble.bestScore} />
                <Stat label="Avg score" value={avg(stats.scramble.totalScore, stats.scramble.sprints)} />
                <Stat label="Words found" value={stats.scramble.words} />
              </div>
            </Section>

            <Section Icon={LayoutGrid} title="Grid sprints">
              <div className="grid grid-cols-4 gap-2">
                <Stat label="Sprints" value={stats.grid.sprints} />
                <Stat label="Best score" value={stats.grid.bestScore} />
                <Stat label="Avg score" value={avg(stats.grid.totalScore, stats.grid.sprints)} />
                <Stat label="Words found" value={stats.grid.words} />
              </div>
            </Section>

            <Section Icon={Square} title="Boxed">
              <div className="grid grid-cols-4 gap-2">
                <Stat label="Solved" value={stats.box.solved} />
                <Stat label="Fewest words" value={stats.box.fewestWords ?? '—'} />
                <Stat label="Best time" value={time(stats.box.bestTimeMs)} />
                <Stat
                  label="Avg words"
                  value={
                    stats.box.solved > 0
                      ? (stats.box.totalWords / stats.box.solved).toFixed(1)
                      : '—'
                  }
                />
              </div>
            </Section>

            {SQUARE_STAT_SIZES.map((k) => (
              <Section key={k} Icon={Table2} title={`Word squares (${k}×${k})`}>
                <div className="grid grid-cols-4 gap-2">
                  <Stat label="Solved" value={stats.squares[k].solved} />
                  <Stat label="Revealed" value={stats.squares[k].revealed} />
                  <Stat label="Best time" value={time(stats.squares[k].bestTimeMs)} />
                  <Stat
                    label="Avg time"
                    value={
                      stats.squares[k].solved > 0
                        ? formatElapsed(
                            Math.round(stats.squares[k].totalTimeMs / stats.squares[k].solved)
                          )
                        : '—'
                    }
                  />
                </div>
              </Section>
            ))}

            <Section Icon={Puzzle} title="Weave">
              <div className="grid grid-cols-4 gap-2">
                <Stat label="Solved" value={stats.weave.solved} />
                <Stat label="Revealed" value={stats.weave.revealed} />
                <Stat label="Best time" value={time(stats.weave.bestTimeMs)} />
                <Stat label="Hints used" value={stats.weave.hintsUsed} />
              </div>
            </Section>

            <Section Icon={KeyRound} title="Cryptogram">
              {/* no streak tile: a streak is counted off puzzle dates, which
                  only the history view has */}
              <div className="grid grid-cols-4 gap-2">
                <Stat label="Solved" value={stats.cryptogram.solved} />
                <Stat label="Revealed" value={stats.cryptogram.revealed} />
                <Stat label="Best time" value={time(stats.cryptogram.bestTimeMs)} />
                <Stat
                  label="Avg time"
                  value={
                    stats.cryptogram.solved > 0
                      ? formatElapsed(
                          Math.round(stats.cryptogram.totalTimeMs / stats.cryptogram.solved)
                        )
                      : '—'
                  }
                />
              </div>
            </Section>
          </div>
        )}
    </PageWithRail>
  );
}
