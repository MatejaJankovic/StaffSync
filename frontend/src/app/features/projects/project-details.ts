import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, combineLatest, map, of, startWith, Subject, switchMap, tap } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../core/auth/auth.service';
import { Notifications } from '../../core/error/notifications';
import { StatusChip } from '../../shared/status-chip/status-chip';
import { ProjectRequests } from '../requests/project-requests';
import { ProjectDialog, ProjectDialogData } from './project-dialog';
import { formatPeriod, isEditable, Project } from './project.models';
import { ProjectService } from './project.service';

type LoadState = 'loading' | 'ready' | 'notFound' | 'failed';

/**
 * Project details at `/projects/:id`: the project, and a section each for its staffing requests,
 * its team and the status action. The staffing requests (US-05) are in; the team panel (US-08)
 * and the status change (US-24) are still to come.
 */
@Component({
  selector: 'app-project-details',
  imports: [MatButtonModule, MatIconModule, ProjectRequests, RouterLink, StatusChip],
  templateUrl: './project-details.html',
  styleUrl: './project-details.scss',
})
export class ProjectDetails {
  private readonly projects = inject(ProjectService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly notifications = inject(Notifications);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  /** Emits to load the project again, e.g. from *Retry*. It goes through the same stream as a route change. */
  private readonly reload$ = new Subject<void>();

  protected readonly project = signal<Project | null>(null);
  protected readonly state = signal<LoadState>('loading');

  protected readonly period = computed(() => {
    const project = this.project();
    return project ? formatPeriod(project) : '';
  });

  /** Only the PM who owns the project can edit it, and not once it is completed or cancelled. */
  protected readonly canEdit = computed(() => {
    const project = this.project();
    return !!project && project.pmId === this.auth.currentUser()?.id && isEditable(project);
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
