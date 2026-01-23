/**
 * Entry Form Component
 * Modal form for creating new entries or editing seed
 */

import type {
  Entry,
  EntryType,
  CreateEntryData,
  UpdateEntryData,
  EntryResponse,
} from '../types/entry.js';
import type { Player, Team, PlayerListResponse, TeamListResponse } from '../types/player.js';
import { toast } from './toast.js';

export interface EntryFormOptions {
  divisionId: string;
  clubId: string;
  mode: 'create' | 'edit';
  entry?: Entry;
  existingEntries?: Entry[];
  onSuccess?: (entry: Entry) => void;
  onCancel?: () => void;
}

interface FormErrors {
  entryType?: string;
  player?: string;
  team?: string;
  seed?: string;
}

export class EntryForm {
  private divisionId: string;
  private clubId: string;
  private mode: 'create' | 'edit';
  private entry?: Entry;
  private existingEntries: Entry[];
  private onSuccess?: (entry: Entry) => void;
  private onCancel?: () => void;

  private overlay: HTMLElement | null = null;
  private isSubmitting = false;
  private errors: FormErrors = {};

  private entryType: EntryType = 'singles';
  private players: Player[] = [];
  private teams: Team[] = [];
  private selectedPlayerId: string | null = null;
  private selectedTeamId: string | null = null;
  private isLoadingPlayers = true;
  private isLoadingTeams = true;
  private playerSearchQuery = '';
  private teamSearchQuery = '';
  private showPlayerDropdown = false;
  private showTeamDropdown = false;

  constructor(options: EntryFormOptions) {
    this.divisionId = options.divisionId;
    this.clubId = options.clubId;
    this.mode = options.mode;
    this.entry = options.entry;
    this.existingEntries = options.existingEntries || [];
    this.onSuccess = options.onSuccess;
    this.onCancel = options.onCancel;

    // Set initial entry type from existing entry
    if (this.entry) {
      this.entryType = this.entry.entryType;
      this.selectedPlayerId = this.entry.playerId;
      this.selectedTeamId = this.entry.teamId;
    }

    this.render();
    this.loadData();
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
    const isEdit = this.mode === 'edit';
    const seedValue = this.entry?.seed != null ? this.entry.seed.toString() : '';

    return `
      <div class="modal" style="max-width: 500px;">
        <div class="modal__header">
          <h2 class="modal__title">${isEdit ? 'Edit Entry Seed' : 'Add Entry'}</h2>
          <button class="modal__close" aria-label="Close">&times;</button>
        </div>
        <form id="entry-form" class="modal__body">
          ${isEdit ? this.renderEditForm(seedValue) : this.renderCreateForm(seedValue)}
        </form>
        <div class="modal__footer">
          <button type="button" class="btn btn-outline" id="cancel-btn">Cancel</button>
          <button type="submit" form="entry-form" class="btn btn-primary" id="submit-btn">
            <span class="btn-text">${isEdit ? 'Save Changes' : 'Add Entry'}</span>
            <span class="btn-loading" hidden>Saving...</span>
          </button>
        </div>
      </div>
    `;
  }

  private renderCreateForm(seedValue: string): string {
    return `
      <div class="form-row">
        <label class="form-label form-label--required">Entry Type</label>
        <div class="entry-type-toggle">
          <button type="button" class="entry-type-toggle__btn${this.entryType === 'singles' ? ' entry-type-toggle__btn--active' : ''}"
                  data-type="singles">
            &#128100; Singles
          </button>
          <button type="button" class="entry-type-toggle__btn${this.entryType === 'doubles' ? ' entry-type-toggle__btn--active' : ''}"
                  data-type="doubles">
            &#128101; Doubles
          </button>
        </div>
      </div>

      <div id="player-selector-container" ${this.entryType === 'doubles' ? 'hidden' : ''}>
        ${this.renderPlayerSelector()}
      </div>

      <div id="team-selector-container" ${this.entryType === 'singles' ? 'hidden' : ''}>
        ${this.renderTeamSelector()}
      </div>

      <div class="form-row">
        <label class="form-label" for="entry-seed">Seed (Optional)</label>
        <input
          type="number"
          id="entry-seed"
          class="form-input"
          placeholder="Enter seed number"
          value="${this.escapeHtml(seedValue)}"
          min="1"
          max="999"
        />
        <div class="form-hint">Optional. Seeds determine initial positioning in the draw.</div>
        <div class="form-error" id="seed-error"></div>
      </div>
    `;
  }

