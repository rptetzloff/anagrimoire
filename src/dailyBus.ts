// The daily/practice toggle belongs to each game: it persists the choice and
// it draws the switch. But the address bar has to say which board is open, and
// a link — or the Back button — has to be able to ask for the other one.
//
// This is that conversation, and nothing else. The alternative was a prop and
// an imperative handle threaded through every game so App could reach in,
// which is a lot of plumbing for one boolean.

import type { Mode } from '@/storage';

type Report = (mode: Mode, daily: boolean, date: string) => void;

const reporters = new Set<Report>();
const switches = new Map<Mode, (daily: boolean) => void>();

// A game that isn't on screen yet can't be asked anything, and the commonest
// moment to ask is the one click that mounts it — opening a game from the home
// page. So a request with nobody to hear it waits for whoever turns up.
const pending = new Map<Mode, boolean>();

// And the other direction: the last word each game said. A game reports on
// mount, and a child's effects run before its parent's, so the report from
// the game an address opens arrived before App was listening and was lost --
// and it only came again if the board's date changed. A player back for the
// same day's puzzle had no date at all: the page could not say which daily
// it was, and the report menu could not offer the puzzle.
const latest = new Map<Mode, { daily: boolean; date: string }>();

/** A game saying which board it currently has open, and which date that
 *  board carries — the puzzle's own, which is not always today's: a tab left
 *  open past the 3:15 a.m. roll is still showing yesterday. Anything acting on
 *  the board a player is looking at has to use the board's date, not the
 *  clock's. Empty for a practice board, which has no date because it was
 *  never published. */
export function reportDaily(mode: Mode, daily: boolean, date = ''): void {
  latest.set(mode, { daily, date });
  for (const fn of reporters) fn(mode, daily, date);
}

/** App listening for the above, told at once what every game last said.
 *  Returns an unsubscribe. */
export function onDailyReport(fn: Report): () => void {
  reporters.add(fn);
  for (const [mode, r] of latest) fn(mode, r.daily, r.date);
  return () => {
    reporters.delete(fn);
  };
}

/** A game offering to switch boards when an address asks it to. */
export function offerDailySwitch(mode: Mode, fn: (daily: boolean) => void): () => void {
  switches.set(mode, fn);
  if (pending.has(mode)) {
    const wanted = pending.get(mode)!;
    pending.delete(mode);
    fn(wanted);
  }
  return () => {
    // only clear our own: a remount registers the new one before the old
    // one's cleanup runs, and blindly deleting would leave nobody listening
    if (switches.get(mode) === fn) switches.delete(mode);
  };
}

/** An address, or the home page, asking a game to show a particular board.
 *  Held until that game exists if it isn't on screen yet. */
export function requestDaily(mode: Mode, daily: boolean): void {
  const fn = switches.get(mode);
  if (fn) fn(daily);
  else pending.set(mode, daily);
}
