import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of, throwError } from 'rxjs';
import { LoginComponent } from './login.component';
import { AuthService } from '../services/auth.service';

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;
  let authService: AuthService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        AuthService,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    authService = TestBed.inject(AuthService);
    fixture.detectChanges();
  });

  it('creates component', () => {
    expect(component).toBeTruthy();
  });

  it('submits login when setup is not required', () => {
    authService.setupRequired.set(false);
    component.username = 'bob';
    component.password = 'password123';

    let successFired = false;
    component.loginSuccess.subscribe(() => {
      successFired = true;
    });

    vi.spyOn(authService, 'login').mockReturnValue(
      of({ status: 'ok', user: { id: '1', username: 'bob', role: 'user', created_at: 1 } })
    );

    component.onSubmit();
    expect(authService.login).toHaveBeenCalledWith('bob', 'password123');
    expect(successFired).toBe(true);
    expect(component.loading).toBe(false);
  });

  it('submits setup when setup is required', () => {
    authService.setupRequired.set(true);
    component.username = 'admin';
    component.password = 'admin123';
    component.confirmPassword = 'admin123';

    let successFired = false;
    component.loginSuccess.subscribe(() => {
      successFired = true;
    });

    vi.spyOn(authService, 'setup').mockReturnValue(
      of({ status: 'ok', user: { id: '1', username: 'admin', role: 'admin', created_at: 1 } })
    );

    component.onSubmit();
    expect(authService.setup).toHaveBeenCalledWith('admin', 'admin123');
    expect(successFired).toBe(true);
    expect(component.loading).toBe(false);
  });

  it('displays error on failed login', () => {
    authService.setupRequired.set(false);
    component.username = 'bad';
    component.password = 'wrong';

    vi.spyOn(authService, 'login').mockReturnValue(
      throwError(() => ({ error: { reason: 'Invalid username or password' } }))
    );

    component.onSubmit();
    expect(component.error).toBe('Invalid username or password');
    expect(component.loading).toBe(false);
  });
});
