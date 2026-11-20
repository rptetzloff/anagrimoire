// The bar at the top has to stay one row and fit at every width. It wrapped to
// a second row once, when it was a strip of game tabs and the ninth game
// arrived: the tabs wanted 888px inside a 768px bar, and a sticky bar that
// wraps costs a slice of every screen on every page. The layout spec's answer
// is a bar of sections rather than games (desktop) and a bar at the top with
// tabs at the bottom (phone); this asserts each holds at its widths.
//
// Nothing else would catch it. axe does not measure layout, and the a11y sweep
// walks one width.
import { test, expect } from '@playwright/test';

// narrow phone, common phones, small tablet, either side of the breakpoint,
// the width the quick-solve box appears at, and desktop
const WIDTHS = [320, 375, 414, 640, 767, 768, 900, 1024, 1280, 1440];

test('the bar stays one row, and the page never scrolls sideways, at every width', async ({ page }) => {
  const bad: string[] = [];
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto('/daily/ladder');
    const r = await page.evaluate(() => {
      const shown = (el: Element | null) => !!el && el.getBoundingClientRect().height > 0;
      const headers = [...document.querySelectorAll('header')].filter((h) => h.querySelector('img[src="/logo.png"]'));
      const top = headers.find(shown) ?? null;
      const tabs = [...document.querySelectorAll('nav[aria-label="Site"]')].find(
        (n) => shown(n) && getComputedStyle(n).position === 'fixed'
      );
      return {
        topH: top ? Math.round(top.getBoundingClientRect().height) : 0,
        // a row that wrapped is taller than the bar; anything sticking out is clipped
        overflowing: top ? [...top.querySelectorAll('*')].some((el) => {
          const b = el.getBoundingClientRect();
          return b.width > 0 && (b.right > window.innerWidth + 1 || b.left < -1);
        }) : false,
        quick: !!top && [...top.querySelectorAll('input')].some(shown),
        tabs: !!tabs,
        tabsH: tabs ? Math.round(tabs.getBoundingClientRect().height) : 0,
        scrolls: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    });
    const phone = w < 768;
    if (r.topH !== (phone ? 56 : 64)) bad.push(`${w}px: the top bar is ${r.topH}px tall`);
    if (r.overflowing) bad.push(`${w}px: something in the top bar runs off the screen`);
    // the box is in the bar from lg up; below that it is in the Solvers menu
    if (r.quick !== w >= 1024) bad.push(`${w}px: the quick-solve box is ${r.quick ? '' : 'not '}in the bar`);
    if (phone && (!r.tabs || r.tabsH !== 64)) bad.push(`${w}px: no tab bar along the bottom`);
    if (!phone && r.tabs) bad.push(`${w}px: the phone tab bar is showing on a desktop`);
    if (r.scrolls) bad.push(`${w}px: the page scrolls sideways`);
  }
  expect(bad, bad.join(' | ')).toEqual([]);
});
