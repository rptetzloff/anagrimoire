import { useEffect, useMemo, useRef, useState } from 'react';
import { Grid3x3, Hexagon, KeyRound, LayoutGrid, Puzzle, Shuffle, Square, Table2, X } from 'lucide-react';
import {
  combineStats,
  fetchSyncedStats,
  loadStats,
  SQUARE_STAT_SIZES,
  type StatsStore,
} from '@/stats';
import { formatElapsed } from '@/useUpTimer';
import { useModalA11y } from '@/useModalA11y';
import HistoryView from '@/HistoryView';
import LeaderboardView from '@/LeaderboardView';

import type { StatsTab as StatsView } from '@/routes';
import { store as siteStore } from '@/siteStorage';

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-white/5 border border-white/10 px-3 py-2">
      <p className="text-lg font-bold text-white tabular-nums leading-tight">{value}</p>
      <p className="text-[0.6875rem] text-slate-500">{label}</p>
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
    <div>
      <h3 className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
        <Icon className="w-3.5 h-3.5 text-accent" />
        {title}
      </h3>
      {children}
    </div>
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

export default function StatsModal({
  signedIn,
  view,
  onView,
  onClose,
}: {
  signedIn: boolean;
  /** the open tab, held by App so it can live in the address bar */
  view: StatsView;
  onView: (v: StatsView) => void;
  onClose: () => void;
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

  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(dialogRef, onClose);

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

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Play statistics"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg max-h-[80vh] flex flex-col rounded-2xl bg-slate-900 border border-white/10 text-left shadow-2xl"
      >
        {/* outside the scroll, so it can't slide away mid-read */}
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center rounded-lg bg-slate-900/95 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="overflow-y-auto p-6 sm:p-8">
        <h2 className="text-xl font-bold mb-1">Statistics</h2>
        <p className="text-xs text-slate-500 mb-4">
          {view === 'history' && 'Your dailies, day by day.'}
          {view === 'boards' && 'How everyone who opted in is doing.'}
          {view !== 'history' && view !== 'boards' &&
            syncState === 'local' &&
            'Lifetime totals, stored only in this browser.'}
          {view !== 'history' && view !== 'boards' && syncState === 'loading' && 'Lifetime totals — syncing from your account…'}
          {view !== 'history' && view !== 'boards' && syncState === 'synced' && 'Lifetime totals, synced to your account.'}
          {view !== 'history' && view !== 'boards' && syncState === 'error' &&
            "Couldn't reach your account — showing this browser's totals."}
        </p>

        <div className="mb-5 inline-flex rounded-lg bg-white/5 border border-white/10 p-0.5 gap-0.5">
          {(
            [
              { id: 'overall', label: 'Overall' },
              { id: 'daily', label: 'Daily' },
              { id: 'practice', label: 'Practice' },
              { id: 'history', label: 'History' },
              { id: 'boards', label: 'Boards' },
            ] as const
          ).map(({ id, label }) => (
            <button
              key={id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onView(id)}
              className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-colors
                ${view === id ? 'bg-accent text-slate-950' : 'text-slate-400 hover:text-white'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {view === 'history' && <HistoryView signedIn={signedIn} />}
        {view === 'boards' && <LeaderboardView signedIn={signedIn} />}

        {view !== 'history' && view !== 'boards' && !anyPlay && (
          <p className="text-sm text-slate-400 py-6 text-center">
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
        </div>
      </div>
    </div>
  );
}
