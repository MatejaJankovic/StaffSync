import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { Page } from '../../core/api/page';
import { DEPARTMENTS_URL } from '../departments/department.service';
import { SKILLS_URL } from '../skills/skill.service';
import { EmployeeSearchPage } from './employee-search-page';
import { EmployeeSearchResult } from './employee-search.models';
import { EMPLOYEE_SEARCH_URL } from './employee-search.service';

const ROW: EmployeeSearchResult = {
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

describe('EmployeeSearchPage tags and load bar', () => {
  let fixture: ComponentFixture<EmployeeSearchPage>;
  let httpMock: HttpTestingController;

  async function open(params: Record<string, string>, row: EmployeeSearchResult): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [EmployeeSearchPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { queryParamMap: new BehaviorSubject(convertToParamMap(params)) },
        },
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(EmployeeSearchPage);
    fixture.detectChanges();
    httpMock.expectOne(SKILLS_URL).flush([]);
    httpMock.expectOne(DEPARTMENTS_URL).flush([]);
    const page: Page<EmployeeSearchResult> = {
      content: [row],
      page: { size: 20, number: 0, totalElements: 1, totalPages: 1 },
    };
    httpMock.expectOne((r) => r.url === EMPLOYEE_SEARCH_URL).flush(page);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  afterEach(() => httpMock.verify());

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  it('marks only the searched skill with a teal tag and a check glyph', async () => {
    await open({ skillId: '3' }, ROW);

    const tags = [...el().querySelectorAll('ss-chip')];
    expect(tags.map((tag) => tag.classList.contains('employee-search__tag--match'))).toEqual([
      true,
      false,
    ]);
    expect(tags[0].querySelector('svg[role="img"]')?.getAttribute('aria-label')).toContain(
      'searched',
    );
    expect(tags[1].querySelector('svg')).toBeNull();
  });

  it('marks nothing without a skill filter', async () => {
    await open({}, ROW);

    expect(el().querySelector('.employee-search__tag--match')).toBeNull();
    expect(el().querySelector('.employee-search__check')).toBeNull();
  });

  it('shows the load once, as the bar with its numbers, without a ring beside it', async () => {
    await open({}, { ...ROW, load: 80, free: 20 });

    expect(el().querySelector('app-capacity-ring')).toBeNull();
    expect(el().querySelector('app-capacity-bar')?.textContent).toContain('80%');
  });

  it('says Over capacity for an overbooked employee', async () => {
    await open({}, { ...ROW, load: 120, free: -20 });

    expect(el().querySelector('app-capacity-bar')?.textContent).toContain('Over capacity');
  });
});
