/**
 * Profile editing component
 */

interface UserProfile {
  id: string;
  email: string;
  name: string;
  roles: string[];
}

export class ProfileEdit {
  private container: HTMLElement;
  private user: UserProfile;
  private onUpdate: (user: UserProfile) => void;
  private onClose: () => void;

  constructor(options: {
    container: HTMLElement;
    user: UserProfile;
    onUpdate: (user: UserProfile) => void;
    onClose: () => void;
  }) {
    this.container = options.container;
    this.user = options.user;
    this.onUpdate = options.onUpdate;
    this.onClose = options.onClose;
    this.render();
    this.bindEvents();
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="profile-edit-container">
        <div class="profile-card">
          <div class="profile-header">
            <h2>Edit Profile</h2>
            <button id="close-profile" class="btn-icon" aria-label="Close">&times;</button>
          </div>

          <section class="profile-section">
            <h3>Profile Information</h3>
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
            <h3>Change Password</h3>
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
  }

  private bindEvents(): void {
    const closeBtn = this.container.querySelector('#close-profile') as HTMLButtonElement;
    const profileForm = this.container.querySelector('#profile-form') as HTMLFormElement;
    const passwordForm = this.container.querySelector('#password-form') as HTMLFormElement;

    closeBtn.addEventListener('click', () => this.onClose());
    profileForm.addEventListener('submit', (e) => this.handleProfileSubmit(e));
    passwordForm.addEventListener('submit', (e) => this.handlePasswordSubmit(e));
  }

  private async handleProfileSubmit(event: Event): Promise<void> {
    event.preventDefault();

    const name = (this.container.querySelector('#profile-name') as HTMLInputElement).value.trim();
    const email = (this.container.querySelector('#profile-email') as HTMLInputElement).value.trim();

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
    } catch (error) {
      this.showError('profile', 'Update failed. Please try again.');
    }
  }

  private async handlePasswordSubmit(event: Event): Promise<void> {
    event.preventDefault();

    const oldPassword = (this.container.querySelector('#current-password') as HTMLInputElement).value;
    const newPassword = (this.container.querySelector('#new-password') as HTMLInputElement).value;
    const confirmPassword = (this.container.querySelector('#confirm-new-password') as HTMLInputElement).value;

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
      (this.container.querySelector('#password-form') as HTMLFormElement).reset();
      this.showSuccess('password', 'Password changed successfully');
    } catch (error) {
      this.showError('password', 'Password change failed. Please try again.');
    }
  }

  private showError(section: 'profile' | 'password', message: string): void {
    const errorEl = this.container.querySelector(`#${section}-error`) as HTMLElement;
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  private showSuccess(section: 'profile' | 'password', message: string): void {
    const successEl = this.container.querySelector(`#${section}-success`) as HTMLElement;
    successEl.textContent = message;
    successEl.hidden = false;
  }

  private hideMessages(section: 'profile' | 'password'): void {
    const errorEl = this.container.querySelector(`#${section}-error`) as HTMLElement;
    const successEl = this.container.querySelector(`#${section}-success`) as HTMLElement;
    errorEl.hidden = true;
    successEl.hidden = true;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
