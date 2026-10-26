import { convertToParamMap } from '@angular/router';
import { filtersFromParams } from './employee-search.models';

describe('filtersFromParams', () => {
  it('reads every filter from the URL', () => {
    expect(
      filtersFromParams(
        convertToParamMap({
          skillId: '3',
          minLevel: '4',
          seniority: 'SENIOR',
          departmentId: '1',
          availableFrom: '2026-11-02',
          availableTo: '2026-11-30',
          minFreePercent: '50',
        }),
      ),
    ).toEqual({
      skillId: 3,
      minLevel: 4,
      seniority: 'SENIOR',
      departmentId: 1,
      availableFrom: '2026-11-02',
      availableTo: '2026-11-30',
      minFreePercent: 50,
    });
  });

  it('gives no filters for an empty URL', () => {
    expect(filtersFromParams(convertToParamMap({}))).toEqual({});
  });

  it('leaves out values that are not valid, e.g. after the URL was edited by hand', () => {
    expect(
      filtersFromParams(
        convertToParamMap({
          skillId: 'java',
          departmentId: '-1',
          seniority: 'GURU',
          availableFrom: '2026-11-02',
          availableTo: '2026-11-30',
          minFreePercent: '150',
        }),
      ),
    ).toEqual({});
  });

  it('leaves out a period with a day that does not exist, or that ends before it starts', () => {
    for (const [availableFrom, availableTo] of [
      ['2026-02-30', '2026-03-31'],
      ['2026-11-02', '2026-13-01'],
      ['0050-01-01', '2026-11-30'],
      ['2026-11-30', '2026-11-02'],
    ]) {
      expect(
        filtersFromParams(convertToParamMap({ availableFrom, availableTo, minFreePercent: '50' })),
      ).toEqual({});
    }
    // A one-day period is fine
    expect(
      filtersFromParams(
        convertToParamMap({
          availableFrom: '2026-11-02',
          availableTo: '2026-11-02',
          minFreePercent: '50',
        }),
      ),
    ).toEqual({ availableFrom: '2026-11-02', availableTo: '2026-11-02', minFreePercent: 50 });
  });

  it('needs a skill for a minimum level, and a level from 1 to 5', () => {
    expect(filtersFromParams(convertToParamMap({ minLevel: '3' }))).toEqual({});
    expect(filtersFromParams(convertToParamMap({ skillId: '3', minLevel: '6' }))).toEqual({
      skillId: 3,
    });
  });

  it('keeps the availability filters only when all three are there', () => {
    expect(
      filtersFromParams(
        convertToParamMap({ availableFrom: '2026-11-02', availableTo: '2026-11-30' }),
      ),
    ).toEqual({});
    expect(
      filtersFromParams(
        convertToParamMap({
          availableFrom: '2026-11-02',
          availableTo: '2026-11-30',
          minFreePercent: '0',
        }),
      ),
    ).toEqual({ availableFrom: '2026-11-02', availableTo: '2026-11-30', minFreePercent: 0 });
  });
});
