import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Availability } from './user.models';
import { USERS_URL, UserService } from './user.service';

const AVAILABILITY: Availability = {
  employeeId: 4,
  capacityPercent: 100,
  from: '2026-11-06',
  to: '2026-11-10',
  days: [
    { date: '2026-11-06', load: 60, free: 40 },
    { date: '2026-11-09', load: 60, free: 40 },
    { date: '2026-11-10', load: 90, free: 10 },
  ],
};

describe('UserService', () => {
  let httpMock: HttpTestingController;
  let service: UserService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
    service = TestBed.inject(UserService);
  });

  afterEach(() => httpMock.verify());

  it('availability gets the employee’s days for the period', () => {
    let result: Availability | undefined;
    service.availability(4, '2026-11-06', '2026-11-10').subscribe((a) => (result = a));

    const req = httpMock.expectOne((r) => r.url === `${USERS_URL}/4/availability`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('from')).toBe('2026-11-06');
    expect(req.request.params.get('to')).toBe('2026-11-10');
    req.flush(AVAILABILITY);

    expect(result).toEqual(AVAILABILITY);
  });
});
