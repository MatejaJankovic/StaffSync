import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { SS_DIALOG_DATA, SsDialog, SsDialogRef } from '../../shared/ui';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { Notifications } from '../../core/error/notifications';
import { ConfirmDialogService } from '../../shared/confirm-dialog/confirm-dialog.service';
import { Project } from '../projects/project.models';
import { ProjectRequests } from './project-requests';
import { RequestDetailsDialog } from './request-details-dialog';
import { RequestStatus, StaffingRequest } from './request.models';

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

function request(id: number, title: string, status: RequestStatus = 'OPEN'): StaffingRequest {
  return {
    id,
    projectId: 5,
    title,
    seniority: 'MEDIOR',
    allocationPercent: 60,
    startDate: '2026-11-01',
    endDate: '2027-01-31',
    headcount: 2,
    status,
    createdAt: '2026-10-21T09:15:30Z',
    skills: [
      { skillId: 1, skillName: 'Java', category: 'BACKEND', minLevel: 4, mandatory: true },
      { skillId: 12, skillName: 'PostgreSQL', category: 'DATABASE', minLevel: 2, mandatory: false },
    ],
  };
}

const LIST_URL = '/api/projects/5/requests?page=0&size=10';

describe('ProjectRequests', () => {
  let fixture: ComponentFixture<ProjectRequests>;
  let httpMock: HttpTestingController;
  let dialogOpen: ReturnType<typeof vi.spyOn>;
  let confirm: ReturnType<typeof vi.spyOn>;
  let success: ReturnType<typeof vi.spyOn>;

  async function open(
    rows: StaffingRequest[],
    options: { userId?: number; project?: Project } = {},
  ): Promise<void> {
    const { userId = 7, project = PROJECT } = options;
    await TestBed.configureTestingModule({
      imports: [ProjectRequests],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AuthService, useValue: { currentUser: signal({ id: userId }) } },
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    dialogOpen = vi.spyOn(TestBed.inject(SsDialog), 'open').mockReturnValue(undefined as never);
    confirm = vi.spyOn(TestBed.inject(ConfirmDialogService), 'confirm').mockReturnValue(of(true));
    success = vi.spyOn(TestBed.inject(Notifications), 'success').mockReturnValue(undefined);
    fixture = TestBed.createComponent(ProjectRequests);
    fixture.componentRef.setInput('project', project);
    await settle();
    answer(rows);
    await settle();
  }

  function answer(rows: StaffingRequest[]): void {
    httpMock.expectOne(LIST_URL).flush({
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

  function rowOf(title: string): HTMLElement {
    return [...el().querySelectorAll<HTMLElement>('tr.cdk-row')].find((row) =>
      row.textContent?.includes(title),
    )!;
  }

  function action(row: HTMLElement, label: string): HTMLElement | null {
    return row.querySelector<HTMLElement>(`[aria-label="${label}"]`);
  }

  function findCandidates(row: HTMLElement): HTMLAnchorElement | undefined {
    return [...row.querySelectorAll('a')].find((a) => a.textContent?.includes('Find candidates'));
  }

  function newRequest(): HTMLAnchorElement | undefined {
    return [...el().querySelectorAll('a')].find((a) => a.textContent?.includes('New request'));
  }

  it('lists the requests with title, seniority, allocation, period, headcount and a status chip', async () => {
    await open([request(1, 'Java Developer'), request(2, 'QA Engineer', 'PARTIALLY_FILLED')]);

    const row = rowOf('Java Developer');
    expect(row.textContent).toContain('Medior');
    expect(row.textContent).toContain('60%');
    expect(row.textContent).toContain('1 Nov 2026 – 31 Jan 2027');
    expect(row.textContent).toContain('2');
    expect(row.querySelector('app-status-chip')?.textContent?.trim()).toBe('Open');
    expect(rowOf('QA Engineer').querySelector('app-status-chip')?.textContent?.trim()).toBe(
      'Partially filled',
    );
  });

  it('says there are no requests yet, and points the PM to New request', async () => {
    await open([]);

    expect(el().textContent).toContain('no staffing requests yet');
    expect(el().textContent).toContain('New request');
  });

  describe('for the PM who owns the project', () => {
    it('links New request to the form of the project', async () => {
      await open([]);

      expect(newRequest()?.getAttribute('href')).toBe('/projects/5/requests/new');
    });

    it('offers Edit, Cancel and Find candidates on an OPEN request', async () => {
      await open([request(1, 'Java Developer')]);
      const row = rowOf('Java Developer');

      expect(action(row, 'Edit Java Developer')?.getAttribute('href')).toBe(
        '/projects/5/requests/1/edit',
      );
      expect(action(row, 'Cancel Java Developer')).toBeTruthy();
      expect(findCandidates(row)?.getAttribute('href')).toBe('/requests/1/candidates');
    });

    it('offers Edit, Cancel and Find candidates on a PARTIALLY_FILLED request', async () => {
      await open([request(1, 'Java Developer', 'PARTIALLY_FILLED')]);
      const row = rowOf('Java Developer');

      expect(findCandidates(row)).toBeTruthy();
      expect(action(row, 'Edit Java Developer')).toBeTruthy();
      expect(action(row, 'Cancel Java Developer')).toBeTruthy();
    });

    it('offers neither Find candidates nor Cancel on a FILLED request', async () => {
      await open([request(1, 'Java Developer', 'FILLED')]);
      const row = rowOf('Java Developer');

      expect(findCandidates(row)).toBeUndefined();
      expect(action(row, 'Cancel Java Developer')).toBeNull();
      expect(action(row, 'Edit Java Developer')).toBeTruthy();
    });

    it('offers no action on a CANCELLED request', async () => {
      await open([request(1, 'Java Developer', 'CANCELLED')]);
      const row = rowOf('Java Developer');

      expect(findCandidates(row)).toBeUndefined();
      expect(action(row, 'Edit Java Developer')).toBeNull();
      expect(action(row, 'Cancel Java Developer')).toBeNull();
    });

    it.each(['COMPLETED', 'CANCELLED'] as const)(
      'offers no action on the requests of a %s project',
      async (status) => {
        await open([request(1, 'Java Developer')], { project: { ...PROJECT, status } });
        const row = rowOf('Java Developer');

        expect(newRequest()).toBeUndefined();
        expect(action(row, 'Edit Java Developer')).toBeNull();
        expect(action(row, 'Cancel Java Developer')).toBeNull();
        expect(findCandidates(row)).toBeUndefined();
      },
    );

    it('asks before cancelling, then cancels the request and reloads the list', async () => {
      await open([request(1, 'Java Developer')]);

      action(rowOf('Java Developer'), 'Cancel Java Developer')!.click();
      await settle();

      expect(confirm).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Cancel request?', destructive: true }),
      );
      httpMock
        .expectOne({ method: 'DELETE', url: '/api/requests/1' })
        .flush(request(1, 'Java Developer', 'CANCELLED'));
      await settle();
      answer([request(1, 'Java Developer', 'CANCELLED')]);
      await settle();
      expect(success).toHaveBeenCalledWith('Request cancelled');
      expect(rowOf('Java Developer').querySelector('app-status-chip')?.textContent?.trim()).toBe(
        'Cancelled',
      );
    });

    it('keeps the request when the PM does not confirm', async () => {
      await open([request(1, 'Java Developer')]);
      confirm.mockReturnValue(of(false));

      action(rowOf('Java Developer'), 'Cancel Java Developer')!.click();
      await settle();

      httpMock.expectNone({ method: 'DELETE', url: '/api/requests/1' });
      expect(success).not.toHaveBeenCalled();
    });
  });

  describe('for everyone else', () => {
    it.each([
      ['another PM', 8],
      ['an RM, an Employee or an Admin', 3],
    ])('shows %s the requests but no actions', async (_who, userId) => {
      await open([request(1, 'Java Developer')], { userId });

      expect(rowOf('Java Developer')).toBeTruthy();
      expect(newRequest()).toBeUndefined();
      expect(action(rowOf('Java Developer'), 'Edit Java Developer')).toBeNull();
      expect(action(rowOf('Java Developer'), 'Cancel Java Developer')).toBeNull();
      expect(findCandidates(rowOf('Java Developer'))).toBeUndefined();
    });

    it('says there are no requests, without suggesting to create one', async () => {
      await open([], { userId: 3 });

      expect(el().textContent).toContain('This project has no staffing requests.');
      expect(el().textContent).not.toContain('New request');
    });
  });

  describe('opening a request', () => {
    it('opens the details dialog with the request when its row is clicked', async () => {
      const java = request(1, 'Java Developer');
      await open([java]);

      rowOf('Java Developer').click();
      await settle();

      expect(dialogOpen).toHaveBeenCalledTimes(1);
      expect(dialogOpen.mock.calls[0][0]).toBe(RequestDetailsDialog);
      expect(dialogOpen.mock.calls[0][1]).toMatchObject({ data: { request: java } });
    });

    it('does not open it when an action in the row is clicked', async () => {
      await open([request(1, 'Java Developer')]);

      action(rowOf('Java Developer'), 'Cancel Java Developer')!.click();
      await settle();
      httpMock.expectOne({ method: 'DELETE', url: '/api/requests/1' }).flush(null, {
        status: 409,
        statusText: 'Conflict',
      });
      await settle();

      expect(dialogOpen).not.toHaveBeenCalled();
      // a failed cancel loads the list again, in case the request changed
      answer([request(1, 'Java Developer', 'FILLED')]);
      await settle();
      expect(success).not.toHaveBeenCalled();
    });
  });
});

describe('RequestDetailsDialog', () => {
  async function render(data: StaffingRequest): Promise<HTMLElement> {
    await TestBed.configureTestingModule({
      imports: [RequestDetailsDialog],
      providers: [
        { provide: SS_DIALOG_DATA, useValue: { request: data } },
        // ssDialogClose needs the ref of the dialog it closes; this spec renders the component alone
        { provide: SsDialogRef, useValue: { close: vi.fn() } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(RequestDetailsDialog);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows the request and splits its skills into required and nice to have', async () => {
    const el = await render(request(1, 'Java Developer'));

    expect(el.querySelector('h2')?.textContent).toContain('Java Developer');
    expect(el.querySelector('app-status-chip')?.textContent?.trim()).toBe('Open');
    const text = el.textContent!;
    expect(text).toContain('Medior');
    expect(text).toContain('60%');
    expect(text).toContain('1 Nov 2026 – 31 Jan 2027');
    const lists = el.querySelectorAll('ul');
    expect(lists).toHaveLength(2);
    expect(lists[0].textContent).toContain('Java');
    expect(lists[0].textContent).toContain('level 4 or more');
    expect(lists[1].textContent).toContain('PostgreSQL');
    expect(lists[1].textContent).toContain('level 2 or more');
  });

  it('says none when there are no required or no nice-to-have skills', async () => {
    const el = await render({ ...request(1, 'Java Developer'), skills: [] });

    expect(el.querySelectorAll('ul')).toHaveLength(0);
    expect(el.textContent!.match(/None/g)).toHaveLength(2);
  });
});
