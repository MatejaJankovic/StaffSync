import { computed, inject, Injectable, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom, map, Observable, tap } from 'rxjs';
import { skipErrorSnackbar } from '../error/error.interceptor';
import { LoginResponse, User } from './auth.models';

export const LOGIN_URL = '/api/auth/login';
export const ME_URL = '/api/auth/me';

const TOKEN_KEY = 'staffsync.token';
const USER_KEY = 'staffsync.user';

/** Holds the JWT and the current user, and keeps them in localStorage across reloads. */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly tokenState = signal<string | null>(readStorage(TOKEN_KEY));
  private readonly userState = signal<User | null>(parseUser(readStorage(USER_KEY)));

  readonly token = this.tokenState.asReadonly();
  readonly currentUser = this.userState.asReadonly();
  readonly role = computed(() => this.userState()?.role ?? null);
  readonly isLoggedIn = computed(() => this.tokenState() !== null && this.userState() !== null);

  login(email: string, password: string): Observable<User> {
    // The login page shows its own error message
    const context = skipErrorSnackbar();
    return this.http.post<LoginResponse>(LOGIN_URL, { email, password }, { context }).pipe(
      tap(({ token, user }) => this.setSession(token, user)),
      map(({ user }) => user),
    );
  }

  logout(): void {
    this.clearSession();
    void this.router.navigate(['/login']);
  }

  clearSession(): void {
    this.tokenState.set(null);
    this.userState.set(null);
    removeStorage(TOKEN_KEY);
    removeStorage(USER_KEY);
  }

  /**
   * Called once on app start: if a token is stored, re-validate it with /api/auth/me.
   * Never rejects, so a dead backend doesn't block the app from starting. Only a 401 ends the
   * session; on a network error or 5xx the stored session is kept, so a backend restart
   * doesn't log everyone out.
   */
  async restoreSession(): Promise<void> {
    const token = this.tokenState();
    if (!token) {
      return;
    }
    try {
      const user = await firstValueFrom(
        this.http.get<User>(ME_URL, { context: skipErrorSnackbar() }),
      );
      this.setSession(token, user);
    } catch (error: unknown) {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        this.clearSession();
      }
    }
  }

  private setSession(token: string, user: User): void {
    this.tokenState.set(token);
    this.userState.set(user);
    writeStorage(TOKEN_KEY, token);
    writeStorage(USER_KEY, JSON.stringify(user));
  }
}

// localStorage can throw (private mode, blocked storage), so every access is guarded.
function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // The session then only lives until the next reload
  }
}

function removeStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing to remove
  }
}

function parseUser(raw: string | null): User | null {
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}
