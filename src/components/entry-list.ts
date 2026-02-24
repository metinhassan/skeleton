/**
 * Entry List Component
 * Displays entries for a division with filtering, search, and CRUD actions
 */

import type { Entry, EntryListResponse, EntryStatus } from '../types/entry.js';
import type { DrawStatus } from '../types/division.js';
import { toast } from './toast.js';

export type EntryFilter = 'all' | 'pending' | 'approved' | 'withdrawn';

export interface EntryListOptions {
  container: HTMLElement;
  divisionId: string;
  competitionId: string;
  requiresApproval: boolean;
  drawStatus: DrawStatus;
  onAddEntry?: () => void;
  onEditEntry?: (entry: Entry) => void;
  onDeleteEntry?: (entry: Entry) => void;
  onApproveEntry?: (entry: Entry) => void;
  onRejectEntry?: (entry: Entry) => void;
  onWithdrawEntry?: (entry: Entry) => void;
}

export class EntryList {
  private container: HTMLElement;
  private divisionId: string;
  private requiresApproval: boolean;
  private drawStatus: DrawStatus;
  private onAddEntry?: () => void;
  private onEditEntry?: (entry: Entry) => void;
  private onDeleteEntry?: (entry: Entry) => void;
  private onApproveEntry?: (entry: Entry) => void;
  private onRejectEntry?: (entry: Entry) => void;
  private onWithdrawEntry?: (entry: Entry) => void;

  private entries: Entry[] = [];
  private isLoading = true;
  private currentFilter: EntryFilter = 'all';
  private searchQuery = '';
  private selectedEntries: Set<string> = new Set();

