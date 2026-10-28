import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormArray,
  FormControl,
  FormGroup,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin, Observable, of } from 'rxjs';
import { apiErrorMessage, isApiError } from '../../core/api/api-error';
import { AuthService } from '../../core/auth/auth.service';
import { Notifications } from '../../core/error/notifications';
import { parseIsoDate, toIsoDate } from '../../shared/dates';
import { DateRangePicker, DateRangeValue } from '../../shared/date-range-picker/date-range-picker';
import { SkillLevelPicker } from '../../shared/skill-level-picker/skill-level-picker';
import {
  SsCheckbox,
  SsError,
  SsField,
  SsInput,
  SsLabel,
  SsOptgroup,
  SsOption,
  SsSelect,
  SsButton,
  SsIcon,
} from '../../shared/ui';
import { formatPeriod, isEditable, Project } from '../projects/project.models';
import { ProjectService } from '../projects/project.service';
import { Skill, SKILL_CATEGORIES, SKILL_CATEGORY_LABELS } from '../skills/skill.models';
import { SkillService } from '../skills/skill.service';
import {
  ALLOCATION_OPTIONS,
  isCancelled,
  SENIORITIES,
  SENIORITY_LABELS,
  Seniority,
  StaffingRequest,
  StaffingRequestPayload,
} from './request.models';
import { RequestService } from './request.service';

const MAX_TITLE_LENGTH = 200;

/** The API rejects control characters (newlines, tabs, ...) in a title, so it is caught before sending. */
const noControlChars: ValidatorFn = (control) =>
  /\p{Cc}/u.test(String(control.value ?? '')) ? { controlChars: true } : null;

type SkillRow = FormGroup<{
  skillId: FormControl<number | null>;
  minLevel: FormControl<number | null>;
  mandatory: FormControl<boolean>;
}>;

type LoadState = 'loading' | 'ready' | 'notFound' | 'failed';

/** What the API sends for a field that failed validation (`details` of a `VALIDATION_ERROR`). */
interface FieldViolation {
  field: string;
  message: string;
}

function isFieldViolation(detail: unknown): detail is FieldViolation {
  return (
    typeof detail === 'object' &&
    detail !== null &&
    typeof (detail as FieldViolation).field === 'string' &&
    typeof (detail as FieldViolation).message === 'string'
  );
}

/**
 * *New request* at `/projects/:projectId/requests/new` and *Edit request* at
 * `/projects/:projectId/requests/:id/edit`: a reactive form for a staffing request of a project,
 * with a dynamic list of the skills it asks for. The period is limited to the project's period (BR-3).
 * Validation errors from the API are shown next to the fields.
 */
@Component({
  selector: 'app-request-form',
  imports: [
    ReactiveFormsModule,
    SsButton,
    SsIcon,
    RouterLink,
    DateRangePicker,
    SsCheckbox,
    SsError,
    SsField,
    SsInput,
    SsLabel,
    SsOptgroup,
    SsOption,
    SsSelect,
    SkillLevelPicker,
  ],
  templateUrl: './request-form.html',
  styleUrl: './request-form.scss',
})
export class RequestForm {
  private readonly projects = inject(ProjectService);
  private readonly requests = inject(RequestService);
  private readonly skillService = inject(SkillService);
  private readonly auth = inject(AuthService);
  private readonly notifications = inject(Notifications);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly maxTitleLength = MAX_TITLE_LENGTH;
  protected readonly seniorities = SENIORITIES;
  protected readonly seniorityLabels = SENIORITY_LABELS;
  protected readonly allocations = ALLOCATION_OPTIONS;

  protected readonly state = signal<LoadState>('loading');
  protected readonly project = signal<Project | null>(null);
  /** The request being edited, or `null` when a new one is created. */
  protected readonly request = signal<StaffingRequest | null>(null);
  protected readonly catalog = signal<Skill[]>([]);
  protected readonly saving = signal(false);

  protected readonly projectPeriod = computed(() => {
    const project = this.project();
    return project ? formatPeriod(project) : '';
  });
  protected readonly projectStart = computed(() => this.dateOf(this.project()?.startDate));
  protected readonly projectEnd = computed(() => this.dateOf(this.project()?.endDate));

  /** The catalog by category, in the order of §5, for the grouped skill select. */
  protected readonly skillGroups = computed(() =>
    SKILL_CATEGORIES.map((category) => ({
      label: SKILL_CATEGORY_LABELS[category],
      skills: this.catalog().filter((skill) => skill.category === category),
    })).filter((group) => group.skills.length > 0),
  );

  /** Why the form can't be used, or `null` when it can. Only the project's PM can add or edit requests. */
  protected readonly blockedReason = computed(() => {
    const project = this.project();
    if (!project) {
      return null;
    }
    if (project.pmId !== this.auth.currentUser()?.id) {
      return 'Only the project manager who owns this project can manage its staffing requests.';
    }
    if (!isEditable(project)) {
      return `A ${project.status.toLowerCase()} project can’t have staffing requests changed.`;
    }
    const request = this.request();
    return request && isCancelled(request) ? 'A cancelled request can’t be edited.' : null;
  });

