import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth/auth.guard';
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
      menuRoute('home'),
      // Employee
      menuRoute('profile'),
      menuRoute('my-allocations'),
      // PM
      menuRoute('projects'),
      // RM
      menuRoute('approvals'),
      menuRoute('team'),
      // PM and RM
      menuRoute('employees'),
      // Admin
      menuRoute('admin/users'),
      menuRoute('admin/departments'),
      // Lazy, so the Material table and dialogs stay out of the initial bundle
      menuRoute('admin/skills', {
        loadComponent: () => import('./features/skills/skills-page').then((m) => m.SkillsPage),
      }),
    ],
  },
  { path: '**', redirectTo: '' },
];
