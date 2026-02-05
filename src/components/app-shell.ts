/**
 * App Shell Component
 * Layout orchestrator with responsive behavior, sidebar, header, and content area
 */

import { SideNav, NavSection } from './side-nav.js';
import { ClubSelector } from './club-selector.js';
import type { Club } from '../types/club.js';

export interface AppShellOptions {
  container: HTMLElement;
  initialSection?: NavSection;
  onNavigate?: (section: NavSection) => void;
  onClubChange?: (club: Club) => void;
  onLogout?: () => void;
}

const SECTION_TITLES: Record<NavSection, string> = {
  dashboard: 'Dashboard',
  competitions: 'Competitions',
  players: 'Players',
  clubs: 'My Clubs',
};

export class AppShell {
  private container: HTMLElement;
  private onNavigate?: (section: NavSection) => void;
  private onClubChange?: (club: Club) => void;
  private onLogout?: () => void;
  private currentSection: NavSection;

  private shellElement: HTMLElement | null = null;
  private sideNav: SideNav | null = null;
  private clubSelector: ClubSelector | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private isMobileMenuOpen = false;

  constructor(options: AppShellOptions) {
    this.container = options.container;
    this.currentSection = options.initialSection || 'dashboard';
    this.onNavigate = options.onNavigate;
    this.onClubChange = options.onClubChange;
    this.onLogout = options.onLogout;

    this.render();
    this.setupResizeObserver();
  }

  private render(): void {
    this.container.innerHTML = '';

    const shell = document.createElement('div');
    shell.className = 'app-shell';

    shell.innerHTML = `
      <aside class="app-shell__sidebar">
        <div id="side-nav-container"></div>
      </aside>
      <header class="app-shell__header">
        <div class="app-shell__header-left">
          <button class="hamburger-btn" aria-label="Toggle menu">☰</button>
          <h1 class="app-shell__title">${SECTION_TITLES[this.currentSection]}</h1>
        </div>
        <div class="app-shell__header-right">
          <div id="club-selector-container"></div>
          <button id="shell-logout-btn" class="btn btn-secondary">Logout</button>
        </div>
      </header>
      <main class="app-shell__main">
        <div id="app-shell-content"></div>
      </main>
      <div class="mobile-overlay"></div>
    `;

    this.shellElement = shell;
    this.container.appendChild(shell);

    this.initializeComponents();
    this.bindEvents();
  }

  private initializeComponents(): void {
    if (!this.shellElement) return;

    // Initialize SideNav
    const sideNavContainer = this.shellElement.querySelector(
      '#side-nav-container'
    ) as HTMLElement;
    if (sideNavContainer) {
      this.sideNav = new SideNav({
        container: sideNavContainer,
        activeSection: this.currentSection,
        onNavigate: (section) => {
          this.setSection(section);
          this.closeMobileMenu();
        },
        onCollapseChange: (collapsed) => {
          this.shellElement?.classList.toggle('app-shell--collapsed', collapsed);
        },
      });

      // Apply initial collapsed state
      if (this.sideNav.isCollapsed()) {
        this.shellElement.classList.add('app-shell--collapsed');
      }
    }

    // Initialize ClubSelector
    const clubSelectorContainer = this.shellElement.querySelector(
      '#club-selector-container'
    ) as HTMLElement;
    if (clubSelectorContainer) {
      this.clubSelector = new ClubSelector({
        container: clubSelectorContainer,
        onClubChange: (club) => {
          this.onClubChange?.(club);
        },
      });
    }
  }

  private bindEvents(): void {
    if (!this.shellElement) return;

    // Hamburger menu toggle
    const hamburgerBtn = this.shellElement.querySelector('.hamburger-btn');
    if (hamburgerBtn) {
      hamburgerBtn.addEventListener('click', () => {
        this.toggleMobileMenu();
      });
    }

    // Mobile overlay click
    const overlay = this.shellElement.querySelector('.mobile-overlay');
    if (overlay) {
      overlay.addEventListener('click', () => {
        this.closeMobileMenu();
      });
    }

    // Logout button
    const logoutBtn = this.shellElement.querySelector('#shell-logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        this.onLogout?.();
      });
    }
  }

  private setupResizeObserver(): void {
    if (!this.shellElement) return;

    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;

        // Close mobile menu if resizing above mobile breakpoint
        if (width >= 768 && this.isMobileMenuOpen) {
          this.closeMobileMenu();
        }
      }
    });

    this.resizeObserver.observe(document.body);
  }

  private toggleMobileMenu(): void {
    this.isMobileMenuOpen = !this.isMobileMenuOpen;
    this.updateMobileMenuState();
  }

  private closeMobileMenu(): void {
    if (this.isMobileMenuOpen) {
      this.isMobileMenuOpen = false;
      this.updateMobileMenuState();
    }
  }

  private updateMobileMenuState(): void {
    if (!this.shellElement) return;

    const sidebar = this.shellElement.querySelector('.app-shell__sidebar');
    const overlay = this.shellElement.querySelector('.mobile-overlay');

    if (sidebar) {
      sidebar.classList.toggle('app-shell__sidebar--open', this.isMobileMenuOpen);
    }
    if (overlay) {
      overlay.classList.toggle('mobile-overlay--visible', this.isMobileMenuOpen);
    }
  }

  setSection(section: NavSection): void {
    this.currentSection = section;

    // Update title
    const title = this.shellElement?.querySelector('.app-shell__title');
    if (title) {
      title.textContent = SECTION_TITLES[section];
    }

    // Update side nav active state
    this.sideNav?.setActiveSection(section);

    // Notify listener
    this.onNavigate?.(section);
  }

  /**
   * Update the active section visual state without triggering navigation callback
   * Used when navigating via URL to sync the UI state
   */
  setActiveSection(section: NavSection): void {
    this.currentSection = section;

    // Update title
    const title = this.shellElement?.querySelector('.app-shell__title');
    if (title) {
      title.textContent = SECTION_TITLES[section];
    }

    // Update side nav active state
    this.sideNav?.setActiveSection(section);
  }

  getContentContainer(): HTMLElement | null {
    return this.shellElement?.querySelector('#app-shell-content') || null;
  }

  getCurrentSection(): NavSection {
    return this.currentSection;
  }

  destroy(): void {
    this.sideNav?.destroy();
    this.clubSelector?.destroy();
    this.resizeObserver?.disconnect();

    this.sideNav = null;
    this.clubSelector = null;
    this.resizeObserver = null;

    this.container.innerHTML = '';
    this.shellElement = null;
  }
}
