/**
 * Public Match View Component
 * Implements US-011: Public match detail view with real-time updates
 */

import type { DisplayScore, LiveEvent, MatchInfo, PointHistoryEntry } from '../types/live-score.js';

interface PublicMatchViewOptions {
  container: HTMLElement;
  matchId: string;
  onBack: () => void;
}

interface MatchViewData {
  match: MatchInfo;
  displayScore: DisplayScore | null;
}

export class PublicMatchView {
  private container: HTMLElement;
  private matchId: string;
  private onBack: () => void;

  private matchData: MatchViewData | null = null;
  private eventSource: EventSource | null = null;
  private isLoading = true;
  private error: string | null = null;
  private pointHistory: PointHistoryEntry[] = [];
  private showHistory = false;

  constructor(options: PublicMatchViewOptions) {
    this.container = options.container;
    this.matchId = options.matchId;
    this.onBack = options.onBack;

    this.init();
  }

  private async init(): Promise<void> {
    this.render();
    await this.fetchMatchData();
    this.connectSSE();
  }

  private async fetchMatchData(): Promise<void> {
    this.isLoading = true;
    this.error = null;
    this.render();

    try {
      const response = await fetch(`/api/public/live/matches/${this.matchId}`);

      if (!response.ok) {
        if (response.status === 404) {
          this.error = 'Match not found.';
        } else {
          this.error = 'Failed to load match data.';
        }
        this.render();
        return;
      }

      const data = await response.json();
      this.matchData = {
        match: data.match || {
          id: this.matchId,
          entry1Name: data.entry1Name || 'Player 1',
          entry2Name: data.entry2Name || 'Player 2',
          court: data.court || null,
          scheduledTime: null,
          competitionName: data.competitionName || 'Match',
        },
        displayScore: data.displayScore,
      };
    } catch (err) {
      console.error('Failed to fetch match data:', err);
      this.error = 'Network error. Please check your connection.';
    } finally {
      this.isLoading = false;
      this.render();
    }
  }

  private connectSSE(): void {
    if (this.eventSource) {
      this.eventSource.close();
    }

    this.eventSource = new EventSource(`/api/public/live/matches/${this.matchId}/stream`);

    const eventTypes = [
      'match_started',
      'score_change',
      'match_paused',
      'match_resumed',
      'match_completed',
      'match_abandoned',
    ];

    eventTypes.forEach((type) => {
      this.eventSource?.addEventListener(type, (event: Event) => {
        const data = JSON.parse((event as MessageEvent).data) as LiveEvent;
        this.handleSSEEvent(data);
      });
    });

    this.eventSource.onerror = () => {
      console.warn('SSE connection error, will reconnect...');
    };
  }

  private handleSSEEvent(event: LiveEvent): void {
    if (event.data.displayScore && this.matchData) {
      this.matchData.displayScore = event.data.displayScore;
      this.render();
    }
  }

  private render(): void {
    if (this.isLoading) {
      this.container.innerHTML = this.renderLoading();
      return;
    }

    if (this.error) {
      this.container.innerHTML = this.renderError();
      this.bindEvents();
      return;
    }

    if (!this.matchData) {
      this.container.innerHTML = this.renderLoading();
      return;
    }

    const status = this.matchData.displayScore?.status || 'not_started';

    this.container.innerHTML = `
      <div class="public-live-container">
        <header class="public-header">
          <button id="back-btn" class="btn btn-outline" style="position: absolute; left: 1rem; top: 1rem;">
            &larr; Back
          </button>
          <h1>Match Details</h1>
          ${status === 'in_progress' ? '<span class="live-badge">LIVE</span>' : `<span class="status-badge status-${status}">${this.formatStatus(status)}</span>`}
        </header>
        <main style="padding: 1rem; max-width: 600px; margin: 0 auto;">
          ${this.renderMatchHeader()}
          ${this.renderScoreboard()}
          ${status === 'completed' || status === 'abandoned' ? this.renderHistoryButton() : ''}
          ${this.showHistory ? this.renderPointHistory() : ''}
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
          <p>Loading match...</p>
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
          <button id="back-btn" class="btn btn-primary">Go Back</button>
        </div>
      </div>
    `;
  }

  private renderMatchHeader(): string {
    const match = this.matchData!.match;
    const displayScore = this.matchData!.displayScore;
    const serving = displayScore?.serving;

    return `
      <div class="scoreboard" style="margin-bottom: 1rem;">
        <div class="players" style="margin-bottom: 1rem;">
          <div class="player player-1 ${serving === 1 ? 'serving' : ''}">
            <span class="player-name">${this.escapeHtml(match.entry1Name)}</span>
            ${serving === 1 ? '<span class="serve-indicator" title="Serving">&#x1F3BE;</span>' : ''}
          </div>
          <div class="vs">vs</div>
          <div class="player player-2 ${serving === 2 ? 'serving' : ''}">
            ${serving === 2 ? '<span class="serve-indicator" title="Serving">&#x1F3BE;</span>' : ''}
            <span class="player-name">${this.escapeHtml(match.entry2Name)}</span>
          </div>
        </div>
        ${match.court ? `<div class="court-info">Court ${this.escapeHtml(match.court)}</div>` : ''}
      </div>
    `;
  }

