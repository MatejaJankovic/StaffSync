import { Seniority } from '../requests/request.models';
import { DayAvailability } from '../users/user.models';

/** What each part of the score gives, rounded to whole numbers. The three add up to `score` (§8). */
export interface CandidateBreakdown {
  /** 0 to 50 */
  skills: number;
  /** 0 to 40 */
  availability: number;
  /** 0 to 10 */
  seniority: number;
}

/** A ranked candidate for a staffing request (`GET /api/requests/{id}/candidates`). */
export interface Candidate {
  employeeId: number;
  fullName: string;
  seniority: Seniority | null;
  department: string | null;
  /** 0 to 100 */
  score: number;
  breakdown: CandidateBreakdown;
  /** The requested skills the candidate has, e.g. `Java 4/5 (required ≥ 4)` */
  reasons: string[];
  /** Days without enough free capacity, requested skills the candidate lacks, a different seniority */
  warnings: string[];
}

/** One part of the score, shown as `23/50`. */
export interface ScorePart {
  label: string;
  value: number;
  max: number;
}

/** §8: skills are worth 50 points, availability 40 and seniority 10. */
export function scoreParts({ breakdown }: Pick<Candidate, 'breakdown'>): ScorePart[] {
  return [
    { label: 'Skills', value: breakdown.skills, max: 50 },
    { label: 'Availability', value: breakdown.availability, max: 40 },
    { label: 'Seniority', value: breakdown.seniority, max: 10 },
  ];
}

/** How the matching engine starts a capacity warning (§8); the propose dialog recalculates these. */
export const CAPACITY_WARNING_PREFIX = 'Insufficient capacity';

/**
 * The capacity warnings for a chosen percent and period, worded like the matching engine's (§8):
 * one per run of working days on which the free capacity falls short, e.g.
 * `Insufficient capacity 2026-11-02 – 2026-11-13 (40% free, 60% required)`. The days are working
 * days only, so a weekend doesn't split a run, but a different free capacity starts a new one.
 */
export function capacityWarnings(days: readonly DayAvailability[], percent: number): string[] {
  const runs: { from: string; to: string; free: number }[] = [];
  let open: { from: string; to: string; free: number } | null = null;
  for (const day of days) {
    if (day.free >= percent) {
      open = null;
      continue;
    }
    const free = Math.max(day.free, 0);
    if (open && open.free === free) {
      open.to = day.date;
    } else {
      open = { from: day.date, to: day.date, free };
      runs.push(open);
    }
  }
  return runs.map(
    (run) =>
      `${CAPACITY_WARNING_PREFIX} ${run.from === run.to ? run.from : `${run.from} – ${run.to}`} ` +
      `(${run.free}% free, ${percent}% required)`,
  );
}
