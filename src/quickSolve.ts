// The bar's quick-solve box: one line of text, sent to the solver it reads as.
//
// Two readings and no third. A line with a blank in it -- `c?a?t` -- is a
// pattern, so it opens Guess's solver with the known letters in place. A line
// of letters alone is a rack, so it opens Scramble's: there is nothing else a
// bare `retains` could be asking. Everything else is refused with a sentence
// saying what the box takes, rather than opening a solver on half the input.
//
// What it does not do: guess which of the other eight solvers was meant. Hive,
// Boxed and the rest need a shape (a centre letter, four sides, a grid) that a
// single line cannot carry, so they stay one click away in the Solvers menu.

import { MAX_WORD_LEN, MIN_WORD_LEN, type LengthRange } from '@/storage';

/** The longest rack the Scramble solver takes. App's MAX_LEN, said once. */
export const MAX_RACK = 15;

/** Blanks: `?` as the placeholder shows, and the two other marks people type
 *  for "a letter I don't know". */
const BLANK = /[?._]/;

export type QuickSolve =
  | { kind: 'pattern'; known: string[] }
  | { kind: 'anagram'; letters: string }
  | { kind: 'problem'; why: string };

export function parseQuickSolve(
  raw: string,
  range: LengthRange,
  can: { pattern: boolean; anagram: boolean }
): QuickSolve {
  // spaces inside are typing, not meaning: "c ? a ? t" is the same pattern
  const s = raw.toLowerCase().replace(/\s+/g, '');
  if (!s) return { kind: 'problem', why: 'Type a pattern like c?a?t, or some letters to unscramble.' };
  if (/[^a-z?._]/.test(s)) {
    return { kind: 'problem', why: 'Letters only, with ? for a letter you don’t know.' };
  }

  if (BLANK.test(s)) {
    if (!can.pattern) return { kind: 'problem', why: 'Guess the Word is hidden in your settings, so there is no pattern solver to open.' };
    if (s.length < range.min || s.length > range.max) {
      // say whose limit it is: the site's, or one the reader set
      const narrowed = range.min !== MIN_WORD_LEN || range.max !== MAX_WORD_LEN;
      return {
        kind: 'problem',
        why: narrowed
          ? `Your settings offer words of ${range.min} to ${range.max} letters; that pattern is ${s.length}.`
          : `Patterns run ${range.min} to ${range.max} letters; that one is ${s.length}.`,
      };
    }
    return { kind: 'pattern', known: [...s].map((c) => (BLANK.test(c) ? '' : c)) };
  }

  if (!can.anagram) return { kind: 'problem', why: 'Scramble is hidden in your settings. Add a ? for each unknown letter to search a pattern instead.' };
  if (s.length < 2) return { kind: 'problem', why: 'Two letters at least to unscramble, or a pattern like c?a?t.' };
  if (s.length > MAX_RACK) return { kind: 'problem', why: `Up to ${MAX_RACK} letters to unscramble; that is ${s.length}.` };
  return { kind: 'anagram', letters: s };
}
