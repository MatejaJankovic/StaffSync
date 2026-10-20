import { TestBed } from '@angular/core/testing';
import { Status, STATUS_TONES, StatusChip, StatusTone } from './status-chip';

describe('StatusChip', () => {
  function render(status: string): HTMLElement {
    const fixture = TestBed.createComponent(StatusChip);
    fixture.componentRef.setInput('status', status);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it.each<[string, string, StatusTone]>([
    ['PLANNED', 'Planned', 'info'],
    ['OPEN', 'Open', 'info'],
    ['PROPOSED', 'Proposed', 'info'],
    ['CHANGE_PENDING', 'Change pending', 'warning'],
    ['PARTIALLY_FILLED', 'Partially filled', 'warning'],
    ['ACTIVE', 'Active', 'success'],
    ['APPROVED', 'Approved', 'success'],
    ['FILLED', 'Filled', 'success'],
    ['COMPLETED', 'Completed', 'neutral'],
    ['REJECTED', 'Rejected', 'error'],
    ['CANCELLED', 'Cancelled', 'error'],
  ])('shows %s as "%s" in the %s color', (status, label, tone) => {
    const el = render(status);
    expect(el.textContent?.trim()).toBe(label);
    expect(el.classList).toContain('status-chip');
    expect(el.classList).toContain(`status-chip--${tone}`);
  });

  it('has a color for every known status', () => {
    const statuses: Status[] = [
      'PLANNED',
      'ACTIVE',
      'COMPLETED',
      'CANCELLED',
      'OPEN',
      'PARTIALLY_FILLED',
      'FILLED',
      'PROPOSED',
      'APPROVED',
      'REJECTED',
      'CHANGE_PENDING',
    ];
    expect(Object.keys(STATUS_TONES).sort()).toEqual([...statuses].sort());
  });

  it('still shows an unknown status, in the neutral color', () => {
    const el = render('ON_HOLD');
    expect(el.textContent?.trim()).toBe('On hold');
    expect(el.classList).toContain('status-chip--neutral');
  });
});
