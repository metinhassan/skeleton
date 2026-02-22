/**
 * Player List Component
 * Displays club player roster with search and team management
 */

import type {
  Player,
  Team,
  PlayerListResponse,
  TeamListResponse,
} from '../types/player.js';
import { toast } from './toast.js';

export interface PlayerListOptions {
  container: HTMLElement;
  clubId: string;
  onCreatePlayer?: () => void;
  onEditPlayer?: (player: Player) => void;
  onDeletePlayer?: (player: Player) => void;
  onCreateTeam?: () => void;
  onEditTeam?: (team: Team) => void;
  onDeleteTeam?: (team: Team) => void;
  onBulkAddPlayers?: (playerIds: string[]) => void;
}

type TabType = 'players' | 'teams';
type SortField = 'name' | 'email';
type SortDirection = 'asc' | 'desc';

export class PlayerList {
  private container: HTMLElement;
  private clubId: string;
  private onCreatePlayer?: () => void;
  private onEditPlayer?: (player: Player) => void;
  private onDeletePlayer?: (player: Player) => void;
  private onCreateTeam?: () => void;
  private onEditTeam?: (team: Team) => void;
  private onDeleteTeam?: (team: Team) => void;
  private onBulkAddPlayers?: (playerIds: string[]) => void;

  private players: Player[] = [];
  private teams: Team[] = [];
  private isLoading = true;
  private activeTab: TabType = 'players';
  private searchQuery = '';
  private searchTimeout: ReturnType<typeof setTimeout> | null = null;
  private sortField: SortField = 'name';
  private sortDirection: SortDirection = 'asc';
  private isSelectionMode = false;
  private selectedPlayerIds: Set<string> = new Set();

