// Where a game's own panel goes -- its progress, what it has found, sharing
// -- when the page has a rail beside the board (the layout spec, November
// 2026; built in Amherst Games first and ported by hand).
//
// The rail lives in App, the game's state lives in the game; rather than lift
// ten games' worth of state out, the rail offers an element and each game
// portals its panel into it. Only while the rail is beside the board: below
// 1024px the rail drops under the game, and a hint or a found-words list a
// screen's scroll away from the board is worse than one beside it -- so there
// the game draws its panel inline, where it always did.
import { createContext, useContext, useEffect, useState } from 'react';

export const RailSlotContext = createContext<HTMLElement | null>(null);

const WIDE = '(min-width: 1024px)';

function useWide(): boolean {
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(WIDE).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(WIDE);
    if (!mq) return;
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
}

/** The element to portal into, or null to draw inline. */
export function useRailSlot(): HTMLElement | null {
  const slot = useContext(RailSlotContext);
  const wide = useWide();
  return wide ? slot : null;
}
