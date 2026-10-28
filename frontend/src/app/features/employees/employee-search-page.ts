import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { PageQuery } from '../../core/api/page';
import { CapacityBar } from '../../shared/capacity-bar/capacity-bar';
import { CapacityRing } from '../../shared/capacity-ring/capacity-ring';
import { DateRangePicker, DateRangeValue } from '../../shared/date-range-picker/date-range-picker';
import { parseIsoDate, toIsoDate } from '../../shared/dates';
import { PagedTable, PagedTableColumn } from '../../shared/paged-table/paged-table';
import { PagedTableCell } from '../../shared/paged-table/paged-table-cell';
import { SkillLevelPicker } from '../../shared/skill-level-picker/skill-level-picker';
import {
  SsChip,
  SsError,
  SsField,
  SsHint,
  SsInput,
  SsLabel,
  SsOptgroup,
  SsOption,
  SsSelect,
  SsButton,
} from '../../shared/ui';
import { DepartmentService } from '../departments/department.service';
import { Seniority, SENIORITY_LABELS } from '../profile/profile.models';
import { SENIORITIES } from '../requests/request.models';
import { SKILL_CATEGORIES, SKILL_CATEGORY_LABELS } from '../skills/skill.models';
import { SkillService } from '../skills/skill.service';
import { fullName } from '../users/user.models';
import {
  EmployeeSearchFilters,
  EmployeeSearchResult,
  filtersFromParams,
} from './employee-search.models';
import { EmployeeSearchService } from './employee-search.service';

/** The API takes the minimum free % as an integer, and `type="number"` lets `12.5` through. */
const wholeNumberValidator: ValidatorFn = (control) =>
  control.value === null || Number.isInteger(control.value) ? null : { wholeNumber: true };

/**
 * PM and RM page (US-23): find employees, e.g. people on the bench, by skill and minimum level,
 * seniority, department and free capacity in a period. The applied filters live in the URL, so a
 * search can be shared, reloaded, and gone back to with the browser's Back button.
 */
@Component({
  selector: 'app-employee-search-page',
  imports: [
    ReactiveFormsModule,
    SsButton,
    CapacityBar,
    CapacityRing,
    DateRangePicker,
    PagedTable,
    PagedTableCell,
    SkillLevelPicker,
    SsChip,
    SsError,
    SsField,
    SsHint,
    SsInput,
    SsLabel,
    SsOptgroup,
    SsOption,
    SsSelect,
  ],
  templateUrl: './employee-search-page.html',
  styleUrl: './employee-search-page.scss',
})
export class EmployeeSearchPage {
  private readonly employees = inject(EmployeeSearchService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly seniorities = SENIORITIES;
  protected readonly seniorityLabels = SENIORITY_LABELS;

  private readonly skills = toSignal(inject(SkillService).list(), { initialValue: [] });
  protected readonly departments = toSignal(inject(DepartmentService).list(), {
    initialValue: [],
  });

  /** The catalog by category, in the order of §5, for the grouped skill select. */
  protected readonly skillGroups = computed(() =>
    SKILL_CATEGORIES.map((category) => ({
      label: SKILL_CATEGORY_LABELS[category],
      skills: this.skills().filter((skill) => skill.category === category),
    })).filter((group) => group.skills.length > 0),
  );

  protected readonly form = inject(NonNullableFormBuilder).group({
    skillId: null as number | null,
    minLevel: null as number | null,
    seniority: null as Seniority | null,
    departmentId: null as number | null,
    period: { start: null, end: null } as DateRangeValue,
    minFreePercent: [
      null as number | null,
      [Validators.min(0), Validators.max(100), wholeNumberValidator],
    ],
  });

  private readonly formValue = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });

  /** A period needs a minimum free %, and the other way round, as the API asks. */
  protected readonly periodGiven = computed(() => {
    const period = this.formValue().period;
    return !!(period?.start || period?.end);
  });
  protected readonly freeGiven = computed(() => this.formValue().minFreePercent != null);

  /** The filters of the search being shown, read from the URL. */
  protected readonly applied = signal<EmployeeSearchFilters>({});

  /** A new function reloads the table from the first page, so a new search does that. */
  protected readonly fetch = computed(() => {
    const filters = this.applied();
    return (query: PageQuery) => this.employees.search(query, filters);
  });

  protected readonly columns = computed<PagedTableColumn<EmployeeSearchResult>[]>(() => {
    const skillId = this.applied().skillId;
    const skill = this.skills().find((candidate) => candidate.id === skillId);
    return [
      { key: 'lastName', header: 'Name', sortable: true, value: fullName },
      {
        key: 'seniority',
        header: 'Seniority',
        sortable: true,
        value: (row) => (row.seniority ? SENIORITY_LABELS[row.seniority] : '—'),
      },
      {
        key: 'department',
        header: 'Department',
        sortable: true,
        value: (row) => row.department?.name ?? '—',
      },
      ...(skillId
        ? [
            {
              key: 'level',
              header: skill ? `${skill.name} level` : 'Skill level',
              sortable: true,
              value: (row: EmployeeSearchResult) => (row.skillLevel ? `${row.skillLevel}/5` : '—'),
            },
          ]
        : []),
      { key: 'topSkills', header: 'Main skills' },
      { key: 'free', numeric: true, header: 'Free today', sortable: true },
    ];
  });

  constructor() {
    this.route.queryParamMap
      .pipe(map(filtersFromParams), takeUntilDestroyed())
      .subscribe((filters) => {
        this.applied.set(filters);
        this.form.reset({
          skillId: filters.skillId ?? null,
          minLevel: filters.minLevel ?? (filters.skillId ? 1 : null),
          seniority: filters.seniority ?? null,
          departmentId: filters.departmentId ?? null,
          period: {
            start: filters.availableFrom ? parseIsoDate(filters.availableFrom) : null,
            end: filters.availableTo ? parseIsoDate(filters.availableTo) : null,
          },
          minFreePercent: filters.minFreePercent ?? null,
        });
      });
  }

  /** Picking a skill starts at level 1 (any level), and no skill means no level. */
  protected onSkillChange(skillId: number | null): void {
    const minLevel = this.form.controls.minLevel;
    minLevel.setValue(skillId === null ? null : (minLevel.value ?? 1));
  }

  /** Puts the filters in the URL, which runs the search. */
  protected search(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    void this.router.navigate([], { relativeTo: this.route, queryParams: this.toFilters() });
  }

  protected clear(): void {
    // Without filters in the URL this navigation changes nothing, so it can't empty the form
    this.form.reset();
    void this.router.navigate([], { relativeTo: this.route, queryParams: {} });
  }

  protected freeLabel(row: EmployeeSearchResult): string {
    return row.free < 0 ? 'Over capacity' : `${row.free}% free`;
  }

  /** The skill filter, so the row can mark the main skill that was searched for. */
  protected isSearched(skillId: number): boolean {
    return this.applied().skillId === skillId;
  }

  private toFilters(): EmployeeSearchFilters {
    const value = this.form.getRawValue();
    const filters: EmployeeSearchFilters = {};
    if (value.skillId !== null) {
      filters.skillId = value.skillId;
      filters.minLevel = value.minLevel ?? 1;
    }
    if (value.seniority) {
      filters.seniority = value.seniority;
    }
    if (value.departmentId !== null) {
      filters.departmentId = value.departmentId;
    }
    if (value.period.start && value.period.end && value.minFreePercent !== null) {
      filters.availableFrom = toIsoDate(value.period.start);
      filters.availableTo = toIsoDate(value.period.end);
      filters.minFreePercent = value.minFreePercent;
    }
    return filters;
  }
}
