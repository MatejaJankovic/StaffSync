/** One Home page card from `GET /api/dashboard`. The API sends only the caller's role's cards. */
export interface DashboardCard {
  key: string;
  label: string;
  /** Already formatted, e.g. `60%`, `3` or a project name. */
  value: string;
  /** Only for the employee's next allocation: the day it starts, e.g. `2026-11-01`. */
  date: string | null;
  /** The router path of the related list, or `null` if there is none. */
  link: string | null;
}