  private renderEditForm(seedValue: string): string {
    const entryName = this.getEntryDisplayName();
    const typeIcon = this.entry?.entryType === 'singles' ? '&#128100;' : '&#128101;';

    return `
      <div class="form-row">
        <label class="form-label">Entry</label>
        <div class="entry-form__display">
          <span class="entry-form__type-icon">${typeIcon}</span>
          <span class="entry-form__name">${this.escapeHtml(entryName)}</span>
        </div>
      </div>

      <div class="form-row">
        <label class="form-label" for="entry-seed">Seed</label>
        <input
          type="number"
          id="entry-seed"
          class="form-input"
          placeholder="Enter seed number (or leave empty)"
          value="${this.escapeHtml(seedValue)}"
          min="1"
          max="999"
        />
        <div class="form-hint">Leave empty to remove seed.</div>
        <div class="form-error" id="seed-error"></div>
      </div>
    `;
  }

  private renderPlayerSelector(): string {
    if (this.isLoadingPlayers) {
      return `
        <div class="form-row">
          <label class="form-label form-label--required">Player</label>
          <div class="skeleton skeleton-line" style="height: 42px;"></div>
        </div>
      `;
    }

    const selectedPlayer = this.players.find((p) => p.id === this.selectedPlayerId);
    const filteredPlayers = this.getFilteredPlayers();

    return `
      <div class="form-row">
        <label class="form-label form-label--required">Player</label>
        <div class="searchable-dropdown" id="player-dropdown">
          <input
            type="text"
            class="searchable-dropdown__input"
            placeholder="${selectedPlayer ? this.escapeHtml(selectedPlayer.name) : 'Search for a player...'}"
            value="${this.playerSearchQuery}"
            id="player-search-input"
            autocomplete="off"
          />
          ${this.showPlayerDropdown ? `
            <div class="searchable-dropdown__list">
              ${filteredPlayers.length === 0 ? `
                <div class="searchable-dropdown__empty">No players found</div>
              ` : filteredPlayers.map((player) => {
                const isSelected = player.id === this.selectedPlayerId;
                const isDisabled = this.isPlayerAlreadyEntered(player.id);
                return `
                  <div class="searchable-dropdown__item${isSelected ? ' searchable-dropdown__item--selected' : ''}${isDisabled ? ' searchable-dropdown__item--disabled' : ''}"
                       data-player-id="${player.id}"
                       ${isDisabled ? 'title="Already entered in this division"' : ''}>
                    ${this.escapeHtml(player.name)}
                    ${isDisabled ? '<span class="searchable-dropdown__badge">Already entered</span>' : ''}
                  </div>
                `;
              }).join('')}
            </div>
          ` : ''}
        </div>
        <div class="form-error" id="player-error"></div>
      </div>
    `;
  }

  private renderTeamSelector(): string {
    if (this.isLoadingTeams) {
      return `
        <div class="form-row">
          <label class="form-label form-label--required">Team</label>
          <div class="skeleton skeleton-line" style="height: 42px;"></div>
        </div>
      `;
    }

    const selectedTeam = this.teams.find((t) => t.id === this.selectedTeamId);
    const filteredTeams = this.getFilteredTeams();

    return `
      <div class="form-row">
        <label class="form-label form-label--required">Team</label>
        <div class="searchable-dropdown" id="team-dropdown">
          <input
            type="text"
            class="searchable-dropdown__input"
            placeholder="${selectedTeam ? this.getTeamDisplayName(selectedTeam) : 'Search for a team...'}"
            value="${this.teamSearchQuery}"
            id="team-search-input"
            autocomplete="off"
          />
          ${this.showTeamDropdown ? `
            <div class="searchable-dropdown__list">
              ${filteredTeams.length === 0 ? `
                <div class="searchable-dropdown__empty">No teams found</div>
              ` : filteredTeams.map((team) => {
                const isSelected = team.id === this.selectedTeamId;
                const isDisabled = this.isTeamAlreadyEntered(team.id);
                return `
                  <div class="searchable-dropdown__item${isSelected ? ' searchable-dropdown__item--selected' : ''}${isDisabled ? ' searchable-dropdown__item--disabled' : ''}"
                       data-team-id="${team.id}"
                       ${isDisabled ? 'title="Already entered in this division"' : ''}>
                    ${this.escapeHtml(this.getTeamDisplayName(team))}
                    ${isDisabled ? '<span class="searchable-dropdown__badge">Already entered</span>' : ''}
                  </div>
                `;
              }).join('')}
            </div>
          ` : ''}
        </div>
        <div class="form-error" id="team-error"></div>
      </div>
    `;
  }

