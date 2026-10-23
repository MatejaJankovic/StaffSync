import { Component, computed, DestroyRef, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  catchError,
  combineLatest,
  filter,
  map,
  of,
  startWith,
  Subject,
  switchMap,
  tap,
} from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../core/auth/auth.service';
import { Notifications } from '../../core/error/notifications';
import { ConfirmDialogData } from '../../shared/confirm-dialog/confirm-dialog';
import { ConfirmDialogService } from '../../shared/confirm-dialog/confirm-dialog.service';
import { StatusChip } from '../../shared/status-chip/status-chip';
import { TeamPanel } from '../allocations/team-panel';
import { ProjectRequests } from '../requests/project-requests';
import { ProjectDialog, ProjectDialogData } from './project-dialog';
import { formatPeriod, isEditable, nextStatuses, Project, ProjectStatus } from './project.models';
import { ProjectService } from './project.service';

type LoadState = 'loading' | 'ready' | 'notFound' | 'failed';

/** An item of the status menu: a status the project can move to next (§9). */
interface StatusAction {
  status: ProjectStatus;
  label: string;
  icon: string;
  done: string;
  /** Completing and cancelling run the BR-11 clean-up, so they are confirmed first. */
  confirm?: ConfirmDialogData;
}

const CLEAN_UP =
  'Its open requests and proposals are cancelled, pending changes are dropped, allocations that ' +
  'haven’t started are cancelled, and active allocations end today.';

const STATUS_ACTIONS: Partial<Record<ProjectStatus, StatusAction>> = {
  ACTIVE: { status: 'ACTIVE', label: 'Activate', icon: 'play_arrow', done: 'Project activated' },
  COMPLETED: {
    status: 'COMPLETED',
    label: 'Complete',
    icon: 'task_alt',
    done: 'Project completed',
    confirm: {
      title: 'Complete project?',
      message: `The project can’t be changed afterwards. ${CLEAN_UP}`,
      confirmText: 'Complete project',
      cancelText: 'Keep active',
    },
  },
  CANCELLED: {
    status: 'CANCELLED',
    label: 'Cancel project',
    icon: 'cancel',
    done: 'Project cancelled',
    confirm: {
      title: 'Cancel project?',
      message: `The project can’t be changed afterwards. ${CLEAN_UP}`,
      confirmText: 'Cancel project',
      cancelText: 'Keep project',
      destructive: true,
    },
  },
};

/**
 * Project details at `/projects/:id`: the project, and a section each for its staffing requests (US-05)
 * and its team (US-08). The PM who owns the project edits it, and moves it to its next status (US-24):
 * completing or cancelling it runs the BR-11 clean-up on the server, so both sections load again.
 */
@Component({
  selector: 'app-project-details',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    ProjectRequests,
    RouterLink,
    StatusChip,
    TeamPanel,
  ],
  templateUrl: './project-details.html',
  styleUrl: './project-details.scss',
})
export class ProjectDetails {
  private readonly projects = inject(ProjectService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly notifications = inject(Notifications);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  /** Emits to load the project again, e.g. from *Retry*. It goes through the same stream as a route change. */
  private readonly reload$ = new Subject<void>();

  protected readonly project = signal<Project | null>(null);
  protected readonly state = signal<LoadState>('loading');

  /** Only there once the project has loaded. */
  protected readonly requests = viewChild(ProjectRequests);
  protected readonly team = viewChild(TeamPanel);

  protected readonly period = computed(() => {
    const project = this.project();
    return project ? formatPeriod(project) : '';
  });

  private readonly isOwner = computed(() => {
    const project = this.project();
    return !!project && project.pmId === this.auth.currentUser()?.id;
  });

  /** Only the PM who owns the project can edit it, and not once it is completed or cancelled. */
  protected readonly canEdit = computed(() => this.isOwner() && isEditable(this.project()!));

  /** What the owner can move the project to. Empty for anyone else, and once it is closed. */
  protected readonly statusActions = computed(() => {
    const project = this.project();
    if (!project || !this.isOwner()) {
      return [];
    }
    return nextStatuses(project.status).map((status) => STATUS_ACTIONS[status]!);
  });

  protected readonly isPm = computed(() => this.auth.role() === 'PM');

  constructor() {
    combineLatest([this.route.paramMap, this.reload$.pipe(startWith(undefined))])
      .pipe(
        map(([params]) => Number(params.get('id'))),
        tap(() => {
          this.project.set(null);
          this.state.set('loading');
        }),
        switchMap((id) => this.load(id)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ project, state }) => {
        this.project.set(project);
        this.state.set(state);
      });
  }

  protected retry(): void {
    this.reload$.next();
  }

  protected edit(): void {
    const project = this.project();
    if (!project) {
      return;
    }
    this.dialog
      .open<ProjectDialog, ProjectDialogData, Project>(ProjectDialog, {
        data: { project },
        width: '560px',
      })
      .afterClosed()
      .subscribe((saved) => {
        if (saved) {
          this.project.set(saved);
          this.notifications.success('Project saved');
        }
      });
  }

  /**
   * Completing or cancelling changes the requests and the team on the server (BR-11), so both load
   * again. On an error, e.g. the status changed in another tab, the error snackbar shows the API's
   * message and the project loads again, so the menu offers what is allowed now.
   */
  protected changeStatus(action: StatusAction): void {
    const project = this.project();
    if (!project) {
      return;
    }
    (action.confirm ? this.confirmDialog.confirm(action.confirm) : of(true))
      .pipe(
        filter(Boolean),
        switchMap(() => this.projects.changeStatus(project.id, action.status)),
      )
      .subscribe({
        next: (updated) => {
          this.project.set(updated);
          this.requests()?.reload();
          this.team()?.reload();
          this.notifications.success(action.done);
        },
        error: () => this.retry(),
      });
  }

  /** The error snackbar already shows the API's message, so this only decides what the page shows. */
  private load(id: number) {
    if (!Number.isInteger(id)) {
      return of<{ project: Project | null; state: LoadState }>({
        project: null,
        state: 'notFound',
      });
    }
    return this.projects.get(id).pipe(
      map((project) => ({ project, state: 'ready' as LoadState })),
      catchError((error: unknown) =>
        of({
          project: null,
          state: (error instanceof HttpErrorResponse && error.status === 404
            ? 'notFound'
            : 'failed') as LoadState,
        }),
      ),
    );
  }
}
