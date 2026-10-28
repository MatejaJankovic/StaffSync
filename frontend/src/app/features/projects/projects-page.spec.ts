import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { SsDialog, SsSelect } from '../../shared/ui';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { Page } from '../../core/api/page';
import { AuthService } from '../../core/auth/auth.service';
import { Notifications } from '../../core/error/notifications';
import { routes } from '../../app.routes';
import { Project } from './project.models';
import { PROJECTS_URL } from './project.service';
import { ProjectsPage } from './projects-page';

const ALPHA: Project = {
  id: 1,
  name: 'Project Alpha',
  client: 'Acme Corp',
  description: null,
  startDate: '2026-11-01',
  endDate: '2027-03-31',
  status: 'PLANNED',
  pmId: 7,
  pmName: 'Ana PM',
};
const BETA: Project = { ...ALPHA, id: 2, name: 'Project Beta', status: 'COMPLETED' };

function pageOf(...projects: Project[]): Page<Project> {
  return {
    content: projects,
    page: { size: 20, number: 0, totalElements: projects.length, totalPages: 1 },
  };
}

describe('ProjectsPage', () => {
  let fixture: ComponentFixture<ProjectsPage>;
  let httpMock: HttpTestingController;
  let dialogOpen: ReturnType<typeof vi.spyOn>;
  let navigate: ReturnType<typeof vi.spyOn>;
  let success: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProjectsPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AuthService, useValue: { currentUser: signal({ id: 7 }) } },
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    dialogOpen = vi.spyOn(TestBed.inject(SsDialog), 'open');
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    success = vi.spyOn(TestBed.inject(Notifications), 'success').mockReturnValue(undefined);
    fixture = TestBed.createComponent(ProjectsPage);
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /** Answers the table's request for the PM's projects. */
  async function load(page: Page<Project> = pageOf(ALPHA, BETA)) {
    const req = httpMock.expectOne((r) => r.url === PROJECTS_URL);
    req.flush(page);
    await settle();
    return req.request;
  }

  function closeDialogWith(result: unknown): void {
    dialogOpen.mockReturnValue({ afterClosed: () => of(result) } as never);
  }

  function button(label: string): HTMLButtonElement | null {
    return el().querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  }

  it('asks only for the current PM’s projects, sorted by the API default', async () => {
    const request = await load();

    expect(request.params.get('pmId')).toBe('7');
    expect(request.params.has('status')).toBe(false);
    expect(request.params.get('page')).toBe('0');
    expect(request.params.get('size')).toBe('20');
  });

  it('shows name, client, period and a status chip for each project', async () => {
    await load();

    const rows = [...el().querySelectorAll('tr.cdk-row')].map((row) =>
      [...row.querySelectorAll('td')].map((cell) => cell.textContent?.trim()),
    );
    expect(rows[0].slice(0, 3)).toEqual(['Project Alpha', 'Acme Corp', '1 Nov 2026 – 31 Mar 2027']);
    expect(rows[0][3]).toBe('Planned');
    expect(rows[1][3]).toBe('Completed');
  });

  it('says so when the PM has no projects', async () => {
    await load(pageOf());

    expect(el().textContent).toContain('You have no projects yet');
  });

  it('filters by status and goes back to the first page', async () => {
    await load();

    const select = fixture.debugElement.query(By.directive(SsSelect)).componentInstance as SsSelect;
    select.open();
    await settle();
    document.querySelectorAll<HTMLElement>('[role="option"]')[2].click(); // Active
    await settle();

    const request = await load(pageOf());
    expect(request.params.get('status')).toBe('ACTIVE');
    expect(request.params.get('pmId')).toBe('7');
    expect(request.params.get('page')).toBe('0');
    expect(el().textContent).toContain('You have no active projects');
  });

  it('opens Project details when a row is clicked', async () => {
    await load();

    el().querySelector<HTMLElement>('tr.cdk-row')!.click();

    expect(navigate).toHaveBeenCalledWith(['/projects', 1]);
  });

  it('offers Edit only for projects that are not completed or cancelled', async () => {
    await load();

    expect(button('Edit Project Alpha')).toBeTruthy();
    expect(button('Edit Project Beta')).toBeNull();
  });

  it('opens the dialog without a project for New project, then reloads and confirms', async () => {
    await load();
    closeDialogWith(ALPHA);

    [...el().querySelectorAll('button')]
      .find((b) => b.textContent?.includes('New project'))!
      .click();
    await settle();

    expect(dialogOpen.mock.calls[0][1]).toMatchObject({ data: {} });
    await load();
    expect(success).toHaveBeenCalledWith('Project created');
  });

  it('opens the dialog with the project for Edit, without opening its details', async () => {
    await load();
    closeDialogWith(ALPHA);

    button('Edit Project Alpha')!.click();
    await settle();

    expect(dialogOpen.mock.calls[0][1]).toMatchObject({ data: { project: ALPHA } });
    expect(navigate).not.toHaveBeenCalled();
    await load();
    expect(success).toHaveBeenCalledWith('Project saved');
  });

  it('does nothing when the dialog is cancelled', async () => {
    await load();
    closeDialogWith(undefined);

    button('Edit Project Alpha')!.click();
    await settle();

    httpMock.expectNone(PROJECTS_URL);
    expect(success).not.toHaveBeenCalled();
  });
});

describe('My projects route', () => {
  it('opens the projects page, for PMs only', () => {
    const route = routes.find((r) => r.path === '')!.children!.find((r) => r.path === 'projects')!;

    expect(route.loadComponent).toBeDefined();
    expect(route.data?.['roles']).toEqual(['PM']);
  });
});
