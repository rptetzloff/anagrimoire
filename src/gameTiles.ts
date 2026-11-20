// Each game's icon, and the CSS variables its tile is painted from (the layout
// spec, November 2026). The colours live in src/index.css with every other
// colour; this only names them, so a component never carries a literal.
import { Combine, Grid3x3, Hexagon, KeyRound, LayoutGrid, Puzzle, Shuffle, Square, Table2 } from 'lucide-react';
import LadderIcon from '@/LadderIcon';
import type { Slug } from '@/games';

export const GAME_ICONS: Record<Slug, typeof Grid3x3> = {
  guess: Grid3x3,
  scramble: Shuffle,
  hive: Hexagon,
  grid: LayoutGrid,
  boxed: Square,
  weave: Puzzle,
  squares: Table2,
  cryptogram: KeyRound,
  ladder: LadderIcon as unknown as typeof Grid3x3,
  bridge: Combine,
};

/** The fill and glyph variables for a game's tile, as `rgb(var(…))`. */
export function tileColours(slug: Slug): { background: string; color: string } {
  return {
    background: `rgb(var(--tile-${slug}-fill))`,
    color: `rgb(var(--tile-${slug}-glyph))`,
  };
}
