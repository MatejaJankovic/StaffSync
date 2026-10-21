import { Type } from '@angular/core';
import { Route } from '@angular/router';
import { Role } from '../auth/auth.models';
import { roleGuard } from '../auth/role.guard';
import { Placeholder } from '../../features/placeholder/placeholder';

export interface MenuItem {
  label: string;
  icon: string;
  path: string;
  roles: readonly Role[];
}

const ALL_ROLES: readonly Role[] = ['EMPLOYEE', 'PM', 'RM', 'ADMIN'];

/** The side menu, in display order (§11). The single source of truth for who sees which page. */
export const MENU: readonly MenuItem[] = [
  { label: 'Home', icon: 'home', path: 'home', roles: ALL_ROLES },
  { label: 'My profile', icon: 'person', path: 'profile', roles: ['EMPLOYEE'] },
  { label: 'My allocations', icon: 'event_note', path: 'my-allocations', roles: ['EMPLOYEE'] },
  { label: 'My projects', icon: 'folder', path: 'projects', roles: ['PM'] },
  { label: 'Pending approvals', icon: 'pending_actions', path: 'approvals', roles: ['RM'] },
  { label: 'My team', icon: 'groups', path: 'team', roles: ['RM'] },
  { label: 'Employee search', icon: 'person_search', path: 'employees', roles: ['PM', 'RM'] },
  { label: 'Users', icon: 'manage_accounts', path: 'admin/users', roles: ['ADMIN'] },
  { label: 'Departments', icon: 'apartment', path: 'admin/departments', roles: ['ADMIN'] },
  { label: 'Skills catalog', icon: 'psychology', path: 'admin/skills', roles: ['ADMIN'] },
];

export function menuFor(role: Role | null): MenuItem[] {
  return role ? MENU.filter((item) => item.roles.includes(role)) : [];
}

/** A page that is loaded on demand, to keep its dependencies out of the initial bundle. */
export interface LazyPage {
  loadComponent: () => Promise<Type<unknown>>;
}

/**
 * The route for a menu page, protected by `roleGuard` with the roles from `MENU`.
 * Swap in your page with e.g. `menuRoute('projects', ProjectList)`, or load it lazily with
 * `menuRoute('projects', { loadComponent: () => import('./features/projects/list').then((m) => m.ProjectList) })`.
 */
export function menuRoute(path: string, page: Type<unknown> | LazyPage = Placeholder): Route {
  const item = MENU.find((entry) => entry.path === path);
  if (!item) {
    throw new Error(`No menu item for path "${path}"`);
  }
  return {
    path,
    ...('loadComponent' in page ? { loadComponent: page.loadComponent } : { component: page }),
    canActivate: [roleGuard],
    data: { roles: item.roles, title: item.label },
    title: `${item.label} · StaffSync`,
  };
}
