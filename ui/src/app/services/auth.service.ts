import { inject, Injectable, signal, computed } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, tap, catchError, of, map } from 'rxjs';
import { AuthStatus, AuthResponse, User, UsersResponse, Status } from '../interfaces';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private http = inject(HttpClient);

  currentUser = signal<User | null>(null);
  authEnabled = signal<boolean>(false);
  setupRequired = signal<boolean>(false);
  token = signal<string | null>(null);
  checked = signal<boolean>(false);

  isAuthenticated = computed(() => {
    if (!this.authEnabled()) {
      return true;
    }
    return this.currentUser() !== null;
  });

  isAdmin = computed(() => {
    return this.currentUser()?.role === 'admin';
  });

  private getHeaders(): HttpHeaders {
    let headers = new HttpHeaders();
    const t = this.token();
    if (t) {
      headers = headers.set('Authorization', `Bearer ${t}`);
    }
    return headers;
  }

  checkStatus(): Observable<AuthStatus> {
    return this.http.get<AuthStatus>('api/auth/status').pipe(
      tap((res) => {
        this.authEnabled.set(res.auth_enabled);
        this.setupRequired.set(res.setup_required);
        this.currentUser.set(res.user);
        this.checked.set(true);
      }),
      catchError(() => {
        this.checked.set(true);
        return of({
          status: 'ok',
          auth_enabled: false,
          setup_required: false,
          logged_in: false,
          user: null,
        });
      })
    );
  }

  setup(username: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>('api/auth/setup', { username, password }).pipe(
      tap((res) => {
        if (res.status === 'ok' && res.user) {
          this.currentUser.set(res.user);
          this.setupRequired.set(false);
          if (res.token) {
            this.token.set(res.token);
          }
        }
      })
    );
  }

  login(username: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>('api/auth/login', { username, password }).pipe(
      tap((res) => {
        if (res.status === 'ok' && res.user) {
          this.currentUser.set(res.user);
          if (res.token) {
            this.token.set(res.token);
          }
        }
      })
    );
  }

  logout(): Observable<Status> {
    return this.http.post<Status>('api/auth/logout', {}, { headers: this.getHeaders() }).pipe(
      tap(() => {
        this.currentUser.set(null);
        this.token.set(null);
      }),
      catchError(() => {
        this.currentUser.set(null);
        this.token.set(null);
        return of({ status: 'ok' });
      })
    );
  }

  changePassword(current_password: string, new_password: string): Observable<Status> {
    return this.http.post<Status>(
      'api/auth/change-password',
      { current_password, new_password },
      { headers: this.getHeaders() }
    );
  }

  getUsers(): Observable<User[]> {
    return this.http
      .get<UsersResponse>('api/users', { headers: this.getHeaders() })
      .pipe(map((res) => res.users || []));
  }

  createUser(username: string, password: string, role: 'admin' | 'user'): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(
      'api/users',
      { username, password, role },
      { headers: this.getHeaders() }
    );
  }

  updateUser(
    userId: string,
    payload: { role?: 'admin' | 'user'; password?: string }
  ): Observable<AuthResponse> {
    return this.http.put<AuthResponse>(`api/users/${userId}`, payload, {
      headers: this.getHeaders(),
    });
  }

  deleteUser(userId: string): Observable<Status> {
    return this.http.delete<Status>(`api/users/${userId}`, { headers: this.getHeaders() });
  }
}
