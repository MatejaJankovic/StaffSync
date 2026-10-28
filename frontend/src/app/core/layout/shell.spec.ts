import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { Role } from '../auth/auth.models';
import { AuthService } from '../auth/auth.service';
import { ChangePasswordDialog } from '../auth/change-password-dialog';
import { SsDialog } from '../../shared/ui';
import { menuFor } from './menu';
import { Shell } from './shell';

describe('Shell', () => {
  let fixture: ComponentFixture<Shell>;
  let httpMock: HttpTestingController;

  async function render(role: Role): Promise<HTMLElement> {
    localStorage.clear();
    localStorage.setItem('staffsync.token', 'jwt');
    localStorage.setItem(
      'staffsync.user',
      JSON.stringify({ id: 1, email: 'x@y.z', firstName: 'Ana', lastName: 'Project', role }),
    );
    await TestBed.configureTestingModule({
      imports: [Shell],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Shell);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  function menuLabels(el: HTMLElement): string[] {
    return [...el.querySelectorAll('.shell__nav a .shell__link-label')].map((span) =>
      span.textContent!.trim(),
    );
  }

  afterEach(() => httpMock.verify());

  it.each<[Role, string[]]>([
    ['EMPLOYEE', ['Home', 'My profile', 'My allocations']],
    ['PM', ['Home', 'My projects', 'Employee search']],
    ['RM', ['Home', 'Pending approvals', 'My team', 'Employee search']],
    ['ADMIN', ['Home', 'Users', 'Departments', 'Skills catalog']],
  ])('shows only the %s menu', async (role, expected) => {
    const el = await render(role);
    expect(menuLabels(el)).toEqual(expected);
    expect(menuFor(role).map((item) => item.label)).toEqual(expected);
  });

  it("shows the user's name and role in the toolbar", async () => {
    const el = await render('PM');
    expect(el.querySelector('.shell__user-name')?.textContent).toContain('Ana Project');
    expect(el.querySelector('.shell__user-role')?.textContent).toContain('Project Manager');
  });

  it('logs out from the user menu', async () => {
    const el = await render('RM');
    const logout = vi.spyOn(TestBed.inject(AuthService), 'logout').mockReturnValue(undefined);

    el.querySelector<HTMLButtonElement>('.shell__user')!.click();
    await fixture.whenStable();
    const item = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((b) =>
      b.textContent?.includes('Logout'),
    );
    item!.click();

    expect(logout).toHaveBeenCalled();
  });

  it('opens the Change password dialog from the user menu', async () => {
    const el = await render('EMPLOYEE');
    const open = vi.spyOn(TestBed.inject(SsDialog), 'open').mockReturnValue(undefined as never);

    el.querySelector<HTMLButtonElement>('.shell__user')!.click();
    await fixture.whenStable();
    const item = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((b) =>
      b.textContent?.includes('Change password'),
    );
    item!.click();

    expect(open).toHaveBeenCalledWith(ChangePasswordDialog, expect.anything());
  });
});
