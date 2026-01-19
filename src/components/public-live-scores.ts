/**
 * Public Live Scores Component
 * Implements US-010: Public live scores page with SSE
 */

import type { DisplayScore, LiveEvent, CompetitionLiveData } from '../types/live-score.js';

interface PublicLiveScoresOptions {
  container: HTMLElement;
  competitionSlug: string;
  onMatchClick: (matchId: string) => void;
}

interface LiveMatchData {
  matchId: string;
  entry1Name: string;
  entry2Name: string;
  court: string | null;
  displayScore: DisplayScore;
}

export class PublicLiveScores {
  private container: HTMLElement;
  private competitionSlug: string;
  private onMatchClick: (matchId: string) => void;

  private competitionName = '';
  private liveMatches: LiveMatchData[] = [];
  private eventSources: Map<string, EventSource> = new Map();
  private isLoading = true;
  private error: string | null = null;

  constructor(options: PublicLiveScoresOptions) {
    this.container = options.container;
    this.competitionSlug = options.competitionSlug;
    this.onMatchClick = options.onMatchClick;

    this.init();
  }

  private async init(): Promise<void> {
    this.render();
    await this.fetchLiveMatches();
    this.connectSSE();
  }

  private async fetchLiveMatches(): Promise<void> {
    this.isLoading = true;
    this.error = null;
    this.render();

    try {
      const response = await fetch(`/api/public/live/competitions/${this.competitionSlug}`);

      if (!response.ok) {
        if (response.status === 404) {
          this.error = 'Competition not found.';
        } else {
          this.error = 'Failed to load live matches.';
        }
        this.render();
        return;
      }

      const data: CompetitionLiveData = await response.json();
      this.competitionName = data.competition?.name || 'Competition';
      this.liveMatches = data.liveMatches || [];
    } catch (err) {
      console.error('Failed to fetch live matches:', err);
      this.error = 'Network error. Please check your connection.';
    } finally {
      this.isLoading = false;
      this.render();
    }
  }

  private connectSSE(): void {
    // Connect to each live match's SSE stream
    this.liveMatches.forEach((match) => {
      if (match.displayScore.status === 'in_progress' || match.displayScore.status === 'paused') {
        this.connectMatchSSE(match.matchId);
      }
    });
  }

  private connectMatchSSE(matchId: string): void {
    if (this.eventSources.has(matchId)) return;

    const eventSource = new EventSource(`/api/public/live/matches/${matchId}/stream`);

    const eventTypes = ['score_change', 'match_completed', 'match_paused', 'match_resumed'];

    eventTypes.forEach((type) => {
      eventSource.addEventListener(type, (event: Event) => {
        const data = JSON.parse((event as MessageEvent).data) as LiveEvent;
        this.handleSSEEvent(matchId, data);
      });
    });

    eventSource.onerror = () => {
      console.warn(`SSE error for match ${matchId}`);
    };

    this.eventSources.set(matchId, eventSource);
  }

  private handleSSEEvent(matchId: string, event: LiveEvent): void {
    const matchIndex = this.liveMatches.findIndex((m) => m.matchId === matchId);

    if (matchIndex === -1) return;

    if (event.data.displayScore) {
      this.liveMatches[matchIndex].displayScore = event.data.displayScore;

      // If match is completed, remove it after a delay
      if (event.type === 'match_completed') {
        setTimeout(() => {
          this.liveMatches = this.liveMatches.filter((m) => m.matchId !== matchId);
          this.closeMatchSSE(matchId);
          this.render();
        }, 5000);
      }

      this.render();
    }
  }

  private closeMatchSSE(matchId: string): void {
    const eventSource = this.eventSources.get(matchId);
    if (eventSource) {
      eventSource.close();
      this.eventSources.delete(matchId);
    }
  }

  private render(): void {
    if (this.isLoading) {
      this.container.innerHTML = this.renderLoading();
      return;
    }

    if (this.error) {
      this.container.innerHTML = this.renderError();
      return;
    }

    this.container.innerHTML = `
      <div class="public-live-container">
        <header class="public-header">
          <h1>${this.escapeHtml(this.competitionName)}</h1>
          <p>Live Scores</p>
          ${this.liveMatches.length > 0 ? '<span class="live-badge">LIVE</span>' : ''}
        </header>
        <main>
          ${this.liveMatches.length > 0 ? this.renderMatches() : this.renderNoMatches()}
        </main>
      </div>
    `;

    this.bindEvents();
  }

  private renderLoading(): string {
    return `
      <div class="public-live-container">
        <div class="scoring-loading">
          <div class="loading-spinner"></div>
          <p>Loading live scores...</p>
        </div>
      </div>
    `;
  }

  private renderError(): string {
    return `
      <div class="public-live-container">
        <div class="scoring-error">
          <div class="error-icon">!</div>
          <h2>Error</h2>
          <p>${this.error}</p>
        </div>
      </div>
    `;
  }

  private renderNoMatches(): string {
    return `
      <div class="no-matches-message">
        <h2>No Live Matches</h2>
        <p>There are no matches in progress at the moment.</p>
        <p>Check back later!</p>
      </div>
    `;
  }

  private renderMatches(): string {
    return `
      <div class="live-matches-grid">
        ${this.liveMatches.map((match) => this.renderMatchCard(match)).join('')}
      </div>
    `;
  }

  private renderMatchCard(match: LiveMatchData): string {
    const { displayScore } = match;
    const sets = displayScore.sets;
    const currentGame = displayScore.currentGame;
    const isInProgress = displayScore.status === 'in_progress';

    return `
      <div class="live-match-card" data-match-id="${match.matchId}">
        <div class="match-card-header">
          ${match.court ? `<span class="match-court">Court ${this.escapeHtml(match.court)}</span>` : '<span></span>'}
          ${isInProgress ? '<span class="live-badge">LIVE</span>' : `<span class="status-badge status-${displayScore.status}">${this.formatStatus(displayScore.status)}</span>`}
        </div>
        <div class="match-card-players">
          <div class="match-player-row ${displayScore.serving === 1 ? 'serving' : ''}">
            <span class="match-player-name">${this.escapeHtml(match.entry1Name)}</span>
            <div class="match-player-score">
              ${sets.map((set) => `<span class="set-score-pill">${set.entry1}</span>`).join('')}
              ${isInProgress ? `<span class="game-score-pill">${currentGame.entry1}</span>` : ''}
            </div>
          </div>
          <div class="match-player-row ${displayScore.serving === 2 ? 'serving' : ''}">
            <span class="match-player-name">${this.escapeHtml(match.entry2Name)}</span>
            <div class="match-player-score">
              ${sets.map((set) => `<span class="set-score-pill">${set.entry2}</span>`).join('')}
              ${isInProgress ? `<span class="game-score-pill">${currentGame.entry2}</span>` : ''}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private bindEvents(): void {
    const matchCards = this.container.querySelectorAll('.live-match-card');
    matchCards.forEach((card) => {
      card.addEventListener('click', () => {
        const matchId = card.getAttribute('data-match-id');
        if (matchId) {
          this.onMatchClick(matchId);
        }
      });
    });
  }

  private formatStatus(status: string): string {
    const map: Record<string, string> = {
      not_started: 'Upcoming',
      in_progress: 'Live',
      paused: 'Paused',
      completed: 'Final',
      abandoned: 'Abandoned',
    };
    return map[status] || status;
  }

  private escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  public destroy(): void {
    this.eventSources.forEach((eventSource) => {
      eventSource.close();
    });
    this.eventSources.clear();
  }
}
