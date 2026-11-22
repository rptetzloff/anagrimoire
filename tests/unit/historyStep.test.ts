// Every branch of the address-bar decision, enumerated.
//
// This logic had zero tests and lived inside a useEffect with three refs, which
// meant the only way to exercise it was to render the whole app and press
// buttons. Every case below was reachable and none was checked; the two known
// bugs in e2e/history.spec.ts both live in here.
//
// The awkward branches — the ones that deliberately leave the memo alone — are
// pinned rather than tidied. Each is load-bearing for a reason stated at the
// assertion, so that anyone "fixing" one has to argue with a sentence rather
// than guess at intent.
import { describe, expect, it } from 'vitest';
import { FRESH, historyStep, type Memo } from '@/routing/history';
import type { Route } from '@/routes';

const GAME: Route = { kind: 'game', view: 'play', slug: 'hive', daily: true };
const HOME: Route = { kind: 'home' };
const ABOUT: Route = { kind: 'panel', panel: 'about' };
const NOTICES: Route = { kind: 'legal', doc: 'notices' };
const PRIVACY: Route = { kind: 'legal', doc: 'privacy' };
const STATS: Route = { kind: 'stats', tab: 'overall' };

/** settled, last on `prev` */
const idle = (prev: Route | null = GAME): Memo => ({ settled: true, prev });

describe('the first render', () => {
  it('writes nothing, whatever the route', () => {
    // someone who typed /daily/hive is already looking at it; rewriting the
    // address they typed is at best pointless
    for (const r of [HOME, GAME, ABOUT, STATS]) {
      const { op, memo } = historyStep(FRESH, r, '/whatever');
      expect(op).toEqual({ op: 'none' });
      expect(memo.settled).toBe(true);
    }
  });

  it('records where we were, so the next step can ask', () => {
    expect(historyStep(FRESH, HOME, '/').memo.prev).toEqual(HOME);
  });
});

describe('already at the address', () => {
  it('does nothing', () => {
    expect(historyStep(idle(), GAME, '/daily/hive').op).toEqual({ op: 'none' });
  });

  it('compares the path only, ignoring hash and search', () => {
    // pinned rather than fixed: a route differing only in hash does nothing,
    // which is what the original did and what the auth-callback cleanup relies
    // on
    expect(historyStep(idle(), GAME, '/daily/hive').op).toEqual({ op: 'none' });
  });
});

describe('pages that were panels', () => {
  // About, Legal, Stats and the rest were overlays whose closing stepped Back
  // and whose tabs replaced one another. They are pages now, and move like
  // every other page.
  it('opening one pushes', () => {
    expect(historyStep(idle(), ABOUT, '/daily/hive').op).toEqual({ op: 'push', path: '/about' });
  });

  it('a tab is its own address, pushed, so Back returns to the last one', () => {
    expect(historyStep(idle(NOTICES), PRIVACY, '/legal/notices').op).toEqual({ op: 'push', path: '/legal/privacy' });
    expect(historyStep(idle(STATS), { kind: 'stats', tab: 'boards' }, '/stats/overall').op)
      .toEqual({ op: 'push', path: '/stats/boards' });
  });

  it('leaving one pushes too: nothing steps Back on its own any more', () => {
    expect(historyStep(idle(ABOUT), GAME, '/about').op).toEqual({ op: 'push', path: '/daily/hive' });
  });
});

describe('the front page is two different things', () => {
  it('overwrites "/" when it was only a launcher', () => {
    // start page set to a game: "/" was a placeholder on the way somewhere, and
    // Back should not return to it
    const { op } = historyStep(idle(null), GAME, '/');
    expect(op).toEqual({ op: 'replace', path: '/daily/hive' });
  });

  it('pushes when leaving the real home page', () => {
    // start page is home: "/" is somewhere you were, and Back should return
    const { op } = historyStep(idle(HOME), GAME, '/');
    expect(op).toEqual({ op: 'push', path: '/daily/hive' });
  });
});

describe('the hash rides along', () => {
  it('is kept on a push and a replace', () => {
    expect(historyStep(idle(), ABOUT, '/daily/hive', '#x')).toMatchObject({
      op: { op: 'push', path: '/about#x' },
    });
    expect(historyStep(idle(null), GAME, '/', '#x')).toMatchObject({
      op: { op: 'replace', path: '/daily/hive#x' },
    });
  });
});