  constructor(options: PlayerListOptions) {
    this.container = options.container;
    this.clubId = options.clubId;
    this.onCreatePlayer = options.onCreatePlayer;
    this.onEditPlayer = options.onEditPlayer;
    this.onDeletePlayer = options.onDeletePlayer;
    this.onCreateTeam = options.onCreateTeam;
    this.onEditTeam = options.onEditTeam;
    this.onDeleteTeam = options.onDeleteTeam;
    this.onBulkAddPlayers = options.onBulkAddPlayers;

    this.render();
    this.fetchPlayers();
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="player-list-container">
        <div class="player-list__header">
          <div style="display: flex; align-items: center; gap: 1rem;">
            <h2 class="player-list__title">Players</h2>
            <div class="tab-toggle">
              <button class="tab-toggle__btn ${this.activeTab === 'players' ? 'tab-toggle__btn--active' : ''}" data-tab="players">
                Players
              </button>
              <button class="tab-toggle__btn ${this.activeTab === 'teams' ? 'tab-toggle__btn--active' : ''}" data-tab="teams">
                Teams
              </button>
            </div>
          </div>
          <div class="player-list__actions">
            ${this.activeTab === 'players' ? this.renderPlayerActions() : `
              <button class="btn btn-primary" id="create-team-btn">
                + Create Team
              </button>
            `}
          </div>
        </div>
        ${this.isSelectionMode ? `
          <div class="player-list__selection-bar">
            <span>${this.selectedPlayerIds.size} player${this.selectedPlayerIds.size !== 1 ? 's' : ''} selected</span>
            <button class="btn btn-primary" id="bulk-add-btn" ${this.selectedPlayerIds.size === 0 ? 'disabled' : ''}>
              Add to competition${this.selectedPlayerIds.size > 0 ? ` (${this.selectedPlayerIds.size})` : ''}
            </button>
          </div>
        ` : ''}
        <div id="player-content">
          ${this.isLoading ? this.renderSkeleton() : this.renderContent()}
        </div>
      </div>
    `;

    this.bindEvents();
  }

  private renderPlayerActions(): string {
    if (this.isSelectionMode) {
      return `
        <div class="player-search">
          <span class="player-search__icon">&#128269;</span>
          <input
            type="text"
            class="player-search__input"
            placeholder="Search players..."
            id="player-search"
            value="${this.escapeHtml(this.searchQuery)}"
          />
        </div>
        <button class="btn btn-outline" id="cancel-selection-btn">
          Cancel Selection
        </button>
      `;
    }

    return `
      <div class="player-search">
        <span class="player-search__icon">&#128269;</span>
        <input
          type="text"
          class="player-search__input"
          placeholder="Search players..."
          id="player-search"
          value="${this.escapeHtml(this.searchQuery)}"
        />
      </div>
      ${this.onBulkAddPlayers ? `
        <button class="btn btn-outline" id="select-players-btn">
          Select Players
        </button>
      ` : ''}
      <button class="btn btn-primary" id="add-player-btn">
        + Add Player
      </button>
    `;
  }

  private renderSkeleton(): string {
    if (this.activeTab === 'players') {
      return `
        <div class="player-table">
          <table style="width: 100%;">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${Array(5).fill(0).map(() => `
                <tr class="player-skeleton">
                  <td><div class="skeleton skeleton-line" style="width: 120px; height: 1rem;"></div></td>
                  <td><div class="skeleton skeleton-line" style="width: 150px; height: 1rem;"></div></td>
                  <td><div class="skeleton skeleton-line" style="width: 100px; height: 1rem;"></div></td>
                  <td><div class="skeleton skeleton-line" style="width: 60px; height: 1rem;"></div></td>
                  <td><div class="skeleton skeleton-line" style="width: 80px; height: 1rem;"></div></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    return `
      <div class="team-list">
        ${Array(4).fill(0).map(() => `
          <div class="team-card">
            <div class="skeleton skeleton-line" style="width: 60%; height: 1.25rem; margin-bottom: 0.75rem;"></div>
            <div class="skeleton skeleton-line" style="width: 80%; height: 0.875rem; margin-bottom: 0.5rem;"></div>
            <div class="skeleton skeleton-line" style="width: 80%; height: 0.875rem;"></div>
          </div>
        `).join('')}
      </div>
    `;
  }

  private renderContent(): string {
    if (this.activeTab === 'players') {
      return this.renderPlayersContent();
    }
    return this.renderTeamsContent();
  }

  private renderPlayersContent(): string {
    const filteredPlayers = this.getFilteredPlayers();

    if (filteredPlayers.length === 0) {
      if (this.searchQuery) {
        return `
          <div class="player-empty">
            <div class="player-empty__icon">&#128269;</div>
            <h3 class="player-empty__title">No players found</h3>
            <p class="player-empty__description">
              No players match "${this.escapeHtml(this.searchQuery)}". Try a different search.
            </p>
          </div>
        `;
      }

      return `
        <div class="player-empty">
          <div class="player-empty__icon">&#128101;</div>
          <h3 class="player-empty__title">No players yet</h3>
          <p class="player-empty__description">
            Add players to your club roster so they can be entered into competitions.
          </p>
          <button class="btn btn-primary" id="empty-add-player-btn">
            + Add Player
          </button>
        </div>
      `;
    }

    const sortedPlayers = this.getSortedPlayers(filteredPlayers);
    const tableClass = this.isSelectionMode ? 'player-table player-table--selection-mode' : 'player-table';

    return `
      <div class="${tableClass}">
        <table style="width: 100%;">
          <thead>
            <tr>
              <th class="sortable-header" data-sort="name">
                Name ${this.renderSortIndicator('name')}
              </th>
              <th class="sortable-header" data-sort="email">
                Email ${this.renderSortIndicator('email')}
              </th>
              <th>Phone</th>
              <th>Status</th>
              ${this.isSelectionMode ? '' : '<th></th>'}
            </tr>
          </thead>
          <tbody>
            ${sortedPlayers.map(player => this.renderPlayerRow(player)).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  private renderPlayerRow(player: Player): string {
    const isSelected = this.selectedPlayerIds.has(player.id);

    if (this.isSelectionMode) {
      return `
        <tr data-player-id="${player.id}" class="${isSelected ? 'player-row--selected' : ''}" aria-selected="${isSelected}" tabindex="0">
          <td class="player-table__name">${this.escapeHtml(player.name)}</td>
          <td class="player-table__email">${player.email ? this.escapeHtml(player.email) : '-'}</td>
          <td class="player-table__phone">${player.phone ? this.escapeHtml(player.phone) : '-'}</td>
          <td>
            ${player.userId
              ? '<span class="linked-badge linked-badge--linked">Linked</span>'
              : '<span class="linked-badge linked-badge--unlinked">Unlinked</span>'
            }
          </td>
        </tr>
      `;
    }

    return `
      <tr data-player-id="${player.id}">
        <td class="player-table__name">${this.escapeHtml(player.name)}</td>
        <td class="player-table__email">${player.email ? this.escapeHtml(player.email) : '-'}</td>
        <td class="player-table__phone">${player.phone ? this.escapeHtml(player.phone) : '-'}</td>
        <td>
          ${player.userId
            ? '<span class="linked-badge linked-badge--linked">Linked</span>'
            : '<span class="linked-badge linked-badge--unlinked">Unlinked</span>'
          }
        </td>
        <td class="player-table__cell--actions">
          <button class="btn btn-outline edit-player-btn" data-player-id="${player.id}">Edit</button>
          <button class="btn btn-outline delete-player-btn" data-player-id="${player.id}">Delete</button>
        </td>
      </tr>
    `;
  }

  private renderTeamsContent(): string {
    if (this.teams.length === 0) {
      return `
        <div class="player-empty">
          <div class="player-empty__icon">&#128107;</div>
          <h3 class="player-empty__title">No teams yet</h3>
          <p class="player-empty__description">
            Create doubles teams by pairing two players together.
          </p>
          <button class="btn btn-primary" id="empty-create-team-btn">
            + Create Team
          </button>
        </div>
      `;
    }

    return `
      <div class="team-list">
        ${this.teams.map(team => this.renderTeamCard(team)).join('')}
      </div>
    `;
  }

  private renderTeamCard(team: Team): string {
    const player1Name = team.player1?.name || 'Unknown';
    const player2Name = team.player2?.name || 'Unknown';

    return `
      <div class="team-card" data-team-id="${team.id}">
        <div class="team-card__name">${this.escapeHtml(team.name)}</div>
        <div class="team-card__players">
          <div class="team-card__player">
            <span class="team-card__player-icon">1</span>
            ${this.escapeHtml(player1Name)}
          </div>
          <div class="team-card__player">
            <span class="team-card__player-icon">2</span>
            ${this.escapeHtml(player2Name)}
          </div>
        </div>
        <div class="team-card__actions">
          <button class="btn btn-outline edit-team-btn" data-team-id="${team.id}">Edit</button>
          <button class="btn btn-outline delete-team-btn" data-team-id="${team.id}">Delete</button>
        </div>
      </div>
    `;
  }

  private bindEvents(): void {
    // Tab toggle
    const tabBtns = this.container.querySelectorAll('.tab-toggle__btn');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab') as TabType;
        if (tab !== this.activeTab) {
          this.activeTab = tab;
          if (this.isSelectionMode) {
            this.isSelectionMode = false;
            this.selectedPlayerIds.clear();
          }
          if (tab === 'teams' && this.teams.length === 0) {
            this.fetchTeams();
          }
          this.render();
        }
      });
    });

    // Search input
    const searchInput = this.container.querySelector('#player-search') as HTMLInputElement;
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const value = (e.target as HTMLInputElement).value;
        this.handleSearch(value);
      });
    }

    // Add player button
    const addPlayerBtn = this.container.querySelector('#add-player-btn');
    if (addPlayerBtn) {
      addPlayerBtn.addEventListener('click', () => this.onCreatePlayer?.());
    }

    // Empty state add button
    const emptyAddBtn = this.container.querySelector('#empty-add-player-btn');
    if (emptyAddBtn) {
      emptyAddBtn.addEventListener('click', () => this.onCreatePlayer?.());
    }

    // Create team button
    const createTeamBtn = this.container.querySelector('#create-team-btn');
    if (createTeamBtn) {
      createTeamBtn.addEventListener('click', () => this.onCreateTeam?.());
    }

    // Empty state create team button
    const emptyCreateTeamBtn = this.container.querySelector('#empty-create-team-btn');
    if (emptyCreateTeamBtn) {
      emptyCreateTeamBtn.addEventListener('click', () => this.onCreateTeam?.());
    }

    // Select players button
    const selectPlayersBtn = this.container.querySelector('#select-players-btn');
    if (selectPlayersBtn) {
      selectPlayersBtn.addEventListener('click', () => {
        this.isSelectionMode = true;
        this.selectedPlayerIds.clear();
        this.render();
      });
    }

    // Cancel selection button
    const cancelSelectionBtn = this.container.querySelector('#cancel-selection-btn');
    if (cancelSelectionBtn) {
      cancelSelectionBtn.addEventListener('click', () => {
        this.isSelectionMode = false;
        this.selectedPlayerIds.clear();
        this.render();
      });
    }

    // Bulk add button
    const bulkAddBtn = this.container.querySelector('#bulk-add-btn');
    if (bulkAddBtn) {
      bulkAddBtn.addEventListener('click', () => {
        if (this.selectedPlayerIds.size > 0) {
          this.onBulkAddPlayers?.(Array.from(this.selectedPlayerIds));
        }
      });
    }

    this.bindRowEvents();
  }

  private bindRowEvents(): void {
    // Sort headers
    const sortHeaders = this.container.querySelectorAll('.sortable-header');
    sortHeaders.forEach(th => {
      th.addEventListener('click', () => {
        const field = th.getAttribute('data-sort') as SortField;
        if (field) this.handleSort(field);
      });
    });

    // Empty state buttons (inside #player-content, need rebinding after updateContent)
    const emptyAddPlayerBtn = this.container.querySelector('#empty-add-player-btn');
    if (emptyAddPlayerBtn) {
      emptyAddPlayerBtn.addEventListener('click', () => this.onCreatePlayer?.());
    }

    const emptyCreateTeamBtn = this.container.querySelector('#empty-create-team-btn');
    if (emptyCreateTeamBtn) {
      emptyCreateTeamBtn.addEventListener('click', () => this.onCreateTeam?.());
    }

    if (this.isSelectionMode) {
      // Selection mode: row clicks toggle selection
      const rows = this.container.querySelectorAll('tr[data-player-id]');
      rows.forEach(row => {
        row.addEventListener('click', () => {
          const id = row.getAttribute('data-player-id');
          if (id) this.toggleSelection(id);
        });
        row.addEventListener('keydown', (e) => {
          if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
            e.preventDefault();
            const id = row.getAttribute('data-player-id');
            if (id) this.toggleSelection(id);
          }
        });
      });
    } else {
      // Normal mode: edit/delete buttons
      const editPlayerBtns = this.container.querySelectorAll('.edit-player-btn');
      editPlayerBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = btn.getAttribute('data-player-id');
          const player = this.players.find(p => p.id === id);
          if (player) {
            this.onEditPlayer?.(player);
          }
        });
      });

      const deletePlayerBtns = this.container.querySelectorAll('.delete-player-btn');
      deletePlayerBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = btn.getAttribute('data-player-id');
          const player = this.players.find(p => p.id === id);
          if (player) {
            this.onDeletePlayer?.(player);
          }
        });
      });
    }

    // Edit team buttons
    const editTeamBtns = this.container.querySelectorAll('.edit-team-btn');
    editTeamBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-team-id');
        const team = this.teams.find(t => t.id === id);
        if (team) {
          this.onEditTeam?.(team);
        }
      });
    });

    // Delete team buttons
    const deleteTeamBtns = this.container.querySelectorAll('.delete-team-btn');
    deleteTeamBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-team-id');
        const team = this.teams.find(t => t.id === id);
        if (team) {
          this.onDeleteTeam?.(team);
        }
      });
    });
  }

  private toggleSelection(playerId: string): void {
    if (this.selectedPlayerIds.has(playerId)) {
      this.selectedPlayerIds.delete(playerId);
    } else {
      this.selectedPlayerIds.add(playerId);
    }
    this.render();
  }

  exitSelectionMode(): void {
    this.isSelectionMode = false;
    this.selectedPlayerIds.clear();
    this.render();
  }

  private renderSortIndicator(field: SortField): string {
    if (this.sortField !== field) {
      return '<span class="sort-indicator">&#8693;</span>';
    }
    return this.sortDirection === 'asc'
      ? '<span class="sort-indicator sort-indicator--active">&#8593;</span>'
      : '<span class="sort-indicator sort-indicator--active">&#8595;</span>';
  }

  private getSortedPlayers(players: Player[]): Player[] {
    return [...players].sort((a, b) => {
      let aVal: string;
      let bVal: string;

      if (this.sortField === 'name') {
        aVal = a.name.toLowerCase();
        bVal = b.name.toLowerCase();
      } else {
        aVal = (a.email || '').toLowerCase();
        bVal = (b.email || '').toLowerCase();
      }

      if (aVal < bVal) return this.sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return this.sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }

  private handleSort(field: SortField): void {
    if (this.sortField === field) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortField = field;
      this.sortDirection = 'asc';
    }
    this.updateContent();
  }

  private handleSearch(query: string): void {
    this.searchQuery = query;

    // Debounce the search
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }

    this.searchTimeout = setTimeout(() => {
      this.updateContent();
    }, 300);
  }

  private getFilteredPlayers(): Player[] {
    if (!this.searchQuery) {
      return this.players;
    }

    const query = this.searchQuery.toLowerCase();
    return this.players.filter(player =>
      player.name.toLowerCase().includes(query) ||
      player.email?.toLowerCase().includes(query) ||
      player.phone?.includes(query)
    );
  }

  private async fetchPlayers(): Promise<void> {
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
      console.error('Failed to fetch players:', error);
      toast.error('Failed to load players');
      this.players = [];
    } finally {
      this.isLoading = false;
      this.updateContent();
    }
  }

  private async fetchTeams(): Promise<void> {
    this.isLoading = true;
    this.updateContent();

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
      console.error('Failed to fetch teams:', error);
      toast.error('Failed to load teams');
      this.teams = [];
    } finally {
      this.isLoading = false;
      this.updateContent();
    }
  }

  private updateContent(): void {
    const contentEl = this.container.querySelector('#player-content');
    if (contentEl) {
      contentEl.innerHTML = this.isLoading ? this.renderSkeleton() : this.renderContent();
      this.bindRowEvents();
    }

    // Update the selection bar text and button state
    const selectionBar = this.container.querySelector('.player-list__selection-bar');
    if (selectionBar && this.isSelectionMode) {
      const count = this.selectedPlayerIds.size;
      selectionBar.querySelector('span')!.textContent = `${count} player${count !== 1 ? 's' : ''} selected`;
      const bulkBtn = selectionBar.querySelector('#bulk-add-btn') as HTMLButtonElement;
      if (bulkBtn) {
        bulkBtn.disabled = count === 0;
        bulkBtn.textContent = count > 0 ? `Add to competition (${count})` : 'Add to competition';
      }
    }
  }

  getPlayers(): Player[] {
    return this.players;
  }

  refresh(): void {
    this.isLoading = true;
    this.updateContent();
    this.fetchPlayers();
    if (this.activeTab === 'teams') {
      this.fetchTeams();
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  destroy(): void {
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }
    this.container.innerHTML = '';
  }
}
