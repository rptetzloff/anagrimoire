// The quick-solve box reads a line as a pattern or a rack, and refuses
// anything else in words -- never by opening a solver on part of it.
import { describe, expect, it } from 'vitest';
import { MAX_RACK, parseQuickSolve } from '@/quickSolve';

const FULL = { min: 3, max: 12 };
const BOTH = { pattern: true, anagram: true };

describe('quick solve', () => {
  it('reads a line with a blank as a pattern, the blanks left empty', () => {
    expect(parseQuickSolve('c?a?t', FULL, BOTH)).toEqual({ kind: 'pattern', known: ['c', '', 'a', '', 't'] });
    // the other blanks people type, spaces, and capitals mean the same
    expect(parseQuickSolve(' C . a _ T ', FULL, BOTH)).toEqual({ kind: 'pattern', known: ['c', '', 'a', '', 't'] });
  });

  it('reads letters alone as a rack to unscramble', () => {
    expect(parseQuickSolve('Retains', FULL, BOTH)).toEqual({ kind: 'anagram', letters: 'retains' });
  });

  it('refuses what neither solver takes, saying why', () => {
    for (const bad of ['', '   ', 'c4t', 'c?a-t', 'a', 'x'.repeat(MAX_RACK + 1)]) {
      expect(parseQuickSolve(bad, FULL, BOTH).kind, JSON.stringify(bad)).toBe('problem');
    }
  });

  it('holds a pattern to the lengths on offer, and names whose limit it is', () => {
    const short = parseQuickSolve('c?', FULL, BOTH);
    expect(short).toMatchObject({ kind: 'problem', why: expect.stringMatching(/^Patterns run 3 to 12/) });
    const narrowed = parseQuickSolve('c?a?t', { min: 6, max: 8 }, BOTH);
    expect(narrowed).toMatchObject({ kind: 'problem', why: expect.stringMatching(/^Your settings offer words of 6 to 8/) });
  });

  it('does not open a solver the reader has hidden', () => {
    expect(parseQuickSolve('c?a?t', FULL, { pattern: false, anagram: true }).kind).toBe('problem');
    expect(parseQuickSolve('retains', FULL, { pattern: true, anagram: false }).kind).toBe('problem');
  });
});
