import { AuthService } from './auth';
import type { AuthState } from './auth';

class App {
  private auth: AuthService;
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
    // Initialize auth service with callback
    this.auth = new AuthService({
      onAuthChange: this.handleAuthChange.bind(this),
    });

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
    // Check if already authenticated
    if (this.auth.isAuthenticated()) {
      this.showDashboard();
    } else {
      this.showLogin();
    }
  }

  private handleAuthChange(state: AuthState): void {
    if (state.isAuthenticated) {
      this.showDashboard();
    } else {
      this.showLogin();
    }
  }

  private async handleLogin(event: Event): Promise<void> {
    event.preventDefault();

    const username = this.usernameInput.value.trim();
    const password = this.passwordInput.value;

    this.setLoading(true);
    this.hideError();

    const result = await this.auth.login({ username, password });

    this.setLoading(false);

    if (!result.success) {
      this.showError(result.error ?? 'Login failed');
    }
  }

  private async handleLogout(): Promise<void> {
    await this.auth.logout();
  }

  private showLogin(): void {
    this.dashboardView.hidden = true;
    this.loginView.hidden = false;
    this.loginForm.reset();
    this.hideError();
    this.usernameInput.focus();
  }

  private showDashboard(): void {
    const user = this.auth.getCurrentUser();
    if (user) {
      this.userNameDisplay.textContent = `Welcome, ${user.username}`;
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
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new App();
});
