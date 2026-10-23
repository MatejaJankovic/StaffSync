import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TeamMember } from './team.models';
import { TEAM_URL } from './team.service';
import { TeamPage } from './team-page';

const ENGINEERING = { id: 1, name: 'Engineering' };

function member(
  id: number,
  firstName: string,
  lastName: string,
  load: number,
  capacityPercent = 100,
): TeamMember {
  return {
    id,
    firstName,
    lastName,
    seniority: 'MEDIOR',
    department: ENGINEERING,
    capacityPercent,
    load,
    free: capacityPercent - load,
  };
}

// In API order (by last name). By load: Zoric and Babic are free today, Petrovic is 50% full,
// Ilic is 80% full (40% of 50%), and Kovac is over capacity
const TEAM: TeamMember[] = [
  member(1, 'Ena', 'Babic', 0),
  member(2, 'Lena', 'Ilic', 40, 50),
  member(3, 'Mila', 'Kovac', 120),
  member(4, 'Jovan', 'Petrovic', 50),
  member(5, 'Ana', 'Zoric', 0),
];

describe('TeamPage', () => {
  let fixture: ComponentFixture<TeamPage>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TeamPage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(TeamPage);
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  async function flush(team: TeamMember[] = TEAM): Promise<void> {
    httpMock.expectOne(TEAM_URL).flush(team);
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function column(name: string): (string | undefined)[] {
    return [...el().querySelectorAll(`td.mat-column-${name}`)].map((c) =>
      c.textContent?.replace(/\s+/g, ' ').trim(),
    );
  }

  async function clickHeader(name: string): Promise<void> {
    el().querySelector<HTMLElement>(`th.mat-column-${name} .mat-sort-header-container`)!.click();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('shows a loading message until the team arrives', async () => {
    expect(el().textContent).toContain('Loading your team…');

    await flush();

    expect(el().textContent).not.toContain('Loading');
  });

  it('shows name, seniority, department, capacity and load for each member', async () => {
    await flush([{ ...member(4, 'Jovan', 'Petrovic', 50, 80), seniority: 'SENIOR' }]);

    expect(column('name')).toEqual(['Jovan Petrovic']);
    expect(column('seniority')).toEqual(['Senior']);
    expect(column('department')).toEqual(['Engineering']);
    expect(column('capacity')).toEqual(['80%']);
    expect(column('load')).toEqual(['50% / 80%']);
  });

  it('shows a dash for a missing seniority or department', async () => {
    await flush([{ ...member(1, 'Ena', 'Babic', 0), seniority: null, department: null }]);

    expect(column('seniority')).toEqual(['—']);
    expect(column('department')).toEqual(['—']);
  });

  it('sorts by load from the lowest by default, so the people free today come first', async () => {
    await flush();

    expect(column('name')).toEqual([
      'Ena Babic',
      'Ana Zoric',
      'Jovan Petrovic',
      'Lena Ilic',
      'Mila Kovac',
    ]);
  });

  it('labels a member free today and an overloaded member in words, not only with color', async () => {
    await flush();

    // Not "Bench": on Home that means 0% all week, and someone free today may start tomorrow
    expect(column('load')).toEqual([
      '0% / 100% Free today',
      '0% / 100% Free today',
      '50% / 100%',
      '40% / 50%',
      '120% / 100% Over capacity',
    ]);
    const bars = [...el().querySelectorAll('app-capacity-bar mat-progress-bar')];
    expect(bars.map((bar) => bar.getAttribute('aria-valuenow'))).toEqual([
      '0',
      '0',
      '50',
      '80',
      '100',
    ]);
    // The shared capacity-bar (#59) colors by the share of each member's own capacity
    const tones = [...el().querySelectorAll('app-capacity-bar')].map((bar) =>
      ['free', 'nearly-full', 'full'].find((tone) =>
        bar.classList.contains(`capacity-bar--${tone}`),
      ),
    );
    expect(tones).toEqual(['free', 'free', 'free', 'nearly-full', 'full']);
  });

  it('puts the most loaded first after a click on Load today, and sorts by name on Name', async () => {
    await flush();

    await clickHeader('load');
    expect(column('name')[0]).toBe('Mila Kovac');

    await clickHeader('name');
    expect(column('name')).toEqual([
      'Ena Babic',
      'Lena Ilic',
      'Mila Kovac',
      'Jovan Petrovic',
      'Ana Zoric',
    ]);
  });

  it('says so when no one reports to the RM', async () => {
    await flush([]);

    expect(el().textContent).toContain('No one reports to you yet.');
    expect(el().querySelector('table')).toBeNull();
  });

  it('shows an error with Retry, which loads the team again', async () => {
    httpMock.expectOne(TEAM_URL).flush(null, { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el().querySelector('[role="alert"]')?.textContent).toContain(
      'Unable to load your team.',
    );
    el().querySelector<HTMLButtonElement>('[role="alert"] button')!.click();
    await flush();

    expect(el().querySelector('[role="alert"]')).toBeNull();
    expect(column('name')).toHaveLength(5);
  });
});
