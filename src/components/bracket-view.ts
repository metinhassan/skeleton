/**
 * Bracket View Component
 * Implements US-012: Simple text bracket view
 * Implements US-013: Round robin standings table
 */

import type { BracketData, BracketMatch, StandingsData, StandingsEntry } from '../types/live-score.js';

interface BracketViewOptions {
  container: HTMLElement;
  competitionSlug: string;
}

interface CompetitionData {
  name: string;
  format: string;
  bracket?: BracketData;
  standings?: StandingsData[];
}

export class BracketView {
  private container: HTMLElement;
  private competitionSlug: string;

  private competitionData: CompetitionData | null = null;
  private isLoading = true;
  private error: string | null = null;

  constructor(options: BracketViewOptions) {
    this.container = options.container;
    this.competitionSlug = options.competitionSlug;

    this.init();
  }

  private async init(): Promise<void> {
    this.render();
    await this.fetchBracketData();
  }

  private async fetchBracketData(): Promise<void> {
    this.isLoading = true;
    this.error = null;
    this.render();

    try {
      // Fetch bracket data
      const bracketResponse = await fetch(`/api/public/competitions/${this.competitionSlug}/bracket`);

      let bracket: BracketData | undefined;
      let competitionName = 'Competition';
      let format = 'elimination';

      if (bracketResponse.ok) {
        const bracketData = await bracketResponse.json();
        bracket = bracketData.bracket;
        competitionName = bracketData.competition?.name || competitionName;
        format = bracketData.competition?.format || format;
      }

      // Fetch standings data for round-robin
      let standings: StandingsData[] | undefined;
      const standingsResponse = await fetch(`/api/public/competitions/${this.competitionSlug}/standings`);

      if (standingsResponse.ok) {
        const standingsData = await standingsResponse.json();
        standings = standingsData.standings;
        if (!competitionName || competitionName === 'Competition') {
          competitionName = standingsData.competition?.name || competitionName;
        }
        format = standingsData.competition?.format || format;
      }

      if (!bracket && !standings) {
        this.error = 'Competition not found or no bracket/standings available.';
        this.render();
        return;
      }

      this.competitionData = {
        name: competitionName,
        format,
        bracket,
        standings,
      };
    } catch (err) {
      console.error('Failed to fetch bracket data:', err);
      this.error = 'Network error. Please check your connection.';
    } finally {
      this.isLoading = false;
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
      return;
    }

    if (!this.competitionData) {
      this.container.innerHTML = this.renderLoading();
      return;
    }

    const { bracket, standings } = this.competitionData;

    this.container.innerHTML = `
      <div class="bracket-container">
        <header class="bracket-header">
          <h1>${this.escapeHtml(this.competitionData.name)}</h1>
          <p>${this.formatCompetitionFormat(this.competitionData.format)}</p>
        </header>
        ${standings && standings.length > 0 ? this.renderStandings(standings) : ''}
        ${bracket && bracket.rounds && bracket.rounds.length > 0 ? this.renderBracket(bracket) : ''}
      </div>
    `;
  }

  private renderLoading(): string {
    return `
      <div class="bracket-container">
        <div class="scoring-loading">
          <div class="loading-spinner"></div>
          <p>Loading bracket...</p>
        </div>
      </div>
    `;
  }

  private renderError(): string {
    return `
      <div class="bracket-container">
        <div class="scoring-error">
          <div class="error-icon">!</div>
          <h2>Error</h2>
          <p>${this.error}</p>
        </div>
      </div>
    `;
  }

  private renderStandings(standings: StandingsData[]): string {
    return standings.map((division) => `
      <div class="standings-container">
        <div class="standings-header">
          <h2>${this.escapeHtml(division.division || 'Standings')}</h2>
        </div>
        <table class="standings-table">
          <thead>
            <tr>
              <th>Pos</th>
              <th>Player/Team</th>
              <th>W</th>
              <th>L</th>
              <th>+/-</th>
              <th>Pts</th>
            </tr>
          </thead>
          <tbody>
            ${division.standings.map((entry) => this.renderStandingsRow(entry)).join('')}
          </tbody>
        </table>
      </div>
    `).join('');
  }

  private renderStandingsRow(entry: StandingsEntry): string {
    const diffClass = entry.gamesDiff > 0 ? 'positive' : entry.gamesDiff < 0 ? 'negative' : '';
    const diffSign = entry.gamesDiff > 0 ? '+' : '';

    return `
      <tr>
        <td class="position">${entry.position}</td>
        <td class="name">${this.escapeHtml(entry.entryName)}</td>
        <td class="numeric">${entry.wins}</td>
        <td class="numeric">${entry.losses}</td>
        <td class="diff ${diffClass}">${diffSign}${entry.gamesDiff}</td>
        <td class="numeric"><strong>${entry.points}</strong></td>
      </tr>
    `;
  }

  private renderBracket(bracket: BracketData): string {
    const { rounds } = bracket;
    const roundNames = this.getRoundNames(rounds.length);

    return `
      <div class="bracket-wrapper">
        ${rounds.map((round, index) => `
          <div class="bracket-round">
            <div class="round-header">${roundNames[index]}</div>
            ${round.map((match) => this.renderBracketMatch(match)).join('')}
          </div>
        `).join('')}
      </div>
    `;
  }

  private renderBracketMatch(match: BracketMatch): string {
    const isLive = match.status === 'in_progress';
    const entry1Winner = match.winnerId && match.entry1Name && match.winnerId === match.id + '-1';
    const entry2Winner = match.winnerId && match.entry2Name && match.winnerId === match.id + '-2';

    return `
      <div class="bracket-match ${isLive ? 'live' : ''}">
        <div class="bracket-entry ${entry1Winner ? 'winner' : ''} ${!match.entry1Name ? 'tbd' : ''}">
          <span class="bracket-name">${match.entry1Name ? this.escapeHtml(match.entry1Name) : 'TBD'}</span>
          <span class="bracket-score">${this.formatBracketScore(match, 1)}</span>
        </div>
        <div class="bracket-entry ${entry2Winner ? 'winner' : ''} ${!match.entry2Name ? 'tbd' : ''}">
          <span class="bracket-name">${match.entry2Name ? this.escapeHtml(match.entry2Name) : 'TBD'}</span>
          <span class="bracket-score">${this.formatBracketScore(match, 2)}</span>
        </div>
      </div>
    `;
  }

  private formatBracketScore(match: BracketMatch, entry: 1 | 2): string {
    if (match.status === 'upcoming') {
      return '-';
    }

    if (match.status === 'in_progress') {
      return '<span class="live-badge" style="font-size: 0.625rem;">LIVE</span>';
    }

    const score = entry === 1 ? match.entry1Score : match.entry2Score;
    return score || '-';
  }

  private getRoundNames(totalRounds: number): string[] {
    const names: string[] = [];

    for (let i = 0; i < totalRounds; i++) {
      const remaining = totalRounds - i;
      if (remaining === 1) {
        names.push('Final');
      } else if (remaining === 2) {
        names.push('Semifinals');
      } else if (remaining === 3) {
        names.push('Quarterfinals');
      } else {
        names.push(`Round ${i + 1}`);
      }
    }

    return names;
  }

  private formatCompetitionFormat(format: string): string {
    const map: Record<string, string> = {
      elimination: 'Elimination Bracket',
      single_elimination: 'Single Elimination',
      double_elimination: 'Double Elimination',
      round_robin: 'Round Robin',
      groups: 'Group Stage',
    };
    return map[format] || format;
  }

  private escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  public destroy(): void {
    // No cleanup needed for this component
  }
}
