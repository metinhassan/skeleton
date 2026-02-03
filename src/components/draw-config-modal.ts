/**
 * Draw Configuration Modal Component
 * Modal for configuring draw generation options
 */

import type { DrawType, CreateDrawData, DrawResponse } from '../types/draw.js';
import { toast } from './toast.js';

export interface DrawConfigModalOptions {
  divisionId: string;
  divisionName: string;
  entryCount: number;
  onSuccess: (draw: DrawResponse['draw']) => void;
  onCancel: () => void;
}

export class DrawConfigModal {
  private overlay: HTMLElement;
  private divisionId: string;
  private divisionName: string;
  private entryCount: number;
  private onSuccess: (draw: DrawResponse['draw']) => void;
  private onCancel: () => void;
  private selectedType: DrawType = 'single_elimination';
  private isSubmitting = false;

  constructor(options: DrawConfigModalOptions) {
    this.divisionId = options.divisionId;
    this.divisionName = options.divisionName;
    this.entryCount = options.entryCount;
    this.onSuccess = options.onSuccess;
    this.onCancel = options.onCancel;

    this.overlay = document.createElement('div');
    this.overlay.className = 'modal-overlay';
    this.render();
    document.body.appendChild(this.overlay);

    requestAnimationFrame(() => {
      this.overlay.classList.add('modal-overlay--visible');
    });

    this.bindEvents();
  }

  private render(): void {
    const preview = this.getDrawPreview();

    this.overlay.innerHTML = `
      <div class="modal" style="max-width: 500px;">
        <div class="modal__header">
          <h2 class="modal__title">Generate Draw</h2>
          <button class="modal__close" aria-label="Close">&times;</button>
        </div>
        <div class="modal__body">
          <p class="draw-config__subtitle">Configure the draw for <strong>${this.escapeHtml(this.divisionName)}</strong></p>

          <div class="form-row">
            <label class="form-label form-label--required">Draw Type</label>
            <div class="draw-type-options">
              ${this.renderDrawTypeOption('single_elimination', 'Single Elimination', 'Traditional knockout bracket. Lose once, you\'re out.')}
              ${this.renderDrawTypeOption('double_elimination', 'Double Elimination', 'Two-bracket system. Must lose twice to be eliminated.')}
              ${this.renderDrawTypeOption('round_robin', 'Round Robin', 'Everyone plays everyone. Standings determine winner.')}
            </div>
          </div>

          <div class="draw-preview" id="draw-preview">
            <div class="draw-preview__header">Draw Preview</div>
            <div class="draw-preview__content">
              ${preview}
            </div>
          </div>
        </div>
        <div class="modal__footer">
          <button type="button" class="btn btn-outline" id="cancel-btn">Cancel</button>
          <button type="button" class="btn btn-primary" id="generate-btn" ${this.entryCount < 2 ? 'disabled' : ''}>
            Generate Draw
          </button>
        </div>
      </div>
    `;
  }

  private renderDrawTypeOption(type: DrawType, label: string, description: string): string {
    const isSelected = this.selectedType === type;
    return `
      <label class="draw-type-option${isSelected ? ' draw-type-option--selected' : ''}">
        <input type="radio" name="draw-type" value="${type}" ${isSelected ? 'checked' : ''} />
        <div class="draw-type-option__content">
          <div class="draw-type-option__label">${label}</div>
          <div class="draw-type-option__description">${description}</div>
        </div>
      </label>
    `;
  }

