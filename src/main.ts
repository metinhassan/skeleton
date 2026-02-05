/**
 * Frontend app using server-side cookie authentication
 * Cookies are HttpOnly and managed by the server
 */

import { RegistrationForm } from './components/registration.js';
import { ProfileEdit } from './components/profile-edit.js';
import { LiveScoring } from './components/live-scoring.js';
import { PublicLiveScores } from './components/public-live-scores.js';
import { PublicMatchView } from './components/public-match-view.js';
import { BracketView } from './components/bracket-view.js';
import { PublicRegistration } from './components/public-registration.js';
import { AppShell } from './components/app-shell.js';
import type { NavSection } from './components/side-nav.js';
import { clubContext } from './lib/club-context.js';
import { CompetitionList } from './components/competition-list.js';
import { CompetitionForm } from './components/competition-form.js';
import { CompetitionDetail } from './components/competition-detail.js';
import { PlayerList } from './components/player-list.js';
import { PlayerForm } from './components/player-form.js';
import { TeamForm } from './components/team-form.js';
import type { Player, Team } from './types/player.js';
import { toast } from './components/toast.js';

interface User {
  id: string;
  email: string;
  name?: string;
  roles?: string[];
}

interface AuthResponse {
  authenticated: boolean;
  user?: User;
}

interface LoginResponse {
  success: boolean;
  user?: User;
  error?: string;
}

type ViewName = 'login' | 'register' | 'dashboard' | 'profile' | 'live-scoring' | 'public-live' | 'public-match' | 'bracket' | 'public-registration' | 'app-shell';

// Route parameter interface
interface RouteParams {
  clubId?: string;
  matchId?: string;
  slug?: string;
}

class App {
  private user: User | null = null;
  public currentView: ViewName = 'login';
  private currentSection: NavSection = 'dashboard';

  // Views
  private loginView: HTMLElement;
  private registerView: HTMLElement;
  private dashboardView: HTMLElement;
  private profileView: HTMLElement;
  private liveScoringView: HTMLElement;
  private publicLiveView: HTMLElement;
  private publicMatchView: HTMLElement;
  private bracketView: HTMLElement;
  private publicRegistrationView: HTMLElement;
  private appShellContainer: HTMLElement;

  // App Shell
  private appShell: AppShell | null = null;
  private dashboardContentTemplate: HTMLTemplateElement;

  // Login form elements
  private loginForm: HTMLFormElement;
  private emailInput: HTMLInputElement;
  private passwordInput: HTMLInputElement;
  private loginBtn: HTMLButtonElement;
  private errorMessage: HTMLElement;

  // User name display (dynamically found in app shell content)
  private userNameDisplay: HTMLElement | null = null;
  private editProfileBtn: HTMLElement | null = null;

  // Active component instances (for cleanup)
  private activeLiveScoring: LiveScoring | null = null;
  private activePublicLive: PublicLiveScores | null = null;
  private activePublicMatch: PublicMatchView | null = null;
  private activeBracket: BracketView | null = null;
  private activePublicRegistration: PublicRegistration | null = null;
  private activeCompetitionList: CompetitionList | null = null;
  private activeCompetitionDetail: CompetitionDetail | null = null;
  private activeCompetitionForm: CompetitionForm | null = null;
  private activePlayerList: PlayerList | null = null;
  private activePlayerForm: PlayerForm | null = null;
  private activeTeamForm: TeamForm | null = null;

  constructor() {
    // Get view elements
    this.loginView = this.getElement('#login-view');
    this.registerView = this.getElement('#register-view');
    this.dashboardView = this.getElement('#dashboard-view');
    this.profileView = this.getElement('#profile-view');
    this.liveScoringView = this.getElement('#live-scoring-view');
    this.publicLiveView = this.getElement('#public-live-view');
    this.publicMatchView = this.getElement('#public-match-view');
    this.bracketView = this.getElement('#bracket-view');
    this.publicRegistrationView = this.getElement('#public-registration-view');
    this.appShellContainer = this.getElement('#app-shell-container');

    // Get dashboard content template
    this.dashboardContentTemplate = this.getElement('#dashboard-content') as HTMLTemplateElement;

    // Get login form elements
    this.loginForm = this.getElement('#login-form') as HTMLFormElement;
    this.emailInput = this.getElement('#email') as HTMLInputElement;
    this.passwordInput = this.getElement('#password') as HTMLInputElement;
    this.loginBtn = this.getElement('#login-btn') as HTMLButtonElement;
    this.errorMessage = this.getElement('#error-message');

    this.bindEvents();
    this.setupRouting();
    this.handleInitialRoute();
  }

