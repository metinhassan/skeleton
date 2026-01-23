/**
 * Competition Detail Component
 * Shows competition details with tab navigation (Overview, Divisions, Entries, Draw, Settings)
 */

import type { Competition, CompetitionResponse } from '../types/competition.js';
import type { Division, DivisionListResponse } from '../types/division.js';
import type { Entry, EntryListResponse } from '../types/entry.js';
import { CompetitionForm } from './competition-form.js';
import { DivisionList } from './division-list.js';
import { DivisionForm } from './division-form.js';
import { EntryList } from './entry-list.js';
import { EntryForm } from './entry-form.js';
import { toast } from './toast.js';

export type CompetitionTab = 'overview' | 'divisions' | 'entries' | 'draw' | 'settings';

export interface CompetitionDetailOptions {
  container: HTMLElement;
  competitionId: string;
  clubId: string;
  initialTab?: CompetitionTab;
  onBack?: () => void;
  onNavigateToPublic?: (slug: string) => void;
}

export class CompetitionDetail {
  private container: HTMLElement;
  private competitionId: string;
  private clubId: string;
  private currentTab: CompetitionTab;
  private onBack?: () => void;
  private onNavigateToPublic?: (slug: string) => void;
  private competition: Competition | null = null;
  private isLoading = true;
  private editForm: CompetitionForm | null = null;
  private divisionList: DivisionList | null = null;
  private divisionForm: DivisionForm | null = null;
  private entryList: EntryList | null = null;
  private entryForm: EntryForm | null = null;
  private divisions: Division[] = [];
  private selectedDivisionId: string | null = null;
  private isLoadingDivisions = false;

  constructor(options: CompetitionDetailOptions) {
    this.container = options.container;
    this.competitionId = options.competitionId;
    this.clubId = options.clubId;
    this.currentTab = options.initialTab || 'overview';
    this.onBack = options.onBack;
    this.onNavigateToPublic = options.onNavigateToPublic;

    this.render();
    this.fetchCompetition();
  }

  private render(): void {
    if (this.isLoading) {
      this.container.innerHTML = this.renderSkeleton();
      return;
    }

    if (!this.competition) {
      this.container.innerHTML = this.renderError();
      return;
    }

    this.container.innerHTML = `
      <div class="competition-detail">
        ${this.renderHeader()}
        ${this.renderTabs()}
        <div class="tab-content-container">
          ${this.renderTabContent()}
        </div>
      </div>
    `;

    this.bindEvents();
  }

  private renderSkeleton(): string {
    return `
      <div class="competition-detail">
        <div class="skeleton-card" style="margin-bottom: 1.5rem;">
          <div class="skeleton skeleton-line skeleton-line--title"></div>
          <div class="skeleton skeleton-line skeleton-line--short"></div>
        </div>
        <div class="skeleton skeleton-line" style="height: 48px; margin-bottom: 1.5rem;"></div>
        <div class="skeleton-card">
          <div class="skeleton skeleton-line skeleton-line--medium"></div>
          <div class="skeleton skeleton-line skeleton-line--short"></div>
          <div class="skeleton skeleton-line skeleton-line--medium"></div>
        </div>
      </div>
    `;
  }

  private renderError(): string {
    return `
      <div class="empty-state">
        <div class="empty-state__icon">❌</div>
        <h3 class="empty-state__title">Competition not found</h3>
        <p class="empty-state__description">
          The competition you're looking for doesn't exist or you don't have access to it.
        </p>
        <button class="btn btn-primary" id="back-to-list-btn">
          Back to Competitions
        </button>
      </div>
    `;
  }

  private renderHeader(): string {
    const comp = this.competition!;
    const isDraft = comp.status === 'draft';

    return `
      <div class="competition-detail__header">
        <div class="competition-detail__title-group">
          <button class="competition-detail__back" aria-label="Back">←</button>
          <h1 class="competition-detail__title">${this.escapeHtml(comp.name)}</h1>
          <span class="status-badge status-badge--${comp.status}">
            ${this.formatStatus(comp.status)}
          </span>
        </div>
        <div class="competition-detail__actions">
          ${isDraft ? '<button class="btn btn-primary" id="publish-btn">Publish</button>' : ''}
          ${isDraft ? '<button class="btn btn-outline" id="edit-btn">Edit</button>' : ''}
        </div>
      </div>
    `;
  }

