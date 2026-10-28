import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { SS_DIALOG_DATA, SsDialogRef } from '../../shared/ui';
import { Project } from './project.models';
import { PROJECTS_URL } from './project.service';
import { toIsoDate } from '../../shared/dates';
import { ProjectDialog, ProjectDialogData } from './project-dialog';

const ALPHA: Project = {
  id: 5,
  name: 'Project Alpha',
  client: 'Acme Corp',
  description: 'Portal',
  startDate: '2026-11-01',
  endDate: '2027-03-31',
  status: 'PLANNED',
  pmId: 7,
  pmName: 'Ana PM',
};

describe('ProjectDialog', () => {
  let fixture: ComponentFixture<ProjectDialog>;
  let httpMock: HttpTestingController;
  const close = vi.fn();

  async function open(data: ProjectDialogData): Promise<void> {
    close.mockReset();
    await TestBed.configureTestingModule({
      imports: [ProjectDialog],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SS_DIALOG_DATA, useValue: data },
        { provide: SsDialogRef, useValue: { close } },
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ProjectDialog);
    await fixture.whenStable();
  }

  afterEach(() => httpMock.verify());

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function form() {
    return fixture.componentInstance['form'];
  }

  function fill(values: Partial<ReturnType<typeof form>['value']>): void {
    form().patchValue({
      name: 'Project Alpha',
      client: 'Acme Corp',
      description: '',
      startDate: new Date(2026, 10, 1),
      endDate: new Date(2027, 2, 31),
      ...values,
    });
  }

  async function submit(): Promise<void> {
    el().querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    await fixture.whenStable();
  }

  function type(label: string, text: string): void {
    const input = [...el().querySelectorAll('ss-field')]
      .find((field) => field.querySelector('ss-label')?.textContent?.trim() === label)!
      .querySelector('input')!;
    input.value = text;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  it('reads typed dates as day/month/year', async () => {
    await open({});

    type('Start date', '05/02/2027');
    type('End date', '31/03/2027');

    expect(toIsoDate(form().controls.startDate.value!)).toBe('2027-02-05');
    expect(toIsoDate(form().controls.endDate.value!)).toBe('2027-03-31');
  });

  it('says so when a typed date cannot be read, instead of "required"', async () => {
    await open({});

    type('Start date', 'tomorrow');
    form().controls.startDate.markAsTouched();
    fixture.detectChanges();

    expect(el().textContent).toContain('Enter a valid date');
    expect(el().textContent).not.toContain('Start date is required');
  });

  it('does not call the API while required fields are missing', async () => {
    await open({});

    await submit();

    httpMock.expectNone(PROJECTS_URL);
    expect(el().textContent).toContain('New project');
    expect(el().textContent).toContain('Name is required');
    expect(el().textContent).toContain('Client is required');
    expect(el().textContent).toContain('Start date is required');
    expect(el().textContent).toContain('End date is required');
  });

  it('does not accept a blank name or client', async () => {
    await open({});
    fill({ name: '   ', client: '   ' });

    await submit();

    httpMock.expectNone(PROJECTS_URL);
    expect(el().textContent).toContain('Name is required');
    expect(el().textContent).toContain('Client is required');
  });

  it('rejects a start date after the end date without calling the API', async () => {
    await open({});
    fill({ startDate: new Date(2027, 2, 31), endDate: new Date(2026, 10, 1) });

    await submit();

    httpMock.expectNone(PROJECTS_URL);
    expect(el().querySelector('[role="alert"]')?.textContent).toContain(
      'Start date must not be after end date',
    );
  });

  it('allows a start date equal to the end date', async () => {
    await open({});
    fill({ startDate: new Date(2026, 10, 2), endDate: new Date(2026, 10, 2) });

    await submit();

    httpMock.expectOne({ method: 'POST', url: PROJECTS_URL });
  });

  it('enforces the length limits', async () => {
    await open({});
    fill({ name: 'n'.repeat(201), client: 'c'.repeat(201), description: 'd'.repeat(2001) });

    await submit();

    httpMock.expectNone(PROJECTS_URL);
    expect(el().textContent).toContain('Name must be at most 200 characters');
    expect(el().textContent).toContain('Client must be at most 200 characters');
    expect(el().textContent).toContain('Description must be at most 2000 characters');
  });

  it('creates a project with trimmed text and ISO dates, and closes with it', async () => {
    await open({});
    fill({ name: '  Project Alpha  ', client: ' Acme Corp ', description: '  Portal  ' });

    await submit();

    const req = httpMock.expectOne({ method: 'POST', url: PROJECTS_URL });
    expect(req.request.body).toEqual({
      name: 'Project Alpha',
      client: 'Acme Corp',
      description: 'Portal',
      startDate: '2026-11-01',
      endDate: '2027-03-31',
    });
    req.flush(ALPHA);
    expect(close).toHaveBeenCalledWith(ALPHA);
  });

  it('sends a blank description as null', async () => {
    await open({});
    fill({ description: '   ' });

    await submit();

    const req = httpMock.expectOne({ method: 'POST', url: PROJECTS_URL });
    expect(req.request.body.description).toBeNull();
  });

  it('is filled with the project it was opened with, and updates it', async () => {
    await open({ project: ALPHA });
    expect(el().textContent).toContain('Edit project');
    expect(form().getRawValue()).toEqual({
      name: 'Project Alpha',
      client: 'Acme Corp',
      description: 'Portal',
      startDate: new Date(2026, 10, 1),
      endDate: new Date(2027, 2, 31),
    });
    fill({ name: 'Project Alpha 2' });

    await submit();

    const req = httpMock.expectOne({ method: 'PUT', url: `${PROJECTS_URL}/5` });
    expect(req.request.body.name).toBe('Project Alpha 2');
    expect(req.request.body.startDate).toBe('2026-11-01');
    req.flush({ ...ALPHA, name: 'Project Alpha 2' });
    expect(close).toHaveBeenCalledWith({ ...ALPHA, name: 'Project Alpha 2' });
  });

  it('stays open and can be saved again after an API error', async () => {
    await open({ project: ALPHA });

    await submit();
    httpMock
      .expectOne(`${PROJECTS_URL}/5`)
      .flush(
        { code: 'PROJECT_CLOSED', message: "A completed project can't be edited" },
        { status: 409, statusText: 'Conflict' },
      );
    await fixture.whenStable();

    expect(close).not.toHaveBeenCalled();
    await submit();
    httpMock.expectOne({ method: 'PUT', url: `${PROJECTS_URL}/5` });
  });

  it('ignores a second submit while the first is still being saved', async () => {
    await open({});
    fill({});

    await submit();
    await submit();

    httpMock.expectOne({ method: 'POST', url: PROJECTS_URL });
  });
});
