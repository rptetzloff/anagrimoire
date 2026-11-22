// Where the app is, as one value instead of nine booleans.
//
// It was nine `useState`s and a priority ladder: legal beats stats beats
// settings beats account beats panel beats the report pages beats home beats
// the game. Nothing stopped two of them being true at once, and the ladder
// picked a winner — which meant the address depended on an order written in one
// place and the rendering on booleans read in twenty. The report pages were
// added to the rendering and left out of the ladder, so `/reports` drew
// correctly and then rewrote the address to the game underneath it.
//
// Two fields instead. A **page** is where you are; an **overlay** is something
// laid over it. The address is the top of the stack, or the page if there is
// nothing on it — so there is no ladder with a rung to forget, and a new kind
// of page cannot be omitted from a list it does not appear in.
//
// Not one `Route`, though, which would be tidier and wrong: `ConsentBanner` is
// `z-[70]` over the modals' `z-[60]`, so "Read the policy" opens Legal *over* an
// open Settings and closing Legal puts Settings back. Collapsing to a single
// route makes that state unrepresentable and loses the Settings modal silently.
// A stack keeps it.

import type {
  AccountTab,
  LegalDoc,
  Panel,
  Route,
  SettingsTab,
  Slug,
  StatsTab,
  View,
} from '@/routes';

export type Page =
  | { kind: 'home' }
  /** which game, and how, is App's business — see GameCtx */
  | { kind: 'game' }
  | { kind: 'ticket'; ticket: string }
  | { kind: 'reportAction'; id: string; token: string; action: string }
  | { kind: 'reportQueue' }
  // A page since the layout spec (November 2026), under Boards, rather than a
  // panel over the game: it is where you go to read, not a glance.
  | { kind: 'stats'; tab: StatsTab };

export type Overlay =
  | { kind: 'panel'; panel: Panel }
  | { kind: 'settings'; tab: SettingsTab }
  | { kind: 'account'; tab: AccountTab }
  | { kind: 'legal'; doc: LegalDoc };

/** The tab each panel was last left on. Panels remember, and closing one does
 *  not forget — reopening Stats after visiting Boards shows Boards. That was an
 *  accident of `applyRoute` leaving tab state alone, and it is worth keeping,
 *  so it is stated here instead. */
export type Tabs = {
  stats: StatsTab;
  settings: SettingsTab;
  account: AccountTab;
  legal: LegalDoc;
};

export type Nav = { page: Page; overlays: Overlay[]; last: Tabs };

/** What the game underneath is showing. App owns this — `mode` is read at
 *  ninety-odd sites and persisted, so it does not move. */
export type GameCtx = { slug: Slug; view: View; daily: boolean };

export const DEFAULT_TABS: Tabs = {
  stats: 'overall',
  settings: 'site',
  account: 'personal',
  legal: 'notices',
};

/** The address, from the state. Two lines and total: whatever is on top, or the
 *  page if nothing is. */
export function routeOf(nav: Nav, game: GameCtx): Route {
  const top = nav.overlays[nav.overlays.length - 1];
  if (top) return top;
  return nav.page.kind === 'game' ? { kind: 'game', ...game } : nav.page;
}

/** The state, from an address. The other half of the pair, so the two can be
 *  checked against each other rather than trusted to agree.
 *
 *  `friend` is inbound only — it opens the account panel on its friends tab and
 *  the address corrects itself, which is why `routeOf` never emits one. */
export function navOf(route: Route, last: Tabs = DEFAULT_TABS): { nav: Nav; game: GameCtx | null } {
  const page = (p: Page): Nav => ({ page: p, overlays: [], last });
  const over = (o: Overlay, tabs: Tabs): Nav => ({ page: { kind: 'game' }, overlays: [o], last: tabs });

  switch (route.kind) {
    case 'home':
      return { nav: page({ kind: 'home' }), game: null };
    case 'game':
      return {
        nav: page({ kind: 'game' }),
        game: { slug: route.slug, view: route.view, daily: route.daily },
      };
    case 'ticket':
      return { nav: page({ kind: 'ticket', ticket: route.ticket }), game: null };
    case 'reportAction':
      return {
        nav: page({ kind: 'reportAction', id: route.id, token: route.token, action: route.action }),
        game: null,
      };
    case 'reportQueue':
      return { nav: page({ kind: 'reportQueue' }), game: null };
    case 'panel':
      return { nav: over({ kind: 'panel', panel: route.panel }, last), game: null };
    case 'stats':
      return {
        nav: { page: { kind: 'stats', tab: route.tab }, overlays: [], last: { ...last, stats: route.tab } },
        game: null,
      };
    case 'settings':
      return {
        nav: over({ kind: 'settings', tab: route.tab }, { ...last, settings: route.tab }),
        game: null,
      };
    case 'account':
      return {
        nav: over({ kind: 'account', tab: route.tab }, { ...last, account: route.tab }),
        game: null,
      };
    case 'legal':
      return { nav: over({ kind: 'legal', doc: route.doc }, { ...last, legal: route.doc }), game: null };
    case 'friend':
      return { nav: over({ kind: 'account', tab: 'friends' }, { ...last, account: 'friends' }), game: null };
  }
}

export type NavAction =
  /** the browser moved first — Back, Forward, or a typed address */
  | { type: 'apply'; route: Route }
  /** open one, or move within the one already open */
  | { type: 'open'; overlay: Overlay }
  /** close the top one */
  | { type: 'close' }
  | { type: 'page'; page: Page };

function remember(last: Tabs, o: Overlay): Tabs {
  switch (o.kind) {
    case 'settings':
      return { ...last, settings: o.tab };
    case 'account':
      return { ...last, account: o.tab };
    case 'legal':
      return { ...last, legal: o.doc };
    case 'panel':
      return last;
  }
}

export function navReducer(nav: Nav, action: NavAction): Nav {
  switch (action.type) {
    case 'apply': {
      // A route names one place, so everything else closes. Tabs are kept:
      // arriving at /stats/boards should not forget which settings tab you were
      // on, and `applyRoute` never did.
      const { nav: next } = navOf(action.route, nav.last);
      // an inbound route says nothing about the game underneath an overlay, so
      // the page it lands on keeps whatever was there
      return next.overlays.length ? { ...next, page: nav.page } : next;
    }
    case 'open': {
      const last = remember(nav.last, action.overlay);
      const top = nav.overlays[nav.overlays.length - 1];
      // Moving within a panel replaces rather than stacks, so leaving takes one
      // Back and not one per tab read. Stacking a *different* kind is what the
      // consent banner does over an open Settings.
      const rest = top?.kind === action.overlay.kind ? nav.overlays.slice(0, -1) : nav.overlays;
      return { ...nav, overlays: [...rest, action.overlay], last };
    }
    case 'close':
      return { ...nav, overlays: nav.overlays.slice(0, -1) };
    case 'page':
      // going somewhere clears what was laid over it; Stats remembers its tab
      // the way the panels do
      return {
        ...nav,
        page: action.page,
        overlays: [],
        last: action.page.kind === 'stats' ? { ...nav.last, stats: action.page.tab } : nav.last,
      };
  }
}
