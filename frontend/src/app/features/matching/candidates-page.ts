import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, DestroyRef, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  catchError,
  combineLatest,
  map,
  Observable,
  of,
  startWith,
  Subject,
  switchMap,
  tap,
} from 'rxjs';
import { PageQuery } from '../../core/api/page';
import { Notifications } from '../../core/error/notifications';
import { PagedTable, PagedTableColumn } from '../../shared/paged-table/paged-table';
import { PagedTableCell } from '../../shared/paged-table/paged-table-cell';
import { StatusChip } from '../../shared/status-chip/status-chip';
import { WarningList } from '../../shared/warning-list/warning-list';
import { AllocationProposal } from '../allocations/allocation.models';
import { formatPeriod } from '../projects/project.models';
import { canFindCandidates, SENIORITY_LABELS, StaffingRequest } from '../requests/request.models';
import { RequestService } from '../requests/request.service';
import { Candidate, scoreParts } from './candidate.models';
import { CandidateService } from './candidate.service';
import { ProposeDialog, ProposeDialogData } from './propose-dialog';

type LoadState = 'loading' | 'ready' | 'notFound' | 'forbidden' | 'failed';

interface Loaded {
  request: StaffingRequest | null;
  state: LoadState;
}

/** The warnings of a proposal (BR-2), kept on the page until the PM dismisses them. */
interface ProposalNotice {
  allocationId: number;
  employeeName: string;
  warnings: string[];
}

/**
 * *Candidates* at `/requests/:id/candidates`, opened by *Find candidates* on Project details: the
 * request at the top, and below it the people who could fill it, best first (§8). Each candidate
 * has a 0–100 score, how it adds up, the reasons for it, and warnings (not enough capacity, a
 * skill they lack, a different seniority), and can be proposed for the request. Only the PM who
 * owns the project can use it (BR-4).
 */
@Component({
  selector: 'app-candidates-page',
  imports: [
    MatButtonModule,
    MatIconModule,
    PagedTable,
    PagedTableCell,
    RouterLink,
    StatusChip,
    WarningList,
  ],
  templateUrl: './candidates-page.html',
  styleUrl: './candidates-page.scss',
})
export class CandidatesPage {
  private readonly requests = inject(RequestService);
  private readonly candidates = inject(CandidateService);
  private readonly dialog = inject(MatDialog);
  private readonly notifications = inject(Notifications);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  // Not there while the request loads, or when it takes no proposals
  private readonly table = viewChild(PagedTable<Candidate>);

  /** Emits to load the request again, e.g. from *Retry*. It goes through the same stream as a route change. */
  private readonly reload$ = new Subject<void>();

  protected readonly request = signal<StaffingRequest | null>(null);
  protected readonly state = signal<LoadState>('loading');
  protected readonly notices = signal<ProposalNotice[]>([]);

  protected readonly seniorityLabels = SENIORITY_LABELS;
  protected readonly scoreParts = scoreParts;

  // The API sorts by score, so no column can be sorted
  protected readonly columns: PagedTableColumn<Candidate>[] = [
    { key: 'candidate', header: 'Candidate' },
    { key: 'score', header: 'Score' },
    { key: 'breakdown', header: 'Breakdown' },
    { key: 'notes', header: 'Reasons and warnings' },
    { key: 'actions', header: '' },
  ];

  protected readonly emptyText =
    'No candidates match the mandatory skills, or everyone who does is already proposed or staffed on this request.';

  protected readonly period = computed(() => {
    const request = this.request();
    return request ? formatPeriod(request) : '';
  });

  /** `filled`, `cancelled`: why a request has no candidates to rank. */
  protected readonly statusWords = computed(
    () => this.request()?.status.toLowerCase().replaceAll('_', ' ') ?? '',
  );

  protected readonly required = computed(
    () => this.request()?.skills.filter((skill) => skill.mandatory) ?? [],
  );

  protected readonly niceToHave = computed(
    () => this.request()?.skills.filter((skill) => !skill.mandatory) ?? [],
  );

  /** Back to the project the request belongs to, or to *My projects* while the request isn't there. */
  protected readonly backLink = computed(() => {
    const request = this.request();
    return request ? ['/projects', request.projectId] : ['/projects'];
  });

  /**
   * How the table gets its rows, or `null` when the request takes no proposals (BR-9): a FILLED or
   * CANCELLED request has no candidates, and the API answers 409. A new function reloads the table
   * from the first page.
   */
  protected readonly fetchCandidates = computed(() => {
    const request = this.request();
    if (!request || !canFindCandidates(request)) {
      return null;
    }
    const id = request.id;
    return (query: PageQuery) => this.candidates.list(id, query);
  });

  constructor() {
    combineLatest([this.route.paramMap, this.reload$.pipe(startWith(undefined))])
      .pipe(
        map(([params]) => Number(params.get('id'))),
        tap(() => {
          this.request.set(null);
          this.notices.set([]);
          this.state.set('loading');
        }),
        switchMap((id) => this.load(id)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ request, state }) => {
        this.request.set(request);
        this.state.set(state);
      });
  }

  protected retry(): void {
    this.reload$.next();
  }

  protected propose(candidate: Candidate): void {
    const request = this.request();
    if (!request) {
      return;
    }
    this.dialog
      .open<ProposeDialog, ProposeDialogData, AllocationProposal>(ProposeDialog, {
        data: { request, candidate },
        width: '520px',
      })
      .afterClosed()
      .subscribe((proposal) => {
        // Loaded again whatever happened: someone who was proposed is no longer a candidate, and a
        // proposal that failed with a 409 usually means the list is out of date
        this.table()?.reload();
        if (proposal) {
          this.proposed(candidate, proposal);
        }
      });
  }

  protected dismiss(notice: ProposalNotice): void {
    this.notices.update((notices) => notices.filter((other) => other !== notice));
  }

  /** `Senior · Engineering`. Either can be missing on the employee. */
  protected meta(candidate: Candidate): string {
    const seniority = candidate.seniority
      ? SENIORITY_LABELS[candidate.seniority]
      : 'Seniority not set';
    return candidate.department ? `${seniority} · ${candidate.department}` : seniority;
  }

  /**
   * A clean proposal gets a snackbar. One with warnings (BR-2) gets a notice that stays until it is
   * dismissed, because the RM can't approve it while the capacity is short (BR-1), and the PM
   * should not miss that after a few seconds.
   */
  private proposed(candidate: Candidate, { allocation, warnings }: AllocationProposal): void {
    if (warnings.length === 0) {
      this.notifications.success(`${candidate.fullName} proposed`);
      return;
    }
    this.notices.update((notices) => [
      ...notices,
      { allocationId: allocation.id, employeeName: candidate.fullName, warnings },
    ]);
  }

  /** The error snackbar already shows the API's message, so this only decides what the page shows. */
  private load(id: number): Observable<Loaded> {
    if (!Number.isInteger(id)) {
      return of<Loaded>({ request: null, state: 'notFound' });
    }
    return this.requests.get(id).pipe(
      map((request): Loaded => ({ request, state: 'ready' })),
      catchError((error: unknown) => of<Loaded>({ request: null, state: failureOf(error) })),
    );
  }
}

function failureOf(error: unknown): LoadState {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 404) {
      return 'notFound';
    }
    if (error.status === 403) {
      return 'forbidden';
    }
  }
  return 'failed';
}
