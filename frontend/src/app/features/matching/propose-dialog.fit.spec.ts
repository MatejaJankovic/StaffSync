import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { SS_DIALOG_DATA, SsDialogRef } from '../../shared/ui';
import { StaffingRequest } from '../requests/request.models';
import { Candidate } from './candidate.models';
import { ProposeDialog } from './propose-dialog';

const REQUEST: StaffingRequest = {
  id: 9,
  projectId: 5,
  title: 'Java Developer',
  seniority: 'MEDIOR',
  allocationPercent: 60,
  startDate: '2026-11-01',
  endDate: '2027-01-31',
  headcount: 2,
  filled: 0,
  status: 'OPEN',
  createdAt: '2026-10-21T09:15:30Z',
  skills: [],
};

const JELENA: Candidate = {
  employeeId: 17,
  fullName: 'Jelena Petrović',
  seniority: 'MEDIOR',
  department: 'Engineering',
  score: 67,
  breakdown: { skills: 23, availability: 34, seniority: 10 },
  reasons: [],
  warnings: ['Insufficient capacity 2026-11-02 – 2026-11-13 (40% free, 60% required)'],
};

describe('ProposeDialog fit summary', () => {
  let fixture: ComponentFixture<ProposeDialog>;

  async function open(candidate: Candidate): Promise<HTMLElement> {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [ProposeDialog],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SS_DIALOG_DATA, useValue: { request: REQUEST, candidate } },
        { provide: SsDialogRef, useValue: { close: vi.fn(), disableClose: false } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ProposeDialog);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows how the score adds up, so the PM sees the availability part', async () => {
    const el = await open(JELENA);

    const facts = [...el.querySelectorAll('.propose-dialog__fit > div')].map((fact) =>
      (fact.textContent ?? '').replace(/\s+/g, ' ').trim(),
    );
    expect(facts).toEqual(['Skills 23/50', 'Availability 34/40', 'Seniority 10/10']);
  });

  it('titles the warnings only when there are some', async () => {
    const withWarnings = await open(JELENA);
    expect(withWarnings.querySelector('.propose-dialog__section')?.textContent).toContain(
      'Check before proposing',
    );

    const clean = await open({ ...JELENA, warnings: [] });
    expect(clean.querySelector('.propose-dialog__section')).toBeNull();
  });
});
