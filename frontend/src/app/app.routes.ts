import { Routes } from '@angular/router';
import { Login } from './features/login/login';
import { Placeholder } from './features/placeholder/placeholder';

export const routes: Routes = [
  { path: 'login', component: Login, title: 'Sign in · StaffSync' },
  { path: 'home', component: Placeholder, data: { title: 'Home' }, title: 'Home · StaffSync' },
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: '**', redirectTo: 'login' },
];
