export interface User {
  id: string;
  username: string;
  role: 'admin' | 'user';
  created_at: number;
  disabled?: boolean;
}

export interface AuthStatus {
  status: string;
  auth_enabled: boolean;
  setup_required: boolean;
  logged_in: boolean;
  user: User | null;
}

export interface AuthResponse {
  status: string;
  token?: string;
  user?: User;
  msg?: string;
}

export interface UsersResponse {
  status: string;
  users: User[];
  msg?: string;
}
