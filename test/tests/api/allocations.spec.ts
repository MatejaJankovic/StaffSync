import { APIRequestContext, expect, test } from '@playwright/test';
import { AllocationsApi, Proposal } from '../../api/AllocationsApi';
import { AuthApi } from '../../api/AuthApi';
import { expectError } from '../../api/errors';
import { ProjectsApi } from '../../api/ProjectsApi';
import { NewRequest, RequestsApi } from '../../api/RequestsApi';
import { SkillsApi } from '../../api/SkillsApi';
import { PASSWORD, users } from '../../fixtures/users';

// Test cases TC_API_FLOW_001 – 015 and 017 – 024 in docs/TEST_CASES.md §2: the main flow, the allocation rules and
// the change workflow.
// Needs a freshly reset database (docker compose down -v) for the first run: the cases book real capacity of the
// seeded employees. afterAll cancels the QA project, which cancels what the cases booked, so the spec can run again.
// The cases build on each other (Marko is proposed, then approved), so they run in order.
test.describe.configure({ mode: 'serial' });

const PERIOD = { startDate: '2026-11-01', endDate: '2027-01-31' };

let api: APIRequestContext;
let ana: { allocations: AllocationsApi; projects: ProjectsApi; requests: RequestsApi };
let igor: AllocationsApi;
let lazar: AllocationsApi;
let employeeId: Record<'marko' | 'jelena' | 'stefan' | 'milica', number>;
let projectId: number;
let requestId: number;
let markoAllocationId: number;
let javaRequest: (title: string) => NewRequest;

test.beforeAll(async ({ playwright }, testInfo) => {
  api = await playwright.request.newContext({ baseURL: testInfo.project.use.baseURL });
  const auth = new AuthApi(api);
  const login = async (email: string) => (await (await auth.login(email, PASSWORD)).json()) as { token: string; user: { id: number } };

  const anaLogin = await login(users.ana.email);
  ana = {
    allocations: new AllocationsApi(api, anaLogin.token),
    projects: new ProjectsApi(api, anaLogin.token),
    requests: new RequestsApi(api, anaLogin.token),
  };
  igor = new AllocationsApi(api, (await login(users.igor.email)).token);
  lazar = new AllocationsApi(api, (await login(users.lazar.email)).token);
  employeeId = {
    marko: (await login(users.marko.email)).user.id,
    jelena: (await login(users.jelena.email)).user.id,
    stefan: (await login(users.stefan.email)).user.id,
    milica: (await login(users.milica.email)).user.id,
  };

  const skill = await new SkillsApi(api, anaLogin.token).idsByName();
  javaRequest = (title) => ({
    title,
    seniority: 'MEDIOR',
    allocationPercent: 60,
    ...PERIOD,
    headcount: 2,
    skills: [
      { skillId: skill.Java, minLevel: 4, mandatory: true },
      { skillId: skill.Spring, minLevel: 3, mandatory: true },
      { skillId: skill.PostgreSQL, minLevel: 2, mandatory: false },
    ],
  });

  const project = await ana.projects.create({
    name: `QA Project Alpha ${Date.now()}`,
    client: 'QA',
    startDate: '2026-11-01',
    endDate: '2027-03-31',
  });
  expect(project.status()).toBe(201);
  projectId = (await project.json()).id;
  requestId = await createRequest('Java Developer');
});

test.afterAll(async () => {
  // The BR-11 clean-up cancels the proposals, pending changes and approved allocations left on the project,
  // also those of a case that failed before its own cancel
  if (projectId) {
    expect((await ana.projects.changeStatus(projectId, 'CANCELLED')).status()).toBe(200);
  }
  await api.dispose();
});

async function createRequest(title: string): Promise<number> {
  const response = await ana.requests.create(projectId, javaRequest(title));
  expect(response.status()).toBe(201);
  return (await response.json()).id;
}