  private renderScoreboard(): string {
    const displayScore = this.matchData!.displayScore;

    if (!displayScore || displayScore.status === 'not_started') {
      return `
        <div class="scoreboard">
          <p class="scoreboard-message">Match has not started</p>
        </div>
      `;
    }

    const sets = displayScore.sets;
    const currentGame = displayScore.currentGame;

    return `
      <div class="scoreboard">
        <div class="set-scores">
          ${sets
            .map(
              (set, i) => `
            <div class="set-score">
              <span class="set-label">Set ${i + 1}</span>
              <div class="set-games">
                <span class="games games-1">${set.entry1}</span>
                <span class="games-separator">-</span>
                <span class="games games-2">${set.entry2}</span>
                ${set.tiebreak ? `<span class="tiebreak-score">(${set.tiebreak[0]}-${set.tiebreak[1]})</span>` : ''}
              </div>
            </div>
          `
            )
            .join('')}
        </div>
        ${
          displayScore.status === 'in_progress'
            ? `
          <div class="current-game">
            <span class="game-points game-points-1">${currentGame.entry1}</span>
            <span class="game-separator">-</span>
            <span class="game-points game-points-2">${currentGame.entry2}</span>
          </div>
        `
            : ''
        }
        ${
          displayScore.status === 'paused'
            ? `
          <div class="pause-banner">
            <span class="pause-icon">&#x23F8;</span>
            <span>Match Paused</span>
          </div>
        `
            : ''
        }
        ${
          displayScore.status === 'completed'
            ? `
          <div class="winner-banner">
            <span class="trophy-icon">&#x1F3C6;</span>
            <span>Match Complete</span>
          </div>
        `
            : ''
        }
        ${
          displayScore.status === 'abandoned'
            ? `
          <div class="abandon-banner">
            <span class="abandon-icon">&#x26A0;</span>
            <span>Match Abandoned</span>
          </div>
        `
            : ''
        }
      </div>
    `;
  }

  private renderHistoryButton(): string {
    return `
      <div style="text-align: center; margin-top: 1rem;">
        <button id="history-btn" class="btn btn-outline">
          ${this.showHistory ? 'Hide History' : 'View Point History'}
        </button>
      </div>
    `;
  }

  private renderPointHistory(): string {
    if (this.pointHistory.length === 0) {
      return `
        <div class="scoreboard" style="margin-top: 1rem;">
          <p class="no-history">No point history available.</p>
        </div>
      `;
    }

    // Group by set and game
    let currentSet = 0;
    let currentGame = 0;
    const groups: { set: number; game: number; points: PointHistoryEntry[] }[] = [];

    this.pointHistory.forEach((point) => {
      if (point.setNumber !== currentSet || point.gameNumber !== currentGame) {
        currentSet = point.setNumber;
        currentGame = point.gameNumber;
        groups.push({ set: currentSet, game: currentGame, points: [] });
      }
      groups[groups.length - 1].points.push(point);
    });

    return `
      <div class="scoreboard" style="margin-top: 1rem; padding: 1rem;">
        <h3 style="margin-bottom: 1rem;">Point History</h3>
        <div class="history-list">
          ${groups
            .map(
              (group) => `
            <div class="history-group">
              <div class="history-group-header">Set ${group.set}, Game ${group.game}</div>
              ${group.points
                .map(
                  (point) => `
                <div class="history-point ${point.isBreakPoint ? 'break-point' : ''} ${point.isSetPoint ? 'set-point' : ''} ${point.isMatchPoint ? 'match-point' : ''}">
                  <span class="point-number">#${point.sequenceNumber}</span>
                  <span class="point-winner">${point.winnerEntry === 1 ? this.matchData!.match.entry1Name : this.matchData!.match.entry2Name}</span>
                  ${point.isBreakPoint ? '<span class="point-tag break">BP</span>' : ''}
                  ${point.isSetPoint ? '<span class="point-tag set">SP</span>' : ''}
                  ${point.isMatchPoint ? '<span class="point-tag match">MP</span>' : ''}
                </div>
              `
                )
                .join('')}
            </div>
          `
            )
            .join('')}
        </div>
      </div>
    `;
  }

  private bindEvents(): void {
    const backBtn = this.container.querySelector('#back-btn');
    backBtn?.addEventListener('click', () => this.onBack());

    const historyBtn = this.container.querySelector('#history-btn');
    historyBtn?.addEventListener('click', () => this.toggleHistory());
  }

  private async toggleHistory(): Promise<void> {
    if (this.showHistory) {
      this.showHistory = false;
      this.render();
      return;
    }

    // Fetch history
    try {
      const response = await fetch(`/api/public/matches/${this.matchId}/history`);
      if (response.ok) {
        this.pointHistory = await response.json();
      }
    } catch (err) {
      console.error('Failed to fetch history:', err);
    }

    this.showHistory = true;
    this.render();
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
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }
}
