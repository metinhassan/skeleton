/**
 * Division Form Component
 * Modal form for creating or editing divisions
 */

import type {
  Division,
  CreateDivisionData,
  UpdateDivisionData,
  DivisionResponse,
} from '../types/division.js';
import type { CompetitionFormat } from '../types/competition.js';
import { toast } from './toast.js';

export interface DivisionFormOptions {
  mode: 'create' | 'edit';
  competitionId: string;
  competitionFormat: CompetitionFormat;
  division?: Division;
  onSuccess?: (division: Division) => void;
  onCancel?: () => void;
}

interface FormErrors {
  name?: string;
}

export class DivisionForm {
  private mode: 'create' | 'edit';
  private competitionId: string;
  private competitionFormat: CompetitionFormat;
  private division?: Division;
  private onSuccess?: (division: Division) => void;
  private onCancel?: () => void;
  private overlay: HTMLElement | null = null;
  private isSubmitting = false;
  private errors: FormErrors = {};

  constructor(options: DivisionFormOptions) {
    this.mode = options.mode;
    this.competitionId = options.competitionId;
    this.competitionFormat = options.competitionFormat;
    this.division = options.division;
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
  }

  private renderModal(): string {
    const isEdit = this.mode === 'edit';
    const div = this.division;

    return `
      <div class="modal" style="max-width: 450px;">
        <div class="modal__header">
          <h2 class="modal__title">${isEdit ? 'Edit Division' : 'Add Division'}</h2>
          <button class="modal__close" aria-label="Close">&times;</button>
        </div>
        <form id="division-form" class="modal__body">
          <div class="form-row">
            <label class="form-label form-label--required" for="div-name">Name</label>
            <input
              type="text"
              id="div-name"
              class="form-input"
              placeholder="e.g., Open Singles, U18 Boys"
              value="${this.escapeHtml(div?.name || '')}"
              required
            />
            <div class="form-error" id="name-error"></div>
          </div>

          <div class="form-row">
            <label class="form-label" for="div-format">Format</label>
            <select id="div-format" class="form-select">
              <option value="">Inherit from competition (${this.formatFormat(this.competitionFormat)})</option>
              <option value="knockout" ${div?.format === 'knockout' ? 'selected' : ''}>Knockout</option>
              <option value="round_robin" ${div?.format === 'round_robin' ? 'selected' : ''}>Round Robin</option>
              <option value="swiss" ${div?.format === 'swiss' ? 'selected' : ''}>Swiss</option>
              <option value="ladder" ${div?.format === 'ladder' ? 'selected' : ''}>Ladder</option>
            </select>
            <div class="form-hint">Leave blank to use the competition's format</div>
          </div>

          <div class="form-row">
            <label class="form-label" for="div-scoring">Scoring Rule</label>
            <select id="div-scoring" class="form-select">
              <option value="">Default</option>
              <option value="best_of_3" ${div?.scoringRule === 'best_of_3' ? 'selected' : ''}>Best of 3 sets</option>
              <option value="best_of_5" ${div?.scoringRule === 'best_of_5' ? 'selected' : ''}>Best of 5 sets</option>
              <option value="pro_set" ${div?.scoringRule === 'pro_set' ? 'selected' : ''}>Pro set (first to 8)</option>
              <option value="tiebreak_set" ${div?.scoringRule === 'tiebreak_set' ? 'selected' : ''}>Tiebreak set (first to 10)</option>
            </select>
            <div class="form-hint">Optional: Override the default scoring rules</div>
          </div>
        </form>
        <div class="modal__footer">
          <button type="button" class="btn btn-outline" id="cancel-btn">Cancel</button>
          <button type="submit" form="division-form" class="btn btn-primary" id="submit-btn">
            <span class="btn-text">${isEdit ? 'Save Changes' : 'Add Division'}</span>
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
    const form = this.overlay.querySelector('#division-form') as HTMLFormElement;
    if (form) {
      form.addEventListener('submit', (e) => this.handleSubmit(e));
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

    if (!this.validate()) return;

    this.isSubmitting = true;
    this.setLoading(true);

    try {
      const data = this.getFormData();
      let response: Response;

      if (this.mode === 'create') {
        response = await fetch(`/api/competitions/${this.competitionId}/divisions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(data),
        });
      } else {
        response = await fetch(`/api/competitions/${this.competitionId}/divisions/${this.division!.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(data),
        });
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to save division');
      }

      const result: DivisionResponse = await response.json();
      toast.success(
        this.mode === 'create' ? 'Division created successfully' : 'Division updated successfully'
      );
      this.close();
      this.onSuccess?.(result.division);
    } catch (error) {
      console.error('Failed to save division:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save division');
    } finally {
      this.isSubmitting = false;
      this.setLoading(false);
    }
  }

  private validate(): boolean {
    this.errors = {};
    let isValid = true;

    const nameInput = this.overlay?.querySelector('#div-name') as HTMLInputElement;

    if (!nameInput?.value.trim()) {
      this.errors.name = 'Name is required';
      isValid = false;
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
      const input = this.overlay?.querySelector('#div-name');
      if (el) el.textContent = this.errors.name;
      input?.classList.add('form-input--error');
    }
  }

  private getFormData(): CreateDivisionData | UpdateDivisionData {
    const nameInput = this.overlay?.querySelector('#div-name') as HTMLInputElement;
    const formatSelect = this.overlay?.querySelector('#div-format') as HTMLSelectElement;
    const scoringSelect = this.overlay?.querySelector('#div-scoring') as HTMLSelectElement;

    const data: CreateDivisionData | UpdateDivisionData = {
      name: nameInput.value.trim(),
    };

    if (formatSelect.value) {
      data.format = formatSelect.value as CompetitionFormat;
    }

    if (scoringSelect.value) {
      data.scoringRule = scoringSelect.value;
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

  private formatFormat(format: CompetitionFormat): string {
    const formatMap: Record<CompetitionFormat, string> = {
      knockout: 'Knockout',
      round_robin: 'Round Robin',
      swiss: 'Swiss',
      ladder: 'Ladder',
    };
    return formatMap[format] || format;
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