  private getElement(selector: string): HTMLElement {
    const element = document.querySelector(selector);
    if (!element) {
      throw new Error(`Element not found: ${selector}`);
    }
    return element as HTMLElement;
  }

  private bindEvents(): void {
    // Login form events
    this.loginForm.addEventListener('submit', (e) => this.handleLogin(e));
    this.emailInput.addEventListener('input', () => this.hideError());
    this.passwordInput.addEventListener('input', () => this.hideError());

    // Switch to register link
    const switchToRegister = document.querySelector('#switch-to-register');
    if (switchToRegister) {
      switchToRegister.addEventListener('click', (e) => {
        e.preventDefault();
        this.showRegister();
      });
    }
  }

  /**
   * Setup hash-based routing
   */
  private setupRouting(): void {
    window.addEventListener('hashchange', () => this.handleRoute());
  }

  /**
   * Handle the initial route on page load
   */
  private async handleInitialRoute(): Promise<void> {
    const hash = window.location.hash.slice(1);

    // Check if this is a public route (no auth required)
    if (this.isPublicRoute(hash)) {
      this.handleRoute();
      return;
    }

    // For protected routes, check auth first
    await this.checkAuth();

    // After auth check, handle the route if authenticated
    if (this.user && hash) {
      this.handleRoute();
    }
  }

  /**
   * Check if a route is public (no auth required)
   */
  private isPublicRoute(hash: string): boolean {
    // Public live scoring routes
    if (hash.startsWith('/live/')) {
      return true;
    }
    // Public competition routes (bracket, register) - these have a slug, not UUID
    if (hash.match(/^\/competitions\/[^/]+\/(bracket|register)$/)) {
      return true;
    }
    return false;
  }

  /**
   * Handle route changes
   */
  private handleRoute(): void {
    const hash = window.location.hash.slice(1);

    // Parse route and extract parameters
    const params = this.parseRoute(hash);

    if (!params) {
      // No special route, show default view based on auth
      if (this.user) {
        this.showDashboard();
      }
      return;
    }

    // Route to appropriate view
    if (params.route === 'live-scoring' && params.clubId && params.matchId) {
      this.showLiveScoring(params.clubId, params.matchId);
    } else if (params.route === 'public-live' && params.slug) {
      this.showPublicLive(params.slug);
    } else if (params.route === 'public-match' && params.matchId) {
      this.showPublicMatch(params.matchId);
    } else if (params.route === 'bracket' && params.slug) {
      this.showBracket(params.slug);
    } else if (params.route === 'public-registration' && params.slug) {
      this.showPublicRegistration(params.slug);
    } else if (params.route === 'account-register') {
      this.showRegister();
    } else if (params.route === 'dashboard') {
      this.showDashboard();
    } else if (params.route === 'competitions') {
      this.showAppShellSection('competitions');
    } else if (params.route === 'competition-detail' && params.slug) {
      this.showAppShellSection('competitions', params.slug);
    } else if (params.route === 'players') {
      this.showAppShellSection('players');
    } else if (params.route === 'clubs') {
      this.showAppShellSection('clubs');
    }
  }

