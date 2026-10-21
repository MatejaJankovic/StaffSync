import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { routes } from '../../app.routes';
import { Role } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { Notifications } from '../../core/error/notifications';
import { Project } from './project.models';
import { PROJECTS_URL } from './project.service';
import { ProjectDetails } from './project-details';

const ALPHA: Project = {
  id: 5,
  name: 'Project Alpha',
  client: 'Acme Corp',
  description: 'Customer portal rebuild',
  startDate: '2026-11-01',
  endDate: '2027-03-31',
  status: 'PLANNED',
  pmId: 7,
  pmName: 'Ana PM',
};

describe('ProjectDetails', () => {
  let fixture: ComponentFixture<ProjectDetails>;
  let httpMock: HttpTestingController;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let dialogOpen: ReturnType<typeof vi.spyOn>;
  let success: ReturnType<typeof vi.spyOn>;

  async function open(options: { userId?: number; role?: Role; id?: string } = {}) {
    const { userId = 7, role = 'PM', id = '5' } = options;
    params = new BehaviorSubject(convertToParamMap({ id }));
    await TestBed.configureTestingModule({
      imports: [ProjectDetails],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
        {
          provide: AuthService,
          useValue: { currentUser: signal({ id: userId }), role: signal(role) },
        },
        {
          provide: ActivatedRoute,
          useValue: { paramMap: params, snapshot: { paramMap: params.value } },
        },
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    dialogOpen = vi.spyOn(TestBed.inject(MatDialog), 'open');
    success = vi.spyOn(TestBed.inject(Notifications), 'success').mockReturnValue(undefined);
    fixture = TestBed.createComponent(ProjectDetails);
    fixture.detectChanges();
  }

  afterEach(() => httpMock.verify());

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function respond(project: Project = ALPHA, id = project.id): Promise<void> {
    httpMock.expectOne(`${PROJECTS_URL}/${id}`).flush(project);
    await settle();
  }

  function editButton(): HTMLButtonElement | undefined {
    return [...el().querySelectorAll('button')].find((b) => b.textContent?.includes('Edit'));
  }

  it('shows the project with its status, client, period, project manager and description', async () => {
    await open();
    expect(el().textContent).toContain('Loading project');

    await respond();

    expect(el().querySelector('h1')?.textContent).toContain('Project Alpha');
    expect(el().querySelector('app-status-chip')?.textContent?.trim()).toBe('Planned');
    const text = el().textContent!;
    expect(text).toContain('Acme Corp');
    expect(text).toContain('1 Nov 2026 – 31 Mar 2027');
    expect(text).toContain('Ana PM');
    expect(text).toContain('Customer portal rebuild');
  });

  it('says there is no description when the project has none', async () => {
    await open();

    await respond({ ...ALPHA, description: null });

    expect(el().textContent).toContain('No description');
  });

  it('has a section for staffing requests and one for the team, ready for US-05 and US-08', async () => {
    await open();

    await respond();

    const headings = [...el().querySelectorAll('h2')].map((h) => h.textContent?.trim());
    expect(headings).toEqual(['Staffing requests', 'Team']);
    expect(el().querySelector('.project__status-action')).toBeTruthy();
  });

  it('links back to My projects for a PM', async () => {
    await open();
    await respond();

    expect(el().querySelector('a.project__back')?.getAttribute('href')).toBe('/projects');
  });

  it('has no link to My projects for other roles, since they have no such page', async () => {
    await open({ role: 'RM', userId: 3 });
    await respond();

    expect(el().querySelector('a.project__back')).toBeNull();
  });

  it('offers Edit to the PM who owns the project', async () => {
    await open();
    await respond();

    expect(editButton()).toBeTruthy();
  });

  it('offers no Edit to another PM', async () => {
    await open({ userId: 8 });
    await respond();

    expect(editButton()).toBeUndefined();
  });

  it('offers no Edit to other roles', async () => {
    await open({ role: 'EMPLOYEE', userId: 7 });
    await respond({ ...ALPHA, pmId: 99 });

    expect(editButton()).toBeUndefined();
  });

  it.each(['COMPLETED', 'CANCELLED'] as const)(
    'offers no Edit once the project is %s',
    async (status) => {
      await open();

      await respond({ ...ALPHA, status });

      expect(editButton()).toBeUndefined();
    },
  );

  it('opens the edit dialog with the project, then shows the saved version', async () => {
    await open();
    await respond();
    const saved = { ...ALPHA, name: 'Project Alpha 2' };
    dialogOpen.mockReturnValue({ afterClosed: () => of(saved) } as never);

    editButton()!.click();
    await settle();

    expect(dialogOpen.mock.calls[0][1]).toMatchObject({ data: { project: ALPHA } });
    expect(el().querySelector('h1')?.textContent).toContain('Project Alpha 2');
    expect(success).toHaveBeenCalledWith('Project saved');
  });

  it('keeps the project as it was when the edit dialog is cancelled', async () => {
    await open();
    await respond();
    dialogOpen.mockReturnValue({ afterClosed: () => of(undefined) } as never);

    editButton()!.click();
    await settle();

    expect(el().querySelector('h1')?.textContent).toContain('Project Alpha');
    expect(success).not.toHaveBeenCalled();
  });

  it('says so when the project does not exist', async () => {
    await open({ id: '404' });

    httpMock
      .expectOne(`${PROJECTS_URL}/404`)
      .flush(
        { code: 'NOT_FOUND', message: 'Project 404 not found' },
        { status: 404, statusText: 'Not Found' },
      );
    await settle();

    expect(el().querySelector('[role="alert"]')?.textContent).toContain('doesn’t exist');
    expect(editButton()).toBeUndefined();
  });

  it('does not call the API for an id that is not a number', async () => {
    await open({ id: 'abc' });
    await settle();

    httpMock.expectNone((req) => req.url.startsWith(PROJECTS_URL));
    expect(el().textContent).toContain('doesn’t exist');
  });

  it('offers a retry when the project cannot be loaded', async () => {
    await open();

    httpMock
      .expectOne(`${PROJECTS_URL}/5`)
      .flush(
        { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
        { status: 500, statusText: 'Error' },
      );
    await settle();
    expect(el().textContent).toContain('Unable to load the project');

    [...el().querySelectorAll('button')].find((b) => b.textContent?.includes('Retry'))!.click();
    await respond();

    expect(el().querySelector('h1')?.textContent).toContain('Project Alpha');
  });

  it('says the project does not exist when a retry answers 404', async () => {
    await open();
    httpMock
      .expectOne(`${PROJECTS_URL}/5`)
      .flush({ code: 'INTERNAL_ERROR', message: 'x' }, { status: 500, statusText: 'Error' });
    await settle();

    [...el().querySelectorAll('button')].find((b) => b.textContent?.includes('Retry'))!.click();
    httpMock
      .expectOne(`${PROJECTS_URL}/5`)
      .flush({ code: 'NOT_FOUND', message: 'x' }, { status: 404, statusText: 'Not Found' });
    await settle();

    expect(el().textContent).toContain('doesn’t exist');
  });

  it('loads the other project when the id in the URL changes', async () => {
    await open();
    await respond();

    params.next(convertToParamMap({ id: '6' }));
    await respond({ ...ALPHA, id: 6, name: 'Project Beta' });

    expect(el().querySelector('h1')?.textContent).toContain('Project Beta');
  });
});

describe('Project details route', () => {
  it('is open to every logged-in role', () => {
    const route = routes
      .find((r) => r.path === '')!
      .children!.find((r) => r.path === 'projects/:id')!;

    expect(route.loadComponent).toBeDefined();
    expect(route.canActivate).toBeUndefined();
  });
});
