/**
 * Public Registration Component
 * Implements US-020: Player self-registration page
 * Allows players to self-register for competition divisions
 */

import type { Competition, RegistrationMode } from '../types/competition.js';
import type { Division } from '../types/division.js';
import type { EntryType } from '../types/entry.js';

interface PublicRegistrationOptions {
  container: HTMLElement;
  competitionSlug: string;
  onLoginRequired: () => void;
}

interface User {
  id: string;
  email: string;
  name?: string;
}

interface PublicCompetitionData {
  competition: Competition;
  divisions: Division[];
}

type ComponentState = 'loading' | 'error' | 'unauthenticated' | 'authenticated' | 'success';

export class PublicRegistration {
  private container: HTMLElement;
  private competitionSlug: string;
  private onLoginRequired: () => void;

  private state: ComponentState = 'loading';
  private competition: Competition | null = null;
  private divisions: Division[] = [];
  private user: User | null = null;
  private error: string | null = null;

  // Form state
  private selectedDivisionId: string | null = null;
  private selectedEntryType: EntryType = 'singles';
  private seekingPartner = false;
  private isSubmitting = false;

  // Success state
  private requiresApproval = false;

  constructor(options: PublicRegistrationOptions) {
    this.container = options.container;
    this.competitionSlug = options.competitionSlug;
    this.onLoginRequired = options.onLoginRequired;

    this.init();
  }

  private async init(): Promise<void> {
    this.render();
    await this.fetchData();
  }

  private async fetchData(): Promise<void> {
    this.state = 'loading';
    this.render();

    try {
      // Fetch competition data and auth status in parallel
      const [competitionResponse, authResponse] = await Promise.all([
        fetch(`/api/public/competitions/${this.competitionSlug}`),
        fetch('/auth/me', { credentials: 'include' }),
      ]);

      // Handle competition data
      if (!competitionResponse.ok) {
        if (competitionResponse.status === 404) {
          this.error = 'Competition not found.';
        } else {
          this.error = 'Failed to load competition data.';
        }
        this.state = 'error';
        this.render();
        return;
      }

      const competitionData: PublicCompetitionData = await competitionResponse.json();
      this.competition = competitionData.competition;
      this.divisions = competitionData.divisions || [];
      this.requiresApproval = this.competition.requiresApproval;

      // Validate registration is open
      const validationError = this.validateRegistration();
      if (validationError) {
        this.error = validationError;
        this.state = 'error';
        this.render();
        return;
      }

      // Set default division
      if (this.divisions.length > 0) {
        this.selectedDivisionId = this.divisions[0].id;
      }

      // Handle auth status
      if (authResponse.ok) {
        const authData = await authResponse.json();
        if (authData.authenticated && authData.user) {
          this.user = authData.user;
          this.state = 'authenticated';
        } else {
          this.state = 'unauthenticated';
        }
      } else {
        this.state = 'unauthenticated';
      }
    } catch (err) {
      console.error('Failed to fetch registration data:', err);
      this.error = 'Network error. Please check your connection.';
      this.state = 'error';
    }

    this.render();
  }

  private validateRegistration(): string | null {
    if (!this.competition) {
      return 'Competition not found.';
    }

    // Check registration mode
    const mode = this.competition.registrationMode as RegistrationMode;
    if (mode === 'organizer_only') {
      return 'Self-registration is not available for this competition. Please contact the organiser to register.';
    }

    // Check registration deadline
    if (this.competition.registrationDeadline) {
      const deadline = new Date(this.competition.registrationDeadline);
      if (deadline < new Date()) {
        return `Registration closed on ${this.formatDate(this.competition.registrationDeadline)}.`;
      }
    }

    // Check competition status
    if (this.competition.status === 'completed' || this.competition.status === 'cancelled') {
      return 'This competition is no longer accepting registrations.';
    }

    // Check if there are divisions to register for
    if (this.divisions.length === 0) {
      return 'No divisions are available for registration at this time.';
    }

    return null;
  }

  private render(): void {
    switch (this.state) {
      case 'loading':
        this.container.innerHTML = this.renderLoading();
        break;
      case 'error':
        this.container.innerHTML = this.renderError();
        break;
      case 'unauthenticated':
        this.container.innerHTML = this.renderUnauthenticated();
        this.bindAuthButtons();
        break;
      case 'authenticated':
        this.container.innerHTML = this.renderAuthenticated();
        this.bindFormEvents();
        break;
      case 'success':
        this.container.innerHTML = this.renderSuccess();
        break;
    }
  }

  private renderLoading(): string {
    return `
      <div class="public-registration-container">
        <div class="registration-loading">
          <div class="loading-spinner"></div>
          <p>Loading registration...</p>
        </div>
      </div>
    `;
  }

  private renderError(): string {
    return `
      <div class="public-registration-container">
        <div class="registration-error">
          <div class="error-icon">!</div>
          <h2>Registration Unavailable</h2>
          <p>${this.error}</p>
          <a href="#/" class="btn btn-outline">Back to Home</a>
        </div>
      </div>
    `;
  }

