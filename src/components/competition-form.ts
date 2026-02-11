/**
 * Competition Form Component
 * Modal form for creating or editing competitions
 */

import type {
  Competition,
  CompetitionType,
  CompetitionFormat,
  CreateCompetitionData,
  UpdateCompetitionData,
  RegistrationMode,
  CompetitionResponse,
} from '../types/competition.js';
import { toast } from './toast.js';

export interface CompetitionFormOptions {
  mode: 'create' | 'edit';
  clubId: string;
  competition?: Competition;
  onSuccess?: (competition: Competition) => void;
  onCancel?: () => void;
}

interface FormErrors {
  name?: string;
  type?: string;
  format?: string;
  startDate?: string;
  endDate?: string;
}

export class CompetitionForm {
  private mode: 'create' | 'edit';
  private clubId: string;
  private competition?: Competition;
  private onSuccess?: (competition: Competition) => void;
  private onCancel?: () => void;
  private overlay: HTMLElement | null = null;
  private isSubmitting = false;
  private errors: FormErrors = {};

  constructor(options: CompetitionFormOptions) {
    this.mode = options.mode;
    this.clubId = options.clubId;
    this.competition = options.competition;
    this.onSuccess = options.onSuccess;
    this.onCancel = options.onCancel;

    this.render();
  }

  private render(): void {
    // Create overlay
    this.overlay = document.createElement('div');
    this.overlay.className = 'modal-overlay';
    this.overlay.innerHTML = this.renderModal();

    document.body.appendChild(this.overlay);

    // Show with animation
    requestAnimationFrame(() => {
      this.overlay?.classList.add('modal-overlay--visible');
    });

    this.bindEvents();
  }

  private renderModal(): string {
    const isEdit = this.mode === 'edit';
    const comp = this.competition;

    return `
      <div class="modal">
        <div class="modal__header">
          <h2 class="modal__title">${isEdit ? 'Edit Competition' : 'Create Competition'}</h2>
          <button class="modal__close" aria-label="Close">&times;</button>
        </div>
        <form id="competition-form" class="modal__body">
          <div class="form-row">
            <label class="form-label form-label--required" for="comp-name">Name</label>
            <input
              type="text"
              id="comp-name"
              class="form-input"
              placeholder="e.g., Spring Championship 2024"
              value="${this.escapeHtml(comp?.name || '')}"
              required
            />
            <div class="form-error" id="name-error"></div>
          </div>

          <div class="form-row form-row--inline">
            <div>
              <label class="form-label form-label--required" for="comp-type">Type</label>
              <select id="comp-type" class="form-select" required>
                <option value="">Select type</option>
                <option value="tournament" ${comp?.type === 'tournament' ? 'selected' : ''}>Tournament</option>
                <option value="league" ${comp?.type === 'league' ? 'selected' : ''}>League</option>
              </select>
              <div class="form-error" id="type-error"></div>
            </div>
            <div>
              <label class="form-label form-label--required" for="comp-format">Format</label>
              <select id="comp-format" class="form-select" required>
                <option value="">Select format</option>
                <option value="knockout" ${comp?.format === 'knockout' ? 'selected' : ''}>Knockout</option>
                <option value="round_robin" ${comp?.format === 'round_robin' ? 'selected' : ''}>Round Robin</option>
                <option value="swiss" ${comp?.format === 'swiss' ? 'selected' : ''}>Swiss</option>
                <option value="ladder" ${comp?.format === 'ladder' ? 'selected' : ''}>Ladder</option>
              </select>
              <div class="form-error" id="format-error"></div>
            </div>
          </div>

          <div class="form-row form-row--inline">
            <div>
              <label class="form-label" for="comp-start-date">Start Date</label>
              <input
                type="date"
                id="comp-start-date"
                class="form-input"
                value="${comp?.startDate?.split('T')[0] || ''}"
              />
            </div>
            <div>
              <label class="form-label" for="comp-end-date">End Date</label>
              <input
                type="date"
                id="comp-end-date"
                class="form-input"
                value="${comp?.endDate?.split('T')[0] || ''}"
              />
              <div class="form-error" id="date-error"></div>
            </div>
          </div>

          <div class="form-row">
            <div class="toggle-group">
              <label class="toggle">
                <input
                  type="checkbox"
                  id="comp-score-entry"
                  ${comp?.scoreEntryMode === 'players_can_submit' ? 'checked' : ''}
                />
                <span class="toggle__slider"></span>
              </label>
              <span class="toggle__label">Allow players to submit scores</span>
            </div>
            <div class="form-hint">When enabled, players can enter their own match scores</div>
          </div>

          ${isEdit ? this.renderEditOnlyFields() : ''}
        </form>
        <div class="modal__footer">
          <button type="button" class="btn btn-outline" id="cancel-btn">Cancel</button>
          <button type="submit" form="competition-form" class="btn btn-primary" id="submit-btn">
            <span class="btn-text">${isEdit ? 'Save Changes' : 'Create Competition'}</span>
            <span class="btn-loading" hidden>Saving...</span>
          </button>
        </div>
      </div>
    `;
  }

