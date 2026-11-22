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
// Then it was a page with a stack of overlays on it: Stats, Settings, Account,
// Legal, About and Keys were panels over the game, and the consent banner could
// open Legal over Settings. Since the layout spec (November 2026; built in
// Amherst Games first) every one of them is a page of its own, so there is one
// thing: the page you are on, and the tab each tabbed page was last left on.

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
  // Pages since the layout spec (November 2026), each with its own address,
  // where they were panels over the game.
  | { kind: 'stats'; tab: StatsTab }
  | { kind: 'panel'; panel: Panel }
  | { kind: 'settings'; tab: SettingsTab }
  | { kind: 'account'; tab: AccountTab }
  | { kind: 'legal'; doc: LegalDoc };

/** The tab each tabbed page was last left on. They remember, and leaving one
 *  does not forget — going back to Stats after visiting Boards shows Boards.
 *  That was an accident of `applyRoute` leaving tab state alone, and it is
 *  worth keeping, so it is stated here instead. */
export type Tabs = {
  stats: StatsTab;
  settings: SettingsTab;
  account: AccountTab;
  legal: LegalDoc;
};

export type Nav = { page: Page; last: Tabs };

/** What the game underneath is showing. App owns this — `mode` is read at
 *  ninety-odd sites and persisted, so it does not move. */
export type GameCtx = { slug: Slug; view: View; daily: boolean };

export const DEFAULT_TABS: Tabs = {
  stats: 'overall',
  settings: 'site',
  account: 'personal',
  legal: 'notices',
};

/** The address, from the state: the page, with the game's details when it is
 *  a game. */
export function routeOf(nav: Nav, game: GameCtx): Route {
  return nav.page.kind === 'game' ? { kind: 'game', ...game } : nav.page;
}

/** What visiting a page teaches the tabs it remembers. */
function remember(last: Tabs, p: Page): Tabs {
  switch (p.kind) {
    case 'stats':
      return { ...last, stats: p.tab };
    case 'settings':
      return { ...last, settings: p.tab };
    case 'account':
      return { ...last, account: p.tab };
    case 'legal':
      return { ...last, legal: p.doc };
    default:
      return last;
  }
}

/** The state, from an address. The other half of the pair, so the two can be
 *  checked against each other rather than trusted to agree.
 *
 *  `friend` is inbound only — it opens the account page on its friends tab and
 *  the address corrects itself, which is why `routeOf` never emits one. */
export function navOf(route: Route, last: Tabs = DEFAULT_TABS): { nav: Nav; game: GameCtx | null } {
  const page = (p: Page): Nav => ({ page: p, last: remember(last, p) });

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
      return { nav: page({ kind: 'panel', panel: route.panel }), game: null };
    case 'stats':
      return { nav: page({ kind: 'stats', tab: route.tab }), game: null };
    case 'settings':
      return { nav: page({ kind: 'settings', tab: route.tab }), game: null };
    case 'account':
      return { nav: page({ kind: 'account', tab: route.tab }), game: null };
    case 'legal':
      return { nav: page({ kind: 'legal', doc: route.doc }), game: null };
    case 'friend':
      return { nav: page({ kind: 'account', tab: 'friends' }), game: null };
  }
}

export type NavAction =
  /** the browser moved first — Back, Forward, or a typed address */
  | { type: 'apply'; route: Route }
  | { type: 'page'; page: Page };

export function navReducer(nav: Nav, action: NavAction): Nav {
  switch (action.type) {
    case 'apply':
      // A route names one place. Tabs are kept: arriving at /stats/boards
      // should not forget which settings tab you were on, and `applyRoute`
      // never did.
      return navOf(action.route, nav.last).nav;
    case 'page':
      return { ...nav, page: action.page, last: remember(nav.last, action.page) };
  }
}
