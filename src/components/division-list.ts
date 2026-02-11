/**
 * Division List Component
 * Displays a list of divisions within a competition
 */

import type { Division, DivisionListResponse } from '../types/division.js';
import type { CompetitionFormat } from '../types/competition.js';
import { toast } from './toast.js';

export interface DivisionListOptions {
  container: HTMLElement;
  competitionId: string;
  competitionFormat: CompetitionFormat;
  onCreateClick?: () => void;
  onEditClick?: (division: Division) => void;
  onDeleteClick?: (division: Division) => void;
  onDivisionClick?: (division: Division) => void;
}

export class DivisionList {
  private container: HTMLElement;
  private competitionId: string;
  private competitionFormat: CompetitionFormat;
  private onCreateClick?: () => void;
  private onEditClick?: (division: Division) => void;
  private onDeleteClick?: (division: Division) => void;
  private onDivisionClick?: (division: Division) => void;
  private divisions: Division[] = [];
  private isLoading = true;

  constructor(options: DivisionListOptions) {
    this.container = options.container;
    this.competitionId = options.competitionId;
    this.competitionFormat = options.competitionFormat;
    this.onCreateClick = options.onCreateClick;
    this.onEditClick = options.onEditClick;
    this.onDeleteClick = options.onDeleteClick;
    this.onDivisionClick = options.onDivisionClick;

    this.render();
    this.fetchDivisions();
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="division-list-container">
        <div class="division-list__header">
          <h3 class="division-list__title">Divisions</h3>
          <button class="btn btn-primary" id="add-division-btn">
            + Add Division
          </button>
        </div>
        <div id="division-content">
          ${this.isLoading ? this.renderSkeleton() : this.renderContent()}
        </div>
      </div>
    `;

    this.bindEvents();
  }

  private renderSkeleton(): string {
    return `
      <div class="division-list">
        ${Array(2)
          .fill(0)
          .map(
            () => `
          <div class="division-skeleton">
            <div class="division-skeleton__info">
              <div class="skeleton skeleton-line" style="width: 40%; height: 1.25rem; margin-bottom: 0.5rem;"></div>
              <div class="skeleton skeleton-line" style="width: 60%; height: 0.875rem;"></div>
            </div>
          </div>
        `
          )
          .join('')}
      </div>
    `;
  }

  private renderContent(): string {
    if (this.divisions.length === 0) {
      return this.renderEmptyState();
    }

    return `
      <div class="division-list">
        ${this.divisions.map((div) => this.renderRow(div)).join('')}
      </div>
    `;
  }

  private renderEmptyState(): string {
    return `
      <div class="division-empty">
        <div class="division-empty__icon">📋</div>
        <h3 class="division-empty__title">No divisions yet</h3>
        <p class="division-empty__description">
          Add divisions to organize your competition by skill level, age group, or category.
        </p>
        <button class="btn btn-primary" id="empty-add-btn">
          + Add Division
        </button>
      </div>
    `;
  }

  private renderRow(division: Division): string {
    const formatDisplay = division.format
      ? this.formatFormat(division.format)
      : `Inherited (${this.formatFormat(this.competitionFormat)})`;

    return `
      <div class="division-row" data-id="${division.id}">
        <div class="division-row__info">
          <div class="division-row__name">${this.escapeHtml(division.name)}</div>
          <div class="division-row__meta">
            <span>Format: ${formatDisplay}</span>
            ${division.scoringRuleId ? `<span>Scoring: ${division.scoringRuleId}</span>` : ''}
          </div>
        </div>
        <div class="division-row__stats">
          <span class="division-row__stat">
            <span class="division-row__stat-value">${division.entryCount}</span>
            entries
          </span>
          <span class="draw-status-badge draw-status-badge--${division.drawStatus}">
            ${this.formatDrawStatus(division.drawStatus)}
          </span>
        </div>
        <div class="division-row__actions">
          <button class="btn btn-outline edit-btn" data-id="${division.id}">Edit</button>
          <button class="btn btn-outline delete-btn" data-id="${division.id}">Delete</button>
        </div>
      </div>
    `;
  }

  private bindEvents(): void {
    // Add division button
    const addBtn = this.container.querySelector('#add-division-btn');
    if (addBtn) {
      addBtn.addEventListener('click', () => this.onCreateClick?.());
    }

    // Empty state add button
    const emptyAddBtn = this.container.querySelector('#empty-add-btn');
    if (emptyAddBtn) {
      emptyAddBtn.addEventListener('click', () => this.onCreateClick?.());
    }

    this.bindRowEvents();
  }

  private bindRowEvents(): void {
    // Empty state add button (re-rendered inside #division-content)
    const emptyAddBtn = this.container.querySelector('#empty-add-btn');
    if (emptyAddBtn) {
      emptyAddBtn.addEventListener('click', () => this.onCreateClick?.());
    }

    // Row clicks (for future expansion/navigation)
    const rows = this.container.querySelectorAll('.division-row');
    rows.forEach((row) => {
      row.addEventListener('click', (e) => {
        // Don't trigger if clicking on buttons
        if ((e.target as HTMLElement).closest('.division-row__actions')) return;

        const id = row.getAttribute('data-id');
        const division = this.divisions.find((d) => d.id === id);
        if (division) {
          this.onDivisionClick?.(division);
        }
      });
    });

    // Edit buttons
    const editBtns = this.container.querySelectorAll('.edit-btn');
    editBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        const division = this.divisions.find((d) => d.id === id);
        if (division) {
          this.onEditClick?.(division);
        }
      });
    });

    // Delete buttons
    const deleteBtns = this.container.querySelectorAll('.delete-btn');
    deleteBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        const division = this.divisions.find((d) => d.id === id);
        if (division) {
          this.onDeleteClick?.(division);
        }
      });
    });
  }

  private async fetchDivisions(): Promise<void> {
    try {
      const response = await fetch(`/api/competitions/${this.competitionId}/divisions`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch divisions');
      }

      const data: DivisionListResponse = await response.json();
      this.divisions = data.divisions || [];
    } catch (error) {
      console.error('Failed to fetch divisions:', error);
      toast.error('Failed to load divisions');
      this.divisions = [];
    } finally {
      this.isLoading = false;
      this.updateContent();
    }
  }

  private updateContent(): void {
    const contentEl = this.container.querySelector('#division-content');
    if (contentEl) {
      contentEl.innerHTML = this.renderContent();
      this.bindRowEvents();
    }
  }

  refresh(): void {
    this.isLoading = true;
    const contentEl = this.container.querySelector('#division-content');
    if (contentEl) {
      contentEl.innerHTML = this.renderSkeleton();
    }
    this.fetchDivisions();
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

  private formatDrawStatus(status: string): string {
    const statusMap: Record<string, string> = {
      not_generated: 'No Draw',
      generated: 'Draw Ready',
      in_progress: 'In Progress',
      completed: 'Completed',
    };
    return statusMap[status] || status;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  destroy(): void {
    this.container.innerHTML = '';
  }
}
