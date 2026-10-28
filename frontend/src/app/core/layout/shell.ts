import { NgTemplateOutlet } from '@angular/common';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { ConnectedPosition, ScrollStrategyOptions } from '@angular/cdk/overlay';
import { Component, computed, DestroyRef, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { map } from 'rxjs';
import { ROLE_LABELS } from '../auth/auth.models';
import { AuthService } from '../auth/auth.service';
import { ChangePasswordDialog, ChangePasswordDialogData } from '../auth/change-password-dialog';
import { SsButton, SsDialog, SsIcon, SsMenu, SsMenuItem, SsMenuTrigger } from '../../shared/ui';
import { menuFor } from './menu';

/** Where the collapsed state of the sidebar is remembered. */
export const SIDEBAR_STORAGE_KEY = 'staffsync.sidebar';

/**
 * Below this width the sidebar starts as the icon rail, so the tables keep their columns in view
 * (a 1024–1279px laptop window), unless the user has opened it themselves.
 */
export const NARROW_DESKTOP = '(max-width: 1279.98px)';

// localStorage can throw (private mode, blocked storage), so every access is guarded.
/** The user's own choice, or `null` when they haven't made one. */
function readCollapsed(): boolean | null {
  try {
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    return stored === null ? null : stored === 'collapsed';
  } catch {
    return null;
  }
}

function writeCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? 'collapsed' : 'expanded');
  } catch {
    // The choice then only lives until the next reload
  }
}

/**
 * The logged-in app layout: a role-based sidebar and the page outlet. On a desktop the sidebar is
 * always there, in full or folded to an icon rail (remembered in localStorage). On a handset it
 * is an overlay drawer, opened from a slim top bar: focus stays inside it while it is open, Escape,
 * a click outside and a navigation close it, and focus goes back to the menu button.
 */
@Component({
  selector: 'app-shell',
  imports: [
    NgTemplateOutlet,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    CdkTrapFocus,
    SsButton,
    SsIcon,
    SsMenu,
    SsMenuItem,
    SsMenuTrigger,
  ],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class Shell {
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(SsDialog);

  protected readonly user = this.auth.currentUser;
  protected readonly roleLabel = computed(() => {
    const role = this.auth.role();
    return role ? ROLE_LABELS[role] : '';
  });
  protected readonly initials = computed(() => {
    const current = this.user();
    return current ? `${current.firstName.charAt(0)}${current.lastName.charAt(0)}` : '';
  });
  protected readonly menu = computed(() => menuFor(this.auth.role()));

  protected readonly isHandset = toSignal(
    inject(BreakpointObserver)
      .observe(Breakpoints.Handset)
      .pipe(map((state) => state.matches)),
    { initialValue: false },
  );

  protected readonly isNarrow = toSignal(
    inject(BreakpointObserver)
      .observe(NARROW_DESKTOP)
      .pipe(map((state) => state.matches)),
    { initialValue: false },
  );

  /** The user's choice on a desktop, `null` until they make one. */
  private readonly choice = signal(readCollapsed());
  /** The user's choice, or the rail on a narrow desktop and the full sidebar on a wide one. */
  protected readonly collapsed = computed(() => this.choice() ?? this.isNarrow());
  /** Folded to the icon rail: only on a desktop, the handset drawer is always in full. */
  protected readonly rail = computed(() => this.collapsed() && !this.isHandset());

  /** Whether the handset drawer is open. */
  protected readonly drawerOpen = signal(false);
  private readonly scrollBlock = inject(ScrollStrategyOptions).block();

  /** The user menu opens above its button, starting at the same edge (the button is at the foot). */
  protected readonly userMenuPosition: ConnectedPosition[] = [
    { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom' },
    { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top' },
  ];

  constructor() {
    // A drawer left open while the window grows to a desktop would keep the page from scrolling
    effect(() => {
      if (!this.isHandset()) {
        this.setDrawer(false);
      }
    });
    inject(DestroyRef).onDestroy(() => this.scrollBlock.disable());
    // A temporary password from an Admin is replaced before anything else (a new account or a reset)
    effect(() => {
      if (this.auth.mustChangePassword() && !this.passwordDialogOpen) {
        this.passwordDialogOpen = true;
        this.dialog
          .open<ChangePasswordDialog, ChangePasswordDialogData>(ChangePasswordDialog, {
            data: { required: true },
            width: '420px',
            disableClose: true,
          })
          .afterClosed()
          .subscribe(() => (this.passwordDialogOpen = false));
      }
    });
  }

  private passwordDialogOpen = false;

  protected toggleCollapsed(): void {
    const next = !this.collapsed();
    this.choice.set(next);
    writeCollapsed(next);
  }

  protected toggleDrawer(): void {
    this.setDrawer(!this.drawerOpen());
  }

  protected closeDrawer(): void {
    this.setDrawer(false);
  }

  /** Opens or closes the handset drawer; while it is open the page behind does not scroll. */
  private setDrawer(open: boolean): void {
    if (this.drawerOpen() === open) {
      return;
    }
    this.drawerOpen.set(open);
    if (open) {
      this.scrollBlock.enable();
    } else {
      this.scrollBlock.disable();
    }
  }

  protected onNavigate(): void {
    if (this.isHandset()) {
      this.closeDrawer();
    }
  }

  protected openChangePassword(): void {
    this.dialog.open(ChangePasswordDialog, { width: '420px' });
  }

  protected logout(): void {
    this.auth.logout();
  }
}
