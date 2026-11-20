// The bus between the games and App. The rule tested here is the one that was
// broken: a game reports which board it has open when it mounts, and that is
// before App is listening (a child's effects run before its parent's) -- so a
// report has to reach a listener that arrives after it.
import { describe, expect, it } from 'vitest';
import { onDailyReport, reportDaily } from '@/dailyBus';

describe('dailyBus', () => {
  it('a listener that arrives after a report is told it', () => {
    reportDaily('bee', true, '2026-11-20');
    const heard: unknown[] = [];
    const off = onDailyReport((m, daily, date) => heard.push([m, daily, date]));
    expect(heard).toContainEqual(['bee', true, '2026-11-20']);
    off();
  });

  it('is told the latest only, and later reports as they come', () => {
    reportDaily('grid', true, '2026-11-19');
    reportDaily('grid', false, '');
    const heard: unknown[] = [];
    const off = onDailyReport((m, daily, date) => m === 'grid' && heard.push([daily, date]));
    expect(heard).toEqual([[false, '']]);
    reportDaily('grid', true, '2026-11-20');
    expect(heard).toEqual([[false, ''], [true, '2026-11-20']]);
    off();
    reportDaily('grid', false, '');
    expect(heard).toHaveLength(2);
  });
});