/** Ana proposes, and the test fails unless the proposal is created. Returns the allocation id. */
async function propose(proposal: Proposal): Promise<number> {
  const response = await ana.allocations.propose(proposal);
  expect(response.status()).toBe(201);
  return (await response.json()).allocation.id;
}

test.describe('main flow', () => {
  test('TC_API_FLOW_001 ranked candidates for the request', async () => {
    const response = await ana.requests.candidates(requestId);

    expect(response.status()).toBe(200);
    const candidates: { employeeId: number; score: number; warnings: string[] }[] = (await response.json()).content;
    expect(candidates[0]).toMatchObject({ employeeId: employeeId.marko, score: 85 });
    const jelena = candidates.find((candidate) => candidate.score === 67);
    expect(jelena).toMatchObject({ employeeId: employeeId.jelena });
    expect(jelena?.warnings).toContain('Insufficient capacity 2026-11-02 – 2026-11-13 (40% free, 60% required)');
    const scores = candidates.map((candidate) => candidate.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  test('TC_API_FLOW_002 nobody without a mandatory skill is a candidate', async () => {
    const candidates: { reasons: string[] }[] = (await (await ana.requests.candidates(requestId)).json()).content;

    expect(candidates.length).toBeGreaterThan(0);
    for (const candidate of candidates) {
      expect(candidate.reasons.some((reason) => /^Java [45]\/5/.test(reason))).toBe(true);
      expect(candidate.reasons.some((reason) => /^Spring [345]\/5/.test(reason))).toBe(true);
    }
  });

  test('TC_API_FLOW_003 PM proposes an employee', async () => {
    const response = await ana.allocations.propose({ requestId, employeeId: employeeId.marko });

    expect(response.status()).toBe(201);
    const { allocation } = await response.json();
    expect(allocation).toMatchObject({ status: 'PROPOSED', percent: 60, ...PERIOD });
    markoAllocationId = allocation.id;
  });

  test('TC_API_FLOW_007 RM of another team approves', async () => {
    await expectError(await lazar.approve(markoAllocationId), 403, 'NOT_RESOURCE_MANAGER');
  });

  test('TC_API_FLOW_008 employee tries to approve', async () => {
    const marko = new AllocationsApi(api, await new AuthApi(api).tokenFor(users.marko.email, PASSWORD));

    await expectError(await marko.approve(markoAllocationId), 403, 'FORBIDDEN');
  });

  test('TC_API_FLOW_010 reject with a comment shorter than 10 characters', async () => {
    const error = await expectError(await igor.reject(markoAllocationId, 'Too busy'), 400, 'VALIDATION_ERROR');

    expect(error.details.map((detail) => detail.field)).toEqual(['comment']);
  });

  test('TC_API_FLOW_012 same employee proposed twice on the same request', async () => {
    await expectError(await ana.allocations.propose({ requestId, employeeId: employeeId.marko }), 409, 'ALLOCATION_OVERLAP');
  });

  test('TC_API_FLOW_004 RM approves within capacity', async () => {
    // Also shows that the failed approve and reject above left Marko PROPOSED
    const response = await igor.approve(markoAllocationId);

    expect(response.status()).toBe(200);
    expect((await response.json()).status).toBe('APPROVED');
    expect((await (await ana.requests.get(requestId)).json()).status).toBe('PARTIALLY_FILLED');
  });

  test('TC_API_FLOW_011 approve an allocation that is already approved', async () => {
    await expectError(await igor.approve(markoAllocationId), 409, 'INVALID_ALLOCATION_STATUS');
  });

  test('TC_API_FLOW_005 approve over capacity', async () => {
    const id = await propose({ requestId, employeeId: employeeId.jelena });

    const error = await expectError(await igor.approve(id), 409, 'CAPACITY_EXCEEDED');

    expect(error.message).toBe(
      'Capacity exceeded on 2026-11-02 – 2026-11-13 (60% existing + 60% new = 120% of 100% capacity)',
    );
    const pending: { allocation: { id: number; status: string } }[] = (await (await igor.pending()).json()).content;
    expect(pending.find((item) => item.allocation.id === id)?.allocation.status).toBe('PROPOSED');
    expect((await ana.allocations.cancel(id)).status()).toBe(200);
  });

  test('TC_API_FLOW_009 PM proposes on another PM project', async () => {
    const mateja = new AllocationsApi(api, await new AuthApi(api).tokenFor(users.mateja.email, PASSWORD));

    await expectError(await mateja.propose({ requestId, employeeId: employeeId.jelena }), 403, 'NOT_PROJECT_OWNER');
  });

  test('TC_API_FLOW_013 allocation period outside the request', async () => {
    const response = await ana.allocations.propose({
      requestId,
      employeeId: employeeId.jelena,
      startDate: '2026-10-15',
      endDate: PERIOD.endDate,
    });

    await expectError(response, 400, 'ALLOCATION_OUTSIDE_REQUEST');
  });
});

// Each case has its own request, and cancels what it created, so the next case starts with clean capacity.
// Jelena is APPROVED 60% on Helios CRM until Sat Nov 14, so on Nov 2 – 13 only 40% is free.
test.describe('capacity boundaries', () => {
  test('TC_API_FLOW_006 approve at exactly 100%', async () => {
    const id = await propose({
      requestId: await createRequest('Boundary 100%'),
      employeeId: employeeId.jelena,
      percent: 40,
      startDate: '2026-11-02',
      endDate: '2026-11-13',
    });

    const response = await igor.approve(id);

    expect(response.status()).toBe(200);
    expect((await response.json()).status).toBe('APPROVED');
    expect((await ana.allocations.cancel(id)).status()).toBe(200);
  });

  test('TC_API_FLOW_017 overlap on the boundary day', async () => {
    const id = await propose({
      requestId: await createRequest('Boundary day'),
      employeeId: employeeId.jelena,
      startDate: '2026-11-13',
      endDate: PERIOD.endDate,
    });

    const error = await expectError(await igor.approve(id), 409, 'CAPACITY_EXCEEDED');

    expect(error.message).toBe('Capacity exceeded on 2026-11-13 (60% existing + 60% new = 120% of 100% capacity)');
    expect((await ana.allocations.cancel(id)).status()).toBe(200);
  });

  for (const { id: caseId, scenario, startDate } of [
    { id: 'TC_API_FLOW_018', scenario: 'adjacent periods', startDate: '2026-11-15' },
    { id: 'TC_API_FLOW_019', scenario: 'overlap only on a weekend', startDate: '2026-11-14' },
  ]) {
    test(`${caseId} ${scenario}`, async () => {
      const id = await propose({
        requestId: await createRequest(scenario),
        employeeId: employeeId.jelena,
        startDate,
        endDate: PERIOD.endDate,
      });

      const response = await igor.approve(id);

      expect(response.status()).toBe(200);
      expect((await response.json()).status).toBe('APPROVED');
      expect((await ana.allocations.cancel(id)).status()).toBe(200);
    });
  }

  test('TC_API_FLOW_020 part-time 50% employee over capacity', async () => {
    // Stefan's seeded PROPOSED 50% doesn't count (BR-2), so the existing load is 0%
    const id = await propose({
      requestId: await createRequest('Part-time 50%'),
      employeeId: employeeId.stefan,
      startDate: '2026-11-02',
      endDate: '2027-01-29',
    });

    const error = await expectError(await lazar.approve(id), 409, 'CAPACITY_EXCEEDED');

    expect(error.message).toContain('(0% existing + 60% new = 60% of 50% capacity)');
    expect((await ana.allocations.cancel(id)).status()).toBe(200);
  });

  test('TC_API_FLOW_021 part-time 80% employee at and over capacity', async () => {
    // Milica is APPROVED 50% on Atlas from Dec 1 to Jan 29
    const partTimeRequest = await createRequest('Part-time 80%');
    const milica = { requestId: partTimeRequest, employeeId: employeeId.milica, startDate: '2026-12-01', endDate: '2027-01-29' };
    const atCapacity = await propose({ ...milica, percent: 30 });

    expect((await lazar.approve(atCapacity)).status()).toBe(200);
    expect((await ana.allocations.cancel(atCapacity)).status()).toBe(200);

    const overCapacity = await propose({ ...milica, percent: 40 });
    const error = await expectError(await lazar.approve(overCapacity), 409, 'CAPACITY_EXCEEDED');

    expect(error.message).toContain('(50% existing + 40% new = 90% of 80% capacity)');
    expect((await ana.allocations.cancel(overCapacity)).status()).toBe(200);
  });
});

// BR-15 and BR-16. Marko is APPROVED at 60% on the main request since TC_API_FLOW_004.
test.describe('change workflow', () => {
  const REASON = 'The client asked for more work on the reporting module';

  test('TC_API_FLOW_024 change request on a proposal', async () => {
    const id = await propose({ requestId, employeeId: employeeId.jelena, startDate: '2026-11-16', endDate: PERIOD.endDate });

    await expectError(await ana.allocations.requestChange(id, { percent: 80, reason: REASON }), 409, 'INVALID_ALLOCATION_STATUS');
    expect((await ana.allocations.cancel(id)).status()).toBe(200);
  });

  test('TC_API_FLOW_014 change request 60% → 80% waits for the RM as CHANGE', async () => {
    const response = await ana.allocations.requestChange(markoAllocationId, { percent: 80, reason: REASON });

    expect(response.status()).toBe(200);
    expect((await response.json()).allocation).toMatchObject({ status: 'CHANGE_PENDING', percent: 60, pendingPercent: 80 });
    const pending: { type: string; allocation: { id: number } }[] = (await (await igor.pending()).json()).content;
    expect(pending.find((item) => item.allocation.id === markoAllocationId)?.type).toBe('CHANGE');
  });

  test('TC_API_FLOW_015 second change while one is pending', async () => {
    const response = await ana.allocations.requestChange(markoAllocationId, { percent: 90, reason: REASON });

    await expectError(response, 409, 'CHANGE_ALREADY_PENDING');
  });

  test('TC_API_FLOW_022 capacity uses the old values while a change is pending', async () => {
    // 60% + 40% = 100% passes. With the pending 80% it would be 120%
    const id = await propose({ requestId: await createRequest('Change pending'), employeeId: employeeId.marko, percent: 40 });

    const response = await igor.approve(id);

    expect(response.status()).toBe(200);
    expect((await ana.allocations.cancel(id)).status()).toBe(200);
  });

  test('TC_API_FLOW_014 RM approves the change', async () => {
    const response = await igor.approve(markoAllocationId);

    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'APPROVED', percent: 80, pendingPercent: null });
  });

  test('TC_API_FLOW_023 approve a change that goes over capacity', async () => {
    const id = await propose({
      requestId: await createRequest('Change over capacity'),
      employeeId: employeeId.jelena,
      percent: 40,
      startDate: '2026-11-02',
      endDate: '2026-11-13',
    });
    expect((await igor.approve(id)).status()).toBe(200);
    expect((await ana.allocations.requestChange(id, { percent: 60, reason: REASON })).status()).toBe(200);

    const error = await expectError(await igor.approve(id), 409, 'CAPACITY_EXCEEDED');

    expect(error.message).toBe(
      'Capacity exceeded on 2026-11-02 – 2026-11-13 (60% existing + 60% new = 120% of 100% capacity)',
    );
    const pending: { type: string; allocation: { id: number; status: string; percent: number } }[] = (
      await (await igor.pending()).json()
    ).content;
    expect(pending.find((item) => item.allocation.id === id)).toMatchObject({
      type: 'CHANGE',
      allocation: { status: 'CHANGE_PENDING', percent: 40 },
    });
    expect((await ana.allocations.withdrawChange(id)).status()).toBe(200);
    expect((await ana.allocations.cancel(id)).status()).toBe(200);
  });
});
