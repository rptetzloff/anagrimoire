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
    const nav: Nav = { page: { kind: 'reportQueue' }, overlays: [], last: DEFAULT_TABS };
    expect(routeOf(nav, ANY_GAME)).toEqual({ kind: 'reportQueue' });
  });

  it('an overlay wins over the page beneath it', () => {
    const nav: Nav = {
      page: { kind: 'home' },
      overlays: [{ kind: 'legal', doc: 'terms' }],
      last: DEFAULT_TABS,
    };
    expect(routeOf(nav, ANY_GAME)).toEqual({ kind: 'legal', doc: 'terms' });
  });

  it('the game underneath is App’s to supply, not the nav’s to remember', () => {
    const nav: Nav = { page: { kind: 'game' }, overlays: [], last: DEFAULT_TABS };
    expect(routeOf(nav, { slug: 'bridge', view: 'solve', daily: false })).toEqual({
      kind: 'game',
      view: 'solve',
      slug: 'bridge',
      daily: false,
    });
  });
});

describe('opening and closing', () => {
  const start: Nav = { page: { kind: 'game' }, overlays: [], last: DEFAULT_TABS };

  it('moving within a panel replaces rather than stacks', () => {
    // otherwise leaving a panel you read three tabs of would take four Backs
    let nav = navReducer(start, { type: 'open', overlay: { kind: 'legal', doc: 'notices' } });
    nav = navReducer(nav, { type: 'open', overlay: { kind: 'legal', doc: 'privacy' } });
    expect(nav.overlays).toHaveLength(1);
    expect(routeOf(nav, ANY_GAME)).toEqual({ kind: 'legal', doc: 'privacy' });
  });

  it('stacks a different kind, which is the consent banner over an open panel', () => {
    // ConsentBanner is z-[70] and the modals are z-[60], so "Read the policy"
    // is clickable over Settings. Closing Legal must put Settings back — this
    // is the reachable state a single Route would lose.
    let nav = navReducer(start, { type: 'open', overlay: { kind: 'settings', tab: 'privacy' } });
    nav = navReducer(nav, { type: 'open', overlay: { kind: 'legal', doc: 'privacy' } });
    expect(nav.overlays).toHaveLength(2);
    expect(routeOf(nav, ANY_GAME)).toEqual({ kind: 'legal', doc: 'privacy' });

    nav = navReducer(nav, { type: 'close' });
    expect(routeOf(nav, ANY_GAME), 'Settings should still be there').toEqual({
      kind: 'settings',
      tab: 'privacy',
    });
  });

  it('remembers the tab a panel was left on', () => {
    let nav = navReducer(start, { type: 'open', overlay: { kind: 'settings', tab: 'privacy' } });
    nav = navReducer(nav, { type: 'close' });
    expect(nav.last.settings).toBe('privacy');
  });

  it('remembers the Stats tab too, now that Stats is a page', () => {
    let nav = navReducer(start, { type: 'page', page: { kind: 'stats', tab: 'boards' } });
    nav = navReducer(nav, { type: 'page', page: { kind: 'home' } });
    expect(nav.last.stats).toBe('boards');
  });

  it('going to a page clears whatever was over it', () => {
    let nav = navReducer(start, { type: 'open', overlay: { kind: 'panel', panel: 'about' } });
    nav = navReducer(nav, { type: 'page', page: { kind: 'home' } });
    expect(nav.overlays).toEqual([]);
    expect(routeOf(nav, ANY_GAME)).toEqual({ kind: 'home' });
  });

  it('closing with nothing open is not an error', () => {
    expect(navReducer(start, { type: 'close' })).toEqual(start);
  });
});

describe('applying an address the browser moved to', () => {
  const onGame: Nav = { page: { kind: 'game' }, overlays: [], last: DEFAULT_TABS };

  it('closes everything the address does not name', () => {
    let nav = navReducer(onGame, { type: 'open', overlay: { kind: 'settings', tab: 'site' } });
    nav = navReducer(nav, { type: 'open', overlay: { kind: 'legal', doc: 'terms' } });
    nav = navReducer(nav, { type: 'apply', route: { kind: 'home' } });
    expect(nav.overlays).toEqual([]);
    expect(nav.page).toEqual({ kind: 'home' });
  });

  it('keeps the page under an overlay it lands on', () => {
    // Back onto /about from a report page should put About over the report
    // page, not over a game nobody asked for
    const onQueue: Nav = { page: { kind: 'reportQueue' }, overlays: [], last: DEFAULT_TABS };
    const nav = navReducer(onQueue, { type: 'apply', route: { kind: 'panel', panel: 'about' } });
    expect(nav.page).toEqual({ kind: 'reportQueue' });
    expect(routeOf(nav, ANY_GAME)).toEqual({ kind: 'panel', panel: 'about' });
  });

  it('does not forget the other panels’ tabs', () => {
    // applyRoute left tab state alone when the route was not that kind, and
    // that is what made panels remember
    let nav = navReducer(onGame, { type: 'page', page: { kind: 'stats', tab: 'boards' } });
    nav = navReducer(nav, { type: 'apply', route: { kind: 'settings', tab: 'games' } });
    expect(nav.last.stats, 'stats tab should survive a trip to settings').toBe('boards');
    expect(nav.last.settings).toBe('games');
  });
});
