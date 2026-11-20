// Leaderboards, read through a security-definer function so it can see across
// players while `profiles` itself stays own-rows-only. What comes back is
// names and numbers — never a row, an id, or an email.
//
// Setting a display name is the opt-in. No name, no appearance, and that's the
// default for every account.

import { DAILY_ENV } from '@/dailyData';
import { supabase } from '@/supabase';
import type { DailyState } from '@/dailyStatus';
import { nameOfProgress } from '@/games';
import type { Mode } from '@/storage';
import { difficulty, type Difficulty } from '@/difficulty';

// squares fields one board per size — see the note in leaderboard()
export type BoardGame =
  | 'guess'
  | 'hive'
  | 'scramble'
  | 'grid'
  | 'box'
  | 'weave'
  | 'squares4'
  | 'squares5'
  | 'cryptogram'
  | 'ladder'
  | 'bridge';

export type BoardRow = { name: string; value: number; detail: number | null };
export type Boards = Record<BoardGame, BoardRow[]>;

/** how many days back the board looks, today included */
export const WINDOWS = [
  { days: 1, label: 'Today' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
] as const;

// Which board belongs to which game. Squares fields one per size, so finishing
// it can put you on two.
export const MODE_BOARDS: Record<Mode, BoardGame[]> = {
  pattern: ['guess'],
  bee: ['hive'],
  descramble: ['scramble'],
  grid: ['grid'],
  boxed: ['box'],
  weave: ['weave'],
  squares: ['squares4', 'squares5'],
  ladder: ['ladder'],
  bridge: ['bridge'],
  cryptogram: ['cryptogram'],
};

/** The boards worth showing: the ones for games you finished today.
 *
 *  This used to be a single card picked with find(), which sounds like "the
 *  most interesting board" and behaves like "whichever is first in the object"
 *  — always Guess, since it's listed first and is never empty. So the other
 *  five were unreachable from here no matter what happened on them.
 *
 *  Having played is what makes a board mean anything: a column of strangers'
 *  scores is a table, the same column with your morning in it is a result. If
 *  you haven't played yet there's no such reading, so we fall back to the
 *  busiest board as a taste of what's going on.
 *
 *  Played, not finished. Hive and Weave have no finish line we can see from
 *  here — a hive is over when you say it is — so they report "started" for
 *  ever and asking for "done" left them off the page permanently, however well
 *  you'd scored. Their rows were on the board the whole time. */
export function boardsToShow(boards: Boards, modes: Mode[], status: Record<string, DailyState>): BoardGame[] {
  const mine = modes
    .filter((m) => status[m] === 'done' || status[m] === 'started')
    .flatMap((m) => MODE_BOARDS[m] ?? [])
    .filter((g) => boards[g]?.length);
  if (mine.length) return mine;
  const busiest = (Object.keys(boards) as BoardGame[])
    .filter((g) => boards[g].length)
    .sort((a, b) => boards[b].length - boards[a].length)[0];
  return busiest ? [busiest] : [];
}

export function emptyBoards(): Boards {
  return { guess: [], hive: [], scramble: [], grid: [], box: [], weave: [], squares4: [], squares5: [], cryptogram: [], ladder: [], bridge: [] };
}

/** Global, or just your circle. The two run the same queries server-side, so
 *  a rank means the same thing on either — the scope only decides who's in. */
export type BoardScope = 'global' | 'friends';

/** One board per difficulty. A time on easy and a time on extreme aren't the
 *  same event, so they're never ranked together. */
export async function fetchBoards(
  days: number,
  level: Difficulty = difficulty(),
  scope: BoardScope = 'global'
): Promise<Boards | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.rpc(scope === 'friends' ? 'friends_board' : 'leaderboard', {
      p_days: days,
      p_env: DAILY_ENV,
      p_difficulty: level,
    });
    if (error) throw error;
    const out = emptyBoards();
    for (const game of Object.keys(out) as BoardGame[]) {
      const rows = (data as Record<string, unknown>)?.[game];
      if (Array.isArray(rows)) {
        out[game] = rows
          .filter((r) => r && typeof r.name === 'string')
          .map((r) => ({
            name: String(r.name),
            value: Number(r.value) || 0,
            detail: r.detail === null || r.detail === undefined ? null : Number(r.detail),
          }));
      }
    }
    return out;
  } catch {
    return null;
  }
}

// What the two numbers mean, per game. The function ranks on `value` and
// breaks ties on `detail`, so this is only ever labelling.
export const BOARD_LABELS: Record<
  BoardGame,
  { label: string; value: (n: number) => string; detail: (n: number) => string }
> = {
  guess: {
    label: nameOfProgress('guess'),
    value: (n) => `${n} won`,
    detail: (n) => `best ${n}/6`,
  },
  hive: { label: nameOfProgress('hive'), value: (n) => `${n} pts`, detail: (n) => `${n} day${n === 1 ? '' : 's'}` },
  scramble: {
    label: nameOfProgress('scramble'),
    value: (n) => `${n} pts`,
    detail: (n) => `${n} day${n === 1 ? '' : 's'}`,
  },
  grid: { label: nameOfProgress('grid'), value: (n) => `${n} pts`, detail: (n) => `${n} day${n === 1 ? '' : 's'}` },
  box: {
    label: nameOfProgress('box'),
    value: (n) => `${n} solved`,
    detail: (n) => `best ${n} word${n === 1 ? '' : 's'}`,
  },
  weave: { label: nameOfProgress('weave'), value: (n) => `${n} solved`, detail: () => '' },
  squares4: {
    label: `${nameOfProgress('squares')} (4×4)`,
    value: (n) => `${n} solved`,
    detail: () => '',
  },
  squares5: {
    label: `${nameOfProgress('squares')} (5×5)`,
    value: (n) => `${n} solved`,
    detail: () => '',
  },
  cryptogram: { label: nameOfProgress('cryptogram'), value: (n) => `${n} solved`, detail: () => '' },
  // ranked on boards finished, tie-broken on prompts found — a four-of-five
  // day beats a blank one, and one number cannot say both
  bridge: {
    label: nameOfProgress('bridge'),
    value: (n) => `${n} board${n === 1 ? '' : 's'}`,
    detail: (n) => (n ? `${n} found` : ''),
  },
  // ranked on ladders finished, tie-broken on how many were done in par
  ladder: {
    label: nameOfProgress('ladder'),
    value: (n) => `${n} solved`,
    detail: (n) => (n ? `${n} in par` : ''),
  },
};

// ---------------------------------------------------------------------------
// Display names
// ---------------------------------------------------------------------------

export type NameResult = 'ok' | 'length' | 'characters' | 'blocked' | 'taken' | 'error';

export const NAME_MESSAGES: Record<Exclude<NameResult, 'ok'>, string> = {
  length: 'Between 2 and 24 characters.',
  characters: 'Letters and numbers, with spaces, hyphens or underscores inside.',
  blocked: "That one's not available.",
  taken: 'Someone already has that name.',
  error: "Couldn't save that just now.",
};

export async function setDisplayName(name: string): Promise<NameResult> {
  if (!supabase) return 'error';
  try {
    const { data, error } = await supabase.rpc('set_display_name', { p_name: name });
    if (error) return 'error';
    const known: NameResult[] = ['ok', 'length', 'characters', 'blocked', 'taken'];
    const r = String(data) as NameResult;
    return known.includes(r) ? r : 'error';
  } catch {
    return 'error';
  }
}

export async function fetchDisplayName(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) return null;
    const { data, error } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', sess.session.user.id)
      .maybeSingle();
    if (error) return null;
    return data?.display_name ?? null;
  } catch {
    return null;
  }
}
