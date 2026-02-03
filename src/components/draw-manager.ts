/**
 * Draw Manager Component
 * Main component for the Draw tab - handles draw generation, viewing brackets/standings
 */

import type { Division, DivisionListResponse } from '../types/division.js';
import type { DrawWithMatches, Match, Standing, DrawListResponse, DrawResponse, StandingsResponse } from '../types/draw.js';
import { DrawConfigModal } from './draw-config-modal.js';
import { toast } from './toast.js';

export interface DrawManagerOptions {
  container: HTMLElement;
  competitionId: string;
}

type DrawManagerState = 'loading' | 'no-divisions' | 'no-draw' | 'draft' | 'active' | 'completed';

export class DrawManager {
  private container: HTMLElement;
  private competitionId: string;
  private divisions: Division[] = [];
  private selectedDivisionId: string | null = null;
  private currentDraw: DrawWithMatches | null = null;
  private standings: Standing[] = [];
  private state: DrawManagerState = 'loading';
  private isLoadingDivisions = true;
  private configModal: DrawConfigModal | null = null;

  constructor(options: DrawManagerOptions) {
    this.container = options.container;
    this.competitionId = options.competitionId;

    this.render();
    this.fetchDivisions();
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="draw-manager">
        ${this.renderDivisionSelector()}
        <div id="draw-content">
          ${this.renderContent()}
        </div>
      </div>
    `;

    this.bindEvents();
  }

  private renderDivisionSelector(): string {
    if (this.isLoadingDivisions) {
      return `
        <div class="division-selector">
          <div class="skeleton skeleton-line" style="width: 200px; height: 40px;"></div>
        </div>
      `;
    }

    if (this.divisions.length === 0) {
      return '';
    }

    return `
      <div class="division-selector">
        <label class="division-selector__label">Division:</label>
        <select class="division-selector__select form-select" id="draw-division-select">
          ${this.divisions
            .map(
              (div) => `
                <option value="${div.id}" ${div.id === this.selectedDivisionId ? 'selected' : ''}>
                  ${this.escapeHtml(div.name)} (${div.entryCount} entries)
                </option>
              `
            )
            .join('')}
        </select>
      </div>
    `;
  }

  private renderContent(): string {
    switch (this.state) {
      case 'loading':
        return this.renderLoading();
      case 'no-divisions':
        return this.renderNoDivisions();
      case 'no-draw':
        return this.renderNoDrawState();
      case 'draft':
        return this.renderDraftState();
      case 'active':
      case 'completed':
        return this.renderDrawView();
      default:
        return '';
    }
  }

  private renderLoading(): string {
    return `
      <div class="draw-loading">
        <div class="loading-spinner"></div>
        <p>Loading draw...</p>
      </div>
    `;
  }

  private renderNoDivisions(): string {
    return `
      <div class="empty-state">
        <div class="empty-state__icon">&#128196;</div>
        <h3 class="empty-state__title">No divisions yet</h3>
        <p class="empty-state__description">
          Create divisions and add entries before generating a draw.
        </p>
      </div>
    `;
  }

  private renderNoDrawState(): string {
    const division = this.divisions.find((d) => d.id === this.selectedDivisionId);
    const entryCount = division?.entryCount || 0;

    return `
      <div class="draw-empty">
        <div class="draw-empty__icon">&#127942;</div>
        <h3 class="draw-empty__title">No Draw Generated</h3>
        <p class="draw-empty__description">
          ${entryCount < 2
            ? `Add at least 2 entries to ${division?.name || 'this division'} before generating a draw.`
            : `Generate a draw to create the bracket for ${division?.name || 'this division'}.`}
        </p>
        <button class="btn btn-primary" id="generate-draw-btn" ${entryCount < 2 ? 'disabled' : ''}>
          Generate Draw
        </button>
      </div>
    `;
  }

  private renderDraftState(): string {
    if (!this.currentDraw) return '';

    return `
      <div class="draw-draft">
        <div class="draw-draft__banner">
          <span class="draw-draft__banner-icon">&#128221;</span>
          <span class="draw-draft__banner-text">Draft - This draw is not yet active</span>
        </div>
        <div class="draw-actions">
          <button class="btn btn-primary" id="activate-draw-btn">Activate Draw</button>
          <button class="btn btn-outline" id="regenerate-draw-btn">Regenerate</button>
        </div>
        ${this.renderDrawView()}
      </div>
    `;
  }

  private renderDrawView(): string {
    if (!this.currentDraw) return '';

    const isRoundRobin = this.currentDraw.drawType === 'round_robin';
    const showRegenerateButton = this.state === 'active' && !this.hasStartedMatches();

    return `
      <div class="draw-view">
        <div class="draw-view__header">
          <div class="draw-view__info">
            <span class="draw-type-badge">${this.formatDrawType(this.currentDraw.drawType)}</span>
            <span class="draw-status-badge draw-status-badge--${this.currentDraw.status}">
              ${this.formatDrawStatus(this.currentDraw.status)}
            </span>
          </div>
          ${showRegenerateButton ? `
            <button class="btn btn-outline btn-sm" id="regenerate-draw-btn">Regenerate</button>
          ` : ''}
        </div>
        ${isRoundRobin ? this.renderStandings() : this.renderBracket()}
      </div>
    `;
  }

  private renderBracket(): string {
    if (!this.currentDraw) return '';

    const matchesByRound = this.groupMatchesByRound(this.currentDraw.matches);
    const rounds = Object.keys(matchesByRound)
      .map(Number)
      .sort((a, b) => a - b);

    if (rounds.length === 0) {
      return `
        <div class="bracket-empty">
          <p>No matches in this draw.</p>
        </div>
      `;
    }

    return `
      <div class="bracket-wrapper">
        ${rounds
          .map((roundNum) => {
            const matches = matchesByRound[roundNum];
            const roundName = this.getRoundName(roundNum, rounds.length);
            return `
              <div class="bracket-round">
                <div class="round-header">${roundName}</div>
                <div class="bracket-matches">
                  ${matches.map((match) => this.renderBracketMatch(match)).join('')}
                </div>
              </div>
            `;
          })
          .join('')}
      </div>
    `;
  }

  private renderBracketMatch(match: Match): string {
    const entry1Name = match.entry1Name || (match.entry1Id ? 'TBD' : 'BYE');
    const entry2Name = match.entry2Name || (match.entry2Id ? 'TBD' : 'BYE');
    const isLive = match.status === 'in_progress';
    const isCompleted = match.status === 'completed' || match.status === 'walkover';
    const isBye = match.status === 'bye';

    const entry1IsWinner = match.winnerId && match.winnerId === match.entry1Id;
    const entry2IsWinner = match.winnerId && match.winnerId === match.entry2Id;

    return `
      <div class="bracket-match${isLive ? ' live' : ''}${isBye ? ' bye' : ''}">
        <div class="bracket-entry${entry1IsWinner ? ' winner' : ''}${!match.entry1Id ? ' tbd' : ''}">
          <span class="bracket-name">${this.escapeHtml(entry1Name)}</span>
          ${isCompleted && match.entry1Score !== null ? `<span class="bracket-score">${match.entry1Score}</span>` : ''}
        </div>
        <div class="bracket-entry${entry2IsWinner ? ' winner' : ''}${!match.entry2Id ? ' tbd' : ''}">
          <span class="bracket-name">${this.escapeHtml(entry2Name)}</span>
          ${isCompleted && match.entry2Score !== null ? `<span class="bracket-score">${match.entry2Score}</span>` : ''}
        </div>
      </div>
    `;
  }

  private renderStandings(): string {
    if (this.standings.length === 0) {
      return `
        <div class="standings-empty">
          <p>No standings available yet.</p>
        </div>
      `;
    }

    return `
      <div class="standings-container">
        <div class="standings-header">
          <h2>Standings</h2>
        </div>
        <table class="standings-table">
          <thead>
            <tr>
              <th style="width: 50px;">Pos</th>
              <th>Name</th>
              <th class="numeric">P</th>
              <th class="numeric">W</th>
              <th class="numeric">L</th>
              <th class="numeric">PF</th>
              <th class="numeric">PA</th>
              <th class="numeric">+/-</th>
            </tr>
          </thead>
          <tbody>
            ${this.standings
              .map(
                (standing) => `
                  <tr>
                    <td class="position">${standing.position}</td>
                    <td class="name">${this.escapeHtml(standing.entryName)}</td>
                    <td class="numeric">${standing.played}</td>
                    <td class="numeric">${standing.won}</td>
                    <td class="numeric">${standing.lost}</td>
                    <td class="numeric">${standing.pointsFor}</td>
                    <td class="numeric">${standing.pointsAgainst}</td>
                    <td class="diff ${standing.pointsDiff > 0 ? 'positive' : standing.pointsDiff < 0 ? 'negative' : ''}">
                      ${standing.pointsDiff > 0 ? '+' : ''}${standing.pointsDiff}
                    </td>
                  </tr>
                `
              )
              .join('')}
          </tbody>
        </table>
      </div>

      <h3 class="draw-matches__title">Matches</h3>
      ${this.renderRoundRobinMatches()}
    `;
  }

  private renderRoundRobinMatches(): string {
    if (!this.currentDraw) return '';

    const matchesByRound = this.groupMatchesByRound(this.currentDraw.matches);
    const rounds = Object.keys(matchesByRound)
      .map(Number)
      .sort((a, b) => a - b);

    return `
      <div class="round-robin-matches">
        ${rounds
          .map((roundNum) => {
            const matches = matchesByRound[roundNum];
            return `
              <div class="round-robin-round">
                <div class="round-robin-round__header">Round ${roundNum}</div>
                <div class="round-robin-round__matches">
                  ${matches.map((match) => this.renderRoundRobinMatch(match)).join('')}
                </div>
              </div>
            `;
          })
          .join('')}
      </div>
    `;
  }

  private renderRoundRobinMatch(match: Match): string {
    const entry1Name = match.entry1Name || 'TBD';
    const entry2Name = match.entry2Name || 'BYE';
    const isCompleted = match.status === 'completed' || match.status === 'walkover';
    const isLive = match.status === 'in_progress';

    return `
      <div class="round-robin-match${isLive ? ' live' : ''}">
        <div class="round-robin-match__entries">
          <span class="round-robin-match__entry">${this.escapeHtml(entry1Name)}</span>
          <span class="round-robin-match__vs">vs</span>
          <span class="round-robin-match__entry">${this.escapeHtml(entry2Name)}</span>
        </div>
        ${isCompleted
          ? `<span class="round-robin-match__score">${match.entry1Score} - ${match.entry2Score}</span>`
          : `<span class="round-robin-match__status">${this.formatMatchStatus(match.status)}</span>`}
      </div>
    `;
  }

  private groupMatchesByRound(matches: Match[]): Record<number, Match[]> {
    const grouped: Record<number, Match[]> = {};
    for (const match of matches) {
      if (!grouped[match.roundNumber]) {
        grouped[match.roundNumber] = [];
      }
      grouped[match.roundNumber].push(match);
    }
    // Sort matches within each round by match number
    for (const round of Object.keys(grouped)) {
      grouped[Number(round)].sort((a, b) => a.matchNumber - b.matchNumber);
    }
    return grouped;
  }

  private getRoundName(roundNum: number, totalRounds: number): string {
    const roundsFromEnd = totalRounds - roundNum + 1;
    switch (roundsFromEnd) {
      case 1:
        return 'Final';
      case 2:
        return 'Semi-Finals';
      case 3:
        return 'Quarter-Finals';
      default:
        return `Round ${roundNum}`;
    }
  }

  private hasStartedMatches(): boolean {
    if (!this.currentDraw) return false;
    return this.currentDraw.matches.some(
      (m) => m.status === 'in_progress' || m.status === 'completed'
    );
  }

  private bindEvents(): void {
    // Division selector
    const divisionSelect = this.container.querySelector('#draw-division-select') as HTMLSelectElement;
    if (divisionSelect) {
      divisionSelect.addEventListener('change', () => {
        this.selectedDivisionId = divisionSelect.value;
        this.loadDrawForDivision();
      });
    }

    this.bindContentEvents();
  }

  private bindContentEvents(): void {
    // Generate draw button
    const generateBtn = this.container.querySelector('#generate-draw-btn');
    if (generateBtn) {
      generateBtn.addEventListener('click', () => this.showGenerateModal());
    }

    // Activate draw button
    const activateBtn = this.container.querySelector('#activate-draw-btn');
    if (activateBtn) {
      activateBtn.addEventListener('click', () => this.handleActivate());
    }

    // Regenerate draw button
    const regenerateBtn = this.container.querySelector('#regenerate-draw-btn');
    if (regenerateBtn) {
      regenerateBtn.addEventListener('click', () => this.handleRegenerate());
    }
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

      if (this.divisions.length > 0) {
        this.selectedDivisionId = this.divisions[0].id;
        this.state = 'loading';
      } else {
        this.state = 'no-divisions';
      }
    } catch (error) {
      console.error('Failed to fetch divisions:', error);
      toast.error('Failed to load divisions');
      this.divisions = [];
      this.state = 'no-divisions';
    } finally {
      this.isLoadingDivisions = false;
      this.render();

      if (this.selectedDivisionId) {
        this.loadDrawForDivision();
      }
    }
  }

  private async loadDrawForDivision(): Promise<void> {
    if (!this.selectedDivisionId) return;

    this.state = 'loading';
    this.updateContent();

    try {
      // Fetch draws for the division
      const response = await fetch(`/api/divisions/${this.selectedDivisionId}/draws`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch draws');
      }

      const data: DrawListResponse = await response.json();
      const draws = data.draws || [];

      if (draws.length === 0) {
        this.state = 'no-draw';
        this.currentDraw = null;
        this.standings = [];
      } else {
        // Get the most recent draw with full details
        const latestDraw = draws[0];
        await this.loadDrawDetails(latestDraw.id);
      }
    } catch (error) {
      console.error('Failed to fetch draw:', error);
      toast.error('Failed to load draw');
      this.state = 'no-draw';
      this.currentDraw = null;
    } finally {
      this.updateContent();
    }
  }

  private async loadDrawDetails(drawId: string): Promise<void> {
    try {
      const response = await fetch(`/api/draws/${drawId}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch draw details');
      }

