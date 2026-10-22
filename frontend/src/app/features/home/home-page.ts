import { Component, inject, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { shortDate } from '../../shared/dates';
import { StatCard } from '../../shared/stat-card/stat-card';
import { DashboardCard } from './dashboard.models';
import { DashboardService } from './dashboard.service';

type LoadState = 'loading' | 'ready' | 'failed';

/**
 * *Home* at `/home` (US-20): a few number cards for the user's role, each linking to its list. No
 * charts (§3). The page loads the cards each time it opens, so they follow approvals and other actions.
 */
@Component({
  selector: 'app-home-page',
  imports: [MatButtonModule, StatCard],
  templateUrl: './home-page.html',
  styleUrl: './home-page.scss',
})
export class HomePage implements OnInit {
  private readonly dashboard = inject(DashboardService);

  protected readonly cards = signal<DashboardCard[]>([]);
  protected readonly state = signal<LoadState>('loading');

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.state.set('loading');
    this.dashboard.cards().subscribe({
      next: (cards) => {
        this.cards.set(cards);
        this.state.set('ready');
      },
      error: () => this.state.set('failed'),
    });
  }

  /** `From 1 Nov 2026` for the next allocation; the other cards have no date. */
  protected caption(card: DashboardCard): string | null {
    return card.date ? `From ${shortDate(card.date)}` : null;
  }
}
