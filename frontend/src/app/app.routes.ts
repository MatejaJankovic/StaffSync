import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth/auth.guard';
import { roleGuard } from './core/auth/role.guard';
import { menuRoute } from './core/layout/menu';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/login/login').then((m) => m.Login),
    canActivate: [guestGuard],
    title: 'Sign in · StaffSync',
  },
  {
    path: '',
    loadComponent: () => import('./core/layout/shell').then((m) => m.Shell),
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'home' },
      // Each page is a placeholder until its owner swaps in the real component,
      // e.g. menuRoute('projects', ProjectList). Roles come from MENU in core/layout/menu.ts.
      menuRoute('home', {
        loadComponent: () => import('./features/home/home-page').then((m) => m.HomePage),
      }),
      // Employee
      menuRoute('profile', {
        loadComponent: () => import('./features/profile/profile-page').then((m) => m.ProfilePage),
      }),
      menuRoute('my-allocations'),
      // PM
      menuRoute('projects', {
        loadComponent: () =>
          import('./features/projects/projects-page').then((m) => m.ProjectsPage),
      }),
      // Every role can read a project, so no roleGuard. Reached from My projects (PM)
      {
        path: 'projects/:id',
        loadComponent: () =>
          import('./features/projects/project-details').then((m) => m.ProjectDetails),
        title: 'Project details · StaffSync',
      },
      // PM: New request and Edit request, opened from Project details
      {
        path: 'projects/:projectId/requests/new',
        loadComponent: () => import('./features/requests/request-form').then((m) => m.RequestForm),
        canActivate: [roleGuard],
        data: { roles: ['PM'] },
        title: 'New request · StaffSync',
      },
      {
        path: 'projects/:projectId/requests/:id/edit',
        loadComponent: () => import('./features/requests/request-form').then((m) => m.RequestForm),
        canActivate: [roleGuard],
        data: { roles: ['PM'] },
        title: 'Edit request · StaffSync',
      },
      // PM: Candidates, opened by Find candidates on Project details
      {
        path: 'requests/:id/candidates',
        loadComponent: () =>
          import('./features/matching/candidates-page').then((m) => m.CandidatesPage),
        canActivate: [roleGuard],
        data: { roles: ['PM'] },
        title: 'Candidates · StaffSync',
      },
      // RM
      menuRoute('approvals', {
        loadComponent: () =>
          import('./features/allocations/pending-approvals-page').then(
            (m) => m.PendingApprovalsPage,
          ),
      }),
      menuRoute('team', {
        loadComponent: () => import('./features/team/team-page').then((m) => m.TeamPage),
      }),
      // PM and RM
      menuRoute('employees'),
      // Admin
      menuRoute('admin/users', {
        loadComponent: () => import('./features/users/users-page').then((m) => m.UsersPage),
      }),
      menuRoute('admin/departments', {
        loadComponent: () =>
          import('./features/departments/departments-page').then((m) => m.DepartmentsPage),
      }),
      // Lazy, so the Material table and dialogs stay out of the initial bundle
      menuRoute('admin/skills', {
        loadComponent: () => import('./features/skills/skills-page').then((m) => m.SkillsPage),
      }),
    ],
  },
  { path: '**', redirectTo: '' },
];
