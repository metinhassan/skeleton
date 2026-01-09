export interface User {
  id: string;
  username: string;
  email: string;
}

export interface AuthCredentials {
  username: string;
  password: string;
}

export interface AuthResult {
  success: boolean;
  user?: User;
  error?: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  token: string | null;
}

export interface AuthConfig {
  storageKey?: string;
  tokenExpiry?: number; // in milliseconds
  onAuthChange?: (state: AuthState) => void;
}
