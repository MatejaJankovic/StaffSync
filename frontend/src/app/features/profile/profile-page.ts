import { Component, computed, inject, OnInit, signal } from '@angular/core';
import {
  FormControl,
  FormGroup,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { Notifications } from '../../core/error/notifications';
import { SkillLevelPicker } from '../../shared/skill-level-picker/skill-level-picker';
import {
  Skill,
  SKILL_CATEGORIES,
  SKILL_CATEGORY_LABELS,
  SkillCategory,
} from '../skills/skill.models';
import { SkillService } from '../skills/skill.service';
import { EmployeeSkill, Profile, SENIORITY_LABELS } from './profile.models';
import { ProfileService } from './profile.service';

export const MAX_YEARS_OF_EXPERIENCE = 60;

/** One row of the skills table. Name and category are only shown, never sent. */
type SkillRow = FormGroup<{
  skillId: FormControl<number>;
  skillName: FormControl<string>;
  level: FormControl<number>;
  yearsOfExperience: FormControl<number>;
}>;

interface SkillOptionGroup {
  label: string;
  skills: Skill[];
}

/** Employee page: personal data (read-only) and the employee's own skills with levels. */
@Component({
  selector: 'app-profile-page',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatTableModule,
    ReactiveFormsModule,
    SkillLevelPicker,
  ],
  templateUrl: './profile-page.html',
  styleUrl: './profile-page.scss',
})
export class ProfilePage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly profileService = inject(ProfileService);
  private readonly skillService = inject(SkillService);
  private readonly notifications = inject(Notifications);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly columns = ['skill', 'level', 'years', 'actions'];
  protected readonly maxYears = MAX_YEARS_OF_EXPERIENCE;
  protected readonly seniorityLabels = SENIORITY_LABELS;

  protected readonly profile = signal<Profile | null>(null);
  protected readonly catalog = signal<Skill[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadFailed = signal(false);
  protected readonly saving = signal(false);

  protected readonly form = this.fb.array<SkillRow>([]);
  /** The *Add skill* select. It clears itself after each pick. */
  protected readonly addSkill = new FormControl<number | null>(null);
  /** The rows as a signal, so the table and the *Add skill* options follow adds and removes. */
  protected readonly rows = signal<SkillRow[]>([]);

  /** Catalog skills the employee hasn't rated yet, grouped by category. */
  protected readonly addOptions = computed<SkillOptionGroup[]>(() => {
    const rated = new Set(this.rows().map((row) => row.controls.skillId.value));
    return SKILL_CATEGORIES.map((category: SkillCategory) => ({
      label: SKILL_CATEGORY_LABELS[category],
      skills: this.catalog()
        .filter((skill) => skill.category === category && !rated.has(skill.id))
        .sort((a, b) => a.name.localeCompare(b.name)),
    })).filter((group) => group.skills.length > 0);
  });

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    const userId = this.auth.currentUser()?.id;
    if (userId === undefined) {
      this.loading.set(false);
      this.loadFailed.set(true);
      return;
    }
    this.loading.set(true);
    this.loadFailed.set(false);
    forkJoin({
      profile: this.profileService.me(),
      skills: this.profileService.skills(userId),
      catalog: this.skillService.list(),
    }).subscribe({
      next: ({ profile, skills, catalog }) => {
        this.profile.set(profile);
        this.catalog.set(catalog);
        this.setRows(skills);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.loadFailed.set(true);
      },
    });
  }

  protected add(skillId: number): void {
    this.addSkill.reset();
    const skill = this.catalog().find((s) => s.id === skillId);
    if (!skill) {
      return;
    }
    this.form.push(
      this.row({ skillId: skill.id, skillName: skill.name, level: 1, yearsOfExperience: 0 }),
    );
    this.form.markAsDirty();
    this.rows.set([...this.form.controls]);
  }

  protected remove(index: number): void {
    this.form.removeAt(index);
    this.form.markAsDirty();
    this.rows.set([...this.form.controls]);
  }

  protected save(): void {
    const userId = this.profile()?.id;
    if (userId === undefined || this.saving()) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    // A number input can hand back its value as a string
    const skills = this.form.getRawValue().map(({ skillId, level, yearsOfExperience }) => ({
      skillId,
      level,
      yearsOfExperience: Number(yearsOfExperience),
    }));
    // Errors are shown by the global error snackbar
    this.profileService.saveSkills(userId, skills).subscribe({
      next: (saved) => {
        this.setRows(saved);
        this.saving.set(false);
        this.notifications.success('Skills saved');
      },
      error: () => this.saving.set(false),
    });
  }

  private setRows(skills: EmployeeSkill[]): void {
    this.form.clear();
    skills.forEach((skill) => this.form.push(this.row(skill)));
    this.form.markAsPristine();
    this.form.markAsUntouched();
    this.rows.set([...this.form.controls]);
  }

  private row(
    skill: Pick<EmployeeSkill, 'skillId' | 'skillName' | 'level' | 'yearsOfExperience'>,
  ): SkillRow {
    return this.fb.group({
      skillId: this.fb.control<number>(skill.skillId),
      skillName: this.fb.control<string>(skill.skillName),
      level: this.fb.control<number>(skill.level, [
        Validators.required,
        Validators.min(1),
        Validators.max(5),
      ]),
      yearsOfExperience: this.fb.control<number>(skill.yearsOfExperience, [
        Validators.required,
        Validators.min(0),
        Validators.max(MAX_YEARS_OF_EXPERIENCE),
        Validators.pattern(/^\d+$/),
      ]),
    });
  }
}