  private renderHeader(): string {
    if (!this.competition) return '';

    return `
      <div class="registration-header">
        <h1>${this.escapeHtml(this.competition.name)}</h1>
        <p>Player Registration</p>
      </div>
    `;
  }

  private renderInfoCard(): string {
    if (!this.competition) return '';

    const formatLabel = this.formatCompetitionFormat(this.competition.format);
    const deadlineText = this.competition.registrationDeadline
      ? this.formatDate(this.competition.registrationDeadline)
      : 'No deadline';

    return `
      <div class="registration-info-card">
        <div class="info-card__items">
          <div class="info-card__item">
            <span class="info-card__label">Format</span>
            <span class="info-card__value">${formatLabel}</span>
          </div>
          <div class="info-card__item">
            <span class="info-card__label">Divisions</span>
            <span class="info-card__value">${this.divisions.length}</span>
          </div>
          <div class="info-card__item">
            <span class="info-card__label">Registration Deadline</span>
            <span class="info-card__value">${deadlineText}</span>
          </div>
          ${this.competition.startDate ? `
            <div class="info-card__item">
              <span class="info-card__label">Start Date</span>
              <span class="info-card__value">${this.formatDate(this.competition.startDate)}</span>
            </div>
          ` : ''}
        </div>
        ${this.requiresApproval ? `
          <div class="info-card__note">
            <span class="info-card__note-icon">i</span>
            Registrations require organiser approval before confirmation.
          </div>
        ` : ''}
      </div>
    `;
  }

  private renderUnauthenticated(): string {
    return `
      <div class="public-registration-container">
        ${this.renderHeader()}
        <div class="registration-content">
          ${this.renderInfoCard()}
          <div class="registration-auth-prompt">
            <div class="auth-prompt__icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
            </div>
            <h3>Sign in to Register</h3>
            <p>You need to be signed in to register for this competition.</p>
            <div class="auth-prompt__buttons">
              <button type="button" class="btn btn-primary" id="auth-signin-btn">Sign In</button>
              <button type="button" class="btn btn-outline" id="auth-register-btn">Create Account</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderAuthenticated(): string {
    return `
      <div class="public-registration-container">
        ${this.renderHeader()}
        <div class="registration-content">
          ${this.renderInfoCard()}
          <div class="registration-form-card">
            <div class="form-card__header">
              <h3>Register for Competition</h3>
              <p class="form-card__user">Registering as: <strong>${this.escapeHtml(this.user?.name || this.user?.email || '')}</strong></p>
            </div>
            <form id="registration-form" class="registration-form">
              ${this.renderDivisionSelection()}
              ${this.renderEntryTypeToggle()}
              ${this.selectedEntryType === 'doubles' ? this.renderPartnerOption() : ''}
              <div class="form-actions">
                <button type="submit" class="btn btn-primary btn-large" ${this.isSubmitting ? 'disabled' : ''}>
                  ${this.isSubmitting ? 'Registering...' : 'Register'}
                </button>
              </div>
              <div id="form-error" class="form-error-message" hidden></div>
            </form>
          </div>
        </div>
      </div>
    `;
  }

  private renderDivisionSelection(): string {
    if (this.divisions.length === 0) {
      return '<p class="no-divisions">No divisions available for registration.</p>';
    }

    return `
      <div class="form-section">
        <label class="form-section__label">Select Division</label>
        <div class="division-cards">
          ${this.divisions.map((division) => `
            <label class="division-card ${this.selectedDivisionId === division.id ? 'division-card--selected' : ''}">
              <input
                type="radio"
                name="division"
                value="${division.id}"
                ${this.selectedDivisionId === division.id ? 'checked' : ''}
              />
              <div class="division-card__content">
                <span class="division-card__name">${this.escapeHtml(division.name)}</span>
                <span class="division-card__meta">${division.entryCount} ${division.entryCount === 1 ? 'entry' : 'entries'}</span>
              </div>
              <div class="division-card__check">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
            </label>
          `).join('')}
        </div>
      </div>
    `;
  }

  private renderEntryTypeToggle(): string {
    return `
      <div class="form-section">
        <label class="form-section__label">Entry Type</label>
        <div class="entry-type-selector">
          <button
            type="button"
            class="entry-type-btn ${this.selectedEntryType === 'singles' ? 'entry-type-btn--active' : ''}"
            data-type="singles"
          >
            <span class="entry-type-icon">1</span>
            <span class="entry-type-label">Singles</span>
          </button>
          <button
            type="button"
            class="entry-type-btn ${this.selectedEntryType === 'doubles' ? 'entry-type-btn--active' : ''}"
            data-type="doubles"
          >
            <span class="entry-type-icon">2</span>
            <span class="entry-type-label">Doubles</span>
          </button>
        </div>
      </div>
    `;
  }

  private renderPartnerOption(): string {
    return `
      <div class="form-section partner-section">
        <label class="checkbox-label">
          <input
            type="checkbox"
            id="seeking-partner"
            ${this.seekingPartner ? 'checked' : ''}
          />
          <span class="checkbox-custom"></span>
          <span class="checkbox-text">I'm looking for a partner</span>
        </label>
        <p class="form-hint">Check this if you need help finding a doubles partner.</p>
      </div>
    `;
  }

  private renderSuccess(): string {
    return `
      <div class="public-registration-container">
        ${this.renderHeader()}
        <div class="registration-content">
          <div class="registration-success">
            <div class="success-icon">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="9 12 12 15 16 9"/>
              </svg>
            </div>
            <h2>Registration ${this.requiresApproval ? 'Submitted' : 'Confirmed'}</h2>
            <p>
              ${this.requiresApproval
                ? 'Your registration has been submitted and is pending organiser approval. You will be notified once your registration is approved.'
                : 'You have been successfully registered for this competition. Good luck!'
              }
            </p>
            <div class="success-actions">
              <a href="#/competitions/${this.competitionSlug}/bracket" class="btn btn-primary">View Bracket</a>
              <a href="#/" class="btn btn-outline">Back to Home</a>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private bindAuthButtons(): void {
    const signinBtn = this.container.querySelector('#auth-signin-btn');
    const registerBtn = this.container.querySelector('#auth-register-btn');

    if (signinBtn) {
      signinBtn.addEventListener('click', () => {
        // Store return URL in sessionStorage
        sessionStorage.setItem('registration_return_url', window.location.hash);
        this.onLoginRequired();
      });
    }

    if (registerBtn) {
      registerBtn.addEventListener('click', () => {
        sessionStorage.setItem('registration_return_url', window.location.hash);
        window.location.hash = '#/register';
      });
    }
  }

  private bindFormEvents(): void {
    // Division selection
    const divisionInputs = this.container.querySelectorAll('input[name="division"]');
    divisionInputs.forEach((input) => {
      input.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        this.selectedDivisionId = target.value;
        this.render();
      });
    });