  private renderTabs(): string {
    const tabs: { id: CompetitionTab; label: string }[] = [
      { id: 'overview', label: 'Overview' },
      { id: 'divisions', label: 'Divisions' },
      { id: 'entries', label: 'Entries' },
      { id: 'draw', label: 'Draw' },
      { id: 'settings', label: 'Settings' },
    ];

    return `
      <div class="tabs">
        ${tabs
          .map(
            (tab) => `
          <button class="tab${tab.id === this.currentTab ? ' tab--active' : ''}"
                  data-tab="${tab.id}">
            ${tab.label}
          </button>
        `
          )
          .join('')}
      </div>
    `;
  }

  private renderTabContent(): string {
    switch (this.currentTab) {
      case 'overview':
        return this.renderOverviewTab();
      case 'divisions':
        return this.renderDivisionsTab();
      case 'entries':
        return this.renderEntriesTab();
      case 'draw':
        return this.renderDrawTab();
      case 'settings':
        return this.renderSettingsTab();
      default:
        return '';
    }
  }

  private renderOverviewTab(): string {
    const comp = this.competition!;
    const dateRange = this.formatDateRange(comp.startDate, comp.endDate);

    return `
      <div class="tab-content tab-content--active">
        <div class="overview-grid">
          <div class="overview-card">
            <div class="overview-card__label">Type</div>
            <div class="overview-card__value">${this.formatType(comp.type)}</div>
          </div>
          <div class="overview-card">
            <div class="overview-card__label">Format</div>
            <div class="overview-card__value">${this.formatFormat(comp.format)}</div>
          </div>
          <div class="overview-card">
            <div class="overview-card__label">Dates</div>
            <div class="overview-card__value">${dateRange || 'Not set'}</div>
          </div>
          <div class="overview-card">
            <div class="overview-card__label">Score Entry</div>
            <div class="overview-card__value">
              ${comp.scoreEntryMode === 'players_can_submit' ? 'Players can submit' : 'Organizers only'}
            </div>
          </div>
        </div>

        <div class="overview-grid">
          <div class="overview-card">
            <div class="overview-card__label">Divisions</div>
            <div class="overview-card__value">${comp.divisionCount}</div>
          </div>
          <div class="overview-card">
            <div class="overview-card__label">Total Entries</div>
            <div class="overview-card__value">${comp.entryCount}</div>
          </div>
          <div class="overview-card">
            <div class="overview-card__label">Registration</div>
            <div class="overview-card__value">${this.formatRegistrationMode(comp.registrationMode)}</div>
          </div>
          <div class="overview-card">
            <div class="overview-card__label">Requires Approval</div>
            <div class="overview-card__value">${comp.requiresApproval ? 'Yes' : 'No'}</div>
          </div>
        </div>

        <h3 style="margin: 1.5rem 0 1rem;">Quick Actions</h3>
        <div class="quick-actions">
          ${comp.status === 'draft' ? '<button class="btn btn-primary" id="quick-publish-btn">Publish Competition</button>' : ''}
          ${comp.status === 'published' || comp.status === 'in_progress' ? '<button class="btn btn-outline" id="view-public-btn">View Public Page</button>' : ''}
          <button class="btn btn-outline" id="manage-divisions-btn">Manage Divisions</button>
          <button class="btn btn-outline" id="manage-entries-btn">Manage Entries</button>
        </div>
      </div>
    `;
  }

  private renderDivisionsTab(): string {
    return `
      <div class="tab-content tab-content--active">
        <div id="division-list-container"></div>
      </div>
    `;
  }

  private initDivisionList(): void {
    if (!this.competition) return;

    const container = this.container.querySelector('#division-list-container') as HTMLElement;
    if (!container) return;

    // Cleanup existing list
    if (this.divisionList) {
      this.divisionList.destroy();
    }

    this.divisionList = new DivisionList({
      container,
      competitionId: this.competition.id,
      competitionFormat: this.competition.format,
      onCreateClick: () => this.showCreateDivision(),
      onEditClick: (division) => this.showEditDivision(division),
      onDeleteClick: (division) => this.handleDeleteDivision(division),
      onDivisionClick: (division) => {
        // Future: navigate to division detail
        console.log('Division clicked:', division.name);
      },
    });
  }

