// Whether a game's daily reads as done on the home screen.
//
// Weave was read the way Hive is -- done only when revealed -- on the belief,
// written at the top of the module, that its completion needed the puzzle
// rather than the save file. It does not: the record carries the answers,
// base64 JSON. So a Weave solved the honest way sat at "started" for ever.
import { beforeEach, describe, expect, it } from 'vitest';
import { dailyStatus, todayEt } from '@/dailyStatus';
import { store } from '@/siteStorage';

const KEY = 'anagrimoire:weave:v1';
const answers = (words: string[], spangram = 'OWNERSHIP') =>
  btoa(JSON.stringify({ spangram: { w: spangram, path: [] }, words: words.map((w) => ({ w, path: [] })) }));

// Today's, from the module's own reckoning: status answers for today's board
// and nothing else, so a date written into the test is a test that passes on
// the day it is written and fails the next morning.
function weave(daily: Record<string, unknown>) {
  store.setItem(KEY, JSON.stringify({ dailyMode: true, dailyDate: todayEt(), daily }));
}

describe('Weave daily status', () => {
  beforeEach(() => store.removeItem(KEY));

  it('is nothing before a word is found', () => {
    weave({ answersB64: answers(['SHARE', 'STAKE']), found: [] });
    expect(dailyStatus('weave')).toBe('none');
  });

  it('is started part of the way through', () => {
    weave({ answersB64: answers(['SHARE', 'STAKE']), found: ['SHARE'] });
    expect(dailyStatus('weave')).toBe('started');
  });

  it('is done once every theme word and the spangram are found', () => {
    weave({ answersB64: answers(['SHARE', 'STAKE']), found: ['SHARE', 'OWNERSHIP', 'STAKE'] });
    expect(dailyStatus('weave')).toBe('done');
  });

  it('is done when revealed, as before', () => {
    weave({ answersB64: answers(['SHARE', 'STAKE']), found: ['SHARE'], revealed: true });
    expect(dailyStatus('weave')).toBe('done');
  });

  // Every theme word found but the spangram is one short of the finish.
  it('is not done with the spangram still missing', () => {
    weave({ answersB64: answers(['SHARE', 'STAKE']), found: ['SHARE', 'STAKE'] });
    expect(dailyStatus('weave')).toBe('started');
  });

  // A status that cannot see the finish line must not claim it was crossed.
  it('does not call a board done when its answers cannot be read', () => {
    weave({ answersB64: 'not base64 json', found: ['SHARE', 'OWNERSHIP', 'STAKE'] });
    expect(dailyStatus('weave')).toBe('started');
  });
});
