/**
 * Bulk Add Players Modal
 * Modal for selecting a competition and division, then bulk-adding players as singles entries
 */

import { toast } from './toast.js';

interface Competition {
  id: string;
  name: string;
}

interface Division {
  id: string;
  name: string;
}

export interface BulkAddPlayersModalOptions {
  clubId: string;
  playerIds: string[];
  playerCount: number;
  onComplete: () => void;
  onCancel: () => void;
}

export class BulkAddPlayersModal {
  private clubId: string;
  private playerIds: string[];
  private playerCount: number;
  private onComplete: () => void;
  private onCancel: () => void;

  private overlay: HTMLElement | null = null;
  private isSubmitting = false;
  private competitions: Competition[] = [];
  private divisions: Division[] = [];
  private selectedCompetitionId = '';
  private selectedDivisionId = '';
  private isLoadingCompetitions = true;
  private isLoadingDivisions = false;

  constructor(options: BulkAddPlayersModalOptions) {
    this.clubId = options.clubId;
    this.playerIds = options.playerIds;
    this.playerCount = options.playerCount;
    this.onComplete = options.onComplete;
    this.onCancel = options.onCancel;

    this.render();
    this.loadCompetitions();
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
    return `
      <div class="modal" style="max-width: 480px;">
        <div class="modal__header">
          <h2 class="modal__title">Add Players to Competition</h2>
          <button class="modal__close" aria-label="Close">&times;</button>
        </div>
        <div class="modal__body">
          <div class="form-row">
            <label class="form-label form-label--required" for="bulk-competition-select">Competition</label>
            ${this.isLoadingCompetitions ? `
              <div class="skeleton skeleton-line" style="height: 42px;"></div>
            ` : `
              <select id="bulk-competition-select" class="form-select">
                <option value="">Select a competition...</option>
                ${this.competitions.map(c => `
                  <option value="${c.id}" ${c.id === this.selectedCompetitionId ? 'selected' : ''}>${this.escapeHtml(c.name)}</option>
                `).join('')}
              </select>
            `}
          </div>

          <div class="form-row">
            <label class="form-label form-label--required" for="bulk-division-select">Division</label>
            ${this.isLoadingDivisions ? `
              <div class="skeleton skeleton-line" style="height: 42px;"></div>
            ` : `
              <select id="bulk-division-select" class="form-select" ${!this.selectedCompetitionId ? 'disabled' : ''}>
                <option value="">${this.selectedCompetitionId ? 'Select a division...' : 'Select a competition first'}</option>
                ${this.divisions.map(d => `
                  <option value="${d.id}" ${d.id === this.selectedDivisionId ? 'selected' : ''}>${this.escapeHtml(d.name)}</option>
                `).join('')}
              </select>
            `}
          </div>

          ${this.selectedDivisionId ? `
            <div class="form-hint" style="margin-top: 0.5rem; font-size: 0.9rem;">
              Adding ${this.playerCount} player${this.playerCount !== 1 ? 's' : ''} as singles entries
            </div>
          ` : ''}
        </div>
        <div class="modal__footer">
          <button type="button" class="btn btn-outline" id="bulk-cancel-btn">Cancel</button>
          <button type="button" class="btn btn-primary" id="bulk-submit-btn" ${!this.selectedDivisionId ? 'disabled' : ''}>
            <span class="btn-text">Add ${this.playerCount} Player${this.playerCount !== 1 ? 's' : ''}</span>
            <span class="btn-loading" hidden>Adding...</span>
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
      closeBtn.addEventListener('click', () => this.close(false));
    }

    // Cancel button
    const cancelBtn = this.overlay.querySelector('#bulk-cancel-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.close(false));
    }

    // Click outside to close
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.close(false);
      }
    });

    // ESC key
    document.addEventListener('keydown', this.handleKeyDown);

    // Competition select
    const compSelect = this.overlay.querySelector('#bulk-competition-select') as HTMLSelectElement;
    if (compSelect) {
      compSelect.addEventListener('change', () => {
        this.selectedCompetitionId = compSelect.value;
        this.selectedDivisionId = '';
        this.divisions = [];
        if (this.selectedCompetitionId) {
          this.loadDivisions(this.selectedCompetitionId);
        }
        this.updateModalBody();
      });
    }

    // Division select
    const divSelect = this.overlay.querySelector('#bulk-division-select') as HTMLSelectElement;
    if (divSelect) {
      divSelect.addEventListener('change', () => {
        this.selectedDivisionId = divSelect.value;
        this.updateModalBody();
      });
    }

    // Submit button
    const submitBtn = this.overlay.querySelector('#bulk-submit-btn');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => this.handleSubmit());
    }
  }

  private rebindSelectEvents(): void {
    if (!this.overlay) return;

    const compSelect = this.overlay.querySelector('#bulk-competition-select') as HTMLSelectElement;
    if (compSelect) {
      compSelect.addEventListener('change', () => {
        this.selectedCompetitionId = compSelect.value;
        this.selectedDivisionId = '';
        this.divisions = [];
        if (this.selectedCompetitionId) {
          this.loadDivisions(this.selectedCompetitionId);
        }
        this.updateModalBody();
      });
    }

    const divSelect = this.overlay.querySelector('#bulk-division-select') as HTMLSelectElement;
    if (divSelect) {
      divSelect.addEventListener('change', () => {
        this.selectedDivisionId = divSelect.value;
        this.updateModalBody();
      });
    }

    const submitBtn = this.overlay.querySelector('#bulk-submit-btn');
    if (submitBtn) {
      submitBtn.addEventListener('click', () => this.handleSubmit());
    }

    const cancelBtn = this.overlay.querySelector('#bulk-cancel-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.close(false));
    }
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      this.close(false);
    }
  };

  private updateModalBody(): void {
    if (!this.overlay) return;

    const modal = this.overlay.querySelector('.modal');
    if (modal) {
      // Re-render full modal content but keep the overlay
      modal.innerHTML = this.renderModal().replace(/^[^]*<div class="modal"[^>]*>/, '').replace(/<\/div>\s*$/, '');
      // Actually, let's just re-render the whole modal innerHTML
    }

    // Simpler approach: re-render the whole modal
    this.overlay.innerHTML = this.renderModal();
    this.rebindSelectEvents();

    // Re-bind close button
    const closeBtn = this.overlay.querySelector('.modal__close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close(false));
    }

    // Re-bind overlay click
    // (Not needed since we only check e.target === this.overlay, which was bound on the overlay element itself)
  }

  private async loadCompetitions(): Promise<void> {
    try {
      const response = await fetch(`/api/clubs/${this.clubId}/competitions`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch competitions');
      }

      const data = await response.json();
      this.competitions = data.competitions || [];
    } catch (error) {
      console.error('Failed to load competitions:', error);
      toast.error('Failed to load competitions');
    } finally {
      this.isLoadingCompetitions = false;
      this.updateModalBody();
    }
  }

  private async loadDivisions(competitionId: string): Promise<void> {
    this.isLoadingDivisions = true;
    this.updateModalBody();

    try {
      const response = await fetch(`/api/competitions/${competitionId}/divisions`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch divisions');
      }

      const data = await response.json();
      this.divisions = data.divisions || [];
    } catch (error) {
      console.error('Failed to load divisions:', error);
      toast.error('Failed to load divisions');
    } finally {
      this.isLoadingDivisions = false;
      this.updateModalBody();
    }
  }

  private async handleSubmit(): Promise<void> {
    if (this.isSubmitting || !this.selectedDivisionId) return;

    this.isSubmitting = true;
    this.setLoading(true);

    try {
      const response = await fetch(`/api/divisions/${this.selectedDivisionId}/entries/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ playerIds: this.playerIds }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to add players');
      }

      const result = await response.json();
      const divisionName = this.divisions.find(d => d.id === this.selectedDivisionId)?.name || 'division';

      if (result.created > 0 && result.failed.length === 0) {
        toast.success(`Added ${result.created} player${result.created !== 1 ? 's' : ''} to ${divisionName}`);
      } else if (result.created > 0 && result.failed.length > 0) {
        toast.warning(`Added ${result.created} of ${this.playerCount} players. ${result.failed.length} failed.`);
      } else {
        toast.error('No players were added.');
      }

      this.close(true);
    } catch (error) {
      console.error('Failed to bulk add players:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to add players');
      this.isSubmitting = false;
      this.setLoading(false);
    }
  }

  private setLoading(loading: boolean): void {
    const btn = this.overlay?.querySelector('#bulk-submit-btn') as HTMLButtonElement;
    const btnText = btn?.querySelector('.btn-text') as HTMLElement;
    const btnLoading = btn?.querySelector('.btn-loading') as HTMLElement;

    if (btn) btn.disabled = loading;
    if (btnText) btnText.hidden = loading;
    if (btnLoading) btnLoading.hidden = !loading;

    const allButtons = this.overlay?.querySelectorAll('.modal__footer .btn') as NodeListOf<HTMLButtonElement>;
    allButtons?.forEach((b) => { b.disabled = loading; });
  }

  private close(completed: boolean): void {
    document.removeEventListener('keydown', this.handleKeyDown);

    if (this.overlay) {
      this.overlay.classList.remove('modal-overlay--visible');
      setTimeout(() => {
        this.overlay?.remove();
        this.overlay = null;
        if (completed) {
          this.onComplete();
        } else {
          this.onCancel();
        }
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
