import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faKey, faLock, faCheck } from '@fortawesome/free-solid-svg-icons';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-change-password-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, FontAwesomeModule],
  template: `
    <div class="modal-header">
      <h5 class="modal-title d-flex align-items-center gap-2">
        <fa-icon [icon]="faKey" class="text-primary"></fa-icon>
        Change Password
      </h5>
      <button
        type="button"
        class="btn-close"
        aria-label="Close"
        (click)="activeModal.dismiss()"
      ></button>
    </div>
    <div class="modal-body">
      @if (error) {
        <div class="alert alert-danger py-2 small" role="alert">
          {{ error }}
        </div>
      }

      <form (ngSubmit)="onSubmit()">
        <div class="mb-3">
          <label for="currentPassword" class="form-label small fw-semibold"
            >Current Password</label
          >
          <div class="input-group">
            <span class="input-group-text"><fa-icon [icon]="faLock"></fa-icon></span>
            <input
              type="password"
              id="currentPassword"
              name="currentPassword"
              class="form-control"
              [(ngModel)]="currentPassword"
              required
              autocomplete="current-password"
              [disabled]="loading"
            />
          </div>
        </div>

        <div class="mb-3">
          <label for="newPassword" class="form-label small fw-semibold">New Password</label>
          <div class="input-group">
            <span class="input-group-text"><fa-icon [icon]="faKey"></fa-icon></span>
            <input
              type="password"
              id="newPassword"
              name="newPassword"
              class="form-control"
              [(ngModel)]="newPassword"
              required
              autocomplete="new-password"
              placeholder="At least 6 characters"
              [disabled]="loading"
            />
          </div>
        </div>

        <div class="mb-3">
          <label for="confirmNewPassword" class="form-label small fw-semibold"
            >Confirm New Password</label
          >
          <div class="input-group">
            <span class="input-group-text"><fa-icon [icon]="faCheck"></fa-icon></span>
            <input
              type="password"
              id="confirmNewPassword"
              name="confirmNewPassword"
              class="form-control"
              [(ngModel)]="confirmNewPassword"
              required
              autocomplete="new-password"
              [disabled]="loading"
            />
          </div>
        </div>

        <div class="modal-footer px-0 pb-0 mt-4">
          <button
            type="button"
            class="btn btn-secondary"
            (click)="activeModal.dismiss()"
            [disabled]="loading"
          >
            Cancel
          </button>
          <button
            type="submit"
            class="btn btn-primary"
            [disabled]="loading || !currentPassword || !newPassword || !confirmNewPassword"
          >
            @if (loading) {
              <span class="spinner-border spinner-border-sm me-1" role="status"></span>
              Saving...
            } @else {
              Update Password
            }
          </button>
        </div>
      </form>
    </div>
  `,
})
export class ChangePasswordModalComponent {
  activeModal = inject(NgbActiveModal);
  private authService = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);

  currentPassword = '';
  newPassword = '';
  confirmNewPassword = '';
  error = '';
  loading = false;

  faKey = faKey;
  faLock = faLock;
  faCheck = faCheck;

  onSubmit() {
    this.error = '';
    if (this.newPassword !== this.confirmNewPassword) {
      this.error = 'New passwords do not match';
      return;
    }
    if (this.newPassword.length < 6) {
      this.error = 'New password must be at least 6 characters long';
      return;
    }

    this.loading = true;
    this.cdr.markForCheck();

    this.authService.changePassword(this.currentPassword, this.newPassword).subscribe({
      next: (res) => {
        this.loading = false;
        if (res.status === 'ok') {
          this.activeModal.close('saved');
        } else {
          this.error = res.msg || 'Failed to update password';
          this.cdr.markForCheck();
        }
      },
      error: (err) => {
        this.loading = false;
        this.error = err.error?.reason || err.error?.msg || 'Failed to update password';
        this.cdr.markForCheck();
      },
    });
  }
}
