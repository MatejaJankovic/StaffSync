import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { HttpClient } from '@angular/common/http';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { map } from 'rxjs';
import { ROLE_LABELS } from '../auth/auth.models';
import { AuthService } from '../auth/auth.service';
import { menuFor } from './menu';

interface HealthResponse {
  status: string;
  database: string;
}

type HealthState = { kind: 'loading' } | { kind: 'ok'; health: HealthResponse } | { kind: 'error' };

/** The logged-in app layout: toolbar, role-based side menu and the page outlet. */
@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatMenuModule,
    MatSidenavModule,
    MatToolbarModule,
  ],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);

  protected readonly user = this.auth.currentUser;
  protected readonly roleLabel = computed(() => {
    const role = this.auth.role();
    return role ? ROLE_LABELS[role] : '';
  });
  protected readonly menu = computed(() => menuFor(this.auth.role()));
  protected readonly health = signal<HealthState>({ kind: 'loading' });

  protected readonly isHandset = toSignal(
    inject(BreakpointObserver)
      .observe(Breakpoints.Handset)
      .pipe(map((state) => state.matches)),
    { initialValue: false },
  );

  ngOnInit(): void {
    this.http.get<HealthResponse>('/api/health').subscribe({
      next: (health) => this.health.set({ kind: 'ok', health }),
      error: () => this.health.set({ kind: 'error' }),
    });
  }

  protected logout(): void {
    this.auth.logout();
  }
}
