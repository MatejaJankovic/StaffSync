import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { Shell, SIDEBAR_STORAGE_KEY } from './shell';

describe('Shell sidebar collapse', () => {
  let fixture: ComponentFixture<Shell>;
  let httpMock: HttpTestingController;

  async function render(): Promise<HTMLElement> {
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

  function toggle(el: HTMLElement): HTMLButtonElement {
    return el.querySelector<HTMLButtonElement>('.shell__collapse')!;
  }

  async function click(el: HTMLElement): Promise<void> {
    toggle(el).click();
    fixture.detectChanges();
    await fixture.whenStable();
  }

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('staffsync.token', 'jwt');
    localStorage.setItem(
      'staffsync.user',
      JSON.stringify({ id: 1, email: 'x@y.z', firstName: 'Ana', lastName: 'Project', role: 'PM' }),
    );
  });

  afterEach(() => {
    httpMock.verify();
    vi.restoreAllMocks();
  });

  it('starts expanded, with full labels', async () => {
    const el = await render();

    expect(toggle(el).getAttribute('aria-expanded')).toBe('true');
    expect(toggle(el).getAttribute('aria-label')).toBe('Sidebar');
    expect(toggle(el).getAttribute('title')).toBe('Collapse sidebar');
    expect(el.querySelector('.shell--rail')).toBeNull();
    expect(el.querySelector('.shell__panel--rail')).toBeNull();
    expect(el.querySelector('.shell__nav a')?.getAttribute('title')).toBeNull();
  });

  it('folds to an icon rail and back, keeping every label in the DOM', async () => {
    const el = await render();
    const labels = [...el.querySelectorAll('.shell__nav a .shell__link-label')].map((span) =>
      span.textContent!.trim(),
    );

    await click(el);

    expect(toggle(el).getAttribute('aria-expanded')).toBe('false');
    expect(toggle(el).getAttribute('aria-label')).toBe('Sidebar');
    expect(toggle(el).getAttribute('title')).toBe('Expand sidebar');
    expect(el.querySelector('.shell--rail')).not.toBeNull();
    expect(el.querySelector('.shell__panel--rail')).not.toBeNull();
    const railLabels = [...el.querySelectorAll('.shell__nav a .shell__link-label')].map((span) =>
      span.textContent!.trim(),
    );
    expect(railLabels).toEqual(labels);
    // The label is the tooltip of each icon
    const titles = [...el.querySelectorAll('.shell__nav a')].map((a) => a.getAttribute('title'));
    expect(titles).toEqual(labels);

    await click(el);

    expect(toggle(el).getAttribute('aria-expanded')).toBe('true');
    expect(el.querySelector('.shell--rail')).toBeNull();
    expect(el.querySelector('.shell__nav a')?.getAttribute('title')).toBeNull();
  });

  it('keeps the user name and role in the DOM when folded', async () => {
    const el = await render();

    await click(el);

    expect(el.querySelector('.shell__user-name')?.textContent).toContain('Ana Project');
    expect(el.querySelector('.shell__user-role')?.textContent).toContain('Project Manager');
  });

  it('remembers the choice in localStorage', async () => {
    const el = await render();

    await click(el);
    expect(localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe('collapsed');

    await click(el);
    expect(localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe('expanded');
  });

  it('starts folded when the saved choice says so', async () => {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, 'collapsed');

    const el = await render();

    expect(toggle(el).getAttribute('aria-expanded')).toBe('false');
    expect(el.querySelector('.shell--rail')).not.toBeNull();
  });

  it('still works when localStorage throws', async () => {
    const getItem = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (
      this: Storage,
      key: string,
    ) {
      if (key === SIDEBAR_STORAGE_KEY) {
        throw new DOMException('blocked', 'SecurityError');
      }
      return getItem.call(this, key);
    });
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (key === SIDEBAR_STORAGE_KEY) {
        throw new DOMException('blocked', 'SecurityError');
      }
      setItem.call(this, key, value);
    });

    const el = await render();
    expect(toggle(el).getAttribute('aria-expanded')).toBe('true');

    await click(el);

    expect(toggle(el).getAttribute('aria-expanded')).toBe('false');
    expect(el.querySelector('.shell--rail')).not.toBeNull();
  });
});
