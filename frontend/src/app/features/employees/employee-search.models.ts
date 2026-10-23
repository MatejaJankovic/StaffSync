import { ParamMap } from '@angular/router';
import { Department } from '../departments/department.models';
import { Seniority } from '../profile/profile.models';
import { SENIORITIES } from '../requests/request.models';

/** One of the employee's skills and their level (1–5). */
export interface SkillLevel {
  skillId: number;
  name: string;
  level: number;
}

/**
 * `GET /api/employees/search`: an active employee who passes the filters, with the searched skill's
 * level (`null` without a skill filter), their main skills (at most 3, best first) and their load
 * on today's working day. `free` is `capacityPercent - load`, negative if overbooked.
 */
export interface EmployeeSearchResult {
  id: number;
  firstName: string;
  lastName: string;
  seniority: Seniority | null;
  department: Department | null;
  skillLevel: number | null;
  topSkills: SkillLevel[];
  capacityPercent: number;
  load: number;
  free: number;
}

/**
 * The search filters, named as the API and the page's URL name them, so a search can be shared or
 * reloaded. All are optional and combine with AND. `minLevel` needs `skillId`, and `availableFrom`,
 * `availableTo` (ISO dates) and `minFreePercent` go together: free capacity must be at least that
 * on every working day of the period.
 */
export interface EmployeeSearchFilters {
  skillId?: number;
  minLevel?: number;
  seniority?: Seniority;
  departmentId?: number;
  availableFrom?: string;
  availableTo?: string;
  minFreePercent?: number;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The filters in a URL such as `/employees?skillId=3&minLevel=4`. A value that isn't valid, e.g. a
 * hand-edited `seniority=GURU`, is left out instead of failing the search.
 */
export function filtersFromParams(params: ParamMap): EmployeeSearchFilters {
  const filters: EmployeeSearchFilters = {};
  const skillId = positiveInt(params.get('skillId'));
  if (skillId !== undefined) {
    filters.skillId = skillId;
    const minLevel = positiveInt(params.get('minLevel'));
    if (minLevel !== undefined && minLevel <= 5) {
      filters.minLevel = minLevel;
    }
  }
  const seniority = params.get('seniority') as Seniority | null;
  if (seniority && SENIORITIES.includes(seniority)) {
    filters.seniority = seniority;
  }
  const departmentId = positiveInt(params.get('departmentId'));
  if (departmentId !== undefined) {
    filters.departmentId = departmentId;
  }
  const from = params.get('availableFrom');
  const to = params.get('availableTo');
  const minFree = wholeNumber(params.get('minFreePercent'));
  if (from && to && ISO_DATE.test(from) && ISO_DATE.test(to) && minFree !== undefined) {
    if (minFree <= 100) {
      filters.availableFrom = from;
      filters.availableTo = to;
      filters.minFreePercent = minFree;
    }
  }
  return filters;
}

function wholeNumber(value: string | null): number | undefined {
  if (value === null || !/^\d+$/.test(value)) {
    return undefined;
  }
  return Number(value);
}

function positiveInt(value: string | null): number | undefined {
  const number = wholeNumber(value);
  return number !== undefined && number > 0 ? number : undefined;
}
