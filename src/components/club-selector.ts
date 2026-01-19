/**
 * Club Selector Component
 * Dropdown for selecting between user's clubs with role badges
 */

import type { Club, ClubContext } from '../types/club.js';
import { clubContext } from '../lib/club-context.js';

export interface ClubSelectorOptions {
  container: HTMLElement;
  onClubChange?: (club: Club) => void;
}

export class ClubSelector {
  private container: HTMLElement;
  private onClubChange?: (club: Club) => void;
  private unsubscribe: (() => void) | null = null;
  private isOpen = false;
  private outsideClickHandler: (e: MouseEvent) => void;

  constructor(options: ClubSelectorOptions) {
    this.container = options.container;
    this.onClubChange = options.onClubChange;

    this.outsideClickHandler = this.handleOutsideClick.bind(this);

    // Subscribe to club context changes
    this.unsubscribe = clubContext.subscribe((context) => {
      this.render(context);
    });
  }

  private render(context: ClubContext): void {
    this.container.innerHTML = '';

    if (context.isLoading) {
      this.container.innerHTML = `
        <div class="club-selector">
          <div class="club-selector__trigger">
            <div class="club-selector__initial">...</div>
            <div class="club-selector__info">
              <div class="club-selector__name">Loading...</div>
            </div>
          </div>
        </div>
      `;
      return;
    }

    if (context.clubs.length === 0) {
      this.container.innerHTML = `
        <div class="club-selector">
          <div class="club-selector__trigger" style="cursor: default;">
            <div class="club-selector__initial">?</div>
            <div class="club-selector__info">
              <div class="club-selector__name">No clubs</div>
            </div>
          </div>
        </div>
      `;
      return;
    }

    const currentClub = context.currentClub;
    const hasMultipleClubs = context.clubs.length > 1;

    const selector = document.createElement('div');
    selector.className = 'club-selector';

    selector.innerHTML = `
      <div class="club-selector__trigger${this.isOpen ? ' club-selector__trigger--open' : ''}"
           ${!hasMultipleClubs ? 'style="cursor: default;"' : ''}>
        ${this.renderClubLogo(currentClub)}
        <div class="club-selector__info">
          <div class="club-selector__name">${currentClub?.name || 'Select club'}</div>
          ${currentClub?.region ? `<div class="club-selector__region">${currentClub.region}</div>` : ''}
        </div>
        ${hasMultipleClubs ? '<span class="club-selector__chevron">▼</span>' : ''}
      </div>
      ${
        hasMultipleClubs
          ? `
        <div class="club-selector__dropdown" ${!this.isOpen ? 'hidden' : ''}>
          ${context.clubs
            .map(
              (club) => `
            <div class="club-selector__option${club.id === currentClub?.id ? ' club-selector__option--selected' : ''}"
                 data-club-id="${club.id}">
              ${this.renderClubLogo(club)}
              <div class="club-selector__option-info">
                <div class="club-selector__option-name">${club.name}</div>
                ${club.region ? `<div class="club-selector__option-region">${club.region}</div>` : ''}
              </div>
              <span class="role-badge role-badge--${club.role}">${club.role}</span>
            </div>
          `
            )
            .join('')}
        </div>
      `
          : ''
      }
    `;

    this.container.appendChild(selector);

    if (hasMultipleClubs) {
      this.bindEvents(selector);
    }
  }

  private renderClubLogo(club: Club | null): string {
    if (!club) {
      return '<div class="club-selector__initial">?</div>';
    }

    if (club.logoUrl) {
      return `<img class="club-selector__logo" src="${club.logoUrl}" alt="${club.name}" />`;
    }

    const initial = club.name.charAt(0).toUpperCase();
    return `<div class="club-selector__initial">${initial}</div>`;
  }

  private bindEvents(selector: HTMLElement): void {
    const trigger = selector.querySelector('.club-selector__trigger');
    const dropdown = selector.querySelector('.club-selector__dropdown');

    if (trigger && dropdown) {
      trigger.addEventListener('click', () => {
        this.toggleDropdown();
      });

      // Club option clicks
      const options = dropdown.querySelectorAll('.club-selector__option');
      options.forEach((option) => {
        option.addEventListener('click', () => {
          const clubId = option.getAttribute('data-club-id');
          if (clubId) {
            this.selectClub(clubId);
          }
        });
      });
    }
  }

  private toggleDropdown(): void {
    this.isOpen = !this.isOpen;
    this.updateDropdownState();

    if (this.isOpen) {
      // Add outside click listener with a small delay to prevent immediate close
      setTimeout(() => {
        document.addEventListener('click', this.outsideClickHandler);
      }, 0);
    } else {
      document.removeEventListener('click', this.outsideClickHandler);
    }
  }

  private updateDropdownState(): void {
    const trigger = this.container.querySelector('.club-selector__trigger');
    const dropdown = this.container.querySelector('.club-selector__dropdown');
    const chevron = this.container.querySelector('.club-selector__chevron');

    if (trigger) {
      trigger.classList.toggle('club-selector__trigger--open', this.isOpen);
    }
    if (dropdown) {
      dropdown.toggleAttribute('hidden', !this.isOpen);
    }
    if (chevron) {
      chevron.textContent = this.isOpen ? '▲' : '▼';
    }
  }

  private handleOutsideClick(e: MouseEvent): void {
    const selector = this.container.querySelector('.club-selector');
    if (selector && !selector.contains(e.target as Node)) {
      this.isOpen = false;
      this.updateDropdownState();
      document.removeEventListener('click', this.outsideClickHandler);
    }
  }

  private selectClub(clubId: string): void {
    clubContext.selectClub(clubId);
    this.isOpen = false;
    document.removeEventListener('click', this.outsideClickHandler);

    const context = clubContext.getContext();
    if (context.currentClub && this.onClubChange) {
      this.onClubChange(context.currentClub);
    }
  }

  destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    document.removeEventListener('click', this.outsideClickHandler);
    this.container.innerHTML = '';
  }
}
