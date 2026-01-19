/**
 * Live Scoring Component
 * Implements US-001 through US-009: Complete scoring interface for match organisers
 */

import type {
  LiveScore,
  DisplayScore,
  MatchInfo,
  MatchLiveStatus,
  LiveEvent,
  PointHistoryEntry,
} from '../types/live-score.js';

interface LiveScoringOptions {
  container: HTMLElement;
  clubId: string;
  matchId: string;
  onClose: () => void;
  onError?: (message: string) => void;
}

interface MatchData {
  match: MatchInfo;
  score: LiveScore | null;
  displayScore: DisplayScore | null;
}

export class LiveScoring {
  private container: HTMLElement;
  private matchId: string;
  private onClose: () => void;

  private matchData: MatchData | null = null;
  private eventSource: EventSource | null = null;
  private isLoading = false;
  private error: string | null = null;
  private pendingAction = false;
  private pointHistory: PointHistoryEntry[] = [];
  private showHistory = false;

  constructor(options: LiveScoringOptions) {
    this.container = options.container;
    this.matchId = options.matchId;
    this.onClose = options.onClose;

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
      const response = await fetch(`/api/matches/${this.matchId}/live-score`, {
        credentials: 'include',
      });

      if (!response.ok) {
        if (response.status === 401) {
          this.error = 'Authentication required. Please log in.';
        } else if (response.status === 403) {
          this.error = 'You do not have permission to score this match.';
        } else if (response.status === 404) {
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
        score: data.score,
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

    this.eventSource = new EventSource(`/api/live/matches/${this.matchId}/stream`, {
      withCredentials: true,
    });

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
      this.bindErrorEvents();
      return;
    }

    if (!this.matchData) {
      this.container.innerHTML = this.renderLoading();
      return;
    }

    const status = this.matchData.displayScore?.status || 'not_started';
    this.container.innerHTML = `
      <div class="live-scoring-container">
        ${this.renderHeader()}
        ${this.renderScoreboard()}
        ${this.renderControls(status)}
        ${this.showHistory ? this.renderPointHistory() : ''}
      </div>
    `;

    this.bindEvents();
  }

  private renderLoading(): string {
    return `
      <div class="live-scoring-container">
        <div class="scoring-loading">
          <div class="loading-spinner"></div>
          <p>Loading match data...</p>
        </div>
      </div>
    `;
  }

  private renderError(): string {
    return `
      <div class="live-scoring-container">
        <div class="scoring-error">
          <div class="error-icon">!</div>
          <h2>Error</h2>
          <p>${this.error}</p>
          <div class="error-actions">
            <button id="retry-btn" class="btn btn-primary">Retry</button>
            <button id="back-btn" class="btn btn-secondary">Go Back</button>
          </div>
        </div>
      </div>
    `;
  }

  private renderHeader(): string {
    const match = this.matchData!.match;
    const displayScore = this.matchData!.displayScore;
    const status = displayScore?.status || 'not_started';
    const serving = displayScore?.serving;

    return `
      <header class="scoring-header">
        <button id="close-scoring" class="btn-icon" aria-label="Close">&times;</button>
        <div class="match-info">
          <div class="players">
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
          <div class="status-badge status-${status}">${this.formatStatus(status)}</div>
        </div>
      </header>
    `;
  }

  private renderScoreboard(): string {
    const displayScore = this.matchData!.displayScore;

    if (!displayScore || displayScore.status === 'not_started') {
      return `
        <div class="scoreboard scoreboard-empty">
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
            ${this.matchData!.score?.pauseReason ? `<span class="pause-reason">(${this.escapeHtml(this.matchData!.score.pauseReason)})</span>` : ''}
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
            ${this.matchData!.score?.abandonReason ? `<span class="abandon-reason">(${this.escapeHtml(this.matchData!.score.abandonReason)})</span>` : ''}
          </div>
        `
            : ''
        }
      </div>
    `;
  }

  private renderControls(status: MatchLiveStatus): string {
    if (status === 'not_started') {
      return this.renderStartControls();
    }

    if (status === 'in_progress') {
      return this.renderInProgressControls();
    }

    if (status === 'paused') {
      return this.renderPausedControls();
    }

    if (status === 'completed' || status === 'abandoned') {
      return this.renderCompletedControls();
    }

    return '';
  }

  private renderStartControls(): string {
    return `
      <div class="scoring-controls start-controls">
        <h3>Start Match</h3>
        <p>Who serves first?</p>
        <div class="server-selection">
          <button id="start-server-1" class="btn btn-large btn-primary" ${this.pendingAction ? 'disabled' : ''}>
            <span class="btn-text">${this.escapeHtml(this.matchData!.match.entry1Name)}</span>
            <span class="btn-loading" hidden>Starting...</span>
          </button>
          <button id="start-server-2" class="btn btn-large btn-primary" ${this.pendingAction ? 'disabled' : ''}>
            <span class="btn-text">${this.escapeHtml(this.matchData!.match.entry2Name)}</span>
            <span class="btn-loading" hidden>Starting...</span>
          </button>
        </div>
      </div>
    `;
  }

  private renderInProgressControls(): string {
    const match = this.matchData!.match;

    return `
      <div class="scoring-controls in-progress-controls">
        <div class="point-buttons">
          <button id="point-entry-1" class="btn btn-point btn-point-1" ${this.pendingAction ? 'disabled' : ''}>
            <span class="point-btn-text">
              <span class="point-label">Point</span>
              <span class="point-player">${this.escapeHtml(match.entry1Name)}</span>
            </span>
          </button>
          <button id="point-entry-2" class="btn btn-point btn-point-2" ${this.pendingAction ? 'disabled' : ''}>
            <span class="point-btn-text">
              <span class="point-label">Point</span>
              <span class="point-player">${this.escapeHtml(match.entry2Name)}</span>
            </span>
          </button>
        </div>
        <div class="action-buttons">
          <button id="undo-btn" class="btn btn-secondary" ${this.pendingAction ? 'disabled' : ''}>
            Undo
          </button>
          <button id="pause-btn" class="btn btn-secondary" ${this.pendingAction ? 'disabled' : ''}>
            Pause
          </button>
          <button id="more-btn" class="btn btn-outline" ${this.pendingAction ? 'disabled' : ''}>
            &#x22EE; More
          </button>
        </div>
        <div id="more-menu" class="more-menu" hidden>
          <button id="abandon-btn" class="btn btn-danger">Abandon Match</button>
          <button id="history-btn" class="btn btn-outline">View History</button>
        </div>
      </div>
    `;
  }

  private renderPausedControls(): string {
    return `
      <div class="scoring-controls paused-controls">
        <button id="resume-btn" class="btn btn-large btn-primary" ${this.pendingAction ? 'disabled' : ''}>
          <span class="btn-text">Resume Match</span>
          <span class="btn-loading" hidden>Resuming...</span>
        </button>
        <div class="action-buttons">
          <button id="abandon-btn" class="btn btn-secondary" ${this.pendingAction ? 'disabled' : ''}>
            Abandon Match
          </button>
          <button id="history-btn" class="btn btn-outline">View History</button>
        </div>
      </div>
    `;
  }

  private renderCompletedControls(): string {
    const score = this.matchData!.score;
    const displayScore = this.matchData!.displayScore;
    const match = this.matchData!.match;

    // Determine winner
    let winner = '';
    if (displayScore && score?.status === 'completed') {
      const sets = displayScore.sets;
      let entry1Sets = 0;
      let entry2Sets = 0;
      sets.forEach((set) => {
        if (set.entry1 > set.entry2) entry1Sets++;
        else if (set.entry2 > set.entry1) entry2Sets++;
      });
      winner = entry1Sets > entry2Sets ? match.entry1Name : match.entry2Name;
    }

    return `
      <div class="scoring-controls completed-controls">
        ${winner ? `<div class="winner-display"><strong>Winner:</strong> ${this.escapeHtml(winner)}</div>` : ''}
        <div class="action-buttons">
          <button id="history-btn" class="btn btn-primary">View Point History</button>
          <button id="close-btn" class="btn btn-secondary">Close</button>
        </div>
      </div>
    `;
  }

  private renderPointHistory(): string {
    return `
      <div class="point-history-overlay" id="history-overlay">
        <div class="point-history-modal">
          <div class="modal-header">
            <h3>Point History</h3>
            <button id="close-history" class="btn-icon">&times;</button>
          </div>
          <div class="modal-content">
            ${
              this.pointHistory.length === 0
                ? '<p class="no-history">No points recorded yet.</p>'
                : this.renderHistoryList()
            }
          </div>
        </div>
      </div>
    `;
  }

  private renderHistoryList(): string {
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
    `;
  }

  private bindEvents(): void {
    // Close button
    const closeBtn = this.container.querySelector('#close-scoring');
    closeBtn?.addEventListener('click', () => this.onClose());

    // Start match buttons
    const startServer1 = this.container.querySelector('#start-server-1');
    const startServer2 = this.container.querySelector('#start-server-2');
    startServer1?.addEventListener('click', () => this.startMatch(1));
    startServer2?.addEventListener('click', () => this.startMatch(2));

    // Point buttons
    const pointEntry1 = this.container.querySelector('#point-entry-1');
    const pointEntry2 = this.container.querySelector('#point-entry-2');
    pointEntry1?.addEventListener('click', () => this.recordPoint(1));
    pointEntry2?.addEventListener('click', () => this.recordPoint(2));

    // Undo button
    const undoBtn = this.container.querySelector('#undo-btn');
    undoBtn?.addEventListener('click', () => this.confirmUndo());

    // Pause button
    const pauseBtn = this.container.querySelector('#pause-btn');
    pauseBtn?.addEventListener('click', () => this.promptPause());

    // Resume button
    const resumeBtn = this.container.querySelector('#resume-btn');
    resumeBtn?.addEventListener('click', () => this.resumeMatch());

    // More menu
    const moreBtn = this.container.querySelector('#more-btn');
    const moreMenu = this.container.querySelector('#more-menu') as HTMLElement | null;
    moreBtn?.addEventListener('click', () => {
      if (moreMenu) {
        moreMenu.hidden = !moreMenu.hidden;
      }
    });

    // Abandon button
    const abandonBtn = this.container.querySelector('#abandon-btn');
    abandonBtn?.addEventListener('click', () => this.promptAbandon());

    // History button
    const historyBtn = this.container.querySelector('#history-btn');
    historyBtn?.addEventListener('click', () => this.toggleHistory());

    // Close history
    const closeHistory = this.container.querySelector('#close-history');
    const historyOverlay = this.container.querySelector('#history-overlay');
    closeHistory?.addEventListener('click', () => {
      this.showHistory = false;
      this.render();
    });
    historyOverlay?.addEventListener('click', (e) => {
      if (e.target === historyOverlay) {
        this.showHistory = false;
        this.render();
      }
    });

    // Close button (completed state)
    const closeCompleteBtn = this.container.querySelector('#close-btn');
    closeCompleteBtn?.addEventListener('click', () => this.onClose());
  }

  private bindErrorEvents(): void {
    const retryBtn = this.container.querySelector('#retry-btn');
    const backBtn = this.container.querySelector('#back-btn');

    retryBtn?.addEventListener('click', () => this.fetchMatchData());
    backBtn?.addEventListener('click', () => this.onClose());
  }

  private async startMatch(servingEntry: 1 | 2): Promise<void> {
    this.pendingAction = true;
    this.render();

    try {
      const response = await fetch(`/api/matches/${this.matchId}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ servingEntry }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        this.showToast(data.message || 'Failed to start match', 'error');
        return;
      }

      if (data.displayScore && this.matchData) {
        this.matchData.displayScore = data.displayScore;
        this.matchData.score = data.score;
      }

      this.showToast('Match started!', 'success');
    } catch (err) {
      console.error('Failed to start match:', err);
      this.showToast('Network error', 'error');
    } finally {
      this.pendingAction = false;
      this.render();
    }
  }

  private async recordPoint(winnerEntry: 1 | 2): Promise<void> {
    // Optimistic update
    const previousDisplayScore = this.matchData?.displayScore
      ? { ...this.matchData.displayScore }
      : null;

    this.pendingAction = true;

    try {
      const response = await fetch(`/api/matches/${this.matchId}/point`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ winnerEntry }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        // Rollback optimistic update
        if (previousDisplayScore && this.matchData) {
          this.matchData.displayScore = previousDisplayScore;
        }
        this.showToast(data.message || 'Failed to record point', 'error');
        return;
      }

      if (data.displayScore && this.matchData) {
        this.matchData.displayScore = data.displayScore;
        this.matchData.score = data.score;
      }
    } catch (err) {
      console.error('Failed to record point:', err);
      // Rollback
      if (previousDisplayScore && this.matchData) {
        this.matchData.displayScore = previousDisplayScore;
      }
      this.showToast('Network error', 'error');
    } finally {
      this.pendingAction = false;
      this.render();
    }
  }

  private confirmUndo(): void {
    const confirmed = window.confirm('Undo last point?');
    if (confirmed) {
      this.undoPoint();
    }
  }

  private async undoPoint(): Promise<void> {
    this.pendingAction = true;
    this.render();

    try {
      const response = await fetch(`/api/matches/${this.matchId}/undo`, {
        method: 'POST',
        credentials: 'include',
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        this.showToast(data.message || 'Failed to undo point', 'error');
        return;
      }

      if (data.displayScore && this.matchData) {
        this.matchData.displayScore = data.displayScore;
        this.matchData.score = data.score;
      }

      this.showToast('Point undone', 'success');
    } catch (err) {
      console.error('Failed to undo point:', err);
      this.showToast('Network error', 'error');
    } finally {
      this.pendingAction = false;
      this.render();
    }
  }

  private promptPause(): void {
    const presetReasons = ['Rain', 'Injury', 'Break', 'Other'];
    const reason = window.prompt(
      `Pause reason:\n${presetReasons.map((r, i) => `${i + 1}. ${r}`).join('\n')}\n\nEnter number or custom reason:`
    );

    if (reason === null) return;

    const trimmed = reason.trim();
    const numChoice = parseInt(trimmed, 10);
    const finalReason =
      numChoice >= 1 && numChoice <= presetReasons.length ? presetReasons[numChoice - 1] : trimmed || 'Break';

    this.pauseMatch(finalReason);
  }

  private async pauseMatch(reason: string): Promise<void> {
    this.pendingAction = true;
    this.render();

    try {
      const response = await fetch(`/api/matches/${this.matchId}/pause`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reason }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        this.showToast(data.message || 'Failed to pause match', 'error');
        return;
      }

      if (data.displayScore && this.matchData) {
        this.matchData.displayScore = data.displayScore;
        this.matchData.score = data.score;
      }

      this.showToast('Match paused', 'success');
    } catch (err) {
      console.error('Failed to pause match:', err);
      this.showToast('Network error', 'error');
    } finally {
      this.pendingAction = false;
      this.render();
    }
  }

  private async resumeMatch(): Promise<void> {
    this.pendingAction = true;
    this.render();

    try {
      const response = await fetch(`/api/matches/${this.matchId}/resume`, {
        method: 'POST',
        credentials: 'include',
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        this.showToast(data.message || 'Failed to resume match', 'error');
        return;
      }

      if (data.displayScore && this.matchData) {
        this.matchData.displayScore = data.displayScore;
        this.matchData.score = data.score;
      }

      this.showToast('Match resumed', 'success');
    } catch (err) {
      console.error('Failed to resume match:', err);
      this.showToast('Network error', 'error');
    } finally {
      this.pendingAction = false;
      this.render();
    }
  }

  private promptAbandon(): void {
    const reason = window.prompt('Reason for abandoning match (required):');
    if (reason === null) return;

    const trimmed = reason.trim();
    if (!trimmed) {
      this.showToast('Reason is required to abandon match', 'error');
      return;
    }

    const confirmed = window.confirm(`Are you sure you want to abandon this match?\nReason: ${trimmed}`);
    if (confirmed) {
      this.abandonMatch(trimmed);
    }
  }

  private async abandonMatch(reason: string): Promise<void> {
    this.pendingAction = true;
    this.render();

    try {
      const response = await fetch(`/api/matches/${this.matchId}/abandon`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reason }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        this.showToast(data.message || 'Failed to abandon match', 'error');
        return;
      }

      if (data.displayScore && this.matchData) {
        this.matchData.displayScore = data.displayScore;
        this.matchData.score = data.score;
      }

      this.showToast('Match abandoned', 'success');
    } catch (err) {
      console.error('Failed to abandon match:', err);
      this.showToast('Network error', 'error');
    } finally {
      this.pendingAction = false;
      this.render();
    }
  }

  private async toggleHistory(): Promise<void> {
    if (this.showHistory) {
      this.showHistory = false;
      this.render();
      return;
    }

    // Fetch history
    try {
      const response = await fetch(`/api/matches/${this.matchId}/history`, {
        credentials: 'include',
      });

      if (response.ok) {
        this.pointHistory = await response.json();
      }
    } catch (err) {
      console.error('Failed to fetch history:', err);
    }

    this.showHistory = true;
    this.render();
  }

  private showToast(message: string, type: 'success' | 'error'): void {
    const existing = document.querySelector('.toast');
    if (existing) {
      existing.remove();
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-fade');
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  private formatStatus(status: MatchLiveStatus): string {
    const map: Record<MatchLiveStatus, string> = {
      not_started: 'Not Started',
      in_progress: 'In Progress',
      paused: 'Paused',
      completed: 'Completed',
      abandoned: 'Abandoned',
    };
    return map[status];
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
