// The shuffle, both copies (src/shuffle.ts for the browser, scripts/shuffle.mjs
// for the generator). What has to hold: it is fair -- in particular it does
// not favour the order it started from, which sort(() => rng() - 0.5) did,
// dealing a seven-letter word as itself 2.36% of the time; the two copies
// agree; and shuffledUntil never hands back a deal it was told to refuse
// while another exists, and still returns when none does.
import { describe, expect, it } from 'vitest';
import { shuffled, shuffledUntil } from '@/shuffle';
import { shuffled as shuffledGen, shuffledUntil as shuffledUntilGen } from '../../scripts/shuffle.mjs';

/** the generator's own seeded generator, so a run is repeatable */
function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('shuffled', () => {
  it('is a rearrangement of what it was given, and leaves the original alone', () => {
    const word = 'prosper'.split('');
    const out = shuffled(word, mulberry32(1));
    expect([...out].sort()).toEqual([...word].sort());
    expect(word.join('')).toBe('prosper');
  });

  it('does not favour the order it started from', () => {
    // a fair shuffle of p-r-o-s-p-e-r returns it unchanged 4 times in 5,040
    // (0.079%); the old comparator sort did 2.36%. 40,000 deals puts the fair
    // expectation at about 32, and the old one near 950.
    const rng = mulberry32(42);
    let same = 0;
    for (let i = 0; i < 40_000; i++) if (shuffled('prosper'.split(''), rng).join('') === 'prosper') same++;
    expect(same).toBeLessThan(80);
  });

  it('puts each item in each place about equally often', () => {
    const rng = mulberry32(7);
    const counts = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
    for (let i = 0; i < 40_000; i++) shuffled([0, 1, 2, 3], rng).forEach((v, at) => counts[v][at]++);
    for (const row of counts) for (const n of row) expect(Math.abs(n - 10_000)).toBeLessThan(500);
  });

  it('is the same in the browser and the generator, given the same rng', () => {
    for (let seed = 0; seed < 50; seed++) {
      expect(shuffled('scrambled'.split(''), mulberry32(seed))).toEqual(
        shuffledGen('scrambled'.split(''), mulberry32(seed))
      );
    }
  });
});

describe('shuffledUntil', () => {
  it('never deals a word it was told to refuse, while another order exists', () => {
    const words = new Set(['parsley', 'players', 'replays', 'sparely']);
    for (let seed = 0; seed < 2_000; seed++) {
      const deal = shuffledUntil('parsley'.split(''), (d) => words.has(d.join('')), mulberry32(seed));
      expect(words.has(deal.join(''))).toBe(false);
      const gen = shuffledUntilGen('parsley'.split(''), (d: string[]) => words.has(d.join('')), mulberry32(seed));
      expect(gen).toEqual(deal);
    }
  });

  it('returns when every order is refused, rather than looping for ever', () => {
    expect(shuffledUntil(['a', 'a', 'a'], () => true, mulberry32(3))).toEqual(['a', 'a', 'a']);
  });
});