  private getEntryDisplayName(): string {
    if (!this.entry) return 'Unknown';

    if (this.entry.entryType === 'singles' && this.entry.player) {
      return this.entry.player.name;
    }
    if (this.entry.entryType === 'doubles' && this.entry.team) {
      return this.getTeamDisplayName(this.entry.team);
    }
    return 'Unknown Entry';
  }

  private getTeamDisplayName(team: Team): string {
    if (team.name) return team.name;
    const p1 = team.player1?.name || 'Unknown';
    const p2 = team.player2?.name || 'Unknown';
    return `${p1} / ${p2}`;
  }

  private getFilteredPlayers(): Player[] {
    if (!this.playerSearchQuery.trim()) {
      return this.players;
    }
    const query = this.playerSearchQuery.toLowerCase().trim();
    return this.players.filter((p) => p.name.toLowerCase().includes(query));
  }

  private getFilteredTeams(): Team[] {
    if (!this.teamSearchQuery.trim()) {
      return this.teams;
    }
    const query = this.teamSearchQuery.toLowerCase().trim();
    return this.teams.filter((t) => this.getTeamDisplayName(t).toLowerCase().includes(query));
  }

  private isPlayerAlreadyEntered(playerId: string): boolean {
    return this.existingEntries.some(
      (e) =>
        e.entryType === 'singles' &&
        e.playerId === playerId &&
        e.status !== 'withdrawn' &&
        e.status !== 'rejected'
    );
  }

  private isTeamAlreadyEntered(teamId: string): boolean {
    return this.existingEntries.some(
      (e) =>
        e.entryType === 'doubles' &&
        e.teamId === teamId &&
        e.status !== 'withdrawn' &&
        e.status !== 'rejected'
    );
  }

  private async loadData(): Promise<void> {
    if (this.mode === 'create') {
      await Promise.all([this.loadPlayers(), this.loadTeams()]);
    }
  }

  private async loadPlayers(): Promise<void> {
    try {
      const response = await fetch(`/api/clubs/${this.clubId}/players`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch players');
      }

      const data: PlayerListResponse = await response.json();
      this.players = data.players || [];
    } catch (error) {
      console.error('Failed to load players:', error);
      toast.error('Failed to load players');
    } finally {
      this.isLoadingPlayers = false;
      this.updatePlayerSelector();
    }
  }

  private async loadTeams(): Promise<void> {
    try {
      const response = await fetch(`/api/clubs/${this.clubId}/teams`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch teams');
      }

      const data: TeamListResponse = await response.json();
      this.teams = data.teams || [];
    } catch (error) {
      console.error('Failed to load teams:', error);
      toast.error('Failed to load teams');
    } finally {
      this.isLoadingTeams = false;
      this.updateTeamSelector();
    }
  }

  private updatePlayerSelector(): void {
    const container = this.overlay?.querySelector('#player-selector-container');
    if (container) {
      container.innerHTML = this.renderPlayerSelector();
      this.bindPlayerSelectorEvents();
    }
  }

  private updateTeamSelector(): void {
    const container = this.overlay?.querySelector('#team-selector-container');
    if (container) {
      container.innerHTML = this.renderTeamSelector();
      this.bindTeamSelectorEvents();
    }
  }

