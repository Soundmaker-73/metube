import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import {
  faUsers,
  faUserPlus,
  faTrashAlt,
  faKey,
  faShieldHalved,
  faUser,
} from '@fortawesome/free-solid-svg-icons';
import { AuthService } from '../services/auth.service';
import { User } from '../interfaces';

@Component({
  selector: 'app-user-management-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, FontAwesomeModule],
  template: `
    <div class="modal-header">
      <h5 class="modal-title d-flex align-items-center gap-2">
        <fa-icon [icon]="faUsers" class="text-primary"></fa-icon>
        User Management
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
      @if (successMsg) {
        <div class="alert alert-success py-2 small" role="alert">
          {{ successMsg }}
        </div>
      }

      <!-- Add User Section -->
      <div class="card mb-4 bg-body-tertiary border-0">
        <div class="card-body p-3">
          <h6 class="card-subtitle mb-2 text-body-secondary d-flex align-items-center gap-2">
            <fa-icon [icon]="faUserPlus"></fa-icon>
            Add New User
          </h6>
          <form (ngSubmit)="onCreateUser()" class="row g-2 align-items-end">
            <div class="col-12 col-md-4">
              <label for="new-username" class="form-label small mb-1">Username</label>
              <input
                id="new-username"
                type="text"
                class="form-control form-control-sm"
                [(ngModel)]="newUsername"
                name="newUsername"
                placeholder="Username"
                required
              />
            </div>
            <div class="col-12 col-md-4">
              <label for="new-password" class="form-label small mb-1">Password</label>
              <input
                id="new-password"
                type="password"
                class="form-control form-control-sm"
                [(ngModel)]="newPassword"
                name="newPassword"
                placeholder="At least 6 chars"
                required
              />
            </div>
            <div class="col-8 col-md-2">
              <label for="new-role" class="form-label small mb-1">Role</label>
              <select
                id="new-role"
                class="form-select form-select-sm"
                [(ngModel)]="newRole"
                name="newRole"
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div class="col-4 col-md-2">
              <button
                type="submit"
                class="btn btn-primary btn-sm w-100"
                [disabled]="actionLoading || !newUsername || !newPassword"
              >
                Add User
              </button>
            </div>
          </form>
        </div>
      </div>

      <!-- Users List Table -->
      <div class="table-responsive">
        <table class="table table-hover align-middle mb-0">
          <thead class="table-light">
            <tr>
              <th>Username</th>
              <th>Role</th>
              <th>Created</th>
              <th class="text-end">Actions</th>
            </tr>
          </thead>
          <tbody>
            @if (loading) {
              <tr>
                <td colspan="4" class="text-center py-4 text-body-secondary">
                  <span class="spinner-border spinner-border-sm me-2" role="status"></span>
                  Loading users...
                </td>
              </tr>
            } @else if (users.length === 0) {
              <tr>
                <td colspan="4" class="text-center py-4 text-body-secondary">
                  No users found
                </td>
              </tr>
            } @else {
              @for (u of users; track u.id) {
                <tr>
                  <td>
                    <div class="d-flex align-items-center gap-2">
                      <fa-icon
                        [icon]="u.role === 'admin' ? faShieldHalved : faUser"
                        [class.text-primary]="u.role === 'admin'"
                        [class.text-body-secondary]="u.role !== 'admin'"
                      ></fa-icon>
                      <span class="fw-semibold">{{ u.username }}</span>
                      @if (u.id === authService.currentUser()?.id) {
                        <span class="badge bg-secondary-subtle text-secondary-emphasis border small">You</span>
                      }
                    </div>
                  </td>
                  <td>
                    <span
                      class="badge"
                      [class.bg-primary]="u.role === 'admin'"
                      [class.bg-secondary]="u.role === 'user'"
                    >
                      {{ u.role }}
                    </span>
                  </td>
                  <td class="small text-body-secondary">
                    {{ u.created_at ? (u.created_at * 1000 | date: 'mediumDate') : '-' }}
                  </td>
                  <td class="text-end">
                    <div class="btn-group btn-group-sm">
                      <button
                        type="button"
                        class="btn btn-outline-secondary"
                        title="Toggle Admin Role"
                        (click)="onToggleRole(u)"
                        [disabled]="actionLoading || (u.id === authService.currentUser()?.id && u.role === 'admin')"
                      >
                        {{ u.role === 'admin' ? 'Demote' : 'Promote' }}
                      </button>
                      <button
                        type="button"
                        class="btn btn-outline-secondary"
                        title="Reset Password"
                        (click)="onResetPassword(u)"
                        [disabled]="actionLoading"
                      >
                        <fa-icon [icon]="faKey"></fa-icon>
                      </button>
                      <button
                        type="button"
                        class="btn btn-outline-danger"
                        title="Delete User"
                        (click)="onDeleteUser(u)"
                        [disabled]="actionLoading || u.id === authService.currentUser()?.id"
                      >
                        <fa-icon [icon]="faTrashAlt"></fa-icon>
                      </button>
                    </div>
                  </td>
                </tr>
              }
            }
          </tbody>
        </table>
      </div>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-secondary" (click)="activeModal.close()">
        Close
      </button>
    </div>
  `,
})
export class UserManagementModalComponent implements OnInit {
  activeModal = inject(NgbActiveModal);
  authService = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);

  users: User[] = [];
  loading = false;
  actionLoading = false;
  error = '';
  successMsg = '';

  newUsername = '';
  newPassword = '';
  newRole: 'admin' | 'user' = 'user';

  faUsers = faUsers;
  faUserPlus = faUserPlus;
  faTrashAlt = faTrashAlt;
  faKey = faKey;
  faShieldHalved = faShieldHalved;
  faUser = faUser;

  ngOnInit() {
    this.loadUsers();
  }

  loadUsers() {
    this.loading = true;
    this.cdr.markForCheck();
    this.authService.getUsers().subscribe({
      next: (users) => {
        this.users = users;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.loading = false;
        this.error = err.error?.reason || err.error?.msg || 'Failed to load users';
        this.cdr.markForCheck();
      },
    });
  }

  onCreateUser() {
    this.error = '';
    this.successMsg = '';
    if (this.newPassword.length < 6) {
      this.error = 'Password must be at least 6 characters long';
      return;
    }

    this.actionLoading = true;
    this.cdr.markForCheck();

    this.authService.createUser(this.newUsername, this.newPassword, this.newRole).subscribe({
      next: (res) => {
        this.actionLoading = false;
        if (res.status === 'ok') {
          this.successMsg = `User '${this.newUsername}' created successfully`;
          this.newUsername = '';
          this.newPassword = '';
          this.newRole = 'user';
          this.loadUsers();
        } else {
          this.error = res.msg || 'Failed to create user';
        }
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.actionLoading = false;
        this.error = err.error?.reason || err.error?.msg || 'Failed to create user';
        this.cdr.markForCheck();
      },
    });
  }

  onToggleRole(user: User) {
    this.error = '';
    this.successMsg = '';
    const newRole = user.role === 'admin' ? 'user' : 'admin';
    this.actionLoading = true;
    this.cdr.markForCheck();

    this.authService.updateUser(user.id, { role: newRole }).subscribe({
      next: (res) => {
        this.actionLoading = false;
        if (res.status === 'ok') {
          this.successMsg = `User '${user.username}' is now ${newRole}`;
          this.loadUsers();
        } else {
          this.error = res.msg || 'Failed to update user';
        }
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.actionLoading = false;
        this.error = err.error?.reason || err.error?.msg || 'Failed to update user';
        this.cdr.markForCheck();
      },
    });
  }

  onResetPassword(user: User) {
    this.error = '';
    this.successMsg = '';
    const newPassword = prompt(`Enter new password for ${user.username} (min 6 characters):`);
    if (!newPassword) {
      return;
    }
    if (newPassword.length < 6) {
      this.error = 'Password must be at least 6 characters long';
      return;
    }

    this.actionLoading = true;
    this.cdr.markForCheck();

    this.authService.updateUser(user.id, { password: newPassword }).subscribe({
      next: (res) => {
        this.actionLoading = false;
        if (res.status === 'ok') {
          this.successMsg = `Password reset for user '${user.username}'`;
        } else {
          this.error = res.msg || 'Failed to reset password';
        }
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.actionLoading = false;
        this.error = err.error?.reason || err.error?.msg || 'Failed to reset password';
        this.cdr.markForCheck();
      },
    });
  }

  onDeleteUser(user: User) {
    this.error = '';
    this.successMsg = '';
    if (!confirm(`Are you sure you want to delete user '${user.username}'?`)) {
      return;
    }

    this.actionLoading = true;
    this.cdr.markForCheck();

    this.authService.deleteUser(user.id).subscribe({
      next: (res) => {
        this.actionLoading = false;
        if (res.status === 'ok') {
          this.successMsg = `User '${user.username}' deleted`;
          this.loadUsers();
        } else {
          this.error = res.msg || 'Failed to delete user';
        }
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.actionLoading = false;
        this.error = err.error?.reason || err.error?.msg || 'Failed to delete user';
        this.cdr.markForCheck();
      },
    });
  }
}
