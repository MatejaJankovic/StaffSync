import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import {
  ActivatedRoute,
  convertToParamMap,
  NavigationExtras,
  ParamMap,
  Params,
  provideRouter,
  Router,
} from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { routes } from '../../app.routes';
import { Page } from '../../core/api/page';
import { DEPARTMENTS_URL } from '../departments/department.service';
import { Skill } from '../skills/skill.models';
import { SKILLS_URL } from '../skills/skill.service';
import { EmployeeSearchPage } from './employee-search-page';
import { EmployeeSearchResult } from './employee-search.models';
import { EMPLOYEE_SEARCH_URL } from './employee-search.service';

const JAVA: Skill = { id: 3, name: 'Java', category: 'BACKEND' };
const ANGULAR: Skill = { id: 5, name: 'Angular', category: 'FRONTEND' };

const BOGDAN: EmployeeSearchResult = {
  id: 4,
  firstName: 'Bogdan',
  lastName: 'Vujic',
  seniority: 'MEDIOR',
  department: { id: 1, name: 'Engineering' },
  skillLevel: 4,
  topSkills: [
    { skillId: 3, name: 'Java', level: 4 },
    { skillId: 5, name: 'Angular', level: 2 },
  ],
  capacityPercent: 100,
  load: 60,
  free: 40,
};

function pageOf(...rows: EmployeeSearchResult[]): Page<EmployeeSearchResult> {
  return {
    content: rows,
    page: { size: 20, number: 0, totalElements: rows.length, totalPages: 1 },
  };
}