  /**
   * Parse route and extract parameters
   */
  private parseRoute(hash: string): { route: string } & RouteParams | null {
    // Match: /clubs/:clubId/matches/:matchId/score
    const scoringMatch = hash.match(/^\/clubs\/([^/]+)\/matches\/([^/]+)\/score$/);
    if (scoringMatch) {
      return { route: 'live-scoring', clubId: scoringMatch[1], matchId: scoringMatch[2] };
    }

    // Match: /live/:slug
    const publicLiveMatch = hash.match(/^\/live\/([^/]+)$/);
    if (publicLiveMatch) {
      return { route: 'public-live', slug: publicLiveMatch[1] };
    }

    // Match: /live/match/:matchId
    const publicMatchMatch = hash.match(/^\/live\/match\/([^/]+)$/);
    if (publicMatchMatch) {
      return { route: 'public-match', matchId: publicMatchMatch[1] };
    }

    // Match: /competitions/:slug/bracket (public bracket view)
    const bracketMatch = hash.match(/^\/competitions\/([^/]+)\/bracket$/);
    if (bracketMatch) {
      return { route: 'bracket', slug: bracketMatch[1] };
    }

    // Match: /competitions/:slug/register (public registration)
    const publicRegisterMatch = hash.match(/^\/competitions\/([^/]+)\/register$/);
    if (publicRegisterMatch) {
      return { route: 'public-registration', slug: publicRegisterMatch[1] };
    }

    // Match: /register (account registration)
    if (hash === '/register') {
      return { route: 'account-register' };
    }

    // === Internal app routes (require auth) ===

    // Match: /dashboard
    if (hash === '/dashboard' || hash === '/') {
      return { route: 'dashboard' };
    }

    // Match: /competitions (list) - exact match
    if (hash === '/competitions') {
      return { route: 'competitions' };
    }

    // Match: /competitions/:slug (competition detail - slug format: lowercase, numbers, hyphens)
    // This must come after /competitions/:slug/bracket and /competitions/:slug/register checks above
    const competitionDetailMatch = hash.match(/^\/competitions\/([a-z0-9-]+)$/);
    if (competitionDetailMatch) {
      return { route: 'competition-detail', slug: competitionDetailMatch[1] };
    }

    // Match: /players
    if (hash === '/players') {
      return { route: 'players' };
    }

    // Match: /clubs
    if (hash === '/clubs') {
      return { route: 'clubs' };
    }

    return null;
  }

  /**
   * Navigate to a route
   */
  public navigate(path: string): void {
    window.location.hash = path;
  }

