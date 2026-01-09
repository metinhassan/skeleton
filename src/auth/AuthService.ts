import type { User, AuthCredentials, AuthResult, AuthState, AuthConfig } from './types';
import { AuthStorage } from './storage';
import { validateCredentials } from './validators';

// Demo users for local development
const DEMO_USERS: Record<string, { password: string; user: User }> = {
  admin: {
    password: 'admin123',
    user: { id: '1', username: 'admin', email: 'admin@example.com' },
  },
  demo: {
    password: 'demo123',
    user: { id: '2', username: 'demo', email: 'demo@example.com' },
  },
};

export class AuthService {
  private state: AuthState;
  private storage: AuthStorage;
  private config: AuthConfig;

  constructor(config: AuthConfig = {}) {
    this.config = config;
    this.storage = new AuthStorage(config.storageKey);

    // Initialize state from storage or defaults
    const savedState = this.storage.load();
    this.state = savedState ?? {
      isAuthenticated: false,
      user: null,
      token: null,
    };
  }

  getState(): AuthState {
    return { ...this.state };
  }

  isAuthenticated(): boolean {
    return this.state.isAuthenticated;
  }

  getCurrentUser(): User | null {
    return this.state.user ? { ...this.state.user } : null;
  }

  async login(credentials: AuthCredentials): Promise<AuthResult> {
    const { username, password } = credentials;

    // Validate credentials format
    const validation = validateCredentials(username, password);
    if (!validation.valid) {
      return { success: false, error: validation.errors[0] };
    }

    // Simulate network delay for realistic UX
    await this.delay(500);

    // Check against demo users (local dev only)
    const demoUser = DEMO_USERS[username.toLowerCase()];
    if (!demoUser || demoUser.password !== password) {
      return { success: false, error: 'Invalid username or password' };
    }

    // Generate a simple token for local dev
    const token = this.generateToken();

    // Update state
    this.state = {
      isAuthenticated: true,
      user: demoUser.user,
      token,
    };

    this.storage.save(this.state);
    this.notifyAuthChange();

    return { success: true, user: demoUser.user };
  }

  async logout(): Promise<void> {
    this.state = {
      isAuthenticated: false,
      user: null,
      token: null,
    };

    this.storage.clear();
    this.notifyAuthChange();
  }

  private generateToken(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 15);
    return `dev_${timestamp}_${random}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private notifyAuthChange(): void {
    if (this.config.onAuthChange) {
      this.config.onAuthChange(this.getState());
    }
  }
}
