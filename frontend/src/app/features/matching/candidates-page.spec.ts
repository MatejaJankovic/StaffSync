import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { RequestStatus, StaffingRequest } from '../requests/request.models';
import { Candidate } from './candidate.models';
import { CandidatesPage } from './candidates-page';

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

describe('CandidatesPage', () => {
  let fixture: ComponentFixture<CandidatesPage>;
  let httpMock: HttpTestingController;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  async function open(id = '9'): Promise<void> {
    params = new BehaviorSubject(convertToParamMap({ id }));
    await TestBed.configureTestingModule({
      imports: [CandidatesPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
        {
          provide: ActivatedRoute,
          useValue: { paramMap: params, snapshot: { paramMap: params.value } },
        },
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
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
    return [...el().querySelectorAll<HTMLElement>('tr.mat-mdc-row')].find((row) =>
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

      expect(texts(rowOf('Marko'), '.candidate__notes--reasons li > span')).toEqual(MARKO.reasons);
      expect(texts(rowOf('Jelena'), '.candidate__notes--reasons li > span')).toEqual(
        JELENA.reasons,
      );
    });

    it('shows the warnings in their own list, each with a warning icon', async () => {
      await open();

      await respond();

      const jelena = rowOf('Jelena');
      expect(texts(jelena, '.candidate__notes--warnings li > span')).toEqual(JELENA.warnings);
      expect(texts(jelena, '.candidate__notes--warnings li > mat-icon')).toEqual([
        'warning',
        'warning',
      ]);
      expect(jelena.querySelector('ul[aria-label="Warnings"]')).toBeTruthy();
      expect(texts(rowOf('Marko'), '.candidate__notes--warnings li > span')).toEqual([
        'Seniority SENIOR (MEDIOR requested)',
      ]);
    });

    it('has no warnings list for a candidate without warnings, and no reasons list without reasons', async () => {
      await open();

      await respond(REQUEST, [
        { ...MARKO, warnings: [] },
        { ...JELENA, reasons: [] },
      ]);

      expect(rowOf('Marko').querySelector('.candidate__notes--warnings')).toBeNull();
      expect(rowOf('Marko').querySelector('.candidate__notes--reasons')).toBeTruthy();
      expect(rowOf('Jelena').querySelector('.candidate__notes--reasons')).toBeNull();
      expect(rowOf('Jelena').querySelector('.candidate__notes--warnings')).toBeTruthy();
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

      expect(el().querySelector('mat-progress-bar')).toBeTruthy();
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
