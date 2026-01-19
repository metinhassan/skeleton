/**
 * Side Navigation Component
 * Collapsible navigation with sections for Dashboard, Competitions, Players, My Clubs
 */

export type NavSection = 'dashboard' | 'competitions' | 'players' | 'clubs';

export interface SideNavOptions {
  container: HTMLElement;
  activeSection?: NavSection;
  collapsed?: boolean;
  onNavigate?: (section: NavSection) => void;
  onCollapseChange?: (collapsed: boolean) => void;
}

interface NavItem {
  id: NavSection;
  icon: string;
  label: string;
}

const STORAGE_KEY = 'sideNavCollapsed';

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', icon: '🏠', label: 'Dashboard' },
  { id: 'competitions', icon: '🏆', label: 'Competitions' },
  { id: 'players', icon: '👥', label: 'Players' },
  { id: 'clubs', icon: '🏢', label: 'My Clubs' },
];

export class SideNav {
  private container: HTMLElement;
  private activeSection: NavSection;
  private collapsed: boolean;
  private onNavigate?: (section: NavSection) => void;
  private onCollapseChange?: (collapsed: boolean) => void;
  private navElement: HTMLElement | null = null;

  constructor(options: SideNavOptions) {
    this.container = options.container;
    this.activeSection = options.activeSection || 'dashboard';
    this.onNavigate = options.onNavigate;
    this.onCollapseChange = options.onCollapseChange;

    // Restore collapsed state from localStorage
    const savedState = localStorage.getItem(STORAGE_KEY);
    this.collapsed = options.collapsed ?? (savedState === 'true');

    this.render();
  }

  private render(): void {
    this.container.innerHTML = '';

    const nav = document.createElement('nav');
    nav.className = `side-nav${this.collapsed ? ' side-nav--collapsed' : ''}`;

    nav.innerHTML = `
      <div class="side-nav__logo">
        <div class="side-nav__logo-icon">TM</div>
        <span class="side-nav__logo-text">Tournament Manager</span>
      </div>
      <div class="side-nav__section">
        <div class="side-nav__section-title">Menu</div>
        <ul class="side-nav__items">
          ${NAV_ITEMS.map(
            (item) => `
            <li class="side-nav__item${item.id === this.activeSection ? ' side-nav__item--active' : ''}"
                data-section="${item.id}">
              <span class="side-nav__icon">${item.icon}</span>
              <span class="side-nav__label">${item.label}</span>
            </li>
          `
          ).join('')}
        </ul>
      </div>
      <div class="side-nav__footer">
        <button class="collapse-btn" title="${this.collapsed ? 'Expand sidebar' : 'Collapse sidebar'}">
          <span class="collapse-icon">${this.collapsed ? '→' : '←'}</span>
        </button>
      </div>
    `;

    this.navElement = nav;
    this.container.appendChild(nav);
    this.bindEvents();
  }

  private bindEvents(): void {
    if (!this.navElement) return;

    // Navigation item clicks
    const items = this.navElement.querySelectorAll('.side-nav__item');
    items.forEach((item) => {
      item.addEventListener('click', () => {
        const section = item.getAttribute('data-section') as NavSection;
        if (section) {
          this.setActiveSection(section);
          this.onNavigate?.(section);
        }
      });
    });

    // Collapse toggle
    const collapseBtn = this.navElement.querySelector('.collapse-btn');
    if (collapseBtn) {
      collapseBtn.addEventListener('click', () => {
        this.toggleCollapsed();
      });
    }
  }

  setActiveSection(section: NavSection): void {
    this.activeSection = section;

    if (!this.navElement) return;

    const items = this.navElement.querySelectorAll('.side-nav__item');
    items.forEach((item) => {
      const itemSection = item.getAttribute('data-section');
      if (itemSection === section) {
        item.classList.add('side-nav__item--active');
      } else {
        item.classList.remove('side-nav__item--active');
      }
    });
  }

  toggleCollapsed(): void {
    this.collapsed = !this.collapsed;
    localStorage.setItem(STORAGE_KEY, String(this.collapsed));

    if (this.navElement) {
      this.navElement.classList.toggle('side-nav--collapsed', this.collapsed);

      const collapseBtn = this.navElement.querySelector('.collapse-btn');
      const collapseIcon = this.navElement.querySelector('.collapse-icon');
      if (collapseBtn && collapseIcon) {
        collapseBtn.setAttribute(
          'title',
          this.collapsed ? 'Expand sidebar' : 'Collapse sidebar'
        );
        collapseIcon.textContent = this.collapsed ? '→' : '←';
      }
    }

    this.onCollapseChange?.(this.collapsed);
  }

  isCollapsed(): boolean {
    return this.collapsed;
  }

  destroy(): void {
    this.container.innerHTML = '';
    this.navElement = null;
  }
}
