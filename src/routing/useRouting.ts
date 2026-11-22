// Where the app is, and the two effects that keep the address bar honest.
//
// Everything here used to sit in the middle of App.tsx: nine `useState`s, a
// priority ladder, three refs, a thirty-line effect and a seventeen-setter
// reducer, interleaved with word lists and solver state. Extracting it is the
// point of the exercise — not because the file was long, but because this is
// where the troubleshooting kept landing, and because none of it could be
// reached from a test without rendering the whole application.
//
// What stays in App: `mode`, `learnMode`, the ten play flags and `dailyByMode`.
// `mode` alone is read at ninety-odd sites and persisted; moving it would drag
// half the file with it. So the split is *page and overlay identity* here,
// *which game and which view* there.
//
// Two hooks rather than one, and the reason is ordering rather than taste. The
// nav state has to exist early — modal focus handling reads it a thousand lines
// before `currentView` and `dailyByMode` are computed — while the address is
// not knowable until those exist. One hook would have to be called twice or
// take a ref and lie about its dependencies. Two hooks say the truth: the state
// is one thing, the browser is another, and the address joins them.

import { useEffect, useReducer, useRef } from 'react';
import { parsePath, pathOf, titleOf, type Route } from '@/routes';
import { FRESH, historyStep } from '@/routing/history';
import {
  navOf,
  navReducer,
  type Nav,
  type NavAction,
  type Page,
} from '@/routing/nav';

export type Nav0 = {
  nav: Nav;
  dispatch: (a: NavAction) => void;
  /** an anchor's address and its click, from one value — so the two cannot
   *  disagree, which four of them used to */
  pageLink: (p: Exclude<Page, { kind: 'game' }>) => { to: string; onGo: () => void };
};

export function useNav(
  entry: Route,
  /** true when "/" means the front page rather than a launcher on the way to a
   *  game — the start-page setting decides, and that is App's to know */
  homeIsAPage: boolean
): Nav0 {
  const [nav, dispatch] = useReducer(navReducer, undefined, () => {
    const { nav: seeded } = navOf(entry);
    if (entry.kind === 'home' && !homeIsAPage) {
      return { ...seeded, page: { kind: 'game' as const } };
    }
    return seeded;
  });

  return {
    nav,
    dispatch,
    pageLink: (page) => ({ to: pathOf(page), onGo: () => dispatch({ type: 'page', page }) }),
  };
}

/** The half that touches the browser: the title, the history entry, and Back.
 *
 *  `apply` is what to do when the browser moves first — it has to reach both
 *  the nav reducer and the game state, so App supplies it. */
export function useAddressBar(route: Route, apply: (r: Route) => void): void {
  // the tab, the bookmark, and what a search result would show
  useEffect(() => {
    document.title = titleOf(route);
  }, [route]);

  // The decision about what the address bar should do lives in ./history.ts,
  // where it can be enumerated. What is left here is the part that has to touch
  // `window`: carry the memo, apply the op.
  const memo = useRef(FRESH);

  useEffect(() => {
    const { op, memo: next } = historyStep(
      memo.current,
      route,
      window.location.pathname,
      window.location.hash
    );
    memo.current = next;
    switch (op.op) {
      case 'none':
        return;
      case 'replace':
        history.replaceState(null, '', op.path);
        return;
      case 'push':
        history.pushState(null, '', op.path);
        return;
    }
  }, [route]);

  // Back and Forward. The browser has already changed the URL by the time this
  // runs, so the effect above sees a match and stays quiet.
  //
  // Through a ref so the listener is registered once but always runs the
  // current closure rather than one holding last render's state.
  const applyRef = useRef(apply);
  applyRef.current = (r: Route) => apply(r);

  useEffect(() => {
    const onPop = () => applyRef.current(parsePath(window.location.pathname) ?? { kind: 'home' });
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
}
