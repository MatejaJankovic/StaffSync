import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CdkTableModule } from '@angular/cdk/table';
import { SsSort, SsSortChange, SsSortDirection, SsSortHeader, SsButton } from '../../shared/ui';
import { CapacityBar } from '../../shared/capacity-bar/capacity-bar';
import { CapacityRing } from '../../shared/capacity-ring/capacity-ring';
import { SENIORITY_LABELS } from '../profile/profile.models';
import { fullName } from '../users/user.models';
import { TeamMember } from './team.models';
import { TeamService } from './team.service';

type SortColumn = 'name' | 'load';

const byName = (a: TeamMember, b: TeamMember) =>
  a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName);

/** Load as a share of the member's own capacity, so 40% of a 50% part-timer is 80% full. */
const usage = (member: TeamMember) =>
  member.capacityPercent > 0 ? member.load / member.capacityPercent : 0;

/**
 * RM page: the team with today's load (US-21). Sorted by load from the lowest by default, so the
 * people free today (0%) come first and the overloaded ones last; a click on a header resorts.
 * "Free today", not "Bench": the Home card that links here counts the bench as 0% all week (§11).
 */
@Component({
  selector: 'app-team-page',
  imports: [CapacityBar, CapacityRing, SsButton, CdkTableModule, SsSort, SsSortHeader],
  templateUrl: './team-page.html',
  styleUrl: './team-page.scss',
})
export class TeamPage implements OnInit {
  private readonly teamService = inject(TeamService);

  protected readonly columns = ['ring', 'name', 'seniority', 'department', 'capacity', 'load'];
  protected readonly fullName = fullName;
  protected readonly members = signal<TeamMember[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadFailed = signal(false);
  protected readonly sort = signal<{ active: SortColumn; direction: SsSortDirection }>({
    active: 'load',
    direction: 'asc',
  });

  protected readonly sorted = computed(() => {
    const { active, direction } = this.sort();
    const compare =
      active === 'name'
        ? byName
        : (a: TeamMember, b: TeamMember) => usage(a) - usage(b) || byName(a, b);
    const sign = direction === 'desc' ? -1 : 1;
    return [...this.members()].sort((a, b) => sign * compare(a, b));
  });

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.loadFailed.set(false);
    this.teamService.myTeam().subscribe({
      next: (members) => {
        this.members.set(members);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.loadFailed.set(true);
      },
    });
  }

  // Clearing the sort (a third click) goes back to the default: the people free today first
  protected sortBy(sort: SsSortChange): void {
    this.sort.set(
      sort.direction
        ? { active: sort.active as SortColumn, direction: sort.direction }
        : { active: 'load', direction: 'asc' },
    );
  }

  protected seniority(member: TeamMember): string {
    return member.seniority ? SENIORITY_LABELS[member.seniority] : '—';
  }

  protected status(member: TeamMember): string | null {
    if (member.load === 0) {
      return 'Free today';
    }
    return member.load > member.capacityPercent ? 'Over capacity' : null;
  }
}