  private getDrawPreview(): string {
    if (this.entryCount < 2) {
      return `
        <div class="draw-preview__warning">
          <span class="draw-preview__warning-icon">&#9888;</span>
          Need at least 2 entries to generate a draw.
        </div>
      `;
    }

    const bracketSize = this.getNextPowerOf2(this.entryCount);
    const byeCount = bracketSize - this.entryCount;
    const rounds = Math.log2(bracketSize);

    if (this.selectedType === 'round_robin') {
      const totalMatches = (this.entryCount * (this.entryCount - 1)) / 2;
      const roundsNeeded = this.entryCount % 2 === 0 ? this.entryCount - 1 : this.entryCount;
      return `
        <div class="draw-preview__stats">
          <div class="draw-preview__stat">
            <span class="draw-preview__stat-value">${this.entryCount}</span>
            <span class="draw-preview__stat-label">Entries</span>
          </div>
          <div class="draw-preview__stat">
            <span class="draw-preview__stat-value">${totalMatches}</span>
            <span class="draw-preview__stat-label">Matches</span>
          </div>
          <div class="draw-preview__stat">
            <span class="draw-preview__stat-value">${roundsNeeded}</span>
            <span class="draw-preview__stat-label">Rounds</span>
          </div>
        </div>
      `;
    }

    if (this.selectedType === 'double_elimination') {
      const winnersMatches = bracketSize - 1;
      const losersMatches = bracketSize - 1;
      const totalMatches = winnersMatches + losersMatches + 1; // +1 for grand final
      return `
        <div class="draw-preview__stats">
          <div class="draw-preview__stat">
            <span class="draw-preview__stat-value">${bracketSize}</span>
            <span class="draw-preview__stat-label">Bracket Size</span>
          </div>
          <div class="draw-preview__stat">
            <span class="draw-preview__stat-value">${byeCount}</span>
            <span class="draw-preview__stat-label">Byes</span>
          </div>
          <div class="draw-preview__stat">
            <span class="draw-preview__stat-value">~${totalMatches}</span>
            <span class="draw-preview__stat-label">Matches</span>
          </div>
        </div>
      `;
    }

    // Single elimination
    return `
      <div class="draw-preview__stats">
        <div class="draw-preview__stat">
          <span class="draw-preview__stat-value">${bracketSize}</span>
          <span class="draw-preview__stat-label">Bracket Size</span>
        </div>
        <div class="draw-preview__stat">
          <span class="draw-preview__stat-value">${byeCount}</span>
          <span class="draw-preview__stat-label">Byes</span>
        </div>
        <div class="draw-preview__stat">
          <span class="draw-preview__stat-value">${rounds}</span>
          <span class="draw-preview__stat-label">Rounds</span>
        </div>
      </div>
    `;
  }

  private getNextPowerOf2(n: number): number {
    let power = 1;
    while (power < n) {
      power *= 2;
    }
    return power;
  }

  private updatePreview(): void {
    const previewEl = this.overlay.querySelector('#draw-preview .draw-preview__content');
    if (previewEl) {
      previewEl.innerHTML = this.getDrawPreview();
    }

    // Update option styling
    const options = this.overlay.querySelectorAll('.draw-type-option');
    options.forEach((opt) => {
      const input = opt.querySelector('input') as HTMLInputElement;
      opt.classList.toggle('draw-type-option--selected', input.checked);
    });
  }

  private bindEvents(): void {
    // Close button
    this.overlay.querySelector('.modal__close')?.addEventListener('click', () => this.close());

    // Cancel button
    this.overlay.querySelector('#cancel-btn')?.addEventListener('click', () => this.close());

    // Overlay click
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });

    // Draw type radio buttons
    const radios = this.overlay.querySelectorAll('input[name="draw-type"]');
    radios.forEach((radio) => {
      radio.addEventListener('change', (e) => {
        this.selectedType = (e.target as HTMLInputElement).value as DrawType;
        this.updatePreview();
      });
    });

    // Generate button
    this.overlay.querySelector('#generate-btn')?.addEventListener('click', () => this.handleGenerate());

    // Escape key
    document.addEventListener('keydown', this.handleKeyDown);
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      this.close();
    }
  };

  private async handleGenerate(): Promise<void> {
    if (this.isSubmitting) return;

    const generateBtn = this.overlay.querySelector('#generate-btn') as HTMLButtonElement;

    this.isSubmitting = true;
    generateBtn.disabled = true;
    generateBtn.textContent = 'Generating...';

    try {
      const data: CreateDrawData = {
        drawType: this.selectedType,
      };

      const response = await fetch(`/api/divisions/${this.divisionId}/draws`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to generate draw');
      }

      const result: DrawResponse = await response.json();
      toast.success('Draw generated successfully');
      this.onSuccess(result.draw);
      this.destroy();
    } catch (error) {
      console.error('Failed to generate draw:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to generate draw');
      this.isSubmitting = false;
      generateBtn.disabled = false;
      generateBtn.textContent = 'Generate Draw';
    }
  }

  private close(): void {
    this.onCancel();
    this.destroy();
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  destroy(): void {
    document.removeEventListener('keydown', this.handleKeyDown);
    this.overlay.classList.remove('modal-overlay--visible');
    setTimeout(() => this.overlay.remove(), 200);
  }
}
