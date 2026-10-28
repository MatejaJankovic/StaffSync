import { ComponentFixture, TestBed } from '@angular/core/testing';
import { readableMessage } from '../../shared/dates';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { SsDialog } from '../../shared/ui';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { Notifications } from '../../core/error/notifications';
import { AllocationProposal } from '../allocations/allocation.models';
import { RequestStatus, StaffingRequest } from '../requests/request.models';
import { Candidate } from './candidate.models';
import { CandidatesPage } from './candidates-page';
import { ProposeDialog } from './propose-dialog';

// §4 step 2: the demo request
const REQUEST: StaffingRequest = {
  id: 9,
  projectId: 5,
  title: 'Java Developer',
  seniority: 'MEDIOR',
  allocationPercent: 60,
  startDate: '2026-11-01',
  endDate: '2027-01-31',
  headcount: 2,
  filled: 0,
  status: 'OPEN',
  createdAt: '2026-10-21T09:15:30Z',
  skills: [
    { skillId: 1, skillName: 'Java', category: 'BACKEND', minLevel: 4, mandatory: true },
    { skillId: 2, skillName: 'Spring', category: 'BACKEND', minLevel: 3, mandatory: true },
    { skillId: 12, skillName: 'PostgreSQL', category: 'DATABASE', minLevel: 2, mandatory: false },
  ],
};

// §4 step 3: Marko, 85/100 (40 + 40 + 5) ...
const MARKO: Candidate = {
  employeeId: 4,
  fullName: 'Marko Marković',
  seniority: 'SENIOR',
  department: 'Engineering',
  score: 85,
  breakdown: { skills: 40, availability: 40, seniority: 5 },
  reasons: [
    'Java 5/5 (required ≥ 4)',
    'Spring 4/5 (required ≥ 3)',
    'PostgreSQL 3/5 (nice to have ≥ 2)',
  ],
  warnings: ['Seniority SENIOR (MEDIOR requested)'],
};

// ... and Jelena, 67/100 (23 + 34 + 10), with only 40% free until 14 Nov
const JELENA: Candidate = {
  employeeId: 17,
  fullName: 'Jelena Petrović',
  seniority: 'MEDIOR',
  department: 'Engineering',
  score: 67,
  breakdown: { skills: 23, availability: 34, seniority: 10 },
  reasons: ['Java 4/5 (required ≥ 4)', 'Spring 3/5 (required ≥ 3)'],
  warnings: [
    'Insufficient capacity 2026-11-02 – 2026-11-13 (40% free, 60% required)',
    'Missing PostgreSQL (nice to have)',
  ],
};

const REQUEST_URL = '/api/requests/9';
const CANDIDATES_URL = '/api/requests/9/candidates?page=0&size=10';

/** What `POST /api/allocations` answers when `candidate` is proposed for the demo request. */
function proposalFor(candidate: Candidate, warnings: string[] = []): AllocationProposal {
  return {
    allocation: {
      id: 100 + candidate.employeeId,
      employeeId: candidate.employeeId,
      employeeName: candidate.fullName,
      projectId: 5,
      projectName: 'Project Alpha',
      requestId: 9,
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
      decidedByName: null,
      decisionComment: null,
    },
    warnings,
  };
}