  private showCreateDivision(): void {
    if (!this.competition) return;

    this.divisionForm = new DivisionForm({
      mode: 'create',
      competitionId: this.competition.id,
      competitionFormat: this.competition.format,
      onSuccess: () => {
        this.divisionForm = null;
        this.divisionList?.refresh();
        // Update competition division count
        if (this.competition) {
          this.competition.divisionCount++;
        }
      },
      onCancel: () => {
        this.divisionForm = null;
      },
    });
  }

  private showEditDivision(division: Division): void {
    if (!this.competition) return;

    this.divisionForm = new DivisionForm({
      mode: 'edit',
      competitionId: this.competition.id,
      competitionFormat: this.competition.format,
      division,
      onSuccess: () => {
        this.divisionForm = null;
        this.divisionList?.refresh();
      },
      onCancel: () => {
        this.divisionForm = null;
      },
    });
  }

  private async handleDeleteDivision(division: Division): Promise<void> {
    if (division.entryCount > 0) {
      toast.error('Cannot delete division with entries. Remove entries first.');
      return;
    }

    const confirmed = await this.showConfirmation(
      'Delete Division',
      `Are you sure you want to delete "${division.name}"? This action cannot be undone.`,
      'Delete'
    );

    if (!confirmed) return;

    try {
      const response = await fetch(`/api/competitions/${this.competition!.id}/divisions/${division.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to delete division');
      }

      toast.success('Division deleted successfully');
      this.divisionList?.refresh();
      // Update competition division count
      if (this.competition) {
        this.competition.divisionCount--;
      }
    } catch (error) {
      console.error('Failed to delete division:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to delete division');
    }
  }

  private renderEntriesTab(): string {
    return `
      <div class="tab-content tab-content--active">
        <div class="entries-tab">
          ${this.renderDivisionSelector()}
          <div id="entry-list-container"></div>
        </div>
      </div>
    `;
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
      return `
        <div class="entries-empty-divisions">
          <div class="empty-state">
            <div class="empty-state__icon">&#128196;</div>
            <h3 class="empty-state__title">No divisions yet</h3>
            <p class="empty-state__description">
              Create divisions first before adding entries.
            </p>
            <button class="btn btn-primary" id="go-to-divisions-btn">Go to Divisions</button>
          </div>
        </div>
      `;
    }

    const pendingCounts = this.getPendingCountsByDivision();

    return `
      <div class="division-selector">
        <label class="division-selector__label">Division:</label>
        <select class="division-selector__select form-select" id="division-select">
          ${this.divisions
            .map((div) => {
              const pendingCount = pendingCounts.get(div.id) || 0;
              const pendingBadge = pendingCount > 0 ? ` (${pendingCount} pending)` : '';
              return `
                <option value="${div.id}" ${div.id === this.selectedDivisionId ? 'selected' : ''}>
                  ${this.escapeHtml(div.name)}${pendingBadge}
                </option>
              `;
            })
            .join('')}
        </select>
      </div>
    `;
  }

  private getPendingCountsByDivision(): Map<string, number> {
    const counts = new Map<string, number>();
    // This would be populated from API if we have requiresApproval
    // For now, return empty map - the entry list will show pending count internally
    return counts;
  }

  private async initEntriesTab(): Promise<void> {
    if (!this.competition) return;

    // Load divisions first
    this.isLoadingDivisions = true;
    this.updateEntriesTabContent();

    try {
      const response = await fetch(`/api/competitions/${this.competition.id}/divisions`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch divisions');
      }

      const data: DivisionListResponse = await response.json();
      this.divisions = data.divisions || [];

      // Select first division by default
      if (this.divisions.length > 0 && !this.selectedDivisionId) {
        this.selectedDivisionId = this.divisions[0].id;
      }
    } catch (error) {
      console.error('Failed to fetch divisions:', error);
      toast.error('Failed to load divisions');
      this.divisions = [];
    } finally {
      this.isLoadingDivisions = false;
      this.updateEntriesTabContent();
    }

    // Initialize entry list if we have a selected division
    if (this.selectedDivisionId) {
      this.initEntryList(this.selectedDivisionId);
    }

    this.bindEntriesTabEvents();
  }

  private updateEntriesTabContent(): void {
    const selectorContainer = this.container.querySelector('.entries-tab');
    if (selectorContainer) {
      const divisionSelectorHtml = this.renderDivisionSelector();
      const existingSelector = selectorContainer.querySelector('.division-selector, .entries-empty-divisions');
      if (existingSelector) {
        existingSelector.outerHTML = divisionSelectorHtml;
      }
      this.bindEntriesTabEvents();
    }
  }

  private bindEntriesTabEvents(): void {
    // Division selector
    const divisionSelect = this.container.querySelector('#division-select') as HTMLSelectElement;
    if (divisionSelect) {
      divisionSelect.addEventListener('change', () => {
        this.selectedDivisionId = divisionSelect.value;
        this.initEntryList(this.selectedDivisionId);
      });
    }

    // Go to divisions button (when no divisions exist)
    const goToDivisionsBtn = this.container.querySelector('#go-to-divisions-btn');
    if (goToDivisionsBtn) {
      goToDivisionsBtn.addEventListener('click', () => this.switchTab('divisions'));
    }
  }

  private initEntryList(divisionId: string): void {
    if (!this.competition) return;

    const container = this.container.querySelector('#entry-list-container') as HTMLElement;
    if (!container) return;

    // Get selected division
    const selectedDivision = this.divisions.find((d) => d.id === divisionId);
    if (!selectedDivision) return;

    // Cleanup existing list
    if (this.entryList) {
      this.entryList.destroy();
    }

    this.entryList = new EntryList({
      container,
      divisionId,
      competitionId: this.competition.id,
      requiresApproval: this.competition.requiresApproval,
      drawStatus: selectedDivision.drawStatus,
      onAddEntry: () => this.showCreateEntry(),
      onEditEntry: (entry) => this.showEditEntry(entry),
      onDeleteEntry: (entry) => this.handleDeleteEntry(entry),
      onApproveEntry: () => this.refreshEntryList(),
      onRejectEntry: () => this.refreshEntryList(),
    });
  }

  private async fetchEntriesForDivision(divisionId: string): Promise<Entry[]> {
    try {
      const response = await fetch(`/api/divisions/${divisionId}/entries`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch entries');
      }

      const data: EntryListResponse = await response.json();
      return data.entries || [];
    } catch (error) {
      console.error('Failed to fetch entries:', error);
      return [];
    }
  }

  private async showCreateEntry(): Promise<void> {
    if (!this.competition || !this.selectedDivisionId) return;

    // Fetch existing entries to check for duplicates
    const existingEntries = await this.fetchEntriesForDivision(this.selectedDivisionId);

    this.entryForm = new EntryForm({
      mode: 'create',
      divisionId: this.selectedDivisionId,
      clubId: this.clubId,
      existingEntries,
      onSuccess: () => {
        this.entryForm = null;
        this.refreshEntryList();
        // Update entry count
        if (this.competition) {
          this.competition.entryCount++;
        }
      },
      onCancel: () => {
        this.entryForm = null;
      },
    });
  }

  private async showEditEntry(entry: Entry): Promise<void> {
    if (!this.competition || !this.selectedDivisionId) return;

    // Fetch existing entries to check for duplicate seeds
    const existingEntries = await this.fetchEntriesForDivision(this.selectedDivisionId);

    this.entryForm = new EntryForm({
      mode: 'edit',
      divisionId: this.selectedDivisionId,
      clubId: this.clubId,
      entry,
      existingEntries,
      onSuccess: () => {
        this.entryForm = null;
        this.refreshEntryList();
      },
      onCancel: () => {
        this.entryForm = null;
      },
    });
  }

  private async handleDeleteEntry(entry: Entry): Promise<void> {
    const selectedDivision = this.divisions.find((d) => d.id === this.selectedDivisionId);

    // Check if draw is generated
    if (selectedDivision && (selectedDivision.drawStatus === 'in_progress' || selectedDivision.drawStatus === 'completed')) {
      toast.error('Cannot remove entry: draw is in progress or completed');
      return;
    }

    const entryName = this.getEntryDisplayName(entry);
    const confirmed = await this.showConfirmation(
      'Remove Entry',
      `Are you sure you want to remove "${entryName}" from this division?`,
      'Remove'
    );

    if (!confirmed) return;

    try {
      const response = await fetch(`/api/divisions/${this.selectedDivisionId}/entries/${entry.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to remove entry');
      }

      toast.success('Entry removed successfully');
      this.refreshEntryList();
      // Update entry count
      if (this.competition) {
        this.competition.entryCount--;
      }
    } catch (error) {
      console.error('Failed to remove entry:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to remove entry');
    }
  }

  private getEntryDisplayName(entry: Entry): string {
    if (entry.entryType === 'singles' && entry.player) {
      return entry.player.name;
    }
    if (entry.entryType === 'doubles' && entry.team) {
      if (entry.team.name) return entry.team.name;
      const p1 = entry.team.player1?.name || 'Unknown';
      const p2 = entry.team.player2?.name || 'Unknown';
      return `${p1} / ${p2}`;
    }
    return 'Unknown Entry';
  }

  private refreshEntryList(): void {
    this.entryList?.refresh();
  }

  private renderDrawTab(): string {
    return `
      <div class="tab-content tab-content--active">
        <div class="empty-state">
          <div class="empty-state__icon">🏆</div>
          <h3 class="empty-state__title">Draw</h3>
          <p class="empty-state__description">
            Draw generation and viewing will be available in Phase 7.
          </p>
        </div>
      </div>
    `;
  }

  private renderSettingsTab(): string {
    return `
      <div class="tab-content tab-content--active">
        <div class="welcome-card">
          <h3>Competition Settings</h3>
          <p style="color: var(--color-text-muted); margin-bottom: 1rem;">
            Update your competition details and configuration.
          </p>
          <button class="btn btn-primary" id="settings-edit-btn">Edit Settings</button>
        </div>
      </div>
    `;
  }

  private bindEvents(): void {
    // Back button
    const backBtn = this.container.querySelector('.competition-detail__back');
    if (backBtn) {
      backBtn.addEventListener('click', () => this.onBack?.());
    }

    // Error state back button
    const backToListBtn = this.container.querySelector('#back-to-list-btn');
    if (backToListBtn) {
      backToListBtn.addEventListener('click', () => this.onBack?.());
    }

    // Tab clicks
    const tabs = this.container.querySelectorAll('.tab');
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const tabId = tab.getAttribute('data-tab') as CompetitionTab;
        if (tabId) {
          this.switchTab(tabId);
        }
      });
    });

    // Header publish button
    const publishBtn = this.container.querySelector('#publish-btn');
    if (publishBtn) {
      publishBtn.addEventListener('click', () => this.handlePublish());
    }

    // Header edit button
    const editBtn = this.container.querySelector('#edit-btn');
    if (editBtn) {
      editBtn.addEventListener('click', () => this.showEditForm());
    }

    // Quick actions
    const quickPublishBtn = this.container.querySelector('#quick-publish-btn');
    if (quickPublishBtn) {
      quickPublishBtn.addEventListener('click', () => this.handlePublish());
    }

    const viewPublicBtn = this.container.querySelector('#view-public-btn');
    if (viewPublicBtn) {
      viewPublicBtn.addEventListener('click', () => {
        if (this.competition?.slug) {
          this.onNavigateToPublic?.(this.competition.slug);
        }
      });
    }

    const manageDivisionsBtn = this.container.querySelector('#manage-divisions-btn');
    if (manageDivisionsBtn) {
      manageDivisionsBtn.addEventListener('click', () => this.switchTab('divisions'));
    }

    const manageEntriesBtn = this.container.querySelector('#manage-entries-btn');
    if (manageEntriesBtn) {
      manageEntriesBtn.addEventListener('click', () => this.switchTab('entries'));
    }

    // Settings edit button
    const settingsEditBtn = this.container.querySelector('#settings-edit-btn');
    if (settingsEditBtn) {
      settingsEditBtn.addEventListener('click', () => this.showEditForm());
    }
  }

  private switchTab(tab: CompetitionTab): void {
    // Cleanup previous tab components
    this.cleanupTabComponents();

    this.currentTab = tab;

    // Update tab buttons
    const tabs = this.container.querySelectorAll('.tab');
    tabs.forEach((t) => {
      const tabId = t.getAttribute('data-tab');
      t.classList.toggle('tab--active', tabId === tab);
    });

    // Update content
    const contentContainer = this.container.querySelector('.tab-content-container');
    if (contentContainer) {
      contentContainer.innerHTML = this.renderTabContent();
      this.bindTabContentEvents();

      // Initialize tab-specific components
      if (tab === 'divisions') {
        this.initDivisionList();
      } else if (tab === 'entries') {
        this.initEntriesTab();
      }
    }
  }

  private cleanupTabComponents(): void {
    if (this.divisionList) {
      this.divisionList.destroy();
      this.divisionList = null;
    }
    if (this.divisionForm) {
      this.divisionForm.destroy();
      this.divisionForm = null;
    }
    if (this.entryList) {
      this.entryList.destroy();
      this.entryList = null;
    }
    if (this.entryForm) {
      this.entryForm.destroy();
      this.entryForm = null;
    }
  }

  private bindTabContentEvents(): void {
    // Re-bind events for dynamically rendered content
    const quickPublishBtn = this.container.querySelector('#quick-publish-btn');
    if (quickPublishBtn) {
      quickPublishBtn.addEventListener('click', () => this.handlePublish());
    }

    const viewPublicBtn = this.container.querySelector('#view-public-btn');
    if (viewPublicBtn) {
      viewPublicBtn.addEventListener('click', () => {
        if (this.competition?.slug) {
          this.onNavigateToPublic?.(this.competition.slug);
        }
      });
    }

    const manageDivisionsBtn = this.container.querySelector('#manage-divisions-btn');
    if (manageDivisionsBtn) {
      manageDivisionsBtn.addEventListener('click', () => this.switchTab('divisions'));
    }

    const manageEntriesBtn = this.container.querySelector('#manage-entries-btn');
    if (manageEntriesBtn) {
      manageEntriesBtn.addEventListener('click', () => this.switchTab('entries'));
    }

    const settingsEditBtn = this.container.querySelector('#settings-edit-btn');
    if (settingsEditBtn) {
      settingsEditBtn.addEventListener('click', () => this.showEditForm());
    }
  }

  private async fetchCompetition(): Promise<void> {
    try {
      const response = await fetch(`/api/competitions/${this.competitionId}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch competition');
      }

      const data: CompetitionResponse = await response.json();
      this.competition = data.competition;
    } catch (error) {
      console.error('Failed to fetch competition:', error);
      this.competition = null;
    } finally {
      this.isLoading = false;
      this.render();
    }
  }

  private async handlePublish(): Promise<void> {
    if (!this.competition || this.competition.status !== 'draft') return;

    // Show confirmation
    const confirmed = await this.showConfirmation(
      'Publish Competition',
      'Publishing this competition will make it visible and allow registrations (if enabled). This action cannot be undone.',
      'Publish'
    );

    if (!confirmed) return;

    try {
      const response = await fetch(`/api/competitions/${this.competition.id}/publish`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to publish competition');
      }

      const data: CompetitionResponse = await response.json();
      this.competition = data.competition;
      toast.success('Competition published successfully');
      this.render();
    } catch (error) {
      console.error('Failed to publish competition:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to publish competition');
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

  private showEditForm(): void {
    if (!this.competition) return;

    this.editForm = new CompetitionForm({
      mode: 'edit',
      clubId: this.clubId,
      competition: this.competition,
      onSuccess: (updated) => {
        this.competition = updated;
        this.render();
      },
      onCancel: () => {
        this.editForm = null;
      },
    });
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

  private formatRegistrationMode(mode: string): string {
    const modeMap: Record<string, string> = {
      organizer_only: 'Organizer Only',
      self_registration: 'Self Registration',
      both: 'Both',
    };
    return modeMap[mode] || mode;
  }

  private formatDateRange(start: string | null, end: string | null): string {
    if (!start && !end) return '';

    const formatDate = (dateStr: string) => {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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
    this.editForm?.destroy();
    this.entryForm?.destroy();
    this.cleanupTabComponents();
    this.container.innerHTML = '';
  }
}
