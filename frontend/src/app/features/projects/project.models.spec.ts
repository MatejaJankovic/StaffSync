import { nextStatuses } from './project.models';

describe('nextStatuses (§9)', () => {
  it('lets a planned project become active or be cancelled', () => {
    expect(nextStatuses('PLANNED')).toEqual(['ACTIVE', 'CANCELLED']);
  });

  it('lets an active project be completed or cancelled', () => {
    expect(nextStatuses('ACTIVE')).toEqual(['COMPLETED', 'CANCELLED']);
  });

  it.each(['COMPLETED', 'CANCELLED'] as const)('lets a %s project go nowhere', (status) => {
    expect(nextStatuses(status)).toEqual([]);
  });
});
