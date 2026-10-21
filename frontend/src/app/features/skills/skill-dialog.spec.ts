import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Skill } from './skill.models';
import { SKILLS_URL } from './skill.service';
import { SkillDialog, SkillDialogData } from './skill-dialog';

describe('SkillDialog', () => {
  let fixture: ComponentFixture<SkillDialog>;
  let httpMock: HttpTestingController;
  const close = vi.fn();

  async function open(data: SkillDialogData): Promise<void> {
    close.mockReset();
    await TestBed.configureTestingModule({
      imports: [SkillDialog],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: { close } },
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(SkillDialog);
    await fixture.whenStable();
  }

  afterEach(() => httpMock.verify());

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function type(value: string): void {
    const input = el().querySelector<HTMLInputElement>('input[formControlName="name"]')!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  async function submit(): Promise<void> {
    el().querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  }

  it('does not call the API while the form is invalid', async () => {
    await open({});

    type('   ');
    await submit();

    httpMock.expectNone(SKILLS_URL);
    expect(el().textContent).toContain('Add skill');
  });

  it('shows an error for a name over 100 characters and does not call the API', async () => {
    await open({});
    fixture.componentInstance['form'].setValue({ name: 'x'.repeat(101), category: 'BACKEND' });

    await submit();

    httpMock.expectNone(SKILLS_URL);
    expect(el().textContent).toContain('Name must be at most 100 characters');
  });

  it('rejects control characters in the name without calling the API', async () => {
    await open({});
    fixture.componentInstance['form'].setValue({ name: 'a\nb', category: 'BACKEND' });

    await submit();

    httpMock.expectNone(SKILLS_URL);
    expect(el().textContent).toContain('Name must not contain control characters');
  });

  it('creates a skill with a trimmed name', async () => {
    await open({});
    const saved: Skill = { id: 9, name: 'Go', category: 'BACKEND' };
    fixture.componentInstance['form'].setValue({ name: '  Go  ', category: 'BACKEND' });

    await submit();

    const req = httpMock.expectOne({ method: 'POST', url: SKILLS_URL });
    expect(req.request.body).toEqual({ name: 'Go', category: 'BACKEND' });
    req.flush(saved);
    expect(close).toHaveBeenCalledWith(saved);
  });

  it('updates the skill it was opened with', async () => {
    await open({ skill: { id: 1, name: 'Java', category: 'BACKEND' } });
    fixture.componentInstance['form'].setValue({ name: 'Java', category: 'OTHER' });

    await submit();

    const req = httpMock.expectOne({ method: 'PUT', url: `${SKILLS_URL}/1` });
    expect(req.request.body).toEqual({ name: 'Java', category: 'OTHER' });
    req.flush({ id: 1, name: 'Java', category: 'OTHER' });
    expect(el().textContent).toContain('Edit skill');
  });

  it('shows the duplicate-name message from a 409 and stays open', async () => {
    await open({});
    fixture.componentInstance['form'].setValue({ name: 'Java', category: 'BACKEND' });

    await submit();

    httpMock
      .expectOne(SKILLS_URL)
      .flush(
        { code: 'SKILL_NAME_TAKEN', message: "A skill named 'Java' already exists" },
        { status: 409, statusText: 'Conflict' },
      );
    await fixture.whenStable();

    expect(el().querySelector('[role="alert"]')?.textContent).toContain(
      "A skill named 'Java' already exists",
    );
    expect(close).not.toHaveBeenCalled();
  });
});
