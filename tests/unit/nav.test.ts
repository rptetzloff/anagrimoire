// The law that replaces hand-checking: routeOf and navOf are inverses.
//
// They used to be `currentRoute` and `applyRoute`, written separately, and
// nothing checked they agreed. That is how a route kind came to exist in one
// and not the other — `/reports` rendered correctly and then rewrote its own
// address to the game underneath, because the reading half knew about report
// pages and the writing half did not.
//
// A round trip over every enumerated address is the whole test. If a kind is
// added to one side only, this fails before anyone has to notice.
import { describe, expect, it } from 'vitest';
import { ALL_SLUGS, ALL_VIEWS } from '@/games';
import {
  ACCOUNT_TABS,
  DOCS,
  PANELS,
  SETTINGS_TABS,
  STATS_TABS,
  type Route,
} from '@/routes';
import {
  DEFAULT_TABS,
  navOf,
  navReducer,
  routeOf,
  type GameCtx,
  type Nav,
} from '@/routing/nav';

const ANY_GAME: GameCtx = { slug: 'hive', view: 'play', daily: true };

/** Everything routeOf can produce. `friend` is left out on purpose: it is an
 *  inbound-only address that resolves to the account panel, so it has no
 *  round trip and never appears in the bar. */
const EVERY_ROUTE: Route[] = [
  { kind: 'home' },
  { kind: 'reportQueue' },
  { kind: 'ticket', ticket: '4f2ba9c17d' },
  { kind: 'reportAction', id: 'b0a1', token: 'deadbeef', action: 'dismiss' },
  ...PANELS.map((panel) => ({ kind: 'panel', panel }) as const),
  ...DOCS.map((doc) => ({ kind: 'legal', doc }) as const),
  ...STATS_TABS.map((tab) => ({ kind: 'stats', tab }) as const),
  ...SETTINGS_TABS.map((tab) => ({ kind: 'settings', tab }) as const),
  ...ACCOUNT_TABS.map((tab) => ({ kind: 'account', tab }) as const),
  ...ALL_SLUGS.flatMap((slug) =>
    ALL_VIEWS.map((view) => ({ kind: 'game', view, slug, daily: view === 'play' }) as const)
  ),
];

describe('the two halves are inverses', () => {
  it('every address survives becoming state and coming back', () => {
    for (const r of EVERY_ROUTE) {
      const { nav, game } = navOf(r);
      expect(routeOf(nav, game ?? ANY_GAME), `for ${r.kind}`).toEqual(r);
    }
  });

  it('a friend link resolves to the account panel, and stays there', () => {
    const { nav } = navOf({ kind: 'friend', code: '61e45286c813' });
    expect(routeOf(nav, ANY_GAME)).toEqual({ kind: 'account', tab: 'friends' });
  });

  it('a page with nothing over it is the address', () => {
    const nav: Nav = { page: { kind: 'reportQueue' }, last: DEFAULT_TABS };
    expect(routeOf(nav, ANY_GAME)).toEqual({ kind: 'reportQueue' });
  });

  it('the game underneath is App’s to supply, not the nav’s to remember', () => {
    const nav: Nav = { page: { kind: 'game' }, last: DEFAULT_TABS };
    expect(routeOf(nav, { slug: 'bridge', view: 'solve', daily: false })).toEqual({
      kind: 'game',
      view: 'solve',
      slug: 'bridge',
      daily: false,
    });
  });
});

describe('going places', () => {
  const start: Nav = { page: { kind: 'game' }, last: DEFAULT_TABS };

  it('every former panel is a page with its own address', () => {
    for (const page of [
      { kind: 'panel', panel: 'about' },
      { kind: 'panel', panel: 'keys' },
      { kind: 'settings', tab: 'games' },
      { kind: 'account', tab: 'friends' },
      { kind: 'legal', doc: 'terms' },
      { kind: 'stats', tab: 'history' },
    ] as const) {
      const nav = navReducer(start, { type: 'page', page });
      expect(routeOf(nav, ANY_GAME)).toEqual(page);
    }
  });

  it('remembers the tab each tabbed page was left on', () => {
    let nav = navReducer(start, { type: 'page', page: { kind: 'settings', tab: 'privacy' } });
    nav = navReducer(nav, { type: 'page', page: { kind: 'legal', doc: 'terms' } });
    nav = navReducer(nav, { type: 'page', page: { kind: 'stats', tab: 'boards' } });
    nav = navReducer(nav, { type: 'page', page: { kind: 'home' } });
    expect(nav.last).toMatchObject({ settings: 'privacy', legal: 'terms', stats: 'boards' });
  });
});

describe('applying an address the browser moved to', () => {
  const onGame: Nav = { page: { kind: 'game' }, last: DEFAULT_TABS };

  it('goes where the address says', () => {
    const nav = navReducer(onGame, { type: 'apply', route: { kind: 'legal', doc: 'privacy' } });
    expect(nav.page).toEqual({ kind: 'legal', doc: 'privacy' });
  });

  it('does not forget the other pages’ tabs', () => {
    // applyRoute left tab state alone when the route was not that kind, and
    // that is what made them remember
    let nav = navReducer(onGame, { type: 'page', page: { kind: 'stats', tab: 'boards' } });
    nav = navReducer(nav, { type: 'apply', route: { kind: 'settings', tab: 'games' } });
    expect(nav.last.stats, 'stats tab should survive a trip to settings').toBe('boards');
    expect(nav.last.settings).toBe('games');
  });
});
