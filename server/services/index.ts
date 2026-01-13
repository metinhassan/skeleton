/**
 * Service factory
 * Returns appropriate service implementations based on environment
 */

import type { UserService } from './user-service.js';
import type { ClubService } from './club-service.js';
import type { CompetitionService } from './competition-service.js';
import { MockUserService } from './mock-user-service.js';
import { MockClubService } from './mock-club-service.js';
import { MockCompetitionService } from './mock-competition-service.js';
import { PostgresUserService } from './postgres-user-service.js';

let userService: UserService | null = null;
let clubService: ClubService | null = null;
let competitionService: CompetitionService | null = null;

export function getUserService(): UserService {
  if (userService) return userService;

  const dbType = process.env.DB_TYPE || 'sqlite';
  const authMode = process.env.AUTH_MODE;

  // Production Cognito mode
  if (authMode === 'cognito') {
    console.warn('Cognito user service not yet implemented, using mock');
    userService = new MockUserService();
    return userService;
  }

  // Database selection for dev/test
  switch (dbType) {
    case 'postgres':
      console.log('Using PostgreSQL database');
      userService = new PostgresUserService();
      break;
    case 'sqlite':
    default:
      console.log('Using SQLite database');
      userService = new MockUserService();
      break;
  }

  return userService;
}

export function getClubService(): ClubService {
  if (clubService) return clubService;

  // For now, use MockClubService for all database types
  clubService = new MockClubService();
  return clubService;
}

export function getCompetitionService(): CompetitionService {
  if (competitionService) return competitionService;

  // For now, use MockCompetitionService for all database types
  competitionService = new MockCompetitionService();
  return competitionService;
}

export function resetUserService(): void {
  userService = null;
}

export function resetClubService(): void {
  clubService = null;
}

export function resetCompetitionService(): void {
  competitionService = null;
}

export * from './user-service.js';
export * from './club-service.js';
export * from './competition-service.js';