  protected readonly form = inject(NonNullableFormBuilder).group({
    title: [
      '',
      [
        Validators.required,
        Validators.pattern(/\S/),
        Validators.maxLength(MAX_TITLE_LENGTH),
        noControlChars,
      ],
    ],
    seniority: [null as Seniority | null, Validators.required],
    allocationPercent: [null as number | null, Validators.required],
    headcount: [1, [Validators.required, Validators.min(1), Validators.pattern(/^\d+$/)]],
    period: [{ start: null, end: null } as DateRangeValue],
    skills: new FormArray<SkillRow>([]),
  });

  protected get skills(): FormArray<SkillRow> {
    return this.form.controls.skills;
  }

  constructor() {
    const projectId = Number(this.route.snapshot.paramMap.get('projectId'));
    const idParam = this.route.snapshot.paramMap.get('id');
    const requestId = idParam === null ? null : Number(idParam);
    if (!Number.isInteger(projectId) || (requestId !== null && !Number.isInteger(requestId))) {
      this.state.set('notFound');
      return;
    }

    forkJoin({
      project: this.projects.get(projectId),
      catalog: this.skillService.list(),
      request: requestId === null ? of(null) : this.requests.get(requestId),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ project, catalog, request }) => {
          if (request && request.projectId !== project.id) {
            this.state.set('notFound');
            return;
          }
          this.project.set(project);
          this.catalog.set(catalog);
          this.request.set(request);
          if (request) {
            this.fill(request);
          }
          this.state.set('ready');
        },
        // The error snackbar already shows the API's message, so this only decides what the page shows
        error: (error: unknown) =>
          this.state.set(
            error instanceof HttpErrorResponse && error.status === 404 ? 'notFound' : 'failed',
          ),
      });
  }

  protected addSkill(): void {
    this.skills.push(this.newRow());
  }

  protected removeSkill(index: number): void {
    this.skills.removeAt(index);
  }

  /** A skill can only be on the request once, so the ones picked in other rows can't be picked again. */
  protected isTaken(skillId: number, row: number): boolean {
    return this.skills.controls.some(
      (group, index) => index !== row && group.controls.skillId.value === skillId,
    );
  }

  protected skillName(row: SkillRow): string {
    const id = row.controls.skillId.value;
    return this.catalog().find((skill) => skill.id === id)?.name ?? 'skill';
  }

  protected backLink(): string[] {
    return [
      '/projects',
      String(this.project()?.id ?? this.route.snapshot.paramMap.get('projectId')),
    ];
  }

  protected save(): void {
    const project = this.project();
    if (!project || this.saving()) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const request = this.request();
    const payload = this.payload();
    this.saving.set(true);
    const call: Observable<StaffingRequest> = request
      ? this.requests.update(request.id, payload)
      : this.requests.create(project.id, payload);

    call.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.notifications.success(request ? 'Request saved' : 'Request created');
        void this.router.navigate(['/projects', project.id]);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.showServerErrors(error);
      },
    });
  }

  private payload(): StaffingRequestPayload {
    const value = this.form.getRawValue();
    return {
      title: value.title.trim(),
      seniority: value.seniority!,
      allocationPercent: value.allocationPercent!,
      startDate: toIsoDate(value.period.start!),
      endDate: toIsoDate(value.period.end!),
      headcount: value.headcount,
      skills: value.skills.map((skill) => ({
        skillId: skill.skillId!,
        minLevel: skill.minLevel!,
        mandatory: skill.mandatory,
      })),
    };
  }

  private fill(request: StaffingRequest): void {
    this.form.patchValue({
      title: request.title,
      seniority: request.seniority,
      allocationPercent: request.allocationPercent,
      headcount: request.headcount,
      period: { start: parseIsoDate(request.startDate), end: parseIsoDate(request.endDate) },
    });
    for (const skill of request.skills) {
      const row = this.newRow();
      row.setValue({
        skillId: skill.skillId,
        minLevel: skill.minLevel,
        mandatory: skill.mandatory,
      });
      this.skills.push(row);
    }
  }

  private newRow(): SkillRow {
    return new FormGroup({
      skillId: new FormControl<number | null>(null, {
        validators: Validators.required,
      }),
      minLevel: new FormControl<number | null>(null, { validators: Validators.required }),
      mandatory: new FormControl(true, { nonNullable: true }),
    });
  }

  private dateOf(iso: string | undefined): Date | null {
    return iso ? parseIsoDate(iso) : null;
  }

  /**
   * A 400 with field errors is shown next to those fields, and anything else (a period outside the
   * project, a request that was cancelled in the meantime, ...) in the error snackbar.
   */
  private showServerErrors(error: unknown): void {
    const body = error instanceof HttpErrorResponse ? error.error : null;
    if (!isApiError(body) || body.code !== 'VALIDATION_ERROR') {
      this.notifications.error(apiErrorMessage(error));
      return;
    }
    let allShown = true;
    for (const detail of body.details) {
      if (!isFieldViolation(detail) || !this.setServerError(detail)) {
        allShown = false;
      }
    }
    this.form.markAllAsTouched();
    if (!allShown) {
      this.notifications.error(body.message);
    }
  }

  private setServerError({ field, message }: FieldViolation): boolean {
    const control = this.controlFor(field);
    control?.setErrors({ server: message });
    return !!control;
  }

  private controlFor(field: string): AbstractControl | null {
    const row = /^skills\[(\d+)\]\.(skillId|minLevel|mandatory)$/.exec(field);
    if (row) {
      return this.skills.at(Number(row[1]))?.get(row[2]) ?? null;
    }
    if (field === 'startDate' || field === 'endDate') {
      return this.form.controls.period;
    }
    return this.form.get(field);
  }
}
