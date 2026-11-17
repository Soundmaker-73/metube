import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Output,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import {
  faUser,
  faLock,
  faShieldHalved,
  faRightToBracket,
} from '@fortawesome/free-solid-svg-icons';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, FontAwesomeModule],
  template: `
    <div class="container py-5">
      <div class="row justify-content-center">
        <div class="col-12 col-sm-10 col-md-8 col-lg-5">
          <div class="card shadow-sm border-0">
            <div class="card-body p-4 p-md-5">
              <div class="text-center mb-4">
                <img
                  src="assets/icons/android-chrome-192x192.png"
                  alt="MeTube"
                  height="48"
                  class="mb-2"
                />
                <h3 class="fw-bold mb-1">MeTube</h3>
                <p class="text-body-secondary small">
                  @if (authService.setupRequired()) {
                    First-time setup: Create initial admin account
                  } @else {
                    Sign in to your private workspace
                  }
                </p>
              </div>

              @if (error) {
                <div class="alert alert-danger py-2 small" role="alert">
                  {{ error }}
                </div>
              }

              <form (ngSubmit)="onSubmit()">
                <div class="mb-3">
                  <label for="username" class="form-label small fw-semibold">Username</label>
                  <div class="input-group">
                    <span class="input-group-text"><fa-icon [icon]="faUser"></fa-icon></span>
                    <input
                      type="text"
                      id="username"
                      name="username"
                      class="form-control"
                      [(ngModel)]="username"
                      required
                      autocomplete="username"
                      placeholder="Username"
                      [disabled]="loading"
                    />
                  </div>
                </div>

                <div class="mb-3">
                  <label for="password" class="form-label small fw-semibold">Password</label>
                  <div class="input-group">
                    <span class="input-group-text"><fa-icon [icon]="faLock"></fa-icon></span>
                    <input
                      type="password"
                      id="password"
                      name="password"
                      class="form-control"
                      [(ngModel)]="password"
                      required
                      autocomplete="current-password"
                      placeholder="Password"
                      [disabled]="loading"
                    />
                  </div>
                </div>

                @if (authService.setupRequired()) {
                  <div class="mb-4">
                    <label for="confirmPassword" class="form-label small fw-semibold"
                      >Confirm Password</label
                    >
                    <div class="input-group">
                      <span class="input-group-text"
                        ><fa-icon [icon]="faShieldHalved"></fa-icon
                      ></span>
                      <input
                        type="password"
                        id="confirmPassword"
                        name="confirmPassword"
                        class="form-control"
                        [(ngModel)]="confirmPassword"
                        required
                        autocomplete="new-password"
                        placeholder="Confirm password"
                        [disabled]="loading"
                      />
                    </div>
                  </div>
                }

                <div class="d-grid mt-4">
                  <button
                    type="submit"
                    class="btn btn-primary btn-lg d-flex align-items-center justify-content-center gap-2"
                    [disabled]="loading || !username || !password"
                  >
                    @if (loading) {
                      <span class="spinner-border spinner-border-sm" role="status"></span>
                      <span>Processing...</span>
                    } @else if (authService.setupRequired()) {
                      <fa-icon [icon]="faShieldHalved"></fa-icon>
                      <span>Create Admin Account</span>
                    } @else {
                      <fa-icon [icon]="faRightToBracket"></fa-icon>
                      <span>Sign In</span>
                    }
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .card {
        background-color: var(--bs-card-bg, #fff);
        border-radius: 0.75rem;
      }
    `,
  ],
})
export class LoginComponent {
  authService = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);

  @Output() loginSuccess = new EventEmitter<void>();

  username = '';
  password = '';
  confirmPassword = '';
  error = '';
  loading = false;

  faUser = faUser;
  faLock = faLock;
  faShieldHalved = faShieldHalved;
  faRightToBracket = faRightToBracket;

  onSubmit() {
    this.error = '';
    if (this.authService.setupRequired()) {
      if (this.password !== this.confirmPassword) {
        this.error = 'Passwords do not match';
        return;
      }
      if (this.password.length < 6) {
        this.error = 'Password must be at least 6 characters long';
        return;
      }
      this.loading = true;
      this.cdr.markForCheck();
      this.authService.setup(this.username, this.password).subscribe({
        next: (res) => {
          this.loading = false;
          if (res.status === 'ok') {
            this.loginSuccess.emit();
          } else {
            this.error = res.msg || 'Setup failed';
          }
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.loading = false;
          this.error = err.error?.reason || err.error?.msg || 'Setup failed';
          this.cdr.markForCheck();
        },
      });
    } else {
      this.loading = true;
      this.cdr.markForCheck();
      this.authService.login(this.username, this.password).subscribe({
        next: (res) => {
          this.loading = false;
          if (res.status === 'ok') {
            this.loginSuccess.emit();
          } else {
            this.error = res.msg || 'Login failed';
          }
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.loading = false;
          this.error = err.error?.msg || err.error?.reason || 'Invalid username or password';
          this.cdr.markForCheck();
        },
      });
    }
  }
}
