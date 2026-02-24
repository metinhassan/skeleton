/**
 * Draw Manager Component
 * Main component for the Draw tab - handles draw generation, viewing brackets/standings
 */

import type { Division, DivisionListResponse } from '../types/division.js';
import type { BracketType, DrawWithMatches, Match, Standing, DrawListResponse, DrawResponse, StandingsResponse } from '../types/draw.js';
import { DrawConfigModal } from './draw-config-modal.js';
import { toast } from './toast.js';

export interface DrawManagerOptions {
  container: HTMLElement;
  competitionId: string;
}

type DrawManagerState = 'loading' | 'no-divisions' | 'no-draw' | 'draft' | 'active' | 'completed';
interface SwapSource {
  matchId: string;
  slot: 1 | 2;
  entryId: string;
  bracket: BracketType;
}

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
  private editBracket: BracketType | null = null;
  private swapSource: SwapSource | null = null;
  private isSwapping = false;

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
    const isDoubleElimination = this.currentDraw.drawType === 'double_elimination';
    const showRegenerateButton = this.state === 'active' && !this.hasStartedMatches();

    let bracketHtml: string;
    if (isRoundRobin) {
      bracketHtml = this.renderStandings();
    } else if (isDoubleElimination) {
      bracketHtml = this.renderDoubleEliminationBracket();
    } else {
      bracketHtml = this.renderBracket();
    }

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
        ${bracketHtml}
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

    const showEditButton = this.canEditBracket('winners');
    const isEditingThisBracket = this.editBracket === 'winners';

    return `
      <div class="draw-bracket-section">
        <div class="draw-bracket-header">
          <h3 class="draw-bracket-header__title">Main Bracket</h3>
          ${showEditButton ? `
            <button class="btn btn-outline btn-sm edit-draw-btn" data-bracket="winners">
              ${isEditingThisBracket ? 'Done Editing' : 'Edit Draw'}
            </button>
          ` : ''}
        </div>
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
      </div>
    `;
  }

  private renderDoubleEliminationBracket(): string {
    if (!this.currentDraw) return '';

    const matches = this.currentDraw.matches;
    const wbMatches = matches.filter(m => m.bracket === 'winners');
    const lbMatches = matches.filter(m => m.bracket === 'losers');
    const gfMatches = matches.filter(m => m.bracket === 'grand_final');

    const renderSection = (sectionMatches: Match[], title: string, bracket: BracketType) => {
      const byRound = this.groupMatchesByRound(sectionMatches);
      const rounds = Object.keys(byRound).map(Number).sort((a, b) => a - b);

      if (rounds.length === 0) return '';
      const showEditButton = this.canEditBracket(bracket);
      const isEditingThisBracket = this.editBracket === bracket;

      return `
        <div class="de-section draw-bracket-section">
          <div class="draw-bracket-header">
            <h3 class="draw-bracket-header__title de-section__title">${title}</h3>
            ${showEditButton ? `
              <button class="btn btn-outline btn-sm edit-draw-btn" data-bracket="${bracket}">
                ${isEditingThisBracket ? 'Done Editing' : 'Edit Draw'}
              </button>
            ` : ''}
          </div>
          <div class="bracket-wrapper">
            ${rounds.map(roundNum => {
              const roundMatches = byRound[roundNum];
              return `
                <div class="bracket-round">
                  <div class="round-header">Round ${roundNum}</div>
                  <div class="bracket-matches">
                    ${roundMatches.map(match => this.renderBracketMatch(match)).join('')}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    };

    return `
      <div class="double-elimination">
        ${renderSection(wbMatches, 'Winners Bracket', 'winners')}
        ${renderSection(lbMatches, 'Losers Bracket', 'losers')}
        ${gfMatches.length > 0 ? `
          ${renderSection(gfMatches, 'Grand Final', 'grand_final')}
        ` : ''}
      </div>
    `;
  }

  private renderBracketMatch(match: Match): string {
    const entry1Name = match.entry1Name || (match.entry1Id ? 'TBD' : 'BYE');
    const entry2Name = match.entry2Name || (match.entry2Id ? 'TBD' : 'BYE');
    const isLive = match.status === 'in_progress';
    const isCompleted = match.status === 'completed' || match.status === 'walkover';
    const isBye = match.status === 'bye';
    const bracket = this.getMatchBracket(match);

    const entry1IsWinner = match.winnerId && match.winnerId === match.entry1Id;
    const entry2IsWinner = match.winnerId && match.winnerId === match.entry2Id;
    const entry1Editable = this.isEntryEditable(match, 1);
    const entry2Editable = this.isEntryEditable(match, 2);

    const showScoreBtn = (this.state === 'active' || this.state === 'completed') && !isBye && match.entry1Id && match.entry2Id;
    const scoreBtnLabel = match.status === 'in_progress' ? 'Continue Scoring' : isCompleted ? 'View Score' : 'Score';

    return `
      <div class="bracket-match${isLive ? ' live' : ''}${isBye ? ' bye' : ''}">
        <div
          class="bracket-entry${entry1IsWinner ? ' winner' : ''}${!match.entry1Id ? ' tbd' : ''}${entry1Editable ? ' bracket-entry--editable' : ''}"
          data-swap-entry="true"
          data-match-id="${match.id}"
          data-entry-id="${match.entry1Id || ''}"
          data-slot="1"
          data-bracket="${bracket}"
        >
          <span class="bracket-name">${this.escapeHtml(entry1Name)}</span>
          ${this.renderSwapDropdown(match, 1)}
          ${isCompleted && match.entry1Score !== null ? `<span class="bracket-score">${match.entry1Score}</span>` : ''}
        </div>
        <div
          class="bracket-entry${entry2IsWinner ? ' winner' : ''}${!match.entry2Id ? ' tbd' : ''}${entry2Editable ? ' bracket-entry--editable' : ''}"
          data-swap-entry="true"
          data-match-id="${match.id}"
          data-entry-id="${match.entry2Id || ''}"
          data-slot="2"
          data-bracket="${bracket}"
        >
          <span class="bracket-name">${this.escapeHtml(entry2Name)}</span>
          ${this.renderSwapDropdown(match, 2)}
          ${isCompleted && match.entry2Score !== null ? `<span class="bracket-score">${match.entry2Score}</span>` : ''}
        </div>
        ${showScoreBtn ? `
          <div class="bracket-match__actions">
            <button class="btn btn-sm btn-outline score-match-btn" data-match-id="${match.id}">${scoreBtnLabel}</button>
          </div>
        ` : ''}
      </div>
    `;
  }

  private renderSwapDropdown(match: Match, slot: 1 | 2): string {
    if (!this.swapSource || this.swapSource.matchId !== match.id || this.swapSource.slot !== slot) {
      return '';
    }

    const options = this.getSwapCandidates(this.swapSource);
    return `
      <select class="draw-swap-select" data-swap-select="true" data-match-id="${match.id}" data-slot="${slot}">
        <option value="">Swap with...</option>
        ${options
          .map((candidate) => `
            <option value="${candidate.matchId}|${candidate.slot}|${candidate.entryId}|${candidate.bracket}">
              ${this.escapeHtml(candidate.label)}
            </option>
          `)
          .join('')}
      </select>
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
    const isBye = match.status === 'bye';

    const showScoreBtn = (this.state === 'active' || this.state === 'completed') && !isBye && match.entry1Id && match.entry2Id;
    const scoreBtnLabel = match.status === 'in_progress' ? 'Continue Scoring' : isCompleted ? 'View Score' : 'Score';

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
        ${showScoreBtn ? `<button class="btn btn-sm btn-outline score-match-btn" data-match-id="${match.id}">${scoreBtnLabel}</button>` : ''}
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
      (m) => m.status === 'in_progress' || m.status === 'completed' || m.status === 'walkover'
    );
  }

  private getMatchBracket(match: Match): BracketType {
    return match.bracket || 'winners';
  }

  private canEditBracket(bracket: BracketType): boolean {
    if (!this.currentDraw) return false;
    if (this.currentDraw.drawType !== 'single_elimination' && this.currentDraw.drawType !== 'double_elimination') {
      return false;
    }
    if (this.state === 'completed' || this.hasStartedMatches()) return false;

    let editableEntries = 0;
    for (const match of this.currentDraw.matches) {
      if (
        this.getMatchBracket(match) !== bracket ||
        match.roundNumber !== 1 ||
        (match.status !== 'not_started' && match.status !== 'bye')
      ) {
        continue;
      }
      if (match.entry1Id) editableEntries++;
      if (match.entry2Id) editableEntries++;
      if (editableEntries > 1) return true;
    }

    return false;
  }

  private isEntryEditable(match: Match, slot: 1 | 2): boolean {
    if (!this.currentDraw) return false;
    if (this.editBracket !== this.getMatchBracket(match)) return false;
    if (match.roundNumber !== 1) return false;
    if (match.status !== 'not_started' && match.status !== 'bye') return false;
    return slot === 1 ? !!match.entry1Id : !!match.entry2Id;
  }

  private getSwapCandidates(source: SwapSource): Array<SwapSource & { label: string }> {
    if (!this.currentDraw) return [];

    const entries: Array<SwapSource & { label: string }> = [];
    for (const match of this.currentDraw.matches) {
      if (this.getMatchBracket(match) !== source.bracket || match.roundNumber !== 1) {
        continue;
      }
      if (match.status !== 'not_started' && match.status !== 'bye') {
        continue;
      }

      if (match.entry1Id) {
        entries.push({
          matchId: match.id,
          slot: 1,
          entryId: match.entry1Id,
          bracket: source.bracket,
          label: match.entry1Name || 'Unknown Entry',
        });
      }
      if (match.entry2Id) {
        entries.push({
          matchId: match.id,
          slot: 2,
          entryId: match.entry2Id,
          bracket: source.bracket,
          label: match.entry2Name || 'Unknown Entry',
        });
      }
    }

    return entries.filter((entry) => entry.entryId !== source.entryId);
  }

  private handleToggleEditBracket(bracket: BracketType): void {
    if (!this.canEditBracket(bracket)) return;
    if (this.editBracket === bracket) {
      this.editBracket = null;
      this.swapSource = null;
    } else {
      this.editBracket = bracket;
      this.swapSource = null;
    }
    this.updateContent();
  }

  private handleSwapEntryClick(entryEl: HTMLElement): void {
    if (this.isSwapping) return;
    const matchId = entryEl.dataset.matchId;
    const entryId = entryEl.dataset.entryId;
    const slot = entryEl.dataset.slot;
    const bracket = entryEl.dataset.bracket as BracketType | undefined;
    if (!matchId || !entryId || !slot || !bracket) return;

    const match = this.currentDraw?.matches.find((m) => m.id === matchId);
    if (!match) return;

    const parsedSlot = slot === '1' ? 1 : slot === '2' ? 2 : null;
    if (!parsedSlot || !this.isEntryEditable(match, parsedSlot)) return;

    if (
      this.swapSource &&
      this.swapSource.matchId === matchId &&
      this.swapSource.slot === parsedSlot
    ) {
      this.swapSource = null;
    } else {
      this.swapSource = {
        matchId,
        slot: parsedSlot,
        entryId,
        bracket,
      };
    }

    this.updateContent();
  }

  private async handleSwapSelectChange(selectEl: HTMLSelectElement): Promise<void> {
    if (!this.swapSource || this.isSwapping) return;
    const value = selectEl.value;
    if (!value) {
      this.swapSource = null;
      this.updateContent();
      return;
    }

    const [matchId, slotRaw, entryId, bracketRaw] = value.split('|');
    const slot = slotRaw === '1' ? 1 : slotRaw === '2' ? 2 : null;
    const bracket = bracketRaw as BracketType;

    if (!matchId || !slot || !entryId || !bracket) {
      toast.error('Invalid swap target');
      return;
    }

    await this.submitSwap({
      matchId,
      slot,
      entryId,
      bracket,
    });
  }

  private async submitSwap(target: SwapSource): Promise<void> {
    if (!this.currentDraw || !this.swapSource || this.swapSource.bracket !== target.bracket) return;

    this.isSwapping = true;
    try {
      const response = await fetch(`/api/draws/${this.currentDraw.id}/swap-entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          bracket: this.swapSource.bracket,
          entry1Id: this.swapSource.entryId,
          entry2Id: target.entryId,
        }),
      });

      if (!response.ok) {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Failed to swap entries (${response.status})`);
        }
        throw new Error(`Failed to swap entries (${response.status}). Ensure API route /api/draws/:drawId/swap-entries is available.`);
      }

      this.swapSource = null;
      toast.success('Draw updated');
      await this.loadDrawForDivision(true);
    } catch (error) {
      console.error('Failed to swap entries:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to swap entries');
    } finally {
      this.isSwapping = false;
    }
  }

  private resetEditState(): void {
    this.editBracket = null;
    this.swapSource = null;
    this.isSwapping = false;
  }

  private bindEvents(): void {
    // Division selector
    const divisionSelect = this.container.querySelector('#draw-division-select') as HTMLSelectElement;
    if (divisionSelect) {
      divisionSelect.addEventListener('change', () => {
        this.selectedDivisionId = divisionSelect.value;
        this.resetEditState();
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

    this.container.querySelectorAll('.edit-draw-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const bracket = (btn as HTMLElement).dataset.bracket as BracketType | undefined;
        if (bracket) this.handleToggleEditBracket(bracket);
      });
    });

    this.container.querySelectorAll('[data-swap-entry="true"]').forEach((entry) => {
      entry.addEventListener('click', () => this.handleSwapEntryClick(entry as HTMLElement));
    });

    this.container.querySelectorAll('[data-swap-select="true"]').forEach((select) => {
      select.addEventListener('click', (event) => event.stopPropagation());
      select.addEventListener('change', () => this.handleSwapSelectChange(select as HTMLSelectElement));
    });

    // Score match buttons
    this.container.querySelectorAll('.score-match-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const matchId = (btn as HTMLElement).dataset.matchId;
        const match = this.currentDraw?.matches.find(m => m.id === matchId);
        if (match) this.showScoreModal(match);
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

  private async loadDrawForDivision(preserveScroll = false): Promise<void> {
    if (!this.selectedDivisionId) return;

    const mainEl = document.querySelector('.app-shell__main');
    const savedScrollTop = mainEl?.scrollTop ?? 0;

    if (!preserveScroll) {
      this.state = 'loading';
      this.updateContent();
    }

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
        this.resetEditState();
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
      this.resetEditState();
      this.state = 'no-draw';
      this.currentDraw = null;
    } finally {
      this.updateContent();
      if (preserveScroll && mainEl) {
        requestAnimationFrame(() => {
          mainEl.scrollTop = savedScrollTop;
        });
      }
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

      if (!this.editBracket || !this.canEditBracket(this.editBracket)) {
        this.editBracket = null;
        this.swapSource = null;
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
      this.resetEditState();
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

  private showScoreModal(match: Match): void {
    const isCompleted = match.status === 'completed' || match.status === 'walkover';
    const isWalkover = match.status === 'walkover';
    const entry1Name = match.entry1Name || 'Entry 1';
    const entry2Name = match.entry2Name || 'Entry 2';

    // Pre-fill scores from existing match data
    const existingScore: number[][] = match.score && Array.isArray(match.score) ? match.score : [];

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay modal-overlay--visible';
    overlay.innerHTML = `
      <div class="modal score-modal" style="max-width: 440px;">
        <div class="modal__header">
          <h2 class="modal__title">${isCompleted ? 'Match Score' : 'Enter Score'}</h2>
          <button class="modal__close" aria-label="Close">&times;</button>
        </div>
        <div class="modal__body">
          <div class="score-modal__matchup">
            <span class="score-modal__entry-name">${this.escapeHtml(entry1Name)}</span>
            <span class="score-modal__vs">vs</span>
            <span class="score-modal__entry-name">${this.escapeHtml(entry2Name)}</span>
          </div>

          <label class="score-modal__walkover">
            <input type="checkbox" id="score-walkover" ${isWalkover ? 'checked' : ''} ${isCompleted ? 'disabled' : ''}>
            <span>Walkover</span>
          </label>

          <div class="score-modal__sets" id="score-sets">
            ${[0, 1, 2].map(i => `
              <div class="score-modal__set-row">
                <span class="score-modal__set-label">Set ${i + 1}</span>
                <input type="number" class="score-modal__set-input" id="score-e1-set${i}"
                  min="0" max="99" value="${existingScore[i]?.[0] ?? ''}"
                  ${isCompleted ? 'readonly' : ''} ${isWalkover ? 'disabled' : ''}>
                <span class="score-modal__dash">&ndash;</span>
                <input type="number" class="score-modal__set-input" id="score-e2-set${i}"
                  min="0" max="99" value="${existingScore[i]?.[1] ?? ''}"
                  ${isCompleted ? 'readonly' : ''} ${isWalkover ? 'disabled' : ''}>
              </div>
            `).join('')}
          </div>

          <div class="score-modal__winner">
            <span class="score-modal__winner-label">Winner:</span>
            <label class="score-modal__winner-option">
              <input type="radio" name="score-winner" value="${match.entry1Id}"
                ${match.winnerId === match.entry1Id ? 'checked' : ''} ${isCompleted ? 'disabled' : ''}>
              <span>${this.escapeHtml(entry1Name)}</span>
            </label>
            <label class="score-modal__winner-option">
              <input type="radio" name="score-winner" value="${match.entry2Id}"
                ${match.winnerId === match.entry2Id ? 'checked' : ''} ${isCompleted ? 'disabled' : ''}>
              <span>${this.escapeHtml(entry2Name)}</span>
            </label>
          </div>
        </div>
        <div class="modal__footer">
          ${isCompleted ? `
            <button class="btn btn-outline" id="score-clear" style="color: var(--color-error); border-color: var(--color-error);">Clear Result</button>
            <button class="btn btn-outline" id="score-cancel">Close</button>
          ` : `
            <button class="btn btn-outline" id="score-cancel">Cancel</button>
            <button class="btn btn-primary" id="score-save">Save</button>
          `}
        </div>
      </div>
    `;

    const cleanup = () => {
      overlay.classList.remove('modal-overlay--visible');
      setTimeout(() => overlay.remove(), 200);
    };

    // Close handlers
    overlay.querySelector('.modal__close')?.addEventListener('click', cleanup);
    overlay.querySelector('#score-cancel')?.addEventListener('click', cleanup);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cleanup();
    });

    // Walkover toggle
    const walkoverCheckbox = overlay.querySelector('#score-walkover') as HTMLInputElement;
    const setInputs = overlay.querySelectorAll('.score-modal__set-input') as NodeListOf<HTMLInputElement>;

    if (walkoverCheckbox && !isCompleted) {
      walkoverCheckbox.addEventListener('change', () => {
        setInputs.forEach(input => {
          input.disabled = walkoverCheckbox.checked;
          if (walkoverCheckbox.checked) input.value = '';
        });
      });
    }

    // Auto-detect winner from scores
    if (!isCompleted) {
      const autoDetectWinner = () => {
        if (walkoverCheckbox?.checked) return;
        let e1Sets = 0;
        let e2Sets = 0;
        for (let i = 0; i < 3; i++) {
          const e1 = parseInt((overlay.querySelector(`#score-e1-set${i}`) as HTMLInputElement)?.value) || 0;
          const e2 = parseInt((overlay.querySelector(`#score-e2-set${i}`) as HTMLInputElement)?.value) || 0;
          if (e1 > 0 || e2 > 0) {
            if (e1 > e2) e1Sets++;
            else if (e2 > e1) e2Sets++;
          }
        }
        if (e1Sets > e2Sets) {
          const radio = overlay.querySelector(`input[name="score-winner"][value="${match.entry1Id}"]`) as HTMLInputElement;
          if (radio) radio.checked = true;
        } else if (e2Sets > e1Sets) {
          const radio = overlay.querySelector(`input[name="score-winner"][value="${match.entry2Id}"]`) as HTMLInputElement;
          if (radio) radio.checked = true;
        }
      };

      setInputs.forEach(input => {
        input.addEventListener('input', autoDetectWinner);
      });
    }

    // Save handler
    overlay.querySelector('#score-save')?.addEventListener('click', async () => {
      const winnerId = (overlay.querySelector('input[name="score-winner"]:checked') as HTMLInputElement)?.value;
      if (!winnerId) {
        toast.error('Please select a winner');
        return;
      }

      const isWalkoverEntry = walkoverCheckbox?.checked;
      const score: number[][] = [];

      if (!isWalkoverEntry) {
        for (let i = 0; i < 3; i++) {
          const e1 = parseInt((overlay.querySelector(`#score-e1-set${i}`) as HTMLInputElement)?.value);
          const e2 = parseInt((overlay.querySelector(`#score-e2-set${i}`) as HTMLInputElement)?.value);
          if (!isNaN(e1) && !isNaN(e2)) {
            score.push([e1, e2]);
          }
        }
        if (score.length === 0) {
          toast.error('Please enter at least one set score');
          return;
        }
      }

      const saveBtn = overlay.querySelector('#score-save') as HTMLButtonElement;
      if (saveBtn) saveBtn.disabled = true;

      try {
        const response = await fetch(`/api/matches/${match.id}/result`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            winnerId,
            score: isWalkoverEntry ? undefined : score,
            status: isWalkoverEntry ? 'walkover' : 'completed',
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to save score');
        }

        cleanup();
        toast.success('Score saved successfully');
        this.loadDrawForDivision(true);
      } catch (error) {
        console.error('Failed to save score:', error);
        toast.error(error instanceof Error ? error.message : 'Failed to save score');
        if (saveBtn) saveBtn.disabled = false;
      }
    });

    // Clear result handler
    overlay.querySelector('#score-clear')?.addEventListener('click', async () => {
      const clearBtn = overlay.querySelector('#score-clear') as HTMLButtonElement;
      if (clearBtn) clearBtn.disabled = true;

      try {
        const response = await fetch(`/api/matches/${match.id}/result`, {
          method: 'DELETE',
          credentials: 'include',
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to clear result');
        }

        cleanup();
        toast.success('Result cleared');
        this.loadDrawForDivision(true);
      } catch (error) {
        console.error('Failed to clear result:', error);
        toast.error(error instanceof Error ? error.message : 'Failed to clear result');
        if (clearBtn) clearBtn.disabled = false;
      }
    });

    document.body.appendChild(overlay);
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
