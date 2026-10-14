import { Component, inject, OnInit, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterOutlet } from '@angular/router';

interface HealthResponse {
  status: string;
  database: string;
}

type HealthState = { kind: 'loading' } | { kind: 'ok'; health: HealthResponse } | { kind: 'error' };

@Component({
  imports: [RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App implements OnInit {
  private readonly http = inject(HttpClient);

  protected readonly title = signal('StaffSync');
  protected readonly health = signal<HealthState>({ kind: 'loading' });

  ngOnInit(): void {
    this.http.get<HealthResponse>('/api/health').subscribe({
      next: (health) => this.health.set({ kind: 'ok', health }),
      error: () => this.health.set({ kind: 'error' }),
    });
  }
}
