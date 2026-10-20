import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { Skill, SKILL_CATEGORIES, SKILL_CATEGORY_LABELS, SkillCategory } from './skill.models';
import { SkillService } from './skill.service';
import { SkillDeleteDialog } from './skill-delete-dialog';
import { SkillDialog, SkillDialogData } from './skill-dialog';

interface CategoryGroup {
  category: SkillCategory;
  label: string;
  skills: Skill[];
}

/** Admin page: the skills catalog grouped by category, with add, edit and delete. */
@Component({
  selector: 'app-skills-page',
  imports: [MatButtonModule, MatIconModule, MatTableModule],
  templateUrl: './skills-page.html',
  styleUrl: './skills-page.scss',
})
export class SkillsPage implements OnInit {
  private readonly skillService = inject(SkillService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly columns = ['name', 'actions'];
  protected readonly skills = signal<Skill[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadFailed = signal(false);

  protected readonly groups = computed<CategoryGroup[]>(() =>
    SKILL_CATEGORIES.map((category) => ({
      category,
      label: SKILL_CATEGORY_LABELS[category],
      skills: this.skills()
        .filter((skill) => skill.category === category)
        .sort((a, b) => a.name.localeCompare(b.name)),
    })).filter((group) => group.skills.length > 0),
  );

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.loadFailed.set(false);
    this.skillService.list().subscribe({
      next: (skills) => {
        this.skills.set(skills);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.loadFailed.set(true);
      },
    });
  }

  protected add(): void {
    this.openDialog({});
  }

  protected edit(skill: Skill): void {
    this.openDialog({ skill });
  }

  protected remove(skill: Skill): void {
    this.dialog
      .open<SkillDeleteDialog, Skill, boolean>(SkillDeleteDialog, { data: skill })
      .afterClosed()
      .subscribe((confirmed) => {
        if (!confirmed) {
          return;
        }
        this.skillService.delete(skill.id).subscribe({
          next: () => {
            this.skills.update((skills) => skills.filter((s) => s.id !== skill.id));
            this.snackBar.open(`Deleted ${skill.name}`, 'Dismiss', { duration: 4000 });
          },
          error: (err: unknown) => this.showError(err, 'Unable to delete the skill.'),
        });
      });
  }

  private openDialog(data: SkillDialogData): void {
    this.dialog
      .open<SkillDialog, SkillDialogData, Skill>(SkillDialog, { data, width: '400px' })
      .afterClosed()
      .subscribe((saved) => {
        if (!saved) {
          return;
        }
        this.skills.update((skills) => [...skills.filter((s) => s.id !== saved.id), saved]);
        this.snackBar.open(`Saved ${saved.name}`, 'Dismiss', { duration: 4000 });
      });
  }

  private showError(err: unknown, fallback: string): void {
    const message =
      err instanceof HttpErrorResponse && err.status === 409
        ? (err.error?.message ?? fallback)
        : fallback;
    this.snackBar.open(message, 'Dismiss', { duration: 6000 });
  }
}
