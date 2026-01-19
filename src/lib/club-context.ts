/**
 * Club Context Manager
 * Singleton for managing club state with localStorage persistence
 */

import type { ClubContext, ClubContextListener } from '../types/club.js';

const STORAGE_KEY = 'selectedClubId';

class ClubContextManager {
  private static instance: ClubContextManager;
  private context: ClubContext = {
    currentClub: null,
    clubs: [],
    isLoading: false,
  };
  private listeners: Set<ClubContextListener> = new Set();

  private constructor() {}

  static getInstance(): ClubContextManager {
    if (!ClubContextManager.instance) {
      ClubContextManager.instance = new ClubContextManager();
    }
    return ClubContextManager.instance;
  }

  /**
   * Initialize the club context by fetching clubs from the API
   */
  async initialize(): Promise<void> {
    this.context.isLoading = true;
    this.notifyListeners();

    try {
      const response = await fetch('/api/clubs', {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch clubs');
      }

      const data = await response.json();
      this.context.clubs = data.clubs || [];

      // Restore previously selected club from localStorage
      const savedClubId = localStorage.getItem(STORAGE_KEY);
      if (savedClubId) {
        const savedClub = this.context.clubs.find((c) => c.id === savedClubId);
        if (savedClub) {
          this.context.currentClub = savedClub;
        }
      }

      // Auto-select first club if none selected and clubs exist
      if (!this.context.currentClub && this.context.clubs.length > 0) {
        this.context.currentClub = this.context.clubs[0];
        localStorage.setItem(STORAGE_KEY, this.context.currentClub.id);
      }
    } catch (error) {
      console.error('Failed to initialize club context:', error);
      this.context.clubs = [];
      this.context.currentClub = null;
    } finally {
      this.context.isLoading = false;
      this.notifyListeners();
    }
  }

  /**
   * Select a club by ID
   */
  selectClub(clubId: string): void {
    const club = this.context.clubs.find((c) => c.id === clubId);
    if (club) {
      this.context.currentClub = club;
      localStorage.setItem(STORAGE_KEY, clubId);
      this.notifyListeners();
    }
  }

  /**
   * Subscribe to context changes
   */
  subscribe(listener: ClubContextListener): () => void {
    this.listeners.add(listener);
    // Immediately notify with current state
    listener(this.context);
    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Get current context (snapshot)
   */
  getContext(): ClubContext {
    return { ...this.context };
  }

  /**
   * Clear the context (for logout)
   */
  clear(): void {
    this.context = {
      currentClub: null,
      clubs: [],
      isLoading: false,
    };
    localStorage.removeItem(STORAGE_KEY);
    this.notifyListeners();
  }

  private notifyListeners(): void {
    const contextSnapshot = this.getContext();
    this.listeners.forEach((listener) => listener(contextSnapshot));
  }
}

// Export singleton instance
export const clubContext = ClubContextManager.getInstance();
