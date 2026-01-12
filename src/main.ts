import { getMockUsers, generateMockTokens } from '@authlib/mock';
import type { MockUser } from '@authlib/mock';

interface AuthState {
  isAuthenticated: boolean;
  user: MockUser | null;
  accessToken: string | null;
}

const AUTH_STORAGE_KEY = 'skeleton_auth_state';

class App {
  private state: AuthState;
  private loginView: HTMLElement;
  private dashboardView: HTMLElement;
  private loginForm: HTMLFormElement;
  private usernameInput: HTMLInputElement;
  private passwordInput: HTMLInputElement;
  private loginBtn: HTMLButtonElement;
  private errorMessage: HTMLElement;
  private logoutBtn: HTMLButtonElement;
  private userNameDisplay: HTMLElement;

  constructor() {
    // Load state from storage or use defaults
    this.state = this.loadState() ?? {
      isAuthenticated: false,
      user: null,
      accessToken: null,
    };

    // Get DOM elements
    this.loginView = this.getElement('#login-view');
    this.dashboardView = this.getElement('#dashboard-view');
    this.loginForm = this.getElement('#login-form') as HTMLFormElement;
    this.usernameInput = this.getElement('#username') as HTMLInputElement;
    this.passwordInput = this.getElement('#password') as HTMLInputElement;
    this.loginBtn = this.getElement('#login-btn') as HTMLButtonElement;
    this.errorMessage = this.getElement('#error-message');
    this.logoutBtn = this.getElement('#logout-btn') as HTMLButtonElement;
    this.userNameDisplay = this.getElement('#user-name');

    this.bindEvents();
    this.initializeView();
  }

  private getElement(selector: string): HTMLElement {
    const element = document.querySelector(selector);
    if (!element) {
      throw new Error(`Element not found: ${selector}`);
    }
    return element as HTMLElement;
  }

  private bindEvents(): void {
    this.loginForm.addEventListener('submit', this.handleLogin.bind(this));
    this.logoutBtn.addEventListener('click', this.handleLogout.bind(this));

    // Clear error on input
    this.usernameInput.addEventListener('input', () => this.hideError());
    this.passwordInput.addEventListener('input', () => this.hideError());
  }

  private initializeView(): void {
    if (this.state.isAuthenticated) {
      this.showDashboard();
    } else {
      this.showLogin();
    }
  }

  private async handleLogin(event: Event): Promise<void> {
    event.preventDefault();

    const username = this.usernameInput.value.trim();
    const password = this.passwordInput.value;

    if (!username || !password) {
      this.showError('Please enter username and password');
      return;
    }

    this.setLoading(true);
    this.hideError();

    // Simulate network delay
    await this.delay(500);

    // Validate against mock users from authlib
    const mockUsers = getMockUsers();
    const user = mockUsers.find(
      (u) => u.username === username && u.password === password
    );

    this.setLoading(false);

    if (!user) {
      this.showError('Invalid username or password');
      return;
    }

    // Generate mock tokens using authlib
    const tokens = generateMockTokens(user);

    // Update state
    this.state = {
      isAuthenticated: true,
      user,
      accessToken: tokens.accessToken,
    };

    this.saveState();
    this.showDashboard();
  }

  private handleLogout(): void {
    this.state = {
      isAuthenticated: false,
      user: null,
      accessToken: null,
    };

    this.clearState();
    this.showLogin();
  }

  private showLogin(): void {
    this.dashboardView.hidden = true;
    this.loginView.hidden = false;
    this.loginForm.reset();
    this.hideError();
    this.usernameInput.focus();
  }

  private showDashboard(): void {
    if (this.state.user) {
      this.userNameDisplay.textContent = `Welcome, ${this.state.user.username}`;
    }
    this.loginView.hidden = true;
    this.dashboardView.hidden = false;
  }

  private setLoading(loading: boolean): void {
    this.loginBtn.disabled = loading;
    const btnText = this.loginBtn.querySelector('.btn-text') as HTMLElement;
    const btnLoading = this.loginBtn.querySelector('.btn-loading') as HTMLElement;

    if (btnText && btnLoading) {
      btnText.hidden = loading;
      btnLoading.hidden = !loading;
    }
  }

  private showError(message: string): void {
    this.errorMessage.textContent = message;
    this.errorMessage.hidden = false;
  }

  private hideError(): void {
    this.errorMessage.hidden = true;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private saveState(): void {
    try {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(this.state));
    } catch (error) {
      console.error('Failed to save auth state:', error);
    }
  }

  private loadState(): AuthState | null {
    try {
      const data = localStorage.getItem(AUTH_STORAGE_KEY);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  private clearState(): void {
    try {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    } catch (error) {
      console.error('Failed to clear auth state:', error);
    }
  }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new App();
});
