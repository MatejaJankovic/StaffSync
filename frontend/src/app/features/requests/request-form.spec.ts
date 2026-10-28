import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { Notifications } from '../../core/error/notifications';
import { AuthService } from '../../core/auth/auth.service';
import { Project } from '../projects/project.models';
import { Skill } from '../skills/skill.models';
import { StaffingRequest } from './request.models';
import { RequestForm } from './request-form';

const PROJECT: Project = {
  id: 5,
  name: 'Project Alpha',
  client: 'Acme Corp',
  description: null,
  startDate: '2026-11-01',
  endDate: '2027-03-31',
  status: 'PLANNED',
  pmId: 7,
  pmName: 'Ana PM',
};

const SKILLS: Skill[] = [
  { id: 1, name: 'Java', category: 'BACKEND' },
  { id: 2, name: 'Spring', category: 'BACKEND' },
  { id: 12, name: 'PostgreSQL', category: 'DATABASE' },
];

const EXISTING: StaffingRequest = {
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
    { skillId: 12, skillName: 'PostgreSQL', category: 'DATABASE', minLevel: 2, mandatory: false },
  ],
};

const DEMO_PAYLOAD = {
  title: 'Java Developer',
  seniority: 'MEDIOR',
  allocationPercent: 60,
  startDate: '2026-11-01',
  endDate: '2027-01-31',
  headcount: 2,
  skills: [
    { skillId: 1, minLevel: 4, mandatory: true },
    { skillId: 2, minLevel: 3, mandatory: true },
    { skillId: 12, minLevel: 2, mandatory: false },
  ],
};

