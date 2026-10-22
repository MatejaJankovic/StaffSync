import { Seniority } from '../requests/request.models';

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
