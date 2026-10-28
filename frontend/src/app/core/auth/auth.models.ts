export type Role = 'EMPLOYEE' | 'PM' | 'RM' | 'ADMIN';

export interface User {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  /** True while the password is a temporary one from an Admin: the user picks their own first */
  mustChangePassword?: boolean;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface ChangePasswordRequest {
  oldPassword: string;
  newPassword: string;
}

export const ROLE_LABELS: Record<Role, string> = {
  EMPLOYEE: 'Employee',
  PM: 'Project Manager',
  RM: 'Resource Manager',
  ADMIN: 'Admin',
};
