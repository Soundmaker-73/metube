import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { of } from 'rxjs';
import { UserManagementModalComponent } from './user-management-modal.component';
import { AuthService } from '../services/auth.service';
import { User } from '../interfaces';

describe('UserManagementModalComponent', () => {
  let component: UserManagementModalComponent;
  let fixture: ComponentFixture<UserManagementModalComponent>;
  let authService: AuthService;

  const mockUsers: User[] = [
    { id: 'u1', username: 'alice', role: 'admin', created_at: 100 },
    { id: 'u2', username: 'bob', role: 'user', created_at: 200 },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UserManagementModalComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        AuthService,
        NgbActiveModal,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UserManagementModalComponent);
    component = fixture.componentInstance;
    authService = TestBed.inject(AuthService);

    authService.currentUser.set(mockUsers[0]);
    vi.spyOn(authService, 'getUsers').mockReturnValue(of(mockUsers));
    fixture.detectChanges();
  });

  it('loads users on init', () => {
    expect(authService.getUsers).toHaveBeenCalled();
    expect(component.users).toEqual(mockUsers);
    expect(component.loading).toBe(false);
  });

  it('validates user creation input', () => {
    component.newUsername = 'charlie';
    component.newPassword = '123';
    component.onCreateUser();
    expect(component.error).toBe('Password must be at least 6 characters long');
  });

  it('creates user successfully', () => {
    component.newUsername = 'charlie';
    component.newPassword = 'password123';
    component.newRole = 'user';

    vi.spyOn(authService, 'createUser').mockReturnValue(
      of({ status: 'ok', user: { id: 'u3', username: 'charlie', role: 'user', created_at: 300 } })
    );

    component.onCreateUser();
    expect(authService.createUser).toHaveBeenCalledWith('charlie', 'password123', 'user');
    expect(component.successMsg).toContain('created successfully');
    expect(component.newUsername).toBe('');
    expect(component.newPassword).toBe('');
  });

  it('toggles user role', () => {
    const userToToggle = mockUsers[1];
    vi.spyOn(authService, 'updateUser').mockReturnValue(of({ status: 'ok' }));

    component.onToggleRole(userToToggle);
    expect(authService.updateUser).toHaveBeenCalledWith('u2', { role: 'admin' });
  });

  it('deletes user when confirmed', () => {
    const userToDelete = mockUsers[1];
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(authService, 'deleteUser').mockReturnValue(of({ status: 'ok' }));

    component.onDeleteUser(userToDelete);
    expect(authService.deleteUser).toHaveBeenCalledWith('u2');
  });

  it('does not delete user when canceled', () => {
    const userToDelete = mockUsers[1];
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const deleteSpy = vi.spyOn(authService, 'deleteUser');

    component.onDeleteUser(userToDelete);
    expect(deleteSpy).not.toHaveBeenCalled();
  });
});