  private renderEditOnlyFields(): string {
    const comp = this.competition!;

    return `
      <hr style="margin: 1.5rem 0; border: none; border-top: 1px solid var(--color-border);" />

      <div class="form-row">
        <label class="form-label" for="comp-registration-mode">Registration Mode</label>
        <select id="comp-registration-mode" class="form-select">
          <option value="organizer_only" ${comp.registrationMode === 'organizer_only' ? 'selected' : ''}>
            Organizer Only
          </option>
          <option value="self_registration" ${comp.registrationMode === 'self_registration' ? 'selected' : ''}>
            Self Registration
          </option>
          <option value="both" ${comp.registrationMode === 'both' ? 'selected' : ''}>
            Both
          </option>
        </select>
        <div class="form-hint">How players can be added to this competition</div>
      </div>

      <div class="form-row" id="approval-row" ${comp.registrationMode === 'organizer_only' ? 'hidden' : ''}>
        <div class="toggle-group">
          <label class="toggle">
            <input
              type="checkbox"
              id="comp-requires-approval"
              ${comp.requiresApproval ? 'checked' : ''}
            />
            <span class="toggle__slider"></span>
          </label>
          <span class="toggle__label">Require approval for self-registrations</span>
        </div>
      </div>

      <div class="form-row" id="deadline-row" ${comp.registrationMode === 'organizer_only' ? 'hidden' : ''}>
        <label class="form-label" for="comp-deadline">Registration Deadline</label>
        <input
          type="date"
          id="comp-deadline"
          class="form-input"
          value="${comp.registrationDeadline?.split('T')[0] || ''}"
        />
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
    const form = this.overlay.querySelector('#competition-form') as HTMLFormElement;
    if (form) {
      form.addEventListener('submit', (e) => this.handleSubmit(e));
    }

    // Registration mode change (edit mode only)
    const registrationModeSelect = this.overlay.querySelector('#comp-registration-mode');
    if (registrationModeSelect) {
      registrationModeSelect.addEventListener('change', (e) => {
        const value = (e.target as HTMLSelectElement).value;
        const approvalRow = this.overlay?.querySelector('#approval-row');
        const deadlineRow = this.overlay?.querySelector('#deadline-row');
        if (approvalRow) {
          approvalRow.toggleAttribute('hidden', value === 'organizer_only');
        }
        if (deadlineRow) {
          deadlineRow.toggleAttribute('hidden', value === 'organizer_only');
        }
      });
    }

    // ESC key to close
    document.addEventListener('keydown', this.handleKeyDown);
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      this.close();
    }
  };

  private async handleSubmit(e: Event): Promise<void> {
    e.preventDefault();

    if (this.isSubmitting) return;

    // Validate
    if (!this.validate()) return;

    this.isSubmitting = true;
    this.setLoading(true);

    try {
      const data = this.getFormData();
      let response: Response;

      if (this.mode === 'create') {
        response = await fetch(`/api/clubs/${this.clubId}/competitions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(data),
        });
      } else {
        response = await fetch(`/api/competitions/${this.competition!.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(data),
        });
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to save competition');
      }

      const result: CompetitionResponse = await response.json();
      toast.success(
        this.mode === 'create'
          ? 'Competition created successfully'
          : 'Competition updated successfully'
      );
      this.close();
      this.onSuccess?.(result.competition);
    } catch (error) {
      console.error('Failed to save competition:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save competition');
    } finally {
      this.isSubmitting = false;
      this.setLoading(false);
    }
  }

  private validate(): boolean {
    this.errors = {};
    let isValid = true;

    const nameInput = this.overlay?.querySelector('#comp-name') as HTMLInputElement;
    const typeSelect = this.overlay?.querySelector('#comp-type') as HTMLSelectElement;
    const formatSelect = this.overlay?.querySelector('#comp-format') as HTMLSelectElement;
    const startDateInput = this.overlay?.querySelector('#comp-start-date') as HTMLInputElement;
    const endDateInput = this.overlay?.querySelector('#comp-end-date') as HTMLInputElement;

    // Name validation
    if (!nameInput?.value.trim()) {
      this.errors.name = 'Name is required';
      isValid = false;
    }

    // Type validation
    if (!typeSelect?.value) {
      this.errors.type = 'Type is required';
      isValid = false;
    }

    // Format validation
    if (!formatSelect?.value) {
      this.errors.format = 'Format is required';
      isValid = false;
    }

    // Date validation
    if (startDateInput?.value && endDateInput?.value) {
      if (new Date(startDateInput.value) > new Date(endDateInput.value)) {
        this.errors.endDate = 'End date must be after start date';
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
    this.overlay?.querySelectorAll('.form-input, .form-select').forEach((el) => {
      el.classList.remove('form-input--error', 'form-select--error');
    });

    // Show new errors
    if (this.errors.name) {
      const el = this.overlay?.querySelector('#name-error');
      const input = this.overlay?.querySelector('#comp-name');
      if (el) el.textContent = this.errors.name;
      input?.classList.add('form-input--error');
    }

    if (this.errors.type) {
      const el = this.overlay?.querySelector('#type-error');
      const input = this.overlay?.querySelector('#comp-type');
      if (el) el.textContent = this.errors.type;
      input?.classList.add('form-select--error');
    }

    if (this.errors.format) {
      const el = this.overlay?.querySelector('#format-error');
      const input = this.overlay?.querySelector('#comp-format');
      if (el) el.textContent = this.errors.format;
      input?.classList.add('form-select--error');
    }

    if (this.errors.endDate) {
      const el = this.overlay?.querySelector('#date-error');
      const input = this.overlay?.querySelector('#comp-end-date');
      if (el) el.textContent = this.errors.endDate;
      input?.classList.add('form-input--error');
    }
  }

  private getFormData(): CreateCompetitionData | UpdateCompetitionData {
    const nameInput = this.overlay?.querySelector('#comp-name') as HTMLInputElement;
    const typeSelect = this.overlay?.querySelector('#comp-type') as HTMLSelectElement;
    const formatSelect = this.overlay?.querySelector('#comp-format') as HTMLSelectElement;
    const startDateInput = this.overlay?.querySelector('#comp-start-date') as HTMLInputElement;
    const endDateInput = this.overlay?.querySelector('#comp-end-date') as HTMLInputElement;
    const scoreEntryCheckbox = this.overlay?.querySelector('#comp-score-entry') as HTMLInputElement;

    const data: CreateCompetitionData | UpdateCompetitionData = {
      name: nameInput.value.trim(),
      type: typeSelect.value as CompetitionType,
      format: formatSelect.value as CompetitionFormat,
      scoreEntryMode: scoreEntryCheckbox.checked ? 'players_can_submit' : 'organisers_only',
    };

    if (startDateInput.value) {
      data.startDate = startDateInput.value;
    }
    if (endDateInput.value) {
      data.endDate = endDateInput.value;
    }

    // Edit mode additional fields
    if (this.mode === 'edit') {
      const registrationModeSelect = this.overlay?.querySelector(
        '#comp-registration-mode'
      ) as HTMLSelectElement;
      const requiresApprovalCheckbox = this.overlay?.querySelector(
        '#comp-requires-approval'
      ) as HTMLInputElement;
      const deadlineInput = this.overlay?.querySelector('#comp-deadline') as HTMLInputElement;

      if (registrationModeSelect) {
        (data as UpdateCompetitionData).registrationMode =
          registrationModeSelect.value as RegistrationMode;
      }
      if (requiresApprovalCheckbox) {
        (data as UpdateCompetitionData).requiresApproval = requiresApprovalCheckbox.checked;
      }
      if (deadlineInput?.value) {
        (data as UpdateCompetitionData).registrationDeadline = deadlineInput.value;
      }
    }

    return data;
  }

  private setLoading(loading: boolean): void {
    const submitBtn = this.overlay?.querySelector('#submit-btn') as HTMLButtonElement;
    const btnText = submitBtn?.querySelector('.btn-text') as HTMLElement;
    const btnLoading = submitBtn?.querySelector('.btn-loading') as HTMLElement;

    if (submitBtn) {
      submitBtn.disabled = loading;
    }
    if (btnText) {
      btnText.hidden = loading;
    }
    if (btnLoading) {
      btnLoading.hidden = !loading;
    }
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