  constructor(options: EntryListOptions) {
    this.container = options.container;
    this.divisionId = options.divisionId;
    this.requiresApproval = options.requiresApproval;
    this.drawStatus = options.drawStatus;
    this.onAddEntry = options.onAddEntry;
    this.onEditEntry = options.onEditEntry;
    this.onDeleteEntry = options.onDeleteEntry;
    this.onApproveEntry = options.onApproveEntry;
    this.onRejectEntry = options.onRejectEntry;
    this.onWithdrawEntry = options.onWithdrawEntry;

    this.render();
    this.fetchEntries();
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="entry-list-container">
        <div class="entry-list__header">
          <div class="entry-list__title-row">
            <h3 class="entry-list__title">Entries</h3>
            <button class="btn btn-primary" id="add-entry-btn">+ Add Entry</button>
          </div>
          ${this.renderFilters()}
        </div>
        <div id="entry-content">
          ${this.isLoading ? this.renderSkeleton() : this.renderContent()}
        </div>
      </div>
    `;

    this.bindEvents();
  }

  private renderFilters(): string {
    const filters: { id: EntryFilter; label: string }[] = [
      { id: 'all', label: 'All' },
      { id: 'pending', label: 'Pending' },
      { id: 'approved', label: 'Confirmed' },
      { id: 'withdrawn', label: 'Withdrawn' },
    ];

    const pendingCount = this.entries.filter((e) => e.status === 'pending').length;

    return `
      <div class="entry-list__filters">
        <div class="entry-filter-tabs">
          ${filters
            .map(
              (f) => `
            <button class="entry-filter-tab${f.id === this.currentFilter ? ' entry-filter-tab--active' : ''}"
                    data-filter="${f.id}">
              ${f.label}
              ${f.id === 'pending' && pendingCount > 0 ? `<span class="entry-filter-badge">${pendingCount}</span>` : ''}
            </button>
          `
            )
            .join('')}
        </div>
        <div class="entry-search">
          <span class="entry-search__icon">&#128269;</span>
          <input
            type="text"
            class="entry-search__input"
            placeholder="Search entries..."
            value="${this.escapeHtml(this.searchQuery)}"
            id="entry-search-input"
          />
        </div>
      </div>
    `;
  }

  private renderSkeleton(): string {
    return `
      <div class="entry-table-wrapper">
        <table class="entry-table">
          <thead>
            <tr>
              <th style="width: 40px;"></th>
              <th style="width: 50px;">Type</th>
              <th>Name</th>
              <th style="width: 80px;">Seed</th>
              <th style="width: 100px;">Status</th>
              <th style="width: 120px;">Registered</th>
              <th style="width: 150px;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${Array(3)
              .fill(0)
              .map(
                () => `
              <tr class="entry-skeleton-row">
                <td><div class="skeleton" style="width: 18px; height: 18px;"></div></td>
                <td><div class="skeleton" style="width: 24px; height: 24px;"></div></td>
                <td><div class="skeleton skeleton-line" style="width: 60%;"></div></td>
                <td><div class="skeleton skeleton-line" style="width: 40px;"></div></td>
                <td><div class="skeleton skeleton-line" style="width: 70px;"></div></td>
                <td><div class="skeleton skeleton-line" style="width: 80px;"></div></td>
                <td><div class="skeleton skeleton-line" style="width: 100px;"></div></td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  private renderContent(): string {
    const filteredEntries = this.getFilteredEntries();

    if (this.entries.length === 0) {
      return this.renderEmptyState('no-entries');
    }

    if (filteredEntries.length === 0) {
      if (this.searchQuery) {
        return this.renderEmptyState('no-search-results');
      }
      return this.renderEmptyState('no-filter-results');
    }

    const hasSelection = this.selectedEntries.size > 0;
    const pendingSelected = filteredEntries.filter(
      (e) => e.status === 'pending' && this.selectedEntries.has(e.id)
    );

    return `
      ${hasSelection && pendingSelected.length > 0 ? this.renderBulkActions(pendingSelected.length) : ''}
      <div class="entry-table-wrapper">
        <table class="entry-table">
          <thead>
            <tr>
              <th style="width: 40px;">
                <input type="checkbox" id="select-all-entries"
                       ${this.isAllSelected(filteredEntries) ? 'checked' : ''} />
              </th>
              <th style="width: 50px;">Type</th>
              <th>Name</th>
              <th style="width: 80px;">Seed</th>
              <th style="width: 100px;">Status</th>
              <th style="width: 120px;">Registered</th>
              <th style="width: 150px;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${filteredEntries.map((entry) => this.renderRow(entry)).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  private renderEmptyState(type: 'no-entries' | 'no-search-results' | 'no-filter-results'): string {
    const config = {
      'no-entries': {
        icon: '&#128101;',
        title: 'No entries yet',
        description: 'Add players or teams to this division.',
        showButton: true,
      },
      'no-search-results': {
        icon: '&#128269;',
        title: 'No entries match your search',
        description: `No entries found for "${this.escapeHtml(this.searchQuery)}".`,
        showButton: false,
      },
      'no-filter-results': {
        icon: '&#128196;',
        title: 'No entries in this filter',
        description: `There are no ${this.currentFilter} entries.`,
        showButton: false,
      },
    };

    const { icon, title, description, showButton } = config[type];

    return `
      <div class="entry-empty">
        <div class="entry-empty__icon">${icon}</div>
        <h3 class="entry-empty__title">${title}</h3>
        <p class="entry-empty__description">${description}</p>
        ${showButton ? '<button class="btn btn-primary" id="empty-add-entry-btn">+ Add Entry</button>' : ''}
      </div>
    `;
  }

  private renderBulkActions(count: number): string {
    return `
      <div class="entry-bulk-actions">
        <span class="entry-bulk-actions__count">${count} pending selected</span>
        <button class="btn btn-primary btn-sm" id="bulk-approve-btn">Approve Selected</button>
        <button class="btn btn-outline btn-sm" id="bulk-reject-btn">Reject Selected</button>
      </div>
    `;
  }

  private renderRow(entry: Entry): string {
    const typeIcon = entry.entryType === 'singles' ? '&#128100;' : '&#128101;';
    const name = this.getEntryName(entry);
    const seedDisplay = entry.seed != null ? entry.seed.toString() : '-';
    const registeredDate = entry.registeredAt
      ? this.formatDate(entry.registeredAt)
      : this.formatDate(entry.createdAt);

    const canEdit = this.canEditEntry(entry);
    const canRemove = this.canRemoveEntry(entry);
    const canWithdraw = this.canWithdrawEntry(entry);
    const isPending = entry.status === 'pending';

    return `
      <tr class="entry-row" data-id="${entry.id}">
        <td class="entry-table__cell--checkbox">
          <input type="checkbox" class="entry-checkbox" data-id="${entry.id}"
                 ${this.selectedEntries.has(entry.id) ? 'checked' : ''} />
        </td>
        <td class="entry-table__type-icon">${typeIcon}</td>
        <td class="entry-table__name">${this.escapeHtml(name)}</td>
        <td class="entry-table__seed">${seedDisplay}</td>
        <td>
          <span class="entry-status entry-status--${entry.status}">
            ${this.formatStatus(entry.status)}
          </span>
        </td>
        <td class="entry-table__date">${registeredDate}</td>
        <td class="entry-table__cell--actions">
          ${canEdit ? `<button class="btn btn-outline btn-sm edit-entry-btn" data-id="${entry.id}">Edit Seed</button>` : ''}
          ${isPending && this.requiresApproval ? `
            <button class="btn btn-primary btn-sm approve-entry-btn" data-id="${entry.id}">Approve</button>
            <button class="btn btn-outline btn-sm reject-entry-btn" data-id="${entry.id}">Reject</button>
          ` : ''}
          ${canWithdraw ? `<button class="btn btn-outline btn-sm withdraw-entry-btn" data-id="${entry.id}">Withdraw</button>` : ''}
          ${canRemove ? `<button class="btn btn-outline btn-sm remove-entry-btn" data-id="${entry.id}">Remove</button>` : ''}
        </td>
      </tr>
    `;
  }

  private getEntryName(entry: Entry): string {
    if (entry.entryType === 'singles' && entry.player) {
      return entry.player.name;
    }
    if (entry.entryType === 'doubles' && entry.team) {
      const p1 = entry.team.player1?.name || 'Unknown';
      const p2 = entry.team.player2?.name || 'Unknown';
      return entry.team.name || `${p1} / ${p2}`;
    }
    return 'Unknown Entry';
  }

  private canEditEntry(entry: Entry): boolean {
    // Can edit seed if status is approved or pending, and draw hasn't started
    return (
      (entry.status === 'approved' || entry.status === 'pending') &&
      this.drawStatus !== 'in_progress' &&
      this.drawStatus !== 'completed'
    );
  }

  private canWithdrawEntry(entry: Entry): boolean {
    return entry.status === 'approved' || entry.status === 'pending';
  }

  private canRemoveEntry(entry: Entry): boolean {
    // Cannot remove if draw is generated (unless it's still in generated status)
    if (this.drawStatus === 'in_progress' || this.drawStatus === 'completed') {
      return false;
    }
    // Cannot remove withdrawn entries (already removed)
    return entry.status !== 'withdrawn';
  }

  private getFilteredEntries(): Entry[] {
    let filtered = [...this.entries];

    // Apply filter
    if (this.currentFilter !== 'all') {
      filtered = filtered.filter((e) => {
        if (this.currentFilter === 'approved') {
          return e.status === 'approved';
        }
        return e.status === this.currentFilter;
      });
    }

    // Apply search
    if (this.searchQuery.trim()) {
      const query = this.searchQuery.toLowerCase().trim();
      filtered = filtered.filter((e) => {
        const name = this.getEntryName(e).toLowerCase();
        return name.includes(query);
      });
    }

    return filtered;
  }

  private isAllSelected(entries: Entry[]): boolean {
    if (entries.length === 0) return false;
    return entries.every((e) => this.selectedEntries.has(e.id));
  }

  private bindEvents(): void {
    // Add entry button
    const addBtn = this.container.querySelector('#add-entry-btn');
    if (addBtn) {
      addBtn.addEventListener('click', () => this.onAddEntry?.());
    }

    // Empty state add button
    const emptyAddBtn = this.container.querySelector('#empty-add-entry-btn');
    if (emptyAddBtn) {
      emptyAddBtn.addEventListener('click', () => this.onAddEntry?.());
    }

    // Filter tabs
    const filterTabs = this.container.querySelectorAll('.entry-filter-tab');
    filterTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const filter = tab.getAttribute('data-filter') as EntryFilter;
        if (filter) {
          this.setFilter(filter);
        }
      });
    });

    // Search input
    const searchInput = this.container.querySelector('#entry-search-input') as HTMLInputElement;
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = (e.target as HTMLInputElement).value;
        this.updateContent();
      });
    }

    this.bindContentEvents();
  }

  private bindContentEvents(): void {
    // Empty state add button (re-rendered inside #entry-content)
    const emptyAddBtn = this.container.querySelector('#empty-add-entry-btn');
    if (emptyAddBtn) {
      emptyAddBtn.addEventListener('click', () => this.onAddEntry?.());
    }

    // Select all checkbox
    const selectAllCheckbox = this.container.querySelector('#select-all-entries') as HTMLInputElement;
    if (selectAllCheckbox) {
      selectAllCheckbox.addEventListener('change', () => {
        const filteredEntries = this.getFilteredEntries();
        if (selectAllCheckbox.checked) {
          filteredEntries.forEach((e) => this.selectedEntries.add(e.id));
        } else {
          this.selectedEntries.clear();
        }
        this.updateContent();
      });
    }

    // Individual checkboxes
    const checkboxes = this.container.querySelectorAll('.entry-checkbox');
    checkboxes.forEach((cb) => {
      cb.addEventListener('change', (e) => {
        const id = (e.target as HTMLInputElement).getAttribute('data-id');
        if (id) {
          if ((e.target as HTMLInputElement).checked) {
            this.selectedEntries.add(id);
          } else {
            this.selectedEntries.delete(id);
          }
          this.updateContent();
        }
      });
    });

    // Bulk approve button
    const bulkApproveBtn = this.container.querySelector('#bulk-approve-btn');
    if (bulkApproveBtn) {
      bulkApproveBtn.addEventListener('click', () => this.handleBulkApprove());
    }

    // Bulk reject button
    const bulkRejectBtn = this.container.querySelector('#bulk-reject-btn');
    if (bulkRejectBtn) {
      bulkRejectBtn.addEventListener('click', () => this.handleBulkReject());
    }

    // Edit buttons
    const editBtns = this.container.querySelectorAll('.edit-entry-btn');
    editBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        const entry = this.entries.find((en) => en.id === id);
        if (entry) {
          this.onEditEntry?.(entry);
        }
      });
    });

    // Approve buttons
    const approveBtns = this.container.querySelectorAll('.approve-entry-btn');
    approveBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        const entry = this.entries.find((en) => en.id === id);
        if (entry) {
          this.handleApprove(entry);
        }
      });
    });

    // Reject buttons
    const rejectBtns = this.container.querySelectorAll('.reject-entry-btn');
    rejectBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        const entry = this.entries.find((en) => en.id === id);
        if (entry) {
          this.handleReject(entry);
        }
      });
    });

    // Withdraw buttons
    const withdrawBtns = this.container.querySelectorAll('.withdraw-entry-btn');
    withdrawBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        const entry = this.entries.find((en) => en.id === id);
        if (entry) {
          this.onWithdrawEntry?.(entry);
        }
      });
    });

    // Remove buttons
    const removeBtns = this.container.querySelectorAll('.remove-entry-btn');
    removeBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        const entry = this.entries.find((en) => en.id === id);
        if (entry) {
          this.onDeleteEntry?.(entry);
        }
      });
    });
  }

  private setFilter(filter: EntryFilter): void {
    this.currentFilter = filter;
    this.selectedEntries.clear();

    // Update filter tabs
    const filterTabs = this.container.querySelectorAll('.entry-filter-tab');
    filterTabs.forEach((tab) => {
      const tabFilter = tab.getAttribute('data-filter');
      tab.classList.toggle('entry-filter-tab--active', tabFilter === filter);
    });

    this.updateContent();
  }

  private async fetchEntries(): Promise<void> {
    try {
      const response = await fetch(`/api/divisions/${this.divisionId}/entries`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch entries');
      }

      const data: EntryListResponse = await response.json();
      this.entries = data.entries || [];
    } catch (error) {
      console.error('Failed to fetch entries:', error);
      toast.error('Failed to load entries');
      this.entries = [];
    } finally {
      this.isLoading = false;
      this.updateContent();
      this.updateFilters();
    }
  }

  private updateContent(): void {
    const contentEl = this.container.querySelector('#entry-content');
    if (contentEl) {
      contentEl.innerHTML = this.renderContent();
      this.bindContentEvents();
    }
  }

  private updateFilters(): void {
    const filtersEl = this.container.querySelector('.entry-list__filters');
    if (filtersEl) {
      filtersEl.outerHTML = this.renderFilters();
      // Rebind filter events
      const filterTabs = this.container.querySelectorAll('.entry-filter-tab');
      filterTabs.forEach((tab) => {
        tab.addEventListener('click', () => {
          const filter = tab.getAttribute('data-filter') as EntryFilter;
          if (filter) {
            this.setFilter(filter);
          }
        });
      });

      const searchInput = this.container.querySelector('#entry-search-input') as HTMLInputElement;
      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          this.searchQuery = (e.target as HTMLInputElement).value;
          this.updateContent();
        });
      }
    }
  }

  private async handleApprove(entry: Entry): Promise<void> {
    try {
      const response = await fetch(`/api/entries/${entry.id}/approve`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to approve entry');
      }

      toast.success('Entry approved');
      this.onApproveEntry?.(entry);
      this.refresh();
    } catch (error) {
      console.error('Failed to approve entry:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to approve entry');
    }
  }

  private async handleReject(entry: Entry): Promise<void> {
    const entryName = this.getEntryName(entry);
    const result = await this.showRejectModal(entryName);

    if (!result.confirmed) return;

    try {
      const response = await fetch(`/api/entries/${entry.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reason: result.reason || undefined }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to reject entry');
      }

      toast.success('Entry rejected');
      this.onRejectEntry?.(entry);
      this.refresh();
    } catch (error) {
      console.error('Failed to reject entry:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to reject entry');
    }
  }

  private async handleBulkApprove(): Promise<void> {
    const pendingSelected = this.entries.filter(
      (e) => e.status === 'pending' && this.selectedEntries.has(e.id)
    );

    if (pendingSelected.length === 0) return;

    try {
      const results = await Promise.allSettled(
        pendingSelected.map((entry) =>
          fetch(`/api/entries/${entry.id}/approve`, {
            method: 'POST',
            credentials: 'include',
          })
        )
      );

      const successCount = results.filter((r) => r.status === 'fulfilled').length;
      const failCount = results.length - successCount;

      if (failCount > 0) {
        toast.warning(`Approved ${successCount} entries, ${failCount} failed`);
      } else {
        toast.success(`Approved ${successCount} entries`);
      }

      this.selectedEntries.clear();
      this.refresh();
    } catch (error) {
      console.error('Failed to bulk approve:', error);
      toast.error('Failed to approve entries');
    }
  }

  private async handleBulkReject(): Promise<void> {
    const pendingSelected = this.entries.filter(
      (e) => e.status === 'pending' && this.selectedEntries.has(e.id)
    );

    if (pendingSelected.length === 0) return;

    try {
      const results = await Promise.allSettled(
        pendingSelected.map((entry) =>
          fetch(`/api/entries/${entry.id}/reject`, {
            method: 'POST',
            credentials: 'include',
          })
        )
      );

      const successCount = results.filter((r) => r.status === 'fulfilled').length;
      const failCount = results.length - successCount;

      if (failCount > 0) {
        toast.warning(`Rejected ${successCount} entries, ${failCount} failed`);
      } else {
        toast.success(`Rejected ${successCount} entries`);
      }

      this.selectedEntries.clear();
      this.refresh();
    } catch (error) {
      console.error('Failed to bulk reject:', error);
      toast.error('Failed to reject entries');
    }
  }

  refresh(): void {
    this.isLoading = true;
    const contentEl = this.container.querySelector('#entry-content');
    if (contentEl) {
      contentEl.innerHTML = this.renderSkeleton();
    }
    this.fetchEntries();
  }

  setDivision(divisionId: string, drawStatus: DrawStatus): void {
    this.divisionId = divisionId;
    this.drawStatus = drawStatus;
    this.selectedEntries.clear();
    this.currentFilter = 'all';
    this.searchQuery = '';
    this.refresh();
  }

  private formatStatus(status: EntryStatus): string {
    const statusMap: Record<EntryStatus, string> = {
      pending: 'Pending',
      approved: 'Confirmed',
      rejected: 'Rejected',
      withdrawn: 'Withdrawn',
    };
    return statusMap[status] || status;
  }

  private formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private showRejectModal(entryName: string): Promise<{ confirmed: boolean; reason?: string }> {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal" style="max-width: 400px;">
          <div class="modal__header">
            <h2 class="modal__title">Reject Entry</h2>
            <button class="modal__close" aria-label="Close">&times;</button>
          </div>
          <div class="modal__body">
            <p style="margin-bottom: 1rem;">Are you sure you want to reject <strong>${this.escapeHtml(entryName)}</strong>?</p>
            <div class="form-row">
              <label class="form-label" for="reject-reason">Reason (optional)</label>
              <textarea
                id="reject-reason"
                class="form-input"
                rows="3"
                placeholder="Enter a reason for rejection..."
              ></textarea>
            </div>
          </div>
          <div class="modal__footer">
            <button type="button" class="btn btn-outline" id="cancel-reject-btn">Cancel</button>
            <button type="button" class="btn btn-danger" id="confirm-reject-btn">Reject Entry</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      requestAnimationFrame(() => {
        overlay.classList.add('modal-overlay--visible');
      });

      const cleanup = () => {
        overlay.classList.remove('modal-overlay--visible');
        setTimeout(() => overlay.remove(), 200);
      };

      const closeBtn = overlay.querySelector('.modal__close');
      const cancelBtn = overlay.querySelector('#cancel-reject-btn');
      const confirmBtn = overlay.querySelector('#confirm-reject-btn');
      const reasonInput = overlay.querySelector('#reject-reason') as HTMLTextAreaElement;

      closeBtn?.addEventListener('click', () => {
        cleanup();
        resolve({ confirmed: false });
      });

      cancelBtn?.addEventListener('click', () => {
        cleanup();
        resolve({ confirmed: false });
      });

      confirmBtn?.addEventListener('click', () => {
        const reason = reasonInput?.value.trim() || '';
        cleanup();
        resolve({ confirmed: true, reason });
      });

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          cleanup();
          resolve({ confirmed: false });
        }
      });
    });
  }

  destroy(): void {
    this.container.innerHTML = '';
  }
}
