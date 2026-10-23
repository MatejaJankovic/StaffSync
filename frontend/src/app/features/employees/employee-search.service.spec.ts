import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { EMPLOYEE_SEARCH_URL, EmployeeSearchService } from './employee-search.service';

describe('EmployeeSearchService', () => {
  let httpMock: HttpTestingController;
  let service: EmployeeSearchService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
    service = TestBed.inject(EmployeeSearchService);
  });

  afterEach(() => httpMock.verify());

  it('sends every filter that is set, with the page and sort', () => {
    service
      .search(
        { page: 1, size: 20, sort: 'free,desc' },
        {
          skillId: 3,
          minLevel: 4,
          seniority: 'SENIOR',
          departmentId: 1,
          availableFrom: '2026-11-02',
          availableTo: '2026-11-30',
          minFreePercent: 50,
        },
      )
      .subscribe();

    const req = httpMock.expectOne((r) => r.url === EMPLOYEE_SEARCH_URL);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.toString()).toBe(
      'skillId=3&minLevel=4&seniority=SENIOR&departmentId=1&availableFrom=2026-11-02' +
        '&availableTo=2026-11-30&minFreePercent=50&page=1&size=20&sort=free,desc',
    );
    req.flush({ content: [], page: { size: 20, number: 1, totalElements: 0, totalPages: 0 } });
  });

  it('sends no filter that is not set', () => {
    service.search({ page: 0, size: 20 }, { seniority: 'JUNIOR' }).subscribe();

    const req = httpMock.expectOne((r) => r.url === EMPLOYEE_SEARCH_URL);
    expect(req.request.params.keys()).toEqual(['seniority', 'page', 'size']);
    req.flush({ content: [], page: { size: 20, number: 0, totalElements: 0, totalPages: 0 } });
  });
});
