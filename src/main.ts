/**
 * Frontend app using server-side cookie authentication
 * Cookies are HttpOnly and managed by the server
 */

import { RegistrationForm } from './components/registration.js';
import { ProfileEdit } from './components/profile-edit.js';

interface User {
  id: string;
  email: string;
  name?: string;
  roles?: string[];
}

interface AuthResponse {
  authenticated: boolean;
  user?: User;
}

interface LoginResponse {
  success: boolean;
  user?: User;
  error?: string;
}

type ViewName = 'login' | 'register' | 'dashboard' | 'profile';

class App {
  private user: User | null = null;
  private currentView: ViewName = 'login';

  // Views
  private loginView: HTMLElement;
  private registerView: HTMLElement;
  private dashboardView: HTMLElement;
  private profileView: HTMLElement;

  // Login form elements
  private loginForm: HTMLFormElement;
  private emailInput: HTMLInputElement;
  private passwordInput: HTMLInputElement;
  private loginBtn: HTMLButtonElement;
  private errorMessage: HTMLElement;

  // Dashboard elements
  private logoutBtn: HTMLButtonElement;
  private editProfileBtn: HTMLButtonElement;
  private userNameDisplay: HTMLElement;

  constructor() {
    // Get view elements
    this.loginView = this.getElement('#login-view');
    this.registerView = this.getElement('#register-view');
    this.dashboardView = this.getElement('#dashboard-view');
    this.profileView = this.getElement('#profile-view');

    // Get login form elements
    this.loginForm = this.getElement('#login-form') as HTMLFormElement;
    this.emailInput = this.getElement('#email') as HTMLInputElement;
    this.passwordInput = this.getElement('#password') as HTMLInputElement;
    this.loginBtn = this.getElement('#login-btn') as HTMLButtonElement;
    this.errorMessage = this.getElement('#error-message');

    // Get dashboard elements
    this.logoutBtn = this.getElement('#logout-btn') as HTMLButtonElement;
    this.editProfileBtn = this.getElement('#edit-profile-btn') as HTMLButtonElement;
    this.userNameDisplay = this.getElement('#user-name');

    this.bindEvents();
    this.checkAuth();
  }

  private getElement(selector: string): HTMLElement {
    const element = document.querySelector(selector);
    if (!element) {
      throw new Error(`Element not found: ${selector}`);
    }
    return element as HTMLElement;
  }

  private bindEvents(): void {
    // Login form events
    this.loginForm.addEventListener('submit', (e) => this.handleLogin(e));
    this.emailInput.addEventListener('input', () => this.hideError());
    this.passwordInput.addEventListener('input', () => this.hideError());

    // Switch to register link
    const switchToRegister = document.querySelector('#switch-to-register');
    if (switchToRegister) {
      switchToRegister.addEventListener('click', (e) => {
        e.preventDefault();
        this.showRegister();
      });
    }

    // Dashboard events
    this.logoutBtn.addEventListener('click', () => this.handleLogout());
    this.editProfileBtn.addEventListener('click', () => this.showProfile());
  }

  /**
   * Check authentication status with the server
   */
  private async checkAuth(): Promise<void> {
    try {
      const response = await fetch('/auth/me', {
        credentials: 'include',
      });

      const data: AuthResponse = await response.json();

      if (data.authenticated && data.user) {
        this.user = data.user;
        this.showDashboard();
      } else {
        this.showLogin();
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      this.showLogin();
    }
  }

  /**
   * Handle login form submission
   */
  private async handleLogin(event: Event): Promise<void> {
    event.preventDefault();

    const email = this.emailInput.value.trim();
    const password = this.passwordInput.value;

    if (!email || !password) {
      this.showError('Please enter email and password');
      return;
    }

    this.setLoading(true);
    this.hideError();

    try {
      const response = await fetch('/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });

      const data: LoginResponse = await response.json();

      if (!response.ok || !data.success) {
        this.showError(data.error || 'Invalid email or password');
        this.setLoading(false);
        return;
      }

      if (data.user) {
        this.user = data.user;
        this.showDashboard();
      }
    } catch (error) {
      console.error('Login failed:', error);
      this.showError('Login failed. Please try again.');
    } finally {
      this.setLoading(false);
    }
  }

  /**
   * Logout via server endpoint
   */
  private async handleLogout(): Promise<void> {
    try {
      await fetch('/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });

      this.user = null;
      this.showLogin();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  }

  /**
   * Show a specific view, hiding all others
   */
  private showView(view: ViewName): void {
    this.currentView = view;

    this.loginView.hidden = view !== 'login';
    this.registerView.hidden = view !== 'register';
    this.dashboardView.hidden = view !== 'dashboard';
    this.profileView.hidden = view !== 'profile';
  }

  private showLogin(): void {
    this.showView('login');
    this.loginForm.reset();
    this.hideError();
    this.emailInput.focus();
  }

  private showRegister(): void {
    this.showView('register');

    new RegistrationForm({
      container: this.registerView,
      onSuccess: (user) => {
        this.user = user;
        this.showDashboard();
      },
      onSwitchToLogin: () => {
        this.showLogin();
      },
    });
  }

  private showDashboard(): void {
    if (this.user) {
      const displayName = this.user.name || this.user.email;
      this.userNameDisplay.textContent = `Welcome, ${displayName}`;
    }
    this.showView('dashboard');
  }

  private showProfile(): void {
    if (!this.user) return;

    this.showView('profile');

    new ProfileEdit({
      container: this.profileView,
      user: {
        id: this.user.id,
        email: this.user.email,
        name: this.user.name || '',
        roles: this.user.roles || [],
      },
      onUpdate: (updatedUser) => {
        this.user = {
          ...this.user!,
          ...updatedUser,
        };
        this.userNameDisplay.textContent = `Welcome, ${updatedUser.name}`;
      },
      onClose: () => {
        this.showDashboard();
      },
    });
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
