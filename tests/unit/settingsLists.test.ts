// The two lists in Settings that decide which games you can choose.
//
// Both were typed out and both stopped at eight, so Ladder and Bridge could be
// neither set as a start page nor hidden from the nav — the games were
// playable, had dailies and leaderboards, and were absent from the only screen
// that offers to show or hide them. Nothing failed, because a list that is
// short renders perfectly.
//
// Worse, the "don't hide your last game" guard compares against the length of
// that same list, so it was counting to eight: hiding eight of ten games would
// have refused the eighth while two remained.
import { describe, expect, it } from 'vitest';
import { ALL_MODES } from '@/games';
import { MODE_LABELS, START_OPTIONS } from '@/SettingsPage';

describe('the games you can pick in Settings', () => {
  it('offers every game as a start page', () => {
    const offered = START_OPTIONS.filter((o) => o.mode).map((o) => o.mode);
    const missing = ALL_MODES.filter((m) => !offered.includes(m));
    expect(missing, `not offered as a start page: ${missing.join(', ')}`).toEqual([]);
  });

  it('keeps the two non-game options, which are the point of the setting', () => {
    const ids = START_OPTIONS.map((o) => o.id);
    expect(ids.slice(0, 2)).toEqual(['home', 'last']);
  });

  it('lets every game be hidden or shown', () => {
    const listed = MODE_LABELS.map((l) => l.id);
    const missing = ALL_MODES.filter((m) => !listed.includes(m));
    expect(missing, `cannot be hidden or shown: ${missing.join(', ')}`).toEqual([]);
  });

  it('counts every game in the list the last-survivor guard measures', () => {
    // the guard is `hidden.length === MODE_LABELS.length - 1`; if the list is
    // short, it refuses a hide while games are still visible
    expect(MODE_LABELS).toHaveLength(ALL_MODES.length);
  });
});
