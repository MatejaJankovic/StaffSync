import { Role } from '../../core/auth/auth.models';
import { Department } from '../departments/department.models';
import { Seniority } from '../profile/profile.models';

/** In menu order: the roles an Admin can give an account. */
export const ROLES: readonly Role[] = ['EMPLOYEE', 'PM', 'RM', 'ADMIN'];

/** §5: the only capacities a user can have. */
export const CAPACITY_OPTIONS: readonly number[] = [100, 80, 50];

/** A user account as the Admin sees it (`UserAccountDto`). There is never a password in it. */
export interface UserAccount {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  department: Department | null;
  manager: { id: number; firstName: string; lastName: string } | null;
  seniority: Seniority | null;
  capacityPercent: number;
  active: boolean;
}

/** An EMPLOYEE needs a department and an active RM as manager; other roles have no manager. */
export interface UpdateUserRequest {
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  departmentId: number | null;
  managerId: number | null;
  seniority: Seniority | null;
  capacityPercent: number;
}

export interface CreateUserRequest extends UpdateUserRequest {
  temporaryPassword: string;
}

/** A day that a lower capacity would overbook, in the `details` of a 409 `CAPACITY_EXCEEDED` (BR-13). */
export interface OverloadedDay {
  date: string;
  load: number;
}

export function isOverloadedDay(detail: unknown): detail is OverloadedDay {
  return (
    typeof detail === 'object' &&
    detail !== null &&
    typeof (detail as OverloadedDay).date === 'string' &&
    typeof (detail as OverloadedDay).load === 'number'
  );
}

export function fullName(person: { firstName: string; lastName: string }): string {
  return `${person.firstName} ${person.lastName}`;
}
