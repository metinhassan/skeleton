/**
 * Player Form Component
 * Modal form for creating or editing players
 */

import type {
  Player,
  CreatePlayerData,
  UpdatePlayerData,
  PlayerResponse,
} from '../types/player.js';
import { toast } from './toast.js';

export interface PlayerFormOptions {
  mode: 'create' | 'edit';
  clubId: string;
  player?: Player;
  onSuccess?: (player: Player, addAnother: boolean) => void;
  onCancel?: () => void;
}

interface FormErrors {
  name?: string;
  email?: string;
}

export class PlayerForm {
  private mode: 'create' | 'edit';
  private clubId: string;
  private player?: Player;
  private onSuccess?: (player: Player, addAnother: boolean) => void;
  private onCancel?: () => void;
  private overlay: HTMLElement | null = null;
  private isSubmitting = false;
  private errors: FormErrors = {};

  constructor(options: PlayerFormOptions) {
    this.mode = options.mode;
    this.clubId = options.clubId;
    this.player = options.player;
    this.onSuccess = options.onSuccess;
    this.onCancel = options.onCancel;

    this.render();
  }

  private render(): void {
    this.overlay = document.createElement('div');
    this.overlay.className = 'modal-overlay';
    this.overlay.innerHTML = this.renderModal();

    document.body.appendChild(this.overlay);

    requestAnimationFrame(() => {
      this.overlay?.classList.add('modal-overlay--visible');
    });

    this.bindEvents();

    // Focus name input
    const nameInput = this.overlay.querySelector('#player-name') as HTMLInputElement;
    if (nameInput) {
      nameInput.focus();
    }
  }

  private renderModal(): string {
    const isEdit = this.mode === 'edit';
    const p = this.player;

    return `
      <div class="modal" style="max-width: 450px;">
        <div class="modal__header">
          <h2 class="modal__title">${isEdit ? 'Edit Player' : 'Add Player'}</h2>
          <button class="modal__close" aria-label="Close">&times;</button>
        </div>
        <form id="player-form" class="modal__body">
          <div class="form-row">
            <label class="form-label form-label--required" for="player-name">Name</label>
            <input
              type="text"
              id="player-name"
              class="form-input"
              placeholder="Full name"
              value="${this.escapeHtml(p?.name || '')}"
              required
            />
            <div class="form-error" id="name-error"></div>
          </div>

          <div class="form-row">
            <label class="form-label" for="player-email">Email</label>
            <input
              type="email"
              id="player-email"
              class="form-input"
              placeholder="player@example.com"
              value="${this.escapeHtml(p?.email || '')}"
            />
            <div class="form-hint">Optional. Used for notifications and account linking.</div>
            <div class="form-error" id="email-error"></div>
          </div>

          <div class="form-row">
            <label class="form-label" for="player-phone">Phone</label>
            <input
              type="tel"
              id="player-phone"
              class="form-input"
              placeholder="+1 234 567 8900"
              value="${this.escapeHtml(p?.phone || '')}"
            />
            <div class="form-hint">Optional. For contact purposes.</div>
          </div>

          ${isEdit && p?.userId ? `
            <div class="form-row">
              <div class="form-info">
                <span class="linked-badge linked-badge--linked">Linked to user account</span>
              </div>
            </div>
          ` : ''}
        </form>
        <div class="modal__footer">
          <button type="button" class="btn btn-outline" id="cancel-btn">Cancel</button>
          ${!isEdit ? `
            <button type="button" class="btn btn-outline" id="add-another-btn">
              <span class="btn-text">Add Another</span>
              <span class="btn-loading" hidden>Saving...</span>
            </button>
          ` : ''}
          <button type="submit" form="player-form" class="btn btn-primary" id="submit-btn">
            <span class="btn-text">${isEdit ? 'Save Changes' : 'Add Player'}</span>
            <span class="btn-loading" hidden>Saving...</span>
          </button>
        </div>
      </div>
    `;
  }