describe('CandidatesPage', () => {
  let fixture: ComponentFixture<CandidatesPage>;
  let httpMock: HttpTestingController;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let dialogOpen: ReturnType<typeof vi.spyOn>;
  let success: ReturnType<typeof vi.spyOn>;
  /** What the Propose dialog closes with: the proposal, or nothing when the PM cancels. */
  let dialogResult: AllocationProposal | undefined;

  async function open(id = '9'): Promise<void> {
    dialogResult = undefined;
    params = new BehaviorSubject(convertToParamMap({ id }));
    await TestBed.configureTestingModule({
      imports: [CandidatesPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { paramMap: params, snapshot: { paramMap: params.value } },
        },
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    dialogOpen = vi
      .spyOn(TestBed.inject(SsDialog), 'open')
      .mockImplementation(() => ({ afterClosed: () => of(dialogResult) }) as never);
    success = vi.spyOn(TestBed.inject(Notifications), 'success').mockReturnValue(undefined);
    fixture = TestBed.createComponent(CandidatesPage);
    fixture.detectChanges();
  }

  /** Answers the request, and then (unless it is `null`) the candidates the table asks for. */
  async function respond(
    request: StaffingRequest = REQUEST,
    candidates: Candidate[] | null = [MARKO, JELENA],
  ): Promise<void> {
    httpMock.expectOne(REQUEST_URL).flush(request);
    await settle();
    if (candidates) {
      answer(candidates);
      await settle();
    }
  }

  function answer(rows: Candidate[], url = CANDIDATES_URL): void {
    httpMock.expectOne(url).flush({
      content: rows,
      page: { size: 10, number: 0, totalElements: rows.length, totalPages: 1 },
    });
  }

  afterEach(() => httpMock.verify());

  async function settle(): Promise<void> {
    for (let round = 0; round < 3; round++) {
      fixture.detectChanges();
      await fixture.whenStable();
    }
    fixture.detectChanges();
  }

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  /** The text of the elements, trimmed and on one line. */
  function texts(root: ParentNode, selector: string): string[] {
    return [...root.querySelectorAll(selector)].map((node) =>
      (node.textContent ?? '').replace(/\s+/g, ' ').trim(),
    );
  }

  function names(): string[] {
    return texts(el(), '.candidate__name');
  }

  function rowOf(name: string): HTMLElement {
    return [...el().querySelectorAll<HTMLElement>('tr.cdk-row')].find((row) =>
      row.querySelector('.candidate__name')?.textContent?.includes(name),
    )!;
  }

  /** What the request header says for a label such as `Seniority`. */
  function fact(label: string): string {
    const term = [...el().querySelectorAll('.candidates__request dt')].find(
      (dt) => dt.textContent?.trim() === label,
    );
    return (term?.nextElementSibling?.textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  function backLink(): HTMLAnchorElement {
    return el().querySelector<HTMLAnchorElement>('a.candidates__back')!;
  }

  function proposeButton(name: string): HTMLButtonElement | null {
    return el().querySelector<HTMLButtonElement>(`button[aria-label="Propose ${name}"]`);
  }

  function notices(): HTMLElement[] {
    return [...el().querySelectorAll<HTMLElement>('.candidates__notice')];
  }

  /**
   * The PM clicks Propose on `name`. The dialog closes with `result`, and the table loads the
   * candidates again; `remaining` is what the API then answers.
   */
  async function propose(
    name: string,
    result: AllocationProposal | undefined,
    remaining: Candidate[],
  ): Promise<void> {
    dialogResult = result;
    proposeButton(name)!.click();
    await settle();
    answer(remaining);
    await settle();
  }

  it('shows the request: title, status, seniority, allocation, period, headcount and skills', async () => {
    await open();
    expect(el().textContent).toContain('Loading request');

    await respond();

    expect(el().querySelector('h1')?.textContent).toContain('Candidates for Java Developer');
    expect(el().querySelector('app-status-chip')?.textContent?.trim()).toBe('Open');
    expect(fact('Seniority')).toBe('Medior');
    expect(fact('Allocation')).toBe('60%');
    expect(fact('Period')).toBe('1 Nov 2026 – 31 Jan 2027');
    expect(fact('Headcount')).toBe('2');
    expect(fact('Required skills')).toContain('Java ≥ 4');
    expect(fact('Required skills')).toContain('Spring ≥ 3');
    expect(fact('Required skills')).not.toContain('PostgreSQL');
    expect(fact('Nice to have')).toBe('PostgreSQL ≥ 2');
  });

  it('says None when the request asks for no required or no nice-to-have skills', async () => {
    await open();

    await respond({ ...REQUEST, skills: [] });

    expect(fact('Required skills')).toBe('None');
    expect(fact('Nice to have')).toBe('None');
  });

  it('asks the API for the first page of ten candidates, without a sort', async () => {
    await open();

    await respond();

    // answer() only matches this exact URL, so there is no sort parameter
    expect(names()).toHaveLength(2);
  });

  describe('the candidates', () => {
    it('lists them in the order of the API, best score first: Marko (85) above Jelena (67)', async () => {
      await open();

      await respond();

      expect(names()).toEqual(['Marko Marković', 'Jelena Petrović']);
      expect(texts(el(), '.candidate__score')).toEqual(['85/100', '67/100']);
    });

    it('shows how the score adds up: skills, availability and seniority', async () => {
      await open();

      await respond();

      expect(texts(rowOf('Marko'), '.candidate__breakdown > div')).toEqual([
        'Skills 40/50',
        'Availability 40/40',
        'Seniority 5/10',
      ]);
      expect(texts(rowOf('Jelena'), '.candidate__breakdown > div')).toEqual([
        'Skills 23/50',
        'Availability 34/40',
        'Seniority 10/10',
      ]);
    });

    it('fills the bar of a part by its share of the most it can give', async () => {
      await open();

      await respond();

      const widths = [...rowOf('Jelena').querySelectorAll<HTMLElement>('.candidate__bar > span')];
      expect(widths.map((bar) => bar.style.width)).toEqual(['46%', '85%', '100%']);
    });

    it('shows the reasons as text', async () => {
      await open();

      await respond();

      expect(texts(rowOf('Marko'), '.candidate__reasons li > span')).toEqual(MARKO.reasons);
      expect(texts(rowOf('Jelena'), '.candidate__reasons li > span')).toEqual(JELENA.reasons);
    });

    it('shows the warnings in their own list, each with a warning icon', async () => {
      await open();

      await respond();

      const jelena = rowOf('Jelena');
      expect(texts(jelena, '.candidate__warnings li > span')).toEqual(
        JELENA.warnings.map(readableMessage),
      );
      expect(texts(jelena, '.candidate__warnings li > ss-icon')).toEqual(['warning', 'warning']);
      expect(jelena.querySelector('ul[aria-label="Warnings"]')).toBeTruthy();
      expect(texts(rowOf('Marko'), '.candidate__warnings li > span')).toEqual([
        'Seniority Senior (Medior requested)',
      ]);
    });

    it('has no warnings list for a candidate without warnings, and no reasons list without reasons', async () => {
      await open();

      await respond(REQUEST, [
        { ...MARKO, warnings: [] },
        { ...JELENA, reasons: [] },
      ]);

      expect(rowOf('Marko').querySelector<HTMLElement>('.candidate__warnings')?.hidden).toBe(true);
      expect(rowOf('Marko').querySelector('.candidate__reasons')).toBeTruthy();
      expect(rowOf('Jelena').querySelector('.candidate__reasons')).toBeNull();
      expect(rowOf('Jelena').querySelector<HTMLElement>('.candidate__warnings')?.hidden).toBe(
        false,
      );
    });

    it('shows the seniority and department under the name', async () => {
      await open();

      await respond();

      expect(texts(el(), '.candidate__meta')).toEqual([
        'Senior · Engineering',
        'Medior · Engineering',
      ]);
    });

    it('says so when the employee has no seniority, and leaves out a missing department', async () => {
      await open();

      await respond(REQUEST, [
        { ...MARKO, seniority: null, department: null },
        { ...JELENA, department: null },
      ]);

      expect(texts(el(), '.candidate__meta')).toEqual(['Seniority not set', 'Medior']);
    });

    it('shows a loading state while the candidates are on their way', async () => {
      await open();

      await respond(REQUEST, null);

      expect(el().querySelector('ss-progress-bar')).toBeTruthy();
      expect(el().textContent).toContain('Loading…');
      answer([MARKO]);
      await settle();
      expect(names()).toEqual(['Marko Marković']);
    });

    it('explains an empty list', async () => {
      await open();

      await respond(REQUEST, []);

      expect(names()).toEqual([]);
      expect(el().textContent).toContain('No candidates match the mandatory skills');
    });

    it('says so when the candidates cannot be loaded', async () => {
      await open();
      await respond(REQUEST, null);

      httpMock.expectOne(CANDIDATES_URL).flush(null, { status: 409, statusText: 'Conflict' });
      await settle();

      expect(names()).toEqual([]);
      expect(el().textContent).toContain('Unable to load the data');
    });
  });

  describe('a request that still looks for people', () => {
    it('lists the candidates of a PARTIALLY_FILLED request too', async () => {
      await open();

      await respond({ ...REQUEST, status: 'PARTIALLY_FILLED' });

      expect(el().querySelector('app-status-chip')?.textContent?.trim()).toBe('Partially filled');
      expect(names()).toEqual(['Marko Marković', 'Jelena Petrović']);
    });
  });

  describe('a request that takes no proposals (BR-9)', () => {
    it.each<[RequestStatus, string]>([
      ['FILLED', 'filled'],
      ['CANCELLED', 'cancelled'],
    ])('does not ask for the candidates of a %s request', async (status, words) => {
      await open();

      await respond({ ...REQUEST, status }, null);

      // verify() fails the test if the candidates were requested
      expect(el().textContent).toContain(`A ${words} request takes no proposals`);
      expect(el().querySelector('app-paged-table')).toBeNull();
      expect(el().querySelector('h1')?.textContent).toContain('Candidates for Java Developer');
    });
  });

  describe('when the request cannot be shown', () => {
    it('says the request does not exist on a 404', async () => {
      await open();

      httpMock.expectOne(REQUEST_URL).flush(null, { status: 404, statusText: 'Not Found' });
      await settle();

      expect(el().querySelector('[role="alert"]')?.textContent).toContain(
        'This request doesn’t exist.',
      );
      expect(el().querySelector('app-paged-table')).toBeNull();
    });

    it('says only the owner of the project can see the candidates on a 403 (BR-4)', async () => {
      await open();

      httpMock.expectOne(REQUEST_URL).flush(null, { status: 403, statusText: 'Forbidden' });
      await settle();

      expect(el().querySelector('[role="alert"]')?.textContent).toContain(
        'Only the project manager who owns this project',
      );
      expect(el().querySelector('app-paged-table')).toBeNull();
    });

    it('does not call the API for an id that is not a number', async () => {
      await open('abc');
      await settle();

      expect(el().querySelector('[role="alert"]')?.textContent).toContain(
        'This request doesn’t exist.',
      );
    });

    it('offers Retry after any other failure, and loads the request again', async () => {
      await open();
      httpMock
        .expectOne(REQUEST_URL)
        .flush(null, { status: 500, statusText: 'Internal Server Error' });
      await settle();
      expect(el().querySelector('[role="alert"]')?.textContent).toContain(
        'Unable to load the request.',
      );

      [...el().querySelectorAll('button')].find((b) => b.textContent?.includes('Retry'))!.click();
      await settle();
      await respond();

      expect(names()).toEqual(['Marko Marković', 'Jelena Petrović']);
    });
  });

  describe('the link back', () => {
    it('goes to the project of the request', async () => {
      await open();

      await respond();

      expect(backLink().getAttribute('href')).toBe('/projects/5');
      expect(backLink().textContent).toContain('Back to project');
    });

    it('goes to My projects while there is no request to go back from', async () => {
      await open();

      httpMock.expectOne(REQUEST_URL).flush(null, { status: 404, statusText: 'Not Found' });
      await settle();

      expect(backLink().getAttribute('href')).toBe('/projects');
      expect(backLink().textContent).toContain('My projects');
    });
  });

  describe('proposing a candidate', () => {
    it('has a Propose button on every candidate', async () => {
      await open();

      await respond();

      expect(proposeButton('Marko Marković')?.textContent).toContain('Propose');
      expect(proposeButton('Jelena Petrović')?.textContent).toContain('Propose');
    });

    it('opens the Propose dialog with the request and the candidate', async () => {
      await open();
      await respond();

      await propose('Jelena Petrović', undefined, [MARKO, JELENA]);

      expect(dialogOpen).toHaveBeenCalledTimes(1);
      expect(dialogOpen.mock.calls[0][0]).toBe(ProposeDialog);
      expect(dialogOpen.mock.calls[0][1]).toMatchObject({
        data: { request: REQUEST, candidate: JELENA },
      });
    });

    it('thanks the PM with a snackbar, and the proposed person drops off the list', async () => {
      await open();
      await respond();

      await propose('Marko Marković', proposalFor(MARKO), [JELENA]);

      expect(success).toHaveBeenCalledWith('Marko Marković proposed');
      expect(names()).toEqual(['Jelena Petrović']);
      expect(notices()).toHaveLength(0);
    });

    it('keeps the soft-booking warnings on the page, instead of a snackbar (BR-2)', async () => {
      await open();
      await respond();
      const warning = 'Capacity would be exceeded on 2026-11-02 – 2026-11-13 (120%)';

      await propose('Jelena Petrović', proposalFor(JELENA, [warning]), [MARKO]);

      expect(success).not.toHaveBeenCalled();
      expect(notices()).toHaveLength(1);
      expect(notices()[0].textContent).toContain('Jelena Petrović was proposed, with warnings');
      expect(texts(notices()[0], 'li')).toEqual([
        'Capacity would be exceeded on 2 Nov 2026 – 13 Nov 2026 (120%)',
      ]);
      expect(notices()[0].textContent).toContain('can’t approve it while');
      expect(names()).toEqual(['Marko Marković']);
    });

    it('adds the notice to a live region that is there before the first proposal, so it is announced', async () => {
      await open();
      await respond();
      const region = el().querySelector('[role="status"].candidates__notices');
      expect(region).toBeTruthy();
      expect(region!.children).toHaveLength(0);

      await propose('Jelena Petrović', proposalFor(JELENA, ['Capacity would be exceeded']), [
        MARKO,
      ]);

      expect(el().querySelector('[role="status"].candidates__notices')).toBe(region);
      expect(region!.querySelectorAll('.candidates__notice')).toHaveLength(1);
      expect(notices()[0].getAttribute('role')).toBeNull();
    });

    it('keeps a notice per proposal, and dismisses them one at a time', async () => {
      await open();
      await respond();
      await propose('Marko Marković', proposalFor(MARKO, ['Capacity would be exceeded (110%)']), [
        JELENA,
      ]);
      await propose(
        'Jelena Petrović',
        proposalFor(JELENA, ['Capacity would be exceeded (120%)']),
        [],
      );
      expect(
        notices().map((notice) =>
          notice.querySelector('.candidates__notice-title')?.textContent?.trim(),
        ),
      ).toEqual([
        'Marko Marković was proposed, with warnings',
        'Jelena Petrović was proposed, with warnings',
      ]);

      el()
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Dismiss the warnings for Marko Marković"]',
        )!
        .click();
      await settle();

      expect(notices()).toHaveLength(1);
      expect(notices()[0].textContent).toContain('Jelena Petrović');
    });

    it('explains the empty list once everyone who matches has been proposed', async () => {
      await open();
      await respond(REQUEST, [MARKO]);

      await propose('Marko Marković', proposalFor(MARKO), []);

      expect(names()).toEqual([]);
      expect(el().textContent).toContain('everyone who does is already proposed or staffed');
    });

    it('loads the list again when the PM cancels, in case a failed proposal left it out of date', async () => {
      await open();
      await respond();

      await propose('Marko Marković', undefined, [MARKO]);

      expect(success).not.toHaveBeenCalled();
      expect(notices()).toHaveLength(0);
      expect(names()).toEqual(['Marko Marković']);
    });

    it('forgets the notices when another request is opened', async () => {
      await open();
      await respond();
      await propose('Jelena Petrović', proposalFor(JELENA, ['Capacity would be exceeded (120%)']), [
        MARKO,
      ]);
      expect(notices()).toHaveLength(1);

      params.next(convertToParamMap({ id: '10' }));
      await settle();
      httpMock.expectOne('/api/requests/10').flush({ ...REQUEST, id: 10, title: 'QA Engineer' });
      await settle();
      answer([MARKO], '/api/requests/10/candidates?page=0&size=10');
      await settle();

      expect(notices()).toHaveLength(0);
    });
  });

  it('loads the other request when the id in the URL changes', async () => {
    await open();
    await respond();

    params.next(convertToParamMap({ id: '10' }));
    await settle();
    httpMock.expectOne('/api/requests/10').flush({ ...REQUEST, id: 10, title: 'QA Engineer' });
    await settle();
    answer([JELENA], '/api/requests/10/candidates?page=0&size=10');
    await settle();

    expect(el().querySelector('h1')?.textContent).toContain('Candidates for QA Engineer');
    expect(names()).toEqual(['Jelena Petrović']);
  });
});
