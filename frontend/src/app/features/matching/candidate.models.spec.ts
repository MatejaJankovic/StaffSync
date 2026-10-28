import { capacityWarnings } from './candidate.models';

describe('capacityWarnings', () => {
  const day = (date: string, free: number) => ({ date, load: 100 - free, free });

  it('words the days that fall short like the matching engine (§8)', () => {
    const days = [
      day('2026-11-12', 40),
      day('2026-11-13', 40),
      // A weekend is not in the list, so it doesn't split the run
      day('2026-11-16', 40),
      day('2026-11-17', 100),
    ];

    expect(capacityWarnings(days, 60)).toEqual([
      'Insufficient capacity 2026-11-12 – 2026-11-16 (40% free, 60% required)',
    ]);
  });

  it('starts a new run where the free capacity changes, and writes one day on its own', () => {
    const days = [day('2026-11-02', 40), day('2026-11-03', 20), day('2026-11-04', 20)];

    expect(capacityWarnings(days, 60)).toEqual([
      'Insufficient capacity 2026-11-02 (40% free, 60% required)',
      'Insufficient capacity 2026-11-03 – 2026-11-04 (20% free, 60% required)',
    ]);
  });

  it('has no warning when every day has room, and shows an overbooked day as 0% free', () => {
    expect(capacityWarnings([day('2026-11-02', 60)], 60)).toEqual([]);
    expect(capacityWarnings([day('2026-11-02', -20)], 60)).toEqual([
      'Insufficient capacity 2026-11-02 (0% free, 60% required)',
    ]);
  });
});