describe('RequestForm', () => {
  let fixture: ComponentFixture<RequestForm>;
  let httpMock: HttpTestingController;
  let navigate: ReturnType<typeof vi.spyOn>;
  let success: ReturnType<typeof vi.spyOn>;
  let error: ReturnType<typeof vi.spyOn>;

  async function open(options: { requestId?: string; userId?: number } = {}): Promise<void> {
    const { requestId, userId = 7 } = options;
    await TestBed.configureTestingModule({
      imports: [RequestForm],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { currentUser: signal({ id: userId }), role: signal('PM') },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({
                projectId: '5',
                ...(requestId ? { id: requestId } : {}),
              }),
            },
          },
        },
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    success = vi.spyOn(TestBed.inject(Notifications), 'success').mockReturnValue(undefined);
    error = vi.spyOn(TestBed.inject(Notifications), 'error').mockReturnValue(undefined);
    fixture = TestBed.createComponent(RequestForm);
    fixture.detectChanges();
  }

  /** Answers the three loads of the page: the project, the skills catalog and (when editing) the request. */
  async function load(
    options: { project?: Project; request?: StaffingRequest | null } = {},
  ): Promise<void> {
    const { project = PROJECT, request = null } = options;
    httpMock.expectOne('/api/projects/5').flush(project);
    httpMock.expectOne('/api/skills').flush(SKILLS);
    if (request) {
      httpMock.expectOne('/api/requests/9').flush(request);
    }
    await settle();
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

  function form() {
    return fixture.componentInstance['form'];
  }

  function addSkill(skillId: number | null, minLevel: number | null, mandatory = true): void {
    fixture.componentInstance['addSkill']();
    const row = fixture.componentInstance['skills'].at(-1);
    row.setValue({ skillId, minLevel, mandatory });
  }

  function fillDemoRequest(): void {
    form().patchValue({
      title: 'Java Developer',
      seniority: 'MEDIOR',
      allocationPercent: 60,
      headcount: 2,
      period: { start: new Date(2026, 10, 1), end: new Date(2027, 0, 31) },
    });
    addSkill(1, 4, true);
    addSkill(2, 3, true);
    addSkill(12, 2, false);
  }

  async function submit(): Promise<void> {
    el().querySelector('form')!.dispatchEvent(new Event('submit'));
    await settle();
  }

  function button(text: string): HTMLButtonElement | undefined {
    return [...el().querySelectorAll('button')].find((b) => b.textContent?.includes(text));
  }

  it('shows an empty form for the project, with its name and period', async () => {
    await open();
    expect(el().textContent).toContain('Loading');

    await load();

    expect(el().querySelector('h1')?.textContent).toContain('New request');
    expect(el().textContent).toContain('Project Alpha · 1 Nov 2026 – 31 Mar 2027');
    expect(el().querySelector('form')).toBeTruthy();
    expect(el().querySelectorAll('.request-form__skill')).toHaveLength(0);
    expect(el().textContent).toContain('No skills yet');
  });

  it('does not call the API while required fields are missing', async () => {
    await open();
    await load();

    await submit();

    httpMock.expectNone('/api/projects/5/requests');
    expect(el().textContent).toContain('Title is required');
    expect(el().textContent).toContain('Seniority is required');
    expect(el().textContent).toContain('Allocation is required');
    expect(el().textContent).toContain('Start and end dates are required');
  });

  it('does not accept a blank title or a headcount below 1', async () => {
    await open();
    await load();
    fillDemoRequest();
    form().patchValue({ title: '   ', headcount: 0 });

    await submit();

    httpMock.expectNone('/api/projects/5/requests');
    expect(el().textContent).toContain('Title is required');
    expect(el().textContent).toContain('Headcount must be a whole number, at least 1');
  });

  it('does not accept a period outside the project', async () => {
    await open();
    await load();
    fillDemoRequest();
    form().patchValue({ period: { start: new Date(2026, 9, 31), end: new Date(2027, 0, 31) } });

    await submit();

    httpMock.expectNone('/api/projects/5/requests');
    expect(el().textContent).toContain('Dates must be between');
  });

  it('adds and removes skill rows', async () => {
    await open();
    await load();

    button('Add skill')!.click();
    button('Add skill')!.click();
    await settle();
    expect(el().querySelectorAll('.request-form__skill')).toHaveLength(2);
    expect(el().textContent).not.toContain('No skills yet');

    el().querySelector<HTMLButtonElement>('.request-form__remove')!.click();
    await settle();
    expect(el().querySelectorAll('.request-form__skill')).toHaveLength(1);
  });

  it('a new row asks for a skill and a level, and is required by default', async () => {
    await open();
    await load();
    button('Add skill')!.click();
    await settle();

    await submit();

    httpMock.expectNone('/api/projects/5/requests');
    expect(el().textContent).toContain('Pick a skill');
    expect(el().textContent).toContain('Pick a level');
    expect(fixture.componentInstance['skills'].at(0).controls.mandatory.value).toBe(true);
  });

  it('does not offer a skill that another row already has', async () => {
    await open();
    await load();
    addSkill(1, 4);
    addSkill(null, null);
    const component = fixture.componentInstance as unknown as {
      isTaken(skillId: number, row: number): boolean;
    };

    expect(component.isTaken(1, 1)).toBe(true);
    expect(component.isTaken(1, 0)).toBe(false);
    expect(component.isTaken(2, 1)).toBe(false);
  });

  it('creates the demo request from the spec and goes back to the project', async () => {
    await open();
    await load();
    fillDemoRequest();

    await submit();

    const call = httpMock.expectOne({ method: 'POST', url: '/api/projects/5/requests' });
    expect(call.request.body).toEqual(DEMO_PAYLOAD);
    call.flush({ ...EXISTING, id: 10 }, { status: 201, statusText: 'Created' });
    await settle();
    expect(success).toHaveBeenCalledWith('Request created');
    expect(navigate).toHaveBeenCalledWith(['/projects', 5]);
  });

  it('trims the title before sending it', async () => {
    await open();
    await load();
    fillDemoRequest();
    form().patchValue({ title: '  Java Developer  ' });

    await submit();

    const call = httpMock.expectOne({ method: 'POST', url: '/api/projects/5/requests' });
    expect((call.request.body as { title: string }).title).toBe('Java Developer');
    call.flush(EXISTING);
  });

  it('shows the API validation errors next to the fields and stays on the page', async () => {
    await open();
    await load();
    fillDemoRequest();

    await submit();
    httpMock.expectOne({ method: 'POST', url: '/api/projects/5/requests' }).flush(
      {
        timestamp: '2026-10-21T10:00:00Z',
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'Some fields are invalid',
        details: [
          { field: 'title', message: 'Title is already used here' },
          { field: 'skills[1].skillId', message: 'This skill is listed more than once' },
          { field: 'endDate', message: 'End date is not valid' },
        ],
      },
      { status: 400, statusText: 'Bad Request' },
    );
    await settle();

    expect(el().textContent).toContain('Title is already used here');
    expect(el().textContent).toContain('This skill is listed more than once');
    expect(el().textContent).toContain('End date is not valid');
    expect(navigate).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(button('Save')!.disabled).toBe(false);
  });

  it('shows other API errors in the snackbar, such as a period outside the project', async () => {
    await open();
    await load();
    fillDemoRequest();

    await submit();
    httpMock.expectOne({ method: 'POST', url: '/api/projects/5/requests' }).flush(
      {
        timestamp: '2026-10-21T10:00:00Z',
        status: 400,
        code: 'REQUEST_OUTSIDE_PROJECT',
        message: 'The request period must be inside the project period',
        details: [],
      },
      { status: 400, statusText: 'Bad Request' },
    );
    await settle();

    expect(error).toHaveBeenCalledWith('The request period must be inside the project period');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('does not send the request twice while it is being saved', async () => {
    await open();
    await load();
    fillDemoRequest();

    await submit();
    await submit();

    const calls = httpMock.match({ method: 'POST', url: '/api/projects/5/requests' });
    expect(calls).toHaveLength(1);
    calls[0].flush(EXISTING);
  });

  describe('editing', () => {
    it('fills the form with the request and its skills', async () => {
      await open({ requestId: '9' });
      await load({ request: EXISTING });

      expect(el().querySelector('h1')?.textContent).toContain('Edit request');
      expect(form().getRawValue()).toMatchObject({
        title: 'Java Developer',
        seniority: 'MEDIOR',
        allocationPercent: 60,
        headcount: 2,
        period: { start: new Date(2026, 10, 1), end: new Date(2027, 0, 31) },
        skills: [
          { skillId: 1, minLevel: 4, mandatory: true },
          { skillId: 12, minLevel: 2, mandatory: false },
        ],
      });
      expect(el().querySelectorAll('.request-form__skill')).toHaveLength(2);
    });

    it('saves the changes with PUT and goes back to the project', async () => {
      await open({ requestId: '9' });
      await load({ request: EXISTING });
      form().patchValue({ title: 'Senior Java Developer', headcount: 3 });

      await submit();

      const call = httpMock.expectOne({ method: 'PUT', url: '/api/requests/9' });
      expect(call.request.body).toMatchObject({
        title: 'Senior Java Developer',
        headcount: 3,
        skills: [
          { skillId: 1, minLevel: 4, mandatory: true },
          { skillId: 12, minLevel: 2, mandatory: false },
        ],
      });
      call.flush({ ...EXISTING, title: 'Senior Java Developer', headcount: 3 });
      await settle();
      expect(success).toHaveBeenCalledWith('Request saved');
      expect(navigate).toHaveBeenCalledWith(['/projects', 5]);
    });

    it('says a cancelled request cannot be edited', async () => {
      await open({ requestId: '9' });
      await load({ request: { ...EXISTING, status: 'CANCELLED' } });

      expect(el().textContent).toContain('A cancelled request can’t be edited.');
      expect(el().querySelector('form')).toBeNull();
    });

    it('says the request does not exist when it belongs to another project', async () => {
      await open({ requestId: '9' });
      httpMock.expectOne('/api/projects/5').flush(PROJECT);
      httpMock.expectOne('/api/skills').flush(SKILLS);
      httpMock.expectOne('/api/requests/9').flush({ ...EXISTING, projectId: 6 });
      await settle();

      expect(el().textContent).toContain('doesn’t exist');
      expect(el().querySelector('form')).toBeNull();
    });
  });

  describe('who can use it', () => {
    it('shows no form to a PM who does not own the project', async () => {
      await open({ userId: 8 });
      await load();

      expect(el().textContent).toContain(
        'Only the project manager who owns this project can manage its staffing requests.',
      );
      expect(el().querySelector('form')).toBeNull();
    });

    it.each(['COMPLETED', 'CANCELLED'] as const)(
      'shows no form for a %s project',
      async (status) => {
        await open();
        await load({ project: { ...PROJECT, status } });

        expect(el().textContent).toContain(
          `A ${status.toLowerCase()} project can’t have staffing requests`,
        );
        expect(el().querySelector('form')).toBeNull();
      },
    );

    it('says the project does not exist on a 404', async () => {
      await open();
      // The skills are answered first: the failed project cancels the other requests of the page
      httpMock.expectOne('/api/skills').flush(SKILLS);
      httpMock
        .expectOne('/api/projects/5')
        .flush(
          { code: 'NOT_FOUND', message: 'Project 5 not found' },
          { status: 404, statusText: 'Not Found' },
        );
      await settle();

      expect(el().textContent).toContain('doesn’t exist');
    });

    it('says the form could not be loaded on a server error', async () => {
      await open();
      httpMock.expectOne('/api/skills').flush(SKILLS);
      httpMock
        .expectOne('/api/projects/5')
        .flush(null, { status: 500, statusText: 'Server Error' });
      await settle();

      expect(el().textContent).toContain('Unable to load the form');
    });
  });
});