describe('EmployeeSearchPage', () => {
  let fixture: ComponentFixture<EmployeeSearchPage>;
  let httpMock: HttpTestingController;
  let navigate: ReturnType<typeof vi.spyOn>;
  /** The page's URL query parameters. */
  let queryParams: BehaviorSubject<ParamMap>;

  async function create(params: Params = {}): Promise<void> {
    queryParams = new BehaviorSubject(convertToParamMap(params));
    await TestBed.configureTestingModule({
      imports: [EmployeeSearchPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } },
        { provide: ActivatedRoute, useValue: { queryParamMap: queryParams } },
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    // Navigating changes the URL, which the page reads back as its query parameters
    navigate = vi
      .spyOn(TestBed.inject(Router), 'navigate')
      .mockImplementation(async (_commands: readonly unknown[], extras?: NavigationExtras) => {
        queryParams.next(convertToParamMap(extras?.queryParams ?? {}));
        return true;
      });
    fixture = TestBed.createComponent(EmployeeSearchPage);
    fixture.detectChanges();
    httpMock.expectOne(SKILLS_URL).flush([JAVA, ANGULAR]);
    httpMock.expectOne(DEPARTMENTS_URL).flush([{ id: 1, name: 'Engineering' }]);
    await settle();
  }

  afterEach(() => httpMock.verify());

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function page() {
    return fixture.componentInstance as unknown as {
      form: EmployeeSearchPage['form'];
      onSkillChange(skillId: number | null): void;
    };
  }

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /** Answers the table's search request. */
  async function load(result: Page<EmployeeSearchResult> = pageOf(BOGDAN)) {
    const req = httpMock.expectOne((r) => r.url === EMPLOYEE_SEARCH_URL);
    req.flush(result);
    await settle();
    return req.request;
  }

  function button(text: string): HTMLButtonElement {
    return [...el().querySelectorAll('button')].find((b) => b.textContent?.trim() === text)!;
  }

  it('searches without filters at first', async () => {
    await create();

    const request = await load();

    expect(request.params.keys()).toEqual(['page', 'size']);
    expect(el().querySelector('app-skill-level-picker')).toBeNull();
  });

  it('searches with the filters in the URL and shows them in the form', async () => {
    await create({
      skillId: '3',
      minLevel: '4',
      seniority: 'SENIOR',
      departmentId: '1',
      availableFrom: '2026-11-02',
      availableTo: '2026-11-30',
      minFreePercent: '50',
    });

    const request = await load();

    expect(request.params.get('skillId')).toBe('3');
    expect(request.params.get('minLevel')).toBe('4');
    expect(request.params.get('seniority')).toBe('SENIOR');
    expect(request.params.get('departmentId')).toBe('1');
    expect(request.params.get('availableFrom')).toBe('2026-11-02');
    expect(request.params.get('availableTo')).toBe('2026-11-30');
    expect(request.params.get('minFreePercent')).toBe('50');
    const value = page().form.getRawValue();
    expect(value.skillId).toBe(3);
    expect(value.minLevel).toBe(4);
    expect(value.seniority).toBe('SENIOR');
    expect(value.departmentId).toBe(1);
    expect(value.period.start?.getDate()).toBe(2);
    expect(value.period.end?.getDate()).toBe(30);
    expect(value.minFreePercent).toBe(50);
    expect(el().querySelector('app-skill-level-picker')).not.toBeNull();
  });

  it('shows name, seniority, department, the skill level, main skills and free capacity', async () => {
    await create({ skillId: '3' });
    await load();

    const headers = [...el().querySelectorAll('th')].map((cell) => cell.textContent?.trim());
    expect(headers).toEqual([
      'Name',
      'Seniority',
      'Department',
      'Java level',
      'Main skills',
      'Free today',
    ]);
    const cells = [...el().querySelectorAll('tr.mat-mdc-row td')].map((cell) =>
      cell.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(cells.slice(0, 4)).toEqual(['Bogdan Vujic', 'Medior', 'Engineering', '4/5']);
    const chips = [...el().querySelectorAll('mat-chip')].map((chip) => chip.textContent?.trim());
    expect(chips).toEqual(['Java 4', 'Angular 2']);
    expect(cells[5]).toBe('60% / 100% 40% free');
  });

  it('has no skill level column without a skill', async () => {
    await create();
    await load(pageOf({ ...BOGDAN, skillLevel: null }));

    const headers = [...el().querySelectorAll('th')].map((cell) => cell.textContent?.trim());
    expect(headers).not.toContain('Skill level');
    expect(headers).toHaveLength(5);
  });

  it('puts the filters in the URL and searches with them', async () => {
    await create();
    await load();
    page().form.patchValue({
      skillId: 3,
      seniority: 'JUNIOR',
      period: { start: new Date(2026, 10, 2), end: new Date(2026, 10, 30) },
      minFreePercent: 50,
    });
    page().onSkillChange(3);

    button('Search').click();
    await settle();
    const request = await load();

    expect(navigate.mock.calls[0][1]?.queryParams).toEqual({
      skillId: 3,
      minLevel: 1,
      seniority: 'JUNIOR',
      availableFrom: '2026-11-02',
      availableTo: '2026-11-30',
      minFreePercent: 50,
    });
    expect(request.params.get('skillId')).toBe('3');
    expect(request.params.get('minFreePercent')).toBe('50');
  });

  it('shows the minimum level only once a skill is picked, starting at 1', async () => {
    await create();
    await load();

    page().form.controls.skillId.setValue(3);
    page().onSkillChange(3);
    await settle();

    expect(el().querySelector('app-skill-level-picker')).not.toBeNull();
    expect(page().form.controls.minLevel.value).toBe(1);

    page().form.controls.skillId.setValue(null);
    page().onSkillChange(null);
    await settle();

    expect(el().querySelector('app-skill-level-picker')).toBeNull();
    expect(page().form.controls.minLevel.value).toBeNull();
  });

  it('needs a minimum free % for a period, and does not search without it', async () => {
    await create();
    await load();
    page().form.patchValue({
      period: { start: new Date(2026, 10, 2), end: new Date(2026, 10, 30) },
    });
    await settle();

    button('Search').click();
    await settle();

    expect(navigate).not.toHaveBeenCalled();
    expect(el().textContent).toContain('Enter the free % needed in the period');
  });

  it('needs a period for a minimum free %', async () => {
    await create();
    await load();
    page().form.patchValue({ minFreePercent: 50 });
    await settle();

    button('Search').click();
    await settle();

    expect(navigate).not.toHaveBeenCalled();
    expect(page().form.controls.period.hasError('required')).toBe(true);
  });

  it('clears the filters from the URL and searches again', async () => {
    await create({ seniority: 'SENIOR' });
    await load();

    button('Clear').click();
    await settle();
    const request = await load();

    expect(navigate.mock.calls[0][1]?.queryParams).toEqual({});
    expect(request.params.has('seniority')).toBe(false);
    expect(page().form.controls.seniority.value).toBeNull();
  });
});

describe('Employee search route', () => {
  it('opens the search page, for PMs and RMs only', () => {
    const route = routes.find((r) => r.path === '')!.children!.find((r) => r.path === 'employees')!;

    expect(route.loadComponent).toBeDefined();
    expect(route.data?.['roles']).toEqual(['PM', 'RM']);
  });
});
