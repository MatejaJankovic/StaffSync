import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { routes } from '../../app.routes';
import { ME_URL } from '../../core/auth/auth.service';
import { Notifications } from '../../core/error/notifications';
import { Skill } from '../skills/skill.models';
import { SKILLS_URL } from '../skills/skill.service';
import { EmployeeSkill, Profile } from './profile.models';
import { ProfilePage } from './profile-page';
import { userSkillsUrl } from './profile.service';

const PROFILE: Profile = {
  id: 4,
  email: 'bogdan_employee@staffsync.local',
  firstName: 'Bogdan',
  lastName: 'Vujic',
  role: 'EMPLOYEE',
  department: 'Engineering',
  seniority: 'MEDIOR',
  capacityPercent: 80,
  manager: { id: 3, firstName: 'Lazar', lastName: 'Dunjic' },
};

const CATALOG: Skill[] = [
  { id: 1, name: 'Java', category: 'BACKEND' },
  { id: 2, name: 'Spring', category: 'BACKEND' },
  { id: 3, name: 'PostgreSQL', category: 'DATABASE' },
];

const SKILLS: EmployeeSkill[] = [
  { skillId: 1, skillName: 'Java', category: 'BACKEND', level: 4, yearsOfExperience: 3 },
  { skillId: 2, skillName: 'Spring', category: 'BACKEND', level: 2, yearsOfExperience: 1 },
];

describe('ProfilePage', () => {
  let fixture: ComponentFixture<ProfilePage>;
  let httpMock: HttpTestingController;
  let notifications: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem('staffsync.token', 'jwt');
    localStorage.setItem('staffsync.user', JSON.stringify(PROFILE));
    notifications = { success: vi.fn(), error: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [ProfilePage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Notifications, useValue: notifications },
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ProfilePage);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  async function load(skills: EmployeeSkill[] = SKILLS): Promise<void> {
    httpMock.expectOne(ME_URL).flush(PROFILE);
    httpMock.expectOne(userSkillsUrl(4)).flush(skills);
    httpMock.expectOne(SKILLS_URL).flush(CATALOG);
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function skillNames(): (string | undefined)[] {
    return [...el().querySelectorAll('td.cdk-column-skill')].map((c) => c.textContent?.trim());
  }

  function button(label: string): HTMLButtonElement {
    return el().querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
  }

  function saveButton(): HTMLButtonElement {
    return [...el().querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent?.trim() === 'Save',
    )!;
  }

  function levelButton(skill: string, level: number): HTMLButtonElement {
    return el().querySelector<HTMLButtonElement>(
      `ss-toggle-group[aria-label="Level of ${skill}"] button[aria-label="Level ${level}"]`,
    )!;
  }

  it('shows the personal data read-only', async () => {
    await load();

    const data = el().querySelector('.profile__data')!.textContent!;
    expect(data).toContain('Bogdan Vujic');
    expect(data).toContain('bogdan_employee@staffsync.local');
    expect(data).toContain('Engineering');
    expect(data).toContain('Medior');
    expect(data).toContain('80%');
    expect(data).toContain('Lazar Dunjic');
    expect(el().querySelectorAll('.profile__data input')).toHaveLength(0);
  });

  it('lists the skills with their level and years', async () => {
    await load();

    expect(skillNames()).toEqual(['Java', 'Spring']);
    expect(levelButton('Java', 4).getAttribute('aria-checked')).toBe('true');
    const years = el().querySelector<HTMLInputElement>(
      'input[aria-label="Years of experience with Java"]',
    )!;
    expect(years.value).toBe('3');
    expect(saveButton().disabled).toBe(true);
  });

  it('says so when there are no skills yet', async () => {
    await load([]);

    expect(el().textContent).toContain("You haven't added any skills yet");
  });

  it('offers only skills that are not rated yet', async () => {
    await load();

    const options = fixture.componentInstance['addOptions']();
    expect(options).toEqual([{ label: 'Database', skills: [CATALOG[2]] }]);
  });

  it('offers a retry when loading fails', async () => {
    httpMock.expectOne(ME_URL).flush(null, { status: 500, statusText: 'Server Error' });
    httpMock.expectOne(userSkillsUrl(4));
    httpMock.expectOne(SKILLS_URL);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el().querySelector('[role="alert"]')?.textContent).toContain('Unable to load');
    el().querySelector<HTMLButtonElement>('[role="alert"] button')!.click();
    await load();
    expect(skillNames()).toEqual(['Java', 'Spring']);
  });

  it('adds, changes and removes skills, then saves the whole list', async () => {
    await load();

    fixture.componentInstance['add'](3);
    fixture.detectChanges();
    levelButton('Java', 5).click();
    const years = el().querySelector<HTMLInputElement>(
      'input[aria-label="Years of experience with PostgreSQL"]',
    )!;
    years.value = '2';
    years.dispatchEvent(new Event('input'));
    button('Remove Spring').click();
    fixture.detectChanges();

    expect(skillNames()).toEqual(['Java', 'PostgreSQL']);
    expect(saveButton().disabled).toBe(false);
    saveButton().click();

    const saved: EmployeeSkill[] = [
      { skillId: 1, skillName: 'Java', category: 'BACKEND', level: 5, yearsOfExperience: 3 },
      { skillId: 3, skillName: 'PostgreSQL', category: 'DATABASE', level: 1, yearsOfExperience: 2 },
    ];
    const request = httpMock.expectOne({ method: 'PUT', url: userSkillsUrl(4) });
    expect(request.request.body).toEqual([
      { skillId: 1, level: 5, yearsOfExperience: 3 },
      { skillId: 3, level: 1, yearsOfExperience: 2 },
    ]);
    request.flush(saved);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(notifications.success).toHaveBeenCalledWith('Skills saved');
    expect(saveButton().disabled).toBe(true);
  });

  it('can save an empty list after removing every skill', async () => {
    await load();

    button('Remove Java').click();
    fixture.detectChanges();
    button('Remove Spring').click();
    fixture.detectChanges();
    saveButton().click();

    const request = httpMock.expectOne({ method: 'PUT', url: userSkillsUrl(4) });
    expect(request.request.body).toEqual([]);
    request.flush([]);
  });

  it('does not save negative years of experience', async () => {
    await load();

    const years = el().querySelector<HTMLInputElement>(
      'input[aria-label="Years of experience with Java"]',
    )!;
    years.value = '-1';
    years.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(saveButton().disabled).toBe(true);
  });

  it('keeps the changes when saving fails, so the user can retry', async () => {
    await load();

    button('Remove Spring').click();
    fixture.detectChanges();
    saveButton().click();
    httpMock
      .expectOne({ method: 'PUT', url: userSkillsUrl(4) })
      .flush({ code: 'VALIDATION_ERROR' }, { status: 400, statusText: 'Bad Request' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(skillNames()).toEqual(['Java']);
    expect(saveButton().disabled).toBe(false);
    expect(notifications.success).not.toHaveBeenCalled();
  });
});

describe('My profile route', () => {
  it('is open to Employees only', async () => {
    const shell = routes.find((route) => route.path === '');
    const route = shell?.children?.find((child) => child.path === 'profile');

    expect(await (route?.loadComponent as () => Promise<unknown>)()).toBe(ProfilePage);
    expect(route?.data?.['roles']).toEqual(['EMPLOYEE']);
    expect(route?.canActivate).toBeDefined();
  });
});
