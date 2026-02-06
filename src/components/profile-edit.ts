/**
 * Profile editing component - Modal overlay
 */

interface UserProfile {
  id: string;
  email: string;
  name: string;
  roles: string[];
}

export class ProfileEdit {
  private overlay: HTMLElement;
  private user: UserProfile;
  private onUpdate: (user: UserProfile) => void;
  private onClose: () => void;

  constructor(options: {
    user: UserProfile;
    onUpdate: (user: UserProfile) => void;
    onClose: () => void;
  }) {
    this.user = options.user;
    this.onUpdate = options.onUpdate;
    this.onClose = options.onClose;
    this.overlay = this.createOverlay();
    document.body.appendChild(this.overlay);
    this.bindEvents();
    // Trigger animation
    requestAnimationFrame(() => {
      this.overlay.classList.add('modal-overlay--visible');
    });
  }

  private createOverlay(): HTMLElement {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width: 500px;">
        <div class="modal__header">
          <h2 class="modal__title">Edit Profile</h2>
          <button class="modal__close" aria-label="Close">&times;</button>
        </div>
        <div class="modal__body">
          <section class="profile-section" style="margin-bottom: 2rem;">
            <h3 style="font-size: 0.875rem; font-weight: 600; color: var(--color-text-muted); margin-bottom: 1rem; text-transform: uppercase; letter-spacing: 0.05em;">Profile Information</h3>
            <form id="profile-form" class="profile-form">
              <div class="form-group">
                <label for="profile-name">Name</label>
                <input
                  type="text"
                  id="profile-name"
                  value="${this.escapeHtml(this.user.name)}"
                  required
                />
              </div>

              <div class="form-group">
                <label for="profile-email">Email</label>
                <input
                  type="email"
                  id="profile-email"
                  value="${this.escapeHtml(this.user.email)}"
                  required
                />
              </div>

              <div id="profile-error" class="error-message" hidden></div>
              <div id="profile-success" class="success-message" hidden></div>

              <button type="submit" class="btn btn-primary">Save Changes</button>
            </form>
          </section>

          <section class="profile-section">
            <h3 style="font-size: 0.875rem; font-weight: 600; color: var(--color-text-muted); margin-bottom: 1rem; text-transform: uppercase; letter-spacing: 0.05em;">Change Password</h3>
            <form id="password-form" class="profile-form">
              <div class="form-group">
                <label for="current-password">Current Password</label>
                <input
                  type="password"
                  id="current-password"
                  autocomplete="current-password"
                  required
                />
              </div>

              <div class="form-group">
                <label for="new-password">New Password</label>
                <input
                  type="password"
                  id="new-password"
                  autocomplete="new-password"
                  minlength="8"
                  required
                />
              </div>

              <div class="form-group">
                <label for="confirm-new-password">Confirm New Password</label>
                <input
                  type="password"
                  id="confirm-new-password"
                  autocomplete="new-password"
                  required
                />
              </div>

              <div id="password-error" class="error-message" hidden></div>
              <div id="password-success" class="success-message" hidden></div>

              <button type="submit" class="btn btn-secondary">Change Password</button>
            </form>
          </section>
        </div>
      </div>
    `;
    return overlay;
  }

  private bindEvents(): void {
    const closeBtn = this.overlay.querySelector('.modal__close') as HTMLButtonElement;
    const profileForm = this.overlay.querySelector('#profile-form') as HTMLFormElement;
    const passwordForm = this.overlay.querySelector('#password-form') as HTMLFormElement;

    // Close button
    closeBtn.addEventListener('click', () => this.close());

    // Click outside modal to close
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.close();
      }
    });

    // Escape key to close
    document.addEventListener('keydown', this.handleEscape);

    // Form submissions
    profileForm.addEventListener('submit', (e) => this.handleProfileSubmit(e));
    passwordForm.addEventListener('submit', (e) => this.handlePasswordSubmit(e));
  }

  private handleEscape = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      this.close();
    }
  };

  private close(): void {
    document.removeEventListener('keydown', this.handleEscape);
    this.overlay.classList.remove('modal-overlay--visible');
    // Wait for animation to complete before removing
    setTimeout(() => {
      this.overlay.remove();
      this.onClose();
    }, 200);
  }

  private async handleProfileSubmit(event: Event): Promise<void> {
    event.preventDefault();

    const name = (this.overlay.querySelector('#profile-name') as HTMLInputElement).value.trim();
    const email = (this.overlay.querySelector('#profile-email') as HTMLInputElement).value.trim();

    this.hideMessages('profile');

    try {
      const response = await fetch('/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, email }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        this.showError('profile', data.error || 'Update failed');
        return;
      }

      this.user = data.user;
      this.onUpdate(data.user);
      this.showSuccess('profile', 'Profile updated successfully');
      // Close after a brief delay so user sees success message
      setTimeout(() => this.close(), 1000);
    } catch (error) {
      this.showError('profile', 'Update failed. Please try again.');
    }
  }

  private async handlePasswordSubmit(event: Event): Promise<void> {
    event.preventDefault();

    const oldPassword = (this.overlay.querySelector('#current-password') as HTMLInputElement).value;
    const newPassword = (this.overlay.querySelector('#new-password') as HTMLInputElement).value;
    const confirmPassword = (this.overlay.querySelector('#confirm-new-password') as HTMLInputElement).value;

    this.hideMessages('password');

    if (newPassword !== confirmPassword) {
      this.showError('password', 'New passwords do not match');
      return;
    }

    try {
      const response = await fetch('/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ oldPassword, newPassword }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        this.showError('password', data.error || 'Password change failed');
        return;
      }

      // Clear the form
      (this.overlay.querySelector('#password-form') as HTMLFormElement).reset();
      this.showSuccess('password', 'Password changed successfully');
    } catch (error) {
      this.showError('password', 'Password change failed. Please try again.');
    }
  }

  private showError(section: 'profile' | 'password', message: string): void {
    const errorEl = this.overlay.querySelector(`#${section}-error`) as HTMLElement;
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  private showSuccess(section: 'profile' | 'password', message: string): void {
    const successEl = this.overlay.querySelector(`#${section}-success`) as HTMLElement;
    successEl.textContent = message;
    successEl.hidden = false;
  }

  private hideMessages(section: 'profile' | 'password'): void {
    const errorEl = this.overlay.querySelector(`#${section}-error`) as HTMLElement;
    const successEl = this.overlay.querySelector(`#${section}-success`) as HTMLElement;
    errorEl.hidden = true;
    successEl.hidden = true;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
