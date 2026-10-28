import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { SsDialog, SsToast } from '../../shared/ui';
import { of } from 'rxjs';
import { routes } from '../../app.routes';
import { Skill } from './skill.models';
import { SKILLS_URL } from './skill.service';
import { SkillsPage } from './skills-page';

const SKILLS: Skill[] = [
  { id: 2, name: 'Spring', category: 'BACKEND' },
  { id: 1, name: 'Java', category: 'BACKEND' },
  { id: 3, name: 'PostgreSQL', category: 'DATABASE' },
];

describe('SkillsPage', () => {
  let fixture: ComponentFixture<SkillsPage>;
  let httpMock: HttpTestingController;
  let dialogOpen: ReturnType<typeof vi.spyOn>;
  let snackBarOpen: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SkillsPage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    dialogOpen = vi.spyOn(TestBed.inject(SsDialog), 'open');
    snackBarOpen = vi.spyOn(TestBed.inject(SsToast), 'open').mockReturnValue(undefined as never);
    fixture = TestBed.createComponent(SkillsPage);
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  async function loadSkills(skills: Skill[] = SKILLS): Promise<void> {
    httpMock.expectOne(SKILLS_URL).flush(skills);
    await fixture.whenStable();
  }

  function closeDialogWith(result: unknown): void {
    dialogOpen.mockReturnValue({ afterClosed: () => of(result) } as never);
  }

  function clickButton(label: string): void {
    el().querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!.click();
  }

  it('lists the skills grouped by category, sorted by name', async () => {
    await loadSkills();

    const headings = [...el().querySelectorAll('h2')].map((h) => h.textContent?.trim());
    expect(headings).toEqual(['Backend', 'Database']);
    const names = [...el().querySelectorAll('td.cdk-column-name')].map((c) =>
      c.textContent?.trim(),
    );
    expect(names).toEqual(['Java', 'Spring', 'PostgreSQL']);
  });

  it('says so when the catalog is empty', async () => {
    await loadSkills([]);

    expect(el().textContent).toContain('The catalog is empty');
  });

  it('offers a retry when loading fails', async () => {
    httpMock.expectOne(SKILLS_URL).flush(null, { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();

    expect(el().querySelector('[role="alert"]')?.textContent).toContain('Unable to load');
    el().querySelector<HTMLButtonElement>('[role="alert"] button')!.click();
    httpMock.expectOne(SKILLS_URL).flush(SKILLS);
  });

  it('adds a saved skill to its category', async () => {
    await loadSkills();
    closeDialogWith({ id: 4, name: 'Python', category: 'BACKEND' });

    el().querySelector<HTMLButtonElement>('header button')!.click();
    await fixture.whenStable();

    const names = [...el().querySelectorAll('td.cdk-column-name')].map((c) =>
      c.textContent?.trim(),
    );
    expect(names).toEqual(['Java', 'Python', 'Spring', 'PostgreSQL']);
  });

  it('moves an edited skill to its new category', async () => {
    await loadSkills();
    closeDialogWith({ id: 1, name: 'Java', category: 'OTHER' });

    clickButton('Edit Java');
    await fixture.whenStable();

    const headings = [...el().querySelectorAll('h2')].map((h) => h.textContent?.trim());
    expect(headings).toEqual(['Backend', 'Database', 'Other']);
    expect(dialogOpen.mock.calls[0][1]).toMatchObject({ data: { skill: SKILLS[1] } });
  });

  it('does not delete when the confirmation is cancelled', async () => {
    await loadSkills();
    closeDialogWith(false);

    clickButton('Delete Java');
    await fixture.whenStable();

    httpMock.expectNone(`${SKILLS_URL}/1`);
    expect(el().textContent).toContain('Java');
  });

  it('deletes a confirmed skill and removes it from the list', async () => {
    await loadSkills();
    closeDialogWith(true);

    clickButton('Delete Java');
    httpMock.expectOne({ method: 'DELETE', url: `${SKILLS_URL}/1` }).flush(null, {
      status: 204,
      statusText: 'No Content',
    });
    await fixture.whenStable();

    expect(el().textContent).not.toContain('Java');
    expect(snackBarOpen).toHaveBeenCalledWith('Deleted Java', 'Dismiss', expect.anything());
  });

  it('shows the 409 message in a snackbar when the skill is in use', async () => {
    await loadSkills();
    closeDialogWith(true);

    clickButton('Delete Java');
    httpMock
      .expectOne({ method: 'DELETE', url: `${SKILLS_URL}/1` })
      .flush(
        { code: 'SKILL_IN_USE', message: "Skill 'Java' is in use and cannot be deleted" },
        { status: 409, statusText: 'Conflict' },
      );
    await fixture.whenStable();

    expect(el().textContent).toContain('Java');
    expect(snackBarOpen).toHaveBeenCalledWith(
      "Skill 'Java' is in use and cannot be deleted",
      'Dismiss',
      expect.anything(),
    );
  });
});

describe('Skills catalog route', () => {
  it('is open to Admin only', async () => {
    const shell = routes.find((route) => route.path === '');
    const route = shell?.children?.find((child) => child.path === 'admin/skills');

    expect(await (route?.loadComponent as () => Promise<unknown>)()).toBe(SkillsPage);
    expect(route?.data?.['roles']).toEqual(['ADMIN']);
    expect(route?.canActivate).toBeDefined();
  });
});
