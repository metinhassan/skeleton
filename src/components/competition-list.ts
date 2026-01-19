/**
 * Competition List Component
 * Displays a grid of competition cards with status badges
 */

import type { Competition, CompetitionListResponse } from '../types/competition.js';
import { toast } from './toast.js';

export interface CompetitionListOptions {
  container: HTMLElement;
  clubId: string;
  onCreateClick?: () => void;
  onCompetitionClick?: (competition: Competition) => void;
}

export class CompetitionList {
  private container: HTMLElement;
  private clubId: string;
  private onCreateClick?: () => void;
  private onCompetitionClick?: (competition: Competition) => void;
  private competitions: Competition[] = [];
  private isLoading = true;

  constructor(options: CompetitionListOptions) {
    this.container = options.container;
    this.clubId = options.clubId;
    this.onCreateClick = options.onCreateClick;
    this.onCompetitionClick = options.onCompetitionClick;

    this.render();
    this.fetchCompetitions();
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="competition-list">
        <div class="section-header">
          <h2 class="section-header__title">Competitions</h2>
          <div class="section-header__actions">
            <button class="btn btn-primary" id="create-competition-btn">
              + Create Competition
            </button>
          </div>
        </div>
        <div id="competition-content">
          ${this.isLoading ? this.renderSkeleton() : this.renderContent()}
        </div>
      </div>
    `;

    this.bindEvents();
  }

  private renderSkeleton(): string {
    return `
      <div class="competition-grid">
        ${Array(3)
          .fill(0)
          .map(
            () => `
          <div class="skeleton-card">
            <div class="skeleton skeleton-line skeleton-line--title"></div>
            <div class="skeleton skeleton-line skeleton-line--short"></div>
            <div class="skeleton skeleton-line skeleton-line--medium"></div>
          </div>
        `
          )
          .join('')}
      </div>
    `;
  }

  private renderContent(): string {
    if (this.competitions.length === 0) {
      return this.renderEmptyState();
    }

    return `
      <div class="competition-grid">
        ${this.competitions.map((comp) => this.renderCard(comp)).join('')}
      </div>
    `;
  }

  private renderEmptyState(): string {
    return `
      <div class="empty-state">
        <div class="empty-state__icon">🏆</div>
        <h3 class="empty-state__title">No competitions yet</h3>
        <p class="empty-state__description">
          Create your first competition to start organizing tournaments and leagues for your club.
        </p>
        <button class="btn btn-primary" id="empty-create-btn">
          + Create Competition
        </button>
      </div>
    `;
  }

  private renderCard(competition: Competition): string {
    const dateRange = this.formatDateRange(competition.startDate, competition.endDate);

    return `
      <div class="competition-card" data-id="${competition.id}">
        <div class="competition-card__header">
          <h3 class="competition-card__name">${this.escapeHtml(competition.name)}</h3>
          <span class="status-badge status-badge--${competition.status}">
            ${this.formatStatus(competition.status)}
          </span>
        </div>
        <div class="competition-card__badges">
          <span class="type-badge">${this.formatType(competition.type)}</span>
          <span class="type-badge">${this.formatFormat(competition.format)}</span>
        </div>
        ${dateRange ? `<div class="competition-card__meta">
          <span class="competition-card__meta-item">
            📅 ${dateRange}
          </span>
        </div>` : ''}
        <div class="competition-card__footer">
          <div class="competition-card__stats">
            <span class="competition-card__stat">
              <span class="competition-card__stat-value">${competition.divisionCount}</span>
              <span class="competition-card__stat-label">divisions</span>
            </span>
            <span class="competition-card__stat">
              <span class="competition-card__stat-value">${competition.entryCount}</span>
              <span class="competition-card__stat-label">entries</span>
            </span>
          </div>
        </div>
      </div>
    `;
  }

  private bindEvents(): void {
    // Create button
    const createBtn = this.container.querySelector('#create-competition-btn');
    if (createBtn) {
      createBtn.addEventListener('click', () => this.onCreateClick?.());
    }

    // Empty state create button
    const emptyCreateBtn = this.container.querySelector('#empty-create-btn');
    if (emptyCreateBtn) {
      emptyCreateBtn.addEventListener('click', () => this.onCreateClick?.());
    }

    // Card clicks
    const cards = this.container.querySelectorAll('.competition-card');
    cards.forEach((card) => {
      card.addEventListener('click', () => {
        const id = card.getAttribute('data-id');
        const competition = this.competitions.find((c) => c.id === id);
        if (competition) {
          this.onCompetitionClick?.(competition);
        }
      });
    });
  }

  private async fetchCompetitions(): Promise<void> {
    try {
      const response = await fetch(`/api/clubs/${this.clubId}/competitions`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch competitions');
      }

      const data: CompetitionListResponse = await response.json();
      this.competitions = data.competitions || [];
    } catch (error) {
      console.error('Failed to fetch competitions:', error);
      toast.error('Failed to load competitions');
      this.competitions = [];
    } finally {
      this.isLoading = false;
      this.updateContent();
    }
  }

  private updateContent(): void {
    const contentEl = this.container.querySelector('#competition-content');
    if (contentEl) {
      contentEl.innerHTML = this.renderContent();
      this.bindCardEvents();
    }
  }

  private bindCardEvents(): void {
    const cards = this.container.querySelectorAll('.competition-card');
    cards.forEach((card) => {
      card.addEventListener('click', () => {
        const id = card.getAttribute('data-id');
        const competition = this.competitions.find((c) => c.id === id);
        if (competition) {
          this.onCompetitionClick?.(competition);
        }
      });
    });

    // Re-bind empty state button if present
    const emptyCreateBtn = this.container.querySelector('#empty-create-btn');
    if (emptyCreateBtn) {
      emptyCreateBtn.addEventListener('click', () => this.onCreateClick?.());
    }
  }

  refresh(): void {
    this.isLoading = true;
    const contentEl = this.container.querySelector('#competition-content');
    if (contentEl) {
      contentEl.innerHTML = this.renderSkeleton();
    }
    this.fetchCompetitions();
  }

  private formatStatus(status: string): string {
    const statusMap: Record<string, string> = {
      draft: 'Draft',
      published: 'Published',
      in_progress: 'In Progress',
      completed: 'Completed',
      cancelled: 'Cancelled',
    };
    return statusMap[status] || status;
  }

  private formatType(type: string): string {
    const typeMap: Record<string, string> = {
      tournament: 'Tournament',
      league: 'League',
    };
    return typeMap[type] || type;
  }

  private formatFormat(format: string): string {
    const formatMap: Record<string, string> = {
      knockout: 'Knockout',
      round_robin: 'Round Robin',
      swiss: 'Swiss',
      ladder: 'Ladder',
    };
    return formatMap[format] || format;
  }

  private formatDateRange(start: string | null, end: string | null): string {
    if (!start && !end) return '';

    const formatDate = (dateStr: string) => {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    if (start && end) {
      return `${formatDate(start)} - ${formatDate(end)}`;
    }
    if (start) {
      return `Starts ${formatDate(start)}`;
    }
    return `Ends ${formatDate(end!)}`;
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
