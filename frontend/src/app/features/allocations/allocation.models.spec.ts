import { Allocation, overloadedRuns, PendingApproval, requestedValues } from './allocation.models';

const ALLOCATION: Allocation = {
  id: 1,
  employeeId: 4,
  employeeName: 'Marko Markovic',
  projectId: 5,
  projectName: 'Project Alpha',
  requestId: 1,
  requestTitle: 'Java Developer',
  percent: 60,
  startDate: '2026-11-01',
  endDate: '2027-01-31',
  status: 'PROPOSED',
  createdAt: '2026-10-22T09:15:30Z',
  pendingPercent: null,
  pendingStartDate: null,
  pendingEndDate: null,
  changeReason: null,
};

describe('requestedValues', () => {
  it('is the proposal itself for a NEW item', () => {
    const item: PendingApproval = {
      type: 'NEW',
      allocation: ALLOCATION,
      proposedById: 7,
      proposedByName: 'Ana PM',
    };

    expect(requestedValues(item)).toMatchObject({
      percent: 60,
      startDate: '2026-11-01',
      endDate: '2027-01-31',
    });
  });

  it('is what the change asks for on a CHANGE item', () => {
    const item: PendingApproval = {
      type: 'CHANGE',
      allocation: {
        ...ALLOCATION,
        status: 'CHANGE_PENDING',
        pendingPercent: 80,
        pendingStartDate: '2026-11-01',
        pendingEndDate: '2027-02-28',
        changeReason: 'The client asked for more work',
      },
      proposedById: 7,
      proposedByName: 'Ana PM',
    };

    expect(requestedValues(item)).toEqual({
      percent: 80,
      startDate: '2026-11-01',
      endDate: '2027-02-28',
    });
  });
});

describe('overloadedRuns', () => {
  it('joins consecutive working days with the same load, across a weekend', () => {
    // Fri 6 Nov and Mon 9 Nov 2026
    expect(
      overloadedRuns([
        { date: '2026-11-05', load: 120 },
        { date: '2026-11-06', load: 120 },
        { date: '2026-11-09', load: 120 },
      ]),
    ).toEqual([{ start: '2026-11-05', end: '2026-11-09', load: 120 }]);
  });

  it('starts a new run on a different load or after a gap', () => {
    expect(
      overloadedRuns([
        { date: '2026-11-02', load: 120 },
        { date: '2026-11-03', load: 150 },
        { date: '2026-11-05', load: 150 },
      ]),
    ).toEqual([
      { start: '2026-11-02', end: '2026-11-02', load: 120 },
      { start: '2026-11-03', end: '2026-11-03', load: 150 },
      { start: '2026-11-05', end: '2026-11-05', load: 150 },
    ]);
  });

  it('skips entries that are not a day and a load, and is empty without days', () => {
    expect(overloadedRuns([{ field: 'comment', message: 'x' }, null, 'text'])).toEqual([]);
    expect(overloadedRuns([])).toEqual([]);
  });
});