      const data: DrawResponse = await response.json();
      this.currentDraw = data.draw;

      // Map status to state
      switch (this.currentDraw.status) {
        case 'draft':
          this.state = 'draft';
          break;
        case 'active':
          this.state = 'active';
          break;
        case 'completed':
          this.state = 'completed';
          break;
      }

      // Load standings for round robin
      if (this.currentDraw.drawType === 'round_robin') {
        await this.loadStandings(drawId);
      }
    } catch (error) {
      console.error('Failed to load draw details:', error);
      throw error;
    }
  }

  private async loadStandings(drawId: string): Promise<void> {
    try {
      const response = await fetch(`/api/draws/${drawId}/standings`, {
        credentials: 'include',
      });

      if (!response.ok) {
        // Standings might not exist yet
        this.standings = [];
        return;
      }

      const data: StandingsResponse = await response.json();
      this.standings = data.standings || [];
    } catch (error) {
      console.error('Failed to load standings:', error);
      this.standings = [];
    }
  }

  private showGenerateModal(): void {
    const division = this.divisions.find((d) => d.id === this.selectedDivisionId);
    if (!division) return;

    this.configModal = new DrawConfigModal({
      divisionId: division.id,
      divisionName: division.name,
      entryCount: division.entryCount,
      onSuccess: (draw) => {
        this.currentDraw = draw;
        this.state = 'draft';
        this.configModal = null;
        this.updateContent();

        // Update division's draw status locally
        const divIndex = this.divisions.findIndex((d) => d.id === division.id);
        if (divIndex >= 0) {
          this.divisions[divIndex].drawStatus = 'generated';
        }
      },
      onCancel: () => {
        this.configModal = null;
      },
    });
  }

  private async handleActivate(): Promise<void> {
    if (!this.currentDraw) return;

    const confirmed = await this.showConfirmation(
      'Activate Draw',
      'Activating the draw will make it official and allow matches to be played. Continue?',
      'Activate'
    );

    if (!confirmed) return;

    try {
      const response = await fetch(`/api/draws/${this.currentDraw.id}/activate`, {
        method: 'PUT',
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to activate draw');
      }

      const data: DrawResponse = await response.json();
      this.currentDraw = data.draw;
      this.state = 'active';
      toast.success('Draw activated successfully');
      this.updateContent();

      // Update division's draw status locally
      const division = this.divisions.find((d) => d.id === this.selectedDivisionId);
      if (division) {
        division.drawStatus = 'in_progress';
      }
    } catch (error) {
      console.error('Failed to activate draw:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to activate draw');
    }
  }

  private async handleRegenerate(): Promise<void> {
    if (!this.currentDraw) return;

    const hasStarted = this.hasStartedMatches();
    if (hasStarted) {
      toast.error('Cannot regenerate: some matches have already started');
      return;
    }

    const confirmed = await this.showConfirmation(
      'Regenerate Draw',
      'This will delete the current draw and create a new one. All match information will be lost. Continue?',
      'Regenerate'
    );

    if (!confirmed) return;

    try {
      // Delete current draw
      const deleteResponse = await fetch(`/api/draws/${this.currentDraw.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!deleteResponse.ok) {
        const errorData = await deleteResponse.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to delete draw');
      }

      // Reset state and show generate modal
      this.currentDraw = null;
      this.state = 'no-draw';
      this.updateContent();

      // Update division's draw status locally
      const division = this.divisions.find((d) => d.id === this.selectedDivisionId);
      if (division) {
        division.drawStatus = 'not_generated';
      }

      // Show generate modal
      toast.success('Draw deleted. Configure new draw.');
      this.showGenerateModal();
    } catch (error) {
      console.error('Failed to regenerate draw:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to regenerate draw');
    }
  }

  private showConfirmation(title: string, message: string, confirmText: string): Promise<boolean> {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay modal-overlay--visible';
      overlay.innerHTML = `
        <div class="modal" style="max-width: 400px;">
          <div class="modal__header">
            <h2 class="modal__title">${title}</h2>
            <button class="modal__close" aria-label="Close">&times;</button>
          </div>
          <div class="modal__body">
            <p class="confirm-modal__message">${message}</p>
          </div>
          <div class="modal__footer">
            <button class="btn btn-outline" id="confirm-cancel">Cancel</button>
            <button class="btn btn-primary" id="confirm-ok">${confirmText}</button>
          </div>
        </div>
      `;

      const cleanup = (result: boolean) => {
        overlay.classList.remove('modal-overlay--visible');
        setTimeout(() => overlay.remove(), 200);
        resolve(result);
      };

      overlay.querySelector('.modal__close')?.addEventListener('click', () => cleanup(false));
      overlay.querySelector('#confirm-cancel')?.addEventListener('click', () => cleanup(false));
      overlay.querySelector('#confirm-ok')?.addEventListener('click', () => cleanup(true));
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) cleanup(false);
      });

      document.body.appendChild(overlay);
    });
  }

  private updateContent(): void {
    const contentEl = this.container.querySelector('#draw-content');
    if (contentEl) {
      contentEl.innerHTML = this.renderContent();
      this.bindContentEvents();
    }
  }

  private formatDrawType(type: string): string {
    const typeMap: Record<string, string> = {
      single_elimination: 'Single Elimination',
      double_elimination: 'Double Elimination',
      round_robin: 'Round Robin',
    };
    return typeMap[type] || type;
  }

  private formatDrawStatus(status: string): string {
    const statusMap: Record<string, string> = {
      draft: 'Draft',
      active: 'Active',
      completed: 'Completed',
    };
    return statusMap[status] || status;
  }

  private formatMatchStatus(status: string): string {
    const statusMap: Record<string, string> = {
      not_started: 'Not Started',
      in_progress: 'In Progress',
      completed: 'Completed',
      walkover: 'Walkover',
      bye: 'BYE',
    };
    return statusMap[status] || status;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  refresh(): void {
    if (this.selectedDivisionId) {
      this.loadDrawForDivision();
    }
  }

  destroy(): void {
    this.configModal?.destroy();
    this.container.innerHTML = '';
  }
}