  private bindEvents(): void {
    if (!this.overlay) return;

    // Close button
    const closeBtn = this.overlay.querySelector('.modal__close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }

    // Cancel button
    const cancelBtn = this.overlay.querySelector('#cancel-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.close());
    }

    // Click outside to close
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.close();
      }
    });

    // Form submit
    const form = this.overlay.querySelector('#player-form') as HTMLFormElement;
    if (form) {
      form.addEventListener('submit', (e) => this.handleSubmit(e, false));
    }

    // Add another button
    const addAnotherBtn = this.overlay.querySelector('#add-another-btn');
    if (addAnotherBtn) {
      addAnotherBtn.addEventListener('click', () => this.handleSubmit(new Event('submit'), true));
    }

    // ESC key to close
    document.addEventListener('keydown', this.handleKeyDown);
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      this.close();
    }
  };

  private async handleSubmit(e: Event, addAnother: boolean): Promise<void> {
    e.preventDefault();

    if (this.isSubmitting) return;

    if (!this.validate()) return;

    this.isSubmitting = true;
    this.setLoading(true, addAnother);

    try {
      const data = this.getFormData();
      let response: Response;

      if (this.mode === 'create') {
        response = await fetch(`/api/clubs/${this.clubId}/players`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(data),
        });
      } else {
        response = await fetch(`/api/clubs/${this.clubId}/players/${this.player!.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(data),
        });
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to save player');
      }

      const result: PlayerResponse = await response.json();
      toast.success(
        this.mode === 'create' ? 'Player added successfully' : 'Player updated successfully'
      );

      if (addAnother) {
        // Clear form for next entry
        this.clearForm();
        this.onSuccess?.(result.player, true);
      } else {
        this.close();
        this.onSuccess?.(result.player, false);
      }
    } catch (error) {
      console.error('Failed to save player:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save player');
    } finally {
      this.isSubmitting = false;
      this.setLoading(false, addAnother);
    }
  }

  private validate(): boolean {
    this.errors = {};
    let isValid = true;

    const nameInput = this.overlay?.querySelector('#player-name') as HTMLInputElement;
    const emailInput = this.overlay?.querySelector('#player-email') as HTMLInputElement;

    if (!nameInput?.value.trim()) {
      this.errors.name = 'Name is required';
      isValid = false;
    }

    // Validate email format if provided
    if (emailInput?.value.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(emailInput.value.trim())) {
        this.errors.email = 'Please enter a valid email address';
        isValid = false;
      }
    }

    this.showErrors();
    return isValid;
  }

  private showErrors(): void {
    // Clear previous errors
    this.overlay?.querySelectorAll('.form-error').forEach((el) => {
      el.textContent = '';
    });
    this.overlay?.querySelectorAll('.form-input').forEach((el) => {
      el.classList.remove('form-input--error');
    });

    if (this.errors.name) {
      const el = this.overlay?.querySelector('#name-error');
      const input = this.overlay?.querySelector('#player-name');
      if (el) el.textContent = this.errors.name;
      input?.classList.add('form-input--error');
    }

    if (this.errors.email) {
      const el = this.overlay?.querySelector('#email-error');
      const input = this.overlay?.querySelector('#player-email');
      if (el) el.textContent = this.errors.email;
      input?.classList.add('form-input--error');
    }
  }

  private getFormData(): CreatePlayerData | UpdatePlayerData {
    const nameInput = this.overlay?.querySelector('#player-name') as HTMLInputElement;
    const emailInput = this.overlay?.querySelector('#player-email') as HTMLInputElement;
    const phoneInput = this.overlay?.querySelector('#player-phone') as HTMLInputElement;

    const data: CreatePlayerData = {
      name: nameInput.value.trim(),
    };

    if (emailInput.value.trim()) {
      data.email = emailInput.value.trim();
    }

    if (phoneInput.value.trim()) {
      data.phone = phoneInput.value.trim();
    }

    return data;
  }

  private clearForm(): void {
    const nameInput = this.overlay?.querySelector('#player-name') as HTMLInputElement;
    const emailInput = this.overlay?.querySelector('#player-email') as HTMLInputElement;
    const phoneInput = this.overlay?.querySelector('#player-phone') as HTMLInputElement;

    if (nameInput) nameInput.value = '';
    if (emailInput) emailInput.value = '';
    if (phoneInput) phoneInput.value = '';

    nameInput?.focus();
  }

  private setLoading(loading: boolean, addAnother: boolean): void {
    const buttonId = addAnother ? '#add-another-btn' : '#submit-btn';
    const btn = this.overlay?.querySelector(buttonId) as HTMLButtonElement;
    const btnText = btn?.querySelector('.btn-text') as HTMLElement;
    const btnLoading = btn?.querySelector('.btn-loading') as HTMLElement;

    if (btn) {
      btn.disabled = loading;
    }
    if (btnText) {
      btnText.hidden = loading;
    }
    if (btnLoading) {
      btnLoading.hidden = !loading;
    }

    // Also disable the other buttons while loading
    const allButtons = this.overlay?.querySelectorAll('.modal__footer .btn') as NodeListOf<HTMLButtonElement>;
    allButtons?.forEach(b => {
      b.disabled = loading;
    });
  }

  close(): void {
    document.removeEventListener('keydown', this.handleKeyDown);

    if (this.overlay) {
      this.overlay.classList.remove('modal-overlay--visible');
      setTimeout(() => {
        this.overlay?.remove();
        this.overlay = null;
        this.onCancel?.();
      }, 200);
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  destroy(): void {
    document.removeEventListener('keydown', this.handleKeyDown);
    this.overlay?.remove();
    this.overlay = null;
  }
}