  /**
   * Check authentication status with the server
   */
  private async checkAuth(): Promise<void> {
    try {
      const response = await fetch('/auth/me', {
        credentials: 'include',
      });

      const data: AuthResponse = await response.json();

      if (data.authenticated && data.user) {
        this.user = data.user;
        // Navigate to dashboard via URL (if no specific route is set)
        const currentHash = window.location.hash.slice(1);
        if (!currentHash || currentHash === '/') {
          this.navigate('/dashboard');
        }
      } else {
        this.showLogin();
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      this.showLogin();
    }
  }

  /**
   * Handle login form submission
   */
  private async handleLogin(event: Event): Promise<void> {
    event.preventDefault();

    const email = this.emailInput.value.trim();
    const password = this.passwordInput.value;

    if (!email || !password) {
      this.showError('Please enter email and password');
      return;
    }

    this.setLoading(true);
    this.hideError();

    try {
      const response = await fetch('/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });

      const data: LoginResponse = await response.json();

      if (!response.ok || !data.success) {
        this.showError(data.error || 'Invalid email or password');
        this.setLoading(false);
        return;
      }

      if (data.user) {
        this.user = data.user;

        // Check for return URL from registration flow
        const returnUrl = sessionStorage.getItem('registration_return_url');
        if (returnUrl) {
          sessionStorage.removeItem('registration_return_url');
          window.location.hash = returnUrl.replace(/^#/, '');
          return;
        }

        // Navigate to dashboard - set hash and show view directly
        // (hashchange may not fire if hash is already /dashboard)
        window.location.hash = '/dashboard';
        this.showDashboard();
      }
    } catch (error) {
      console.error('Login failed:', error);
      this.showError('Login failed. Please try again.');
    } finally {
      this.setLoading(false);
    }
  }

  /**
   * Logout via server endpoint
   */
  private async handleLogout(): Promise<void> {
    try {
      await fetch('/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });

      // Clean up app shell
      if (this.appShell) {
        this.appShell.destroy();
        this.appShell = null;
      }

      // Clear club context
      clubContext.clear();

      this.user = null;
      this.userNameDisplay = null;
      this.editProfileBtn = null;
      this.showLogin();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  }

  /**
   * Cleanup active components before switching views
   */
  private cleanupActiveComponents(): void {
    if (this.activeLiveScoring) {
      this.activeLiveScoring.destroy();
      this.activeLiveScoring = null;
    }
    if (this.activePublicLive) {
      this.activePublicLive.destroy();
      this.activePublicLive = null;
    }
    if (this.activePublicMatch) {
      this.activePublicMatch.destroy();
      this.activePublicMatch = null;
    }
    if (this.activeBracket) {
      this.activeBracket.destroy();
      this.activeBracket = null;
    }
    if (this.activePublicRegistration) {
      this.activePublicRegistration.destroy();
      this.activePublicRegistration = null;
    }
    this.cleanupCompetitionComponents();
    this.cleanupPlayerComponents();
  }

  /**
   * Cleanup competition-related components (for switching within app shell)
   */
  private cleanupCompetitionComponents(): void {
    if (this.activeCompetitionList) {
      this.activeCompetitionList.destroy();
      this.activeCompetitionList = null;
    }
    if (this.activeCompetitionDetail) {
      this.activeCompetitionDetail.destroy();
      this.activeCompetitionDetail = null;
    }
    if (this.activeCompetitionForm) {
      this.activeCompetitionForm.destroy();
      this.activeCompetitionForm = null;
    }
  }

  /**
   * Cleanup player-related components (for switching within app shell)
   */
  private cleanupPlayerComponents(): void {
    if (this.activePlayerList) {
      this.activePlayerList.destroy();
      this.activePlayerList = null;
    }
    if (this.activePlayerForm) {
      this.activePlayerForm.destroy();
      this.activePlayerForm = null;
    }
    if (this.activeTeamForm) {
      this.activeTeamForm.destroy();
      this.activeTeamForm = null;
    }
  }

  /**
   * Show a specific view, hiding all others
   */
  private showView(view: ViewName): void {
    // Cleanup previous components
    this.cleanupActiveComponents();

    this.currentView = view;

    this.loginView.hidden = view !== 'login';
    this.registerView.hidden = view !== 'register';
    this.dashboardView.hidden = view !== 'dashboard';
    this.profileView.hidden = view !== 'profile';
    this.liveScoringView.hidden = view !== 'live-scoring';
    this.publicLiveView.hidden = view !== 'public-live';
    this.publicMatchView.hidden = view !== 'public-match';
    this.bracketView.hidden = view !== 'bracket';
    this.publicRegistrationView.hidden = view !== 'public-registration';
    this.appShellContainer.hidden = view !== 'app-shell';
  }

  private showLogin(): void {
    this.showView('login');
    this.loginForm.reset();
    this.hideError();
    this.emailInput.focus();
  }

  private showRegister(): void {
    this.showView('register');

    new RegistrationForm({
      container: this.registerView,
      onSuccess: (user) => {
        this.user = user;

        // Check for return URL from registration flow
        const returnUrl = sessionStorage.getItem('registration_return_url');
        if (returnUrl) {
          sessionStorage.removeItem('registration_return_url');
          window.location.hash = returnUrl.replace(/^#/, '');
          return;
        }

        // Navigate to dashboard via URL
        this.navigate('/dashboard');
      },
      onSwitchToLogin: () => {
        this.showLogin();
      },
    });
  }

  private async showDashboard(): Promise<void> {
    if (!this.user) return;

    // Initialize app shell if not already initialized
    if (!this.appShell) {
      await this.initAppShell();
    }

    this.showView('app-shell');
    this.handleNavigation('dashboard', false); // Don't update URL, we're already here from routing
  }

  /**
   * Show app shell with a specific section (called from routing)
   */
  private async showAppShellSection(section: NavSection, competitionId?: string): Promise<void> {
    if (!this.user) {
      this.showLogin();
      return;
    }

    // Initialize app shell if not already initialized
    if (!this.appShell) {
      await this.initAppShell();
    }

    this.showView('app-shell');

    // Update side nav active state
    this.appShell?.setActiveSection(section);

    if (section === 'competitions' && competitionId) {
      // Show competition detail directly
      this.currentSection = section;
      this.cleanupCompetitionComponents();
      this.cleanupPlayerComponents();
      this.showCompetitionDetail(competitionId, false); // Don't update URL
    } else {
      this.handleNavigation(section, false); // Don't update URL, we're already here from routing
    }
  }

  /**
   * Initialize the App Shell with club context
   */
  private async initAppShell(): Promise<void> {
    // Initialize club context
    await clubContext.initialize();

    // Create App Shell
    this.appShell = new AppShell({
      container: this.appShellContainer,
      initialSection: this.currentSection,
      onNavigate: (section) => {
        this.handleNavigation(section);
      },
      onClubChange: (club) => {
        console.log('Club changed:', club.name);
      },
      onLogout: () => {
        this.handleLogout();
      },
    });

    // Load initial dashboard content
    this.loadDashboardContent();
  }

  /**
   * Load dashboard content into the app shell
   */
  private loadDashboardContent(): void {
    const contentContainer = this.appShell?.getContentContainer();
    if (!contentContainer) return;

    // Clone template content
    const content = this.dashboardContentTemplate.content.cloneNode(true) as DocumentFragment;
    contentContainer.innerHTML = '';
    contentContainer.appendChild(content);

    // Update user name display
    this.userNameDisplay = contentContainer.querySelector('#user-name');
    if (this.userNameDisplay && this.user) {
      const displayName = this.user.name || this.user.email || 'User';
      this.userNameDisplay.textContent = `Welcome, ${displayName}`;
    }

    // Bind edit profile button
    this.editProfileBtn = contentContainer.querySelector('#edit-profile-btn');
    if (this.editProfileBtn) {
      this.editProfileBtn.addEventListener('click', () => this.showProfile());
    }
  }

  /**
   * Handle navigation between sections
   * @param section - The section to navigate to
   * @param updateUrl - Whether to update the URL hash (default: true)
   */
  private handleNavigation(section: NavSection, updateUrl: boolean = true): void {
    this.currentSection = section;

    // Update URL if requested
    if (updateUrl) {
      const path = section === 'dashboard' ? '/dashboard' : `/${section}`;
      window.location.hash = path;
      return; // The hashchange event will trigger handleRoute which calls back with updateUrl=false
    }

    // Cleanup components when switching sections
    this.cleanupCompetitionComponents();
    this.cleanupPlayerComponents();

    // Update content based on section
    const contentContainer = this.appShell?.getContentContainer();
    if (!contentContainer) return;

    switch (section) {
      case 'dashboard':
        this.loadDashboardContent();
        break;
      case 'competitions':
        this.showCompetitionList();
        break;
      case 'players':
        this.showPlayerList();
        break;
      case 'clubs':
        contentContainer.innerHTML = `
          <div class="welcome-card">
            <h2>My Clubs</h2>
            <p>Club settings coming soon...</p>
          </div>
        `;
        break;
    }
  }

  /**
   * Show competition list
   */
  private showCompetitionList(): void {
    const contentContainer = this.appShell?.getContentContainer();
    if (!contentContainer) return;

    const currentClub = clubContext.getContext().currentClub;
    if (!currentClub) {
      contentContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__icon">🏢</div>
          <h3 class="empty-state__title">No club selected</h3>
          <p class="empty-state__description">
            Please select a club to view competitions.
          </p>
        </div>
      `;
      return;
    }

    contentContainer.innerHTML = '';
    this.activeCompetitionList = new CompetitionList({
      container: contentContainer,
      clubId: currentClub.id,
      onCreateClick: () => this.showCreateCompetition(),
      onCompetitionClick: (competition) => this.showCompetitionDetail(competition.slug || competition.id),
    });
  }

  /**
   * Show create competition form
   */
  private showCreateCompetition(): void {
    const currentClub = clubContext.getContext().currentClub;
    if (!currentClub) return;

    this.activeCompetitionForm = new CompetitionForm({
      mode: 'create',
      clubId: currentClub.id,
      onSuccess: (competition) => {
        this.activeCompetitionForm = null;
        this.showCompetitionDetail(competition.slug || competition.id);
      },
      onCancel: () => {
        this.activeCompetitionForm = null;
      },
    });
  }

  /**
   * Show competition detail
   * @param slugOrId - The competition slug (or ID for backwards compatibility)
   * @param updateUrl - Whether to update the URL hash (default: true)
   */
  private showCompetitionDetail(slugOrId: string, updateUrl: boolean = true): void {
    // Update URL if requested
    if (updateUrl) {
      window.location.hash = `/competitions/${slugOrId}`;
      return; // The hashchange event will handle rendering
    }

    const contentContainer = this.appShell?.getContentContainer();
    if (!contentContainer) return;

    const currentClub = clubContext.getContext().currentClub;
    if (!currentClub) return;

    // Cleanup list if showing detail
    if (this.activeCompetitionList) {
      this.activeCompetitionList.destroy();
      this.activeCompetitionList = null;
    }

    contentContainer.innerHTML = '';
    this.activeCompetitionDetail = new CompetitionDetail({
      container: contentContainer,
      competitionSlug: slugOrId,
      clubId: currentClub.id,
      onBack: () => {
        this.cleanupCompetitionComponents();
        this.navigate('/competitions');
      },
      onNavigateToPublic: (slug) => {
        this.navigate(`/competitions/${slug}/bracket`);
      },
    });
  }

  /**
   * Show player list
   */
  private showPlayerList(): void {
    const contentContainer = this.appShell?.getContentContainer();
    if (!contentContainer) return;

    const currentClub = clubContext.getContext().currentClub;
    if (!currentClub) {
      contentContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__icon">🏢</div>
          <h3 class="empty-state__title">No club selected</h3>
          <p class="empty-state__description">
            Please select a club to view players.
          </p>
        </div>
      `;
      return;
    }

    contentContainer.innerHTML = '';
    this.activePlayerList = new PlayerList({
      container: contentContainer,
      clubId: currentClub.id,
      onCreatePlayer: () => this.showCreatePlayer(),
      onEditPlayer: (player) => this.showEditPlayer(player),
      onDeletePlayer: (player) => this.handleDeletePlayer(player),
      onCreateTeam: () => this.showCreateTeam(),
      onEditTeam: (team) => this.handleEditTeam(team),
      onDeleteTeam: (team) => this.handleDeleteTeam(team),
    });
  }

  /**
   * Show create player form
   */
  private showCreatePlayer(): void {
    const currentClub = clubContext.getContext().currentClub;
    if (!currentClub) return;

    this.activePlayerForm = new PlayerForm({
      mode: 'create',
      clubId: currentClub.id,
      onSuccess: (_player, addAnother) => {
        if (!addAnother) {
          this.activePlayerForm = null;
        }
        this.activePlayerList?.refresh();
      },
      onCancel: () => {
        this.activePlayerForm = null;
      },
    });
  }

  /**
   * Show edit player form
   */
  private showEditPlayer(player: Player): void {
    const currentClub = clubContext.getContext().currentClub;
    if (!currentClub) return;

    this.activePlayerForm = new PlayerForm({
      mode: 'edit',
      clubId: currentClub.id,
      player,
      onSuccess: () => {
        this.activePlayerForm = null;
        this.activePlayerList?.refresh();
      },
      onCancel: () => {
        this.activePlayerForm = null;
      },
    });
  }

  /**
   * Handle delete player
   */
  private async handleDeletePlayer(player: Player): Promise<void> {
    const confirmed = confirm(`Are you sure you want to delete "${player.name}"? This action cannot be undone.`);
    if (!confirmed) return;

    const currentClub = clubContext.getContext().currentClub;
    if (!currentClub) return;

    try {
      const response = await fetch(`/api/clubs/${currentClub.id}/players/${player.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to delete player');
      }

      toast.success('Player deleted successfully');
      this.activePlayerList?.refresh();
    } catch (error) {
      console.error('Failed to delete player:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to delete player');
    }
  }

  /**
   * Show create team form
   */
  private showCreateTeam(): void {
    const currentClub = clubContext.getContext().currentClub;
    if (!currentClub) return;

    const players = this.activePlayerList?.getPlayers() || [];

    this.activeTeamForm = new TeamForm({
      clubId: currentClub.id,
      players,
      onSuccess: () => {
        this.activeTeamForm = null;
        this.activePlayerList?.refresh();
      },
      onCancel: () => {
        this.activeTeamForm = null;
      },
    });
  }

  /**
   * Handle edit team (placeholder - could open a form)
   */
  private handleEditTeam(team: Team): void {
    // For now, just show a message. Could implement TeamForm in edit mode.
    toast.info(`Edit team "${team.name}" - Coming soon`);
  }

  /**
   * Handle delete team
   */
  private async handleDeleteTeam(team: Team): Promise<void> {
    const confirmed = confirm(`Are you sure you want to delete team "${team.name}"? This action cannot be undone.`);
    if (!confirmed) return;

    const currentClub = clubContext.getContext().currentClub;
    if (!currentClub) return;

    try {
      const response = await fetch(`/api/clubs/${currentClub.id}/teams/${team.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to delete team');
      }

      toast.success('Team deleted successfully');
      this.activePlayerList?.refresh();
    } catch (error) {
      console.error('Failed to delete team:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to delete team');
    }
  }

  private showProfile(): void {
    if (!this.user) return;

    this.showView('profile');

    new ProfileEdit({
      container: this.profileView,
      user: {
        id: this.user.id,
        email: this.user.email,
        name: this.user.name || '',
        roles: this.user.roles || [],
      },
      onUpdate: (updatedUser) => {
        this.user = {
          ...this.user!,
          ...updatedUser,
        };
        if (this.userNameDisplay) {
          const displayName = updatedUser.name || updatedUser.email || 'User';
          this.userNameDisplay.textContent = `Welcome, ${displayName}`;
        }
      },
      onClose: () => {
        window.location.hash = '/dashboard';
        this.showDashboard();
      },
    });
  }

  private setLoading(loading: boolean): void {
    this.loginBtn.disabled = loading;
    const btnText = this.loginBtn.querySelector('.btn-text') as HTMLElement;
    const btnLoading = this.loginBtn.querySelector('.btn-loading') as HTMLElement;

    if (btnText && btnLoading) {
      btnText.hidden = loading;
      btnLoading.hidden = !loading;
    }
  }

  private showError(message: string): void {
    this.errorMessage.textContent = message;
    this.errorMessage.hidden = false;
  }

  private hideError(): void {
    this.errorMessage.hidden = true;
  }

  /**
   * Show live scoring view (requires auth)
   */
  private showLiveScoring(clubId: string, matchId: string): void {
    if (!this.user) {
      // Store intended destination and show login
      this.showLogin();
      return;
    }

    this.showView('live-scoring');

    this.activeLiveScoring = new LiveScoring({
      container: this.liveScoringView,
      clubId,
      matchId,
      onClose: () => {
        this.navigate('/dashboard');
      },
    });
  }

  /**
   * Show public live scores view (no auth required)
   */
  private showPublicLive(slug: string): void {
    this.showView('public-live');

    this.activePublicLive = new PublicLiveScores({
      container: this.publicLiveView,
      competitionSlug: slug,
      onMatchClick: (matchId) => {
        this.navigate(`/live/match/${matchId}`);
      },
    });
  }

  /**
   * Show public match view (no auth required)
   */
  private showPublicMatch(matchId: string): void {
    this.showView('public-match');

    this.activePublicMatch = new PublicMatchView({
      container: this.publicMatchView,
      matchId,
      onBack: () => {
        window.history.back();
      },
    });
  }

  /**
   * Show bracket view (no auth required)
   */
  private showBracket(slug: string): void {
    this.showView('bracket');

    this.activeBracket = new BracketView({
      container: this.bracketView,
      competitionSlug: slug,
    });
  }

  /**
   * Show public registration view (no auth required for viewing, auth for submitting)
   */
  private showPublicRegistration(slug: string): void {
    this.showView('public-registration');

    this.activePublicRegistration = new PublicRegistration({
      container: this.publicRegistrationView,
      competitionSlug: slug,
      onLoginRequired: () => {
        // Store return URL in sessionStorage for redirect after login
        sessionStorage.setItem('registration_return_url', window.location.hash);
        this.showLogin();
      },
    });
  }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new App();
});