    // Entry type toggle
    const entryTypeButtons = this.container.querySelectorAll('.entry-type-btn');
    entryTypeButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        const type = target.dataset.type as EntryType;
        if (type && type !== this.selectedEntryType) {
          this.selectedEntryType = type;
          this.render();
        }
      });
    });

    // Seeking partner checkbox
    const partnerCheckbox = this.container.querySelector('#seeking-partner') as HTMLInputElement;
    if (partnerCheckbox) {
      partnerCheckbox.addEventListener('change', () => {
        this.seekingPartner = partnerCheckbox.checked;
      });
    }

    // Form submission
    const form = this.container.querySelector('#registration-form') as HTMLFormElement;
    if (form) {
      form.addEventListener('submit', (e) => this.handleSubmit(e));
    }
  }

  private async handleSubmit(e: Event): Promise<void> {
    e.preventDefault();

    if (!this.selectedDivisionId) {
      this.showFormError('Please select a division.');
      return;
    }

    this.isSubmitting = true;
    this.hideFormError();
    this.render();

    try {
      const body: { entryType: EntryType; seekingPartner?: boolean } = {
        entryType: this.selectedEntryType,
      };

      if (this.selectedEntryType === 'doubles') {
        body.seekingPartner = this.seekingPartner;
      }

      const response = await fetch(`/api/divisions/${this.selectedDivisionId}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorCode = errorData.code || '';

        // Handle specific error codes
        switch (errorCode) {
          case 'already_registered':
            throw new Error('You are already registered for this division.');
          case 'registration_closed':
            throw new Error('Registration is closed for this competition.');
          case 'player_not_found':
            throw new Error('Your player profile was not found. Please contact the organiser.');
          default:
            throw new Error(errorData.error || 'Registration failed. Please try again.');
        }
      }

      // Success!
      this.state = 'success';
      this.render();
    } catch (err) {
      console.error('Registration failed:', err);
      this.showFormError(err instanceof Error ? err.message : 'Registration failed. Please try again.');
      this.isSubmitting = false;
      this.render();
    }
  }

  private showFormError(message: string): void {
    const errorEl = this.container.querySelector('#form-error');
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.removeAttribute('hidden');
    }
  }

  private hideFormError(): void {
    const errorEl = this.container.querySelector('#form-error');
    if (errorEl) {
      errorEl.setAttribute('hidden', '');
    }
  }

  private formatCompetitionFormat(format: string): string {
    const map: Record<string, string> = {
      knockout: 'Knockout',
      round_robin: 'Round Robin',
      swiss: 'Swiss System',
      ladder: 'Ladder',
    };
    return map[format] || format;
  }

  private formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  private escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  public destroy(): void {
    this.container.innerHTML = '';
  }
}
