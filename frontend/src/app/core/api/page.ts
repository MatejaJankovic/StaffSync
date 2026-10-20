import { HttpParams } from '@angular/common/http';

/** A page of a backend list: Spring Data's `Page` serialized as `{ content, page }`. */
export interface Page<T> {
  content: T[];
  page: PageInfo;
}

export interface PageInfo {
  size: number;
  /** 0-based */
  number: number;
  totalElements: number;
  totalPages: number;
}

/** What a list endpoint accepts: `page` (0-based), `size` and `sort` such as `name,asc`. */
export interface PageQuery {
  page: number;
  size: number;
  sort?: string;
}

/**
 * Adds `page`, `size` and `sort` to the request params, e.g.
 * `http.get<Page<ProjectDto>>('/api/projects', { params: toPageParams(query, filters) })`.
 */
export function toPageParams(query: PageQuery, params = new HttpParams()): HttpParams {
  let result = params.set('page', query.page).set('size', query.size);
  if (query.sort) {
    result = result.set('sort', query.sort);
  }
  return result;
}
