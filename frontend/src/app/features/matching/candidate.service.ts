import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Page, PageQuery, toPageParams } from '../../core/api/page';
import { REQUESTS_URL } from '../requests/request.service';
import { Candidate } from './candidate.models';

/** Talks to the matching API. Only the PM who owns the request's project can list its candidates. */
@Injectable({ providedIn: 'root' })
export class CandidateService {
  private readonly http = inject(HttpClient);

  /**
   * The candidates of a request, best score first. The API always sorts by score, so there is no
   * `sort`. A request that is FILLED or CANCELLED has none: the API answers 409.
   */
  list(requestId: number, query: PageQuery): Observable<Page<Candidate>> {
    return this.http.get<Page<Candidate>>(`${REQUESTS_URL}/${requestId}/candidates`, {
      params: toPageParams(query),
    });
  }
}
