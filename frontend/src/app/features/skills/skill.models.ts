export type SkillCategory = 'BACKEND' | 'FRONTEND' | 'DATABASE' | 'DEVOPS' | 'QA' | 'OTHER';

export interface Skill {
  id: number;
  name: string;
  category: SkillCategory;
}

export interface SkillRequest {
  name: string;
  category: SkillCategory;
}

/** The categories in display order (§5). */
export const SKILL_CATEGORIES: readonly SkillCategory[] = [
  'BACKEND',
  'FRONTEND',
  'DATABASE',
  'DEVOPS',
  'QA',
  'OTHER',
];

export const SKILL_CATEGORY_LABELS: Record<SkillCategory, string> = {
  BACKEND: 'Backend',
  FRONTEND: 'Frontend',
  DATABASE: 'Database',
  DEVOPS: 'DevOps',
  QA: 'QA',
  OTHER: 'Other',
};