  private bindEvents(): void {
    if (!this.overlay) return;

    // Close button
    const closeBtn = this.overlay.querySelector('.modal__close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }

    // Cancel button
    const cancelBtn = this.overlay.querySelector('#cancel-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.close());
    }

    // Click outside to close
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.close();
      }
    });

    // Form submit
    const form = this.overlay.querySelector('#entry-form') as HTMLFormElement;
    if (form) {
      form.addEventListener('submit', (e) => this.handleSubmit(e));
    }

    // Entry type toggle (for create mode)
    const typeToggleBtns = this.overlay.querySelectorAll('.entry-type-toggle__btn');
    typeToggleBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const type = btn.getAttribute('data-type') as EntryType;
        if (type) {
          this.setEntryType(type);
        }
      });
    });

    // ESC key to close
    document.addEventListener('keydown', this.handleKeyDown);

    // Bind selector events
    this.bindPlayerSelectorEvents();
    this.bindTeamSelectorEvents();

    // Click outside dropdown to close
    document.addEventListener('click', this.handleDocumentClick);
  }

  private bindPlayerSelectorEvents(): void {
    const input = this.overlay?.querySelector('#player-search-input') as HTMLInputElement;
    if (input) {
      input.addEventListener('focus', () => {
        this.showPlayerDropdown = true;
        this.updatePlayerSelector();
      });

      input.addEventListener('input', (e) => {
        this.playerSearchQuery = (e.target as HTMLInputElement).value;
        this.showPlayerDropdown = true;
        this.updatePlayerSelector();
      });
    }

    const items = this.overlay?.querySelectorAll('#player-dropdown .searchable-dropdown__item:not(.searchable-dropdown__item--disabled)');
    items?.forEach((item) => {
      item.addEventListener('click', () => {
        const playerId = item.getAttribute('data-player-id');
        if (playerId) {
          this.selectedPlayerId = playerId;
          this.playerSearchQuery = '';
          this.showPlayerDropdown = false;
          this.updatePlayerSelector();
        }
      });
    });
  }

  private bindTeamSelectorEvents(): void {
    const input = this.overlay?.querySelector('#team-search-input') as HTMLInputElement;
    if (input) {
      input.addEventListener('focus', () => {
        this.showTeamDropdown = true;
        this.updateTeamSelector();
      });

      input.addEventListener('input', (e) => {
        this.teamSearchQuery = (e.target as HTMLInputElement).value;
        this.showTeamDropdown = true;
        this.updateTeamSelector();
      });
    }

    const items = this.overlay?.querySelectorAll('#team-dropdown .searchable-dropdown__item:not(.searchable-dropdown__item--disabled)');
    items?.forEach((item) => {
      item.addEventListener('click', () => {
        const teamId = item.getAttribute('data-team-id');
        if (teamId) {
          this.selectedTeamId = teamId;
          this.teamSearchQuery = '';
          this.showTeamDropdown = false;
          this.updateTeamSelector();
        }
      });
    });
  }

  private handleDocumentClick = (e: MouseEvent): void => {
    const target = e.target as HTMLElement;

    // Close player dropdown if clicking outside
    if (!target.closest('#player-dropdown') && this.showPlayerDropdown) {
      this.showPlayerDropdown = false;
      this.updatePlayerSelector();
    }

    // Close team dropdown if clicking outside
    if (!target.closest('#team-dropdown') && this.showTeamDropdown) {
      this.showTeamDropdown = false;
      this.updateTeamSelector();
    }
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      this.close();
    }
  };

  private setEntryType(type: EntryType): void {
    this.entryType = type;

    // Update toggle buttons
    const toggleBtns = this.overlay?.querySelectorAll('.entry-type-toggle__btn');
    toggleBtns?.forEach((btn) => {
      const btnType = btn.getAttribute('data-type');
      btn.classList.toggle('entry-type-toggle__btn--active', btnType === type);
    });

    // Show/hide selectors
    const playerContainer = this.overlay?.querySelector('#player-selector-container') as HTMLElement;
    const teamContainer = this.overlay?.querySelector('#team-selector-container') as HTMLElement;

    if (playerContainer) {
      playerContainer.hidden = type === 'doubles';
    }
    if (teamContainer) {
      teamContainer.hidden = type === 'singles';
    }

    // Clear selection when switching
    if (type === 'singles') {
      this.selectedTeamId = null;
    } else {
      this.selectedPlayerId = null;
    }
  }

  private async handleSubmit(e: Event): Promise<void> {
    e.preventDefault();

    if (this.isSubmitting) return;

    if (!this.validate()) return;

    this.isSubmitting = true;
    this.setLoading(true);

    try {
      let response: Response;

      if (this.mode === 'create') {
        const data = this.getCreateFormData();
        response = await fetch(`/api/divisions/${this.divisionId}/entries`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(data),
        });
      } else {
        const data = this.getUpdateFormData();
        response = await fetch(`/api/divisions/${this.divisionId}/entries/${this.entry!.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(data),
        });
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to save entry');
      }

      const result: EntryResponse = await response.json();
      toast.success(this.mode === 'create' ? 'Entry added successfully' : 'Entry updated successfully');
      this.close();
      this.onSuccess?.(result.entry);
    } catch (error) {
      console.error('Failed to save entry:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save entry');
    } finally {
      this.isSubmitting = false;
      this.setLoading(false);
    }
  }

  private validate(): boolean {
    this.errors = {};
    let isValid = true;

    if (this.mode === 'create') {
      if (this.entryType === 'singles') {
        if (!this.selectedPlayerId) {
          this.errors.player = 'Please select a player';
          isValid = false;
        } else if (this.isPlayerAlreadyEntered(this.selectedPlayerId)) {
          this.errors.player = 'This player is already entered in this division';
          isValid = false;
        }
      } else {
        if (!this.selectedTeamId) {
          this.errors.team = 'Please select a team';
          isValid = false;
        } else if (this.isTeamAlreadyEntered(this.selectedTeamId)) {
          this.errors.team = 'This team is already entered in this division';
          isValid = false;
        }
      }
    }

    // Validate seed
    const seedInput = this.overlay?.querySelector('#entry-seed') as HTMLInputElement;
    if (seedInput && seedInput.value.trim()) {
      const seedValue = parseInt(seedInput.value.trim(), 10);
      if (isNaN(seedValue) || seedValue < 1 || seedValue > 999) {
        this.errors.seed = 'Seed must be between 1 and 999';
        isValid = false;
      } else {
        // Check for duplicate seed
        const existingSeed = this.existingEntries.find(
          (e) =>
            e.seed === seedValue &&
            e.id !== this.entry?.id &&
            e.status !== 'withdrawn' &&
            e.status !== 'rejected'
        );
        if (existingSeed) {
          this.errors.seed = 'This seed number is already assigned';
          isValid = false;
        }
      }
    }

    this.showErrors();
    return isValid;
  }

  private showErrors(): void {
    // Clear previous errors
    this.overlay?.querySelectorAll('.form-error').forEach((el) => {
      el.textContent = '';
    });
    this.overlay?.querySelectorAll('.form-input').forEach((el) => {
      el.classList.remove('form-input--error');
    });
    this.overlay?.querySelectorAll('.searchable-dropdown__input').forEach((el) => {
      el.classList.remove('form-input--error');
    });

    if (this.errors.player) {
      const el = this.overlay?.querySelector('#player-error');
      const input = this.overlay?.querySelector('#player-search-input');
      if (el) el.textContent = this.errors.player;
      input?.classList.add('form-input--error');
    }

    if (this.errors.team) {
      const el = this.overlay?.querySelector('#team-error');
      const input = this.overlay?.querySelector('#team-search-input');
      if (el) el.textContent = this.errors.team;
      input?.classList.add('form-input--error');
    }

    if (this.errors.seed) {
      const el = this.overlay?.querySelector('#seed-error');
      const input = this.overlay?.querySelector('#entry-seed');
      if (el) el.textContent = this.errors.seed;
      input?.classList.add('form-input--error');
    }
  }

  private getCreateFormData(): CreateEntryData {
    const seedInput = this.overlay?.querySelector('#entry-seed') as HTMLInputElement;

    const data: CreateEntryData = {
      entryType: this.entryType,
    };

    if (this.entryType === 'singles' && this.selectedPlayerId) {
      data.playerId = this.selectedPlayerId;
    } else if (this.entryType === 'doubles' && this.selectedTeamId) {
      data.teamId = this.selectedTeamId;
    }

    if (seedInput?.value.trim()) {
      data.seed = parseInt(seedInput.value.trim(), 10);
    }

    return data;
  }

  private getUpdateFormData(): UpdateEntryData {
    const seedInput = this.overlay?.querySelector('#entry-seed') as HTMLInputElement;

    const data: UpdateEntryData = {};

    if (seedInput?.value.trim()) {
      data.seed = parseInt(seedInput.value.trim(), 10);
    } else {
      data.seed = null;
    }

    return data;
  }

  private setLoading(loading: boolean): void {
    const btn = this.overlay?.querySelector('#submit-btn') as HTMLButtonElement;
    const btnText = btn?.querySelector('.btn-text') as HTMLElement;
    const btnLoading = btn?.querySelector('.btn-loading') as HTMLElement;

    if (btn) {
      btn.disabled = loading;
    }
    if (btnText) {
      btnText.hidden = loading;
    }
    if (btnLoading) {
      btnLoading.hidden = !loading;
    }

    // Disable all buttons while loading
    const allButtons = this.overlay?.querySelectorAll('.modal__footer .btn') as NodeListOf<HTMLButtonElement>;
    allButtons?.forEach((b) => {
      b.disabled = loading;
    });
  }

  close(): void {
    document.removeEventListener('keydown', this.handleKeyDown);
    document.removeEventListener('click', this.handleDocumentClick);

    if (this.overlay) {
      this.overlay.classList.remove('modal-overlay--visible');
      setTimeout(() => {
        this.overlay?.remove();
        this.overlay = null;
        this.onCancel?.();
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
    document.removeEventListener('click', this.handleDocumentClick);
    this.overlay?.remove();
    this.overlay = null;
  }
}
