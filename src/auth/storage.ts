import type { AuthState } from './types';

const DEFAULT_STORAGE_KEY = 'auth_state';

export class AuthStorage {
  private storageKey: string;

  constructor(storageKey: string = DEFAULT_STORAGE_KEY) {
    this.storageKey = storageKey;
  }

  save(state: AuthState): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(state));
    } catch (error) {
      console.error('Failed to save auth state:', error);
    }
  }

  load(): AuthState | null {
    try {
      const data = localStorage.getItem(this.storageKey);
      if (data) {
        return JSON.parse(data) as AuthState;
      }
    } catch (error) {
      console.error('Failed to load auth state:', error);
    }
    return null;
  }

  clear(): void {
    try {
      localStorage.removeItem(this.storageKey);
    } catch (error) {
      console.error('Failed to clear auth state:', error);
    }
  }
}
