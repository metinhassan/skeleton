/**
 * Service factory
 * Returns appropriate service implementations based on environment
 */

import type { UserService } from './user-service.js';
import { MockUserService } from './mock-user-service.js';

let userService: UserService | null = null;

export function getUserService(): UserService {
  if (userService) return userService;

  const authMode = process.env.AUTH_MODE;

  if (authMode === 'mock' || process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
    userService = new MockUserService();
  } else {
    // Production would use CognitoUserService
    // For now, fall back to mock
    console.warn('Cognito user service not yet implemented, using mock');
    userService = new MockUserService();
  }

  return userService;
}

export function resetUserService(): void {
  userService = null;
}

export * from './user-service.js';
