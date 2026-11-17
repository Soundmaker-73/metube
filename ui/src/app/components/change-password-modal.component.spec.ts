import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { of, throwError } from 'rxjs';
import { ChangePasswordModalComponent } from './change-password-modal.component';
import { AuthService } from '../services/auth.service';

describe('ChangePasswordModalComponent', () => {
  let component: ChangePasswordModalComponent;
  let fixture: ComponentFixture<ChangePasswordModalComponent>;
  let authService: AuthService;
  let activeModal: NgbActiveModal;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChangePasswordModalComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        AuthService,
        NgbActiveModal,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ChangePasswordModalComponent);
    component = fixture.componentInstance;
    authService = TestBed.inject(AuthService);
    activeModal = TestBed.inject(NgbActiveModal);
    fixture.detectChanges();
  });

  it('validates password match', () => {
    component.currentPassword = 'old';
    component.newPassword = 'pass1';
    component.confirmNewPassword = 'pass2';

    component.onSubmit();
    expect(component.error).toBe('New passwords do not match');
  });

  it('validates password length', () => {
    component.currentPassword = 'old';
    component.newPassword = '123';
    component.confirmNewPassword = '123';

    component.onSubmit();
    expect(component.error).toBe('New password must be at least 6 characters long');
  });

  it('submits change and closes modal on success', () => {
    component.currentPassword = 'oldPassword';
    component.newPassword = 'newPassword123';
    component.confirmNewPassword = 'newPassword123';

    vi.spyOn(authService, 'changePassword').mockReturnValue(of({ status: 'ok' }));
    const closeSpy = vi.spyOn(activeModal, 'close');

    component.onSubmit();
    expect(authService.changePassword).toHaveBeenCalledWith('oldPassword', 'newPassword123');
    expect(closeSpy).toHaveBeenCalled();
  });

  it('handles backend error', () => {
    component.currentPassword = 'wrongPassword';
    component.newPassword = 'newPassword123';
    component.confirmNewPassword = 'newPassword123';

    vi.spyOn(authService, 'changePassword').mockReturnValue(
      throwError(() => ({ error: { reason: 'Incorrect current password' } }))
    );

    component.onSubmit();
    expect(component.error).toBe('Incorrect current password');
    expect(component.loading).toBe(false);
  });
});
