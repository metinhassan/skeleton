/**
 * Registration form component
 */

interface RegistrationResult {
  success: boolean;
  user?: {
    id: string;
    email: string;
    name: string;
  };
  error?: string;
  code?: string;
}

export class RegistrationForm {
  private container: HTMLElement;
  private onSuccess: (user: any) => void;
  private onSwitchToLogin: () => void;

  constructor(options: {
    container: HTMLElement;
    onSuccess: (user: any) => void;
    onSwitchToLogin: () => void;
  }) {
    this.container = options.container;
    this.onSuccess = options.onSuccess;
    this.onSwitchToLogin = options.onSwitchToLogin;
    this.render();
    this.bindEvents();
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="login-container">
        <div class="login-card">
          <h1 class="login-title">Create Account</h1>
          <p class="login-subtitle">Sign up to get started</p>

          <form id="register-form" class="login-form">
            <div class="form-group">
              <label for="register-name">Name</label>
              <input
                type="text"
                id="register-name"
                name="name"
                placeholder="Enter your name"
                autocomplete="name"
                required
              />
            </div>

            <div class="form-group">
              <label for="register-email">Email</label>
              <input
                type="email"
                id="register-email"
                name="email"
                placeholder="Enter your email"
                autocomplete="email"
                required
              />
            </div>

            <div class="form-group">
              <label for="register-password">Password</label>
              <input
                type="password"
                id="register-password"
                name="password"
                placeholder="Create a password (min 8 characters)"
                autocomplete="new-password"
                minlength="8"
                required
              />
            </div>

            <div class="form-group">
              <label for="register-confirm">Confirm Password</label>
              <input
                type="password"
                id="register-confirm"
                name="confirmPassword"
                placeholder="Confirm your password"
                autocomplete="new-password"
                required
              />
            </div>

            <div id="register-error" class="error-message" hidden></div>

            <button type="submit" id="register-btn" class="btn btn-primary">
              <span class="btn-text">Create Account</span>
              <span class="btn-loading" hidden>Creating...</span>
            </button>
          </form>

          <div class="login-footer">
            <p class="hint">
              Already have an account?
              <a href="#" id="switch-to-login" class="link">Sign in</a>
            </p>
          </div>
        </div>
      </div>
    `;
  }

  private bindEvents(): void {
    const form = this.container.querySelector('#register-form') as HTMLFormElement;
    const switchLink = this.container.querySelector('#switch-to-login') as HTMLAnchorElement;

    form.addEventListener('submit', (e) => this.handleSubmit(e));
    switchLink.addEventListener('click', (e) => {
      e.preventDefault();
      this.onSwitchToLogin();
    });
  }

  private async handleSubmit(event: Event): Promise<void> {
    event.preventDefault();

    const form = event.target as HTMLFormElement;
    const name = (form.querySelector('#register-name') as HTMLInputElement).value.trim();
    const email = (form.querySelector('#register-email') as HTMLInputElement).value.trim();
    const password = (form.querySelector('#register-password') as HTMLInputElement).value;
    const confirmPassword = (form.querySelector('#register-confirm') as HTMLInputElement).value;

    // Validate passwords match
    if (password !== confirmPassword) {
      this.showError('Passwords do not match');
      return;
    }

    this.setLoading(true);
    this.hideError();

    try {
      const response = await fetch('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password, name }),
      });

      const data: RegistrationResult = await response.json();

      if (!response.ok || !data.success) {
        this.showError(data.error || 'Registration failed');
        return;
      }

      if (data.user) {
        this.onSuccess(data.user);
      }
    } catch (error) {
      console.error('Registration failed:', error);
      this.showError('Registration failed. Please try again.');
    } finally {
      this.setLoading(false);
    }
  }

  private showError(message: string): void {
    const errorEl = this.container.querySelector('#register-error') as HTMLElement;
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  private hideError(): void {
    const errorEl = this.container.querySelector('#register-error') as HTMLElement;
    errorEl.hidden = true;
  }

  private setLoading(loading: boolean): void {
    const btn = this.container.querySelector('#register-btn') as HTMLButtonElement;
    const btnText = btn.querySelector('.btn-text') as HTMLElement;
    const btnLoading = btn.querySelector('.btn-loading') as HTMLElement;

    btn.disabled = loading;
    btnText.hidden = loading;
    btnLoading.hidden = !loading;
  }
}
