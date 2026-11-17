import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { AuthService } from './auth.service';
import { AuthStatus, AuthResponse, User } from '../interfaces';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        AuthService,
      ],
    });
    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('initial state has auth disabled and authenticated=true', () => {
    expect(service.authEnabled()).toBe(false);
    expect(service.isAuthenticated()).toBe(true);
    expect(service.isAdmin()).toBe(false);
    expect(service.currentUser()).toBeNull();
  });

  it('checkStatus() updates authEnabled, setupRequired, and currentUser', () => {
    const mockStatus: AuthStatus = {
      status: 'ok',
      auth_enabled: true,
      setup_required: false,
      logged_in: true,
      user: {
        id: 'u1',
        username: 'alice',
        role: 'admin',
        created_at: 123456789,
      },
    };

    service.checkStatus().subscribe((res) => {
      expect(res).toEqual(mockStatus);
    });

    const req = httpMock.expectOne('api/auth/status');
    expect(req.request.method).toBe('GET');
    req.flush(mockStatus);

    expect(service.authEnabled()).toBe(true);
    expect(service.setupRequired()).toBe(false);
    expect(service.currentUser()?.username).toBe('alice');
    expect(service.isAuthenticated()).toBe(true);
    expect(service.isAdmin()).toBe(true);
    expect(service.checked()).toBe(true);
  });

  it('checkStatus() handles error gracefully', () => {
    service.checkStatus().subscribe((res) => {
      expect(res.auth_enabled).toBe(false);
      expect(res.logged_in).toBe(false);
    });

    const req = httpMock.expectOne('api/auth/status');
    req.error(new ProgressEvent('Network error'));

    expect(service.checked()).toBe(true);
    expect(service.authEnabled()).toBe(false);
  });

  it('setup() posts username and password, updating state', () => {
    const mockUser: User = { id: 'u1', username: 'admin', role: 'admin', created_at: 123456 };
    const mockResp: AuthResponse = { status: 'ok', user: mockUser, token: 'tok-123' };

    service.setup('admin', 'secret123').subscribe((res) => {
      expect(res).toEqual(mockResp);
    });

    const req = httpMock.expectOne('api/auth/setup');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ username: 'admin', password: 'secret123' });
    req.flush(mockResp);

    expect(service.currentUser()?.username).toBe('admin');
    expect(service.token()).toBe('tok-123');
    expect(service.setupRequired()).toBe(false);
  });

  it('login() posts credentials and updates user and token', () => {
    const mockUser: User = { id: 'u2', username: 'bob', role: 'user', created_at: 123456 };
    const mockResp: AuthResponse = { status: 'ok', user: mockUser, token: 'tok-456' };

    service.login('bob', 'password').subscribe((res) => {
      expect(res).toEqual(mockResp);
    });

    const req = httpMock.expectOne('api/auth/login');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ username: 'bob', password: 'password' });
    req.flush(mockResp);

    expect(service.currentUser()?.username).toBe('bob');
    expect(service.isAdmin()).toBe(false);
    expect(service.token()).toBe('tok-456');
  });

  it('logout() posts and clears current user and token', () => {
    service.currentUser.set({ id: 'u1', username: 'test', role: 'user', created_at: 100 });
    service.token.set('tok');

    service.logout().subscribe((res) => {
      expect(res.status).toBe('ok');
    });

    const req = httpMock.expectOne('api/auth/logout');
    expect(req.request.method).toBe('POST');
    req.flush({ status: 'ok' });

    expect(service.currentUser()).toBeNull();
    expect(service.token()).toBeNull();
  });

  it('changePassword() posts current and new passwords with auth header', () => {
    service.token.set('bearer-token');

    service.changePassword('oldpw', 'newpw').subscribe((res) => {
      expect(res.status).toBe('ok');
    });

    const req = httpMock.expectOne('api/auth/change-password');
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('Authorization')).toBe('Bearer bearer-token');
    expect(req.request.body).toEqual({ current_password: 'oldpw', new_password: 'newpw' });
    req.flush({ status: 'ok' });
  });

  it('getUsers() returns user list', () => {
    const users: User[] = [
      { id: '1', username: 'alice', role: 'admin', created_at: 1 },
      { id: '2', username: 'bob', role: 'user', created_at: 2 },
    ];

    service.getUsers().subscribe((res) => {
      expect(res).toEqual(users);
    });

    const req = httpMock.expectOne('api/users');
    expect(req.request.method).toBe('GET');
    req.flush({ status: 'ok', users });
  });

  it('createUser() posts new user payload', () => {
    service.createUser('carol', 'secret', 'user').subscribe((res) => {
      expect(res.status).toBe('ok');
    });

    const req = httpMock.expectOne('api/users');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ username: 'carol', password: 'secret', role: 'user' });
    req.flush({ status: 'ok' });
  });

  it('updateUser() sends PUT request', () => {
    service.updateUser('u2', { role: 'admin' }).subscribe((res) => {
      expect(res.status).toBe('ok');
    });

    const req = httpMock.expectOne('api/users/u2');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ role: 'admin' });
    req.flush({ status: 'ok' });
  });

  it('deleteUser() sends DELETE request', () => {
    service.deleteUser('u3').subscribe((res) => {
      expect(res.status).toBe('ok');
    });

    const req = httpMock.expectOne('api/users/u3');
    expect(req.request.method).toBe('DELETE');
    req.flush({ status: 'ok' });
  });
});
