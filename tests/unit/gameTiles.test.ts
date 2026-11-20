// Every game has a tile, every tile's glyph reads on its fill, and no two
// games share a fill -- read out of src/index.css, where the colours live.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GAME_ICONS } from '@/gameTiles';
import { ALL_SLUGS } from '@/games';

const css = readFileSync('src/index.css', 'utf8');
type RGB = [number, number, number];
const tile = (slug: string, part: 'fill' | 'glyph'): RGB => {
  const m = css.match(new RegExp(`--tile-${slug}-${part}:\\s*(\\d+) (\\d+) (\\d+);`));
  if (!m) throw new Error(`--tile-${slug}-${part} is not declared`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
};
const lin = (c: number) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
const lum = ([r, g, b]: RGB) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a: RGB, b: RGB) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe('game tiles', () => {
  it('cover every game, and no others', () => {
    expect(Object.keys(GAME_ICONS).sort()).toEqual([...ALL_SLUGS].sort());
    const declared = [...css.matchAll(/--tile-([a-z]+)-fill:/g)].map((m) => m[1]).sort();
    expect(declared).toEqual([...ALL_SLUGS].sort());
  });

  it('put every glyph at 4.5:1 or better on its fill', () => {
    for (const slug of ALL_SLUGS) {
      const r = ratio(tile(slug, 'fill'), tile(slug, 'glyph'));
      expect(r, `${slug} glyph is ${r.toFixed(2)}:1 on its fill`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('give every game a fill of its own', () => {
    const fills = ALL_SLUGS.map((s) => tile(s, 'fill').join(' '));
    expect(new Set(fills).size).toBe(fills.length);
  });
});
