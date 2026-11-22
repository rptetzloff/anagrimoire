// What the address bar should do next, as a function rather than an effect.
//
// This is the subtlest code in the app and it had no tests at all. It decides
// whether a state change pushes a history entry, replaces one, steps back, or
// does nothing — and getting it wrong is invisible until somebody presses Back
// and lands somewhere absurd. Pulling it out of the effect means the decision
// can be enumerated; the effect is left holding only the part that must touch
// `window`.
//
// The memo is the three refs the effect used to keep. They are carried in and
// out rather than mutated, so a test can put the machine in any state without
// rendering anything.

import { pathOf, type Route } from '@/routes';

// There were overlays here once -- panels over the game whose closing stepped
// Back and whose tabs replaced rather than stacked. Every one of them is a
// page since the layout spec (November 2026), so every move is a page's:
// pushed, except over a "/" that was only ever a launcher.

export type HistoryOp =
  | { op: 'none' }
  | { op: 'push'; path: string }
  | { op: 'replace'; path: string };

export type Memo = {
  /** the first render writes nothing */
  settled: boolean;
  /** where we were, for the "leaving home" question */
  prev: Route | null;
};

export const FRESH: Memo = { settled: false, prev: null };

/** Decide what to do about `next`, given where the browser currently is.
 *
 *  `here` is `location.pathname` and `hash` is `location.hash`; both are passed
 *  in rather than read, which is the only reason this is testable. */
export function historyStep(memo: Memo, next: Route, here: string, hash = ''): {
  op: HistoryOp;
  memo: Memo;
} {
  const path = pathOf(next);
  // "/" is a real page when it is the home page, and a placeholder when the
  // start page sends you straight to a game. Leaving the first should be a step
  // you can come back from; overwriting the second is the whole point.
  const leavingHome = memo.prev?.kind === 'home';
  const prev = next;

  // The first render writes nothing: someone who typed "/" keeps the tidy link
  // they typed, and a route asked for by hand is already on screen.
  if (!memo.settled) {
    return { op: { op: 'none' }, memo: { ...memo, settled: true, prev } };
  }

  // Already there. Two ways to arrive here: the browser moved first (Back or
  // Forward, whose listener sets state to match) or nothing that matters
  // changed. The comparison ignores hash and search, so a route differing only
  // in those does nothing -- pinned by test, which the auth-callback cleanup
  // relies on.
  if (path === here) return { op: { op: 'none' }, memo: { ...memo, prev } };

  const op: HistoryOp =
    here === '/' && !leavingHome
      ? { op: 'replace', path: path + hash }
      : { op: 'push', path: path + hash };
  return { op, memo: { ...memo, prev } };
}
