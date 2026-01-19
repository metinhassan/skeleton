/**
 * Service factory
 * Returns appropriate service implementations based on environment
 */

import type { UserService } from './user-service.js';
import type { ClubService } from './club-service.js';
import type { CompetitionService } from './competition-service.js';
import type { PlayerService } from './player-service.js';
import type { DrawService } from './draw-service.js';
import type { EmailService } from './email-service.js';
import type { NotificationService } from './notification-service.js';
import type { LiveScoreService } from './live-score-service.js';
import type { LiveEventsService } from './live-events-service.js';
import { MockUserService } from './mock-user-service.js';
import { MockClubService } from './mock-club-service.js';
import { MockCompetitionService } from './mock-competition-service.js';
import { MockPlayerService } from './mock-player-service.js';
import { MockDrawService } from './mock-draw-service.js';
import { MockEmailService } from './mock-email-service.js';
import { MockNotificationService } from './mock-notification-service.js';
import { PostgresUserService } from './postgres-user-service.js';
import { PostgresClubService } from './postgres-club-service.js';
import { PostgresCompetitionService } from './postgres-competition-service.js';
import { PostgresPlayerService } from './postgres-player-service.js';
import { PostgresDrawService } from './postgres-draw-service.js';
import { PostgresNotificationService } from './postgres-notification-service.js';
import { SmtpEmailService } from './smtp-email-service.js';
import { MockLiveScoreService } from './mock-live-score-service.js';
import { MockLiveEventsService, getMockLiveEventsService } from './mock-live-events-service.js';

let userService: UserService | null = null;
let clubService: ClubService | null = null;
let competitionService: CompetitionService | null = null;
let playerService: PlayerService | null = null;
let drawService: DrawService | null = null;
let emailService: EmailService | null = null;
let notificationService: NotificationService | null = null;
let liveScoreService: LiveScoreService | null = null;
let liveEventsService: LiveEventsService | null = null;

function getDbType(): 'postgres' | 'sqlite' {
  return (process.env.DB_TYPE as 'postgres' | 'sqlite') || 'sqlite';
}

export function getUserService(): UserService {
  if (userService) return userService;

  const dbType = getDbType();
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
      userService = new PostgresUserService();
      break;
    case 'sqlite':
    default:
      userService = new MockUserService();
      break;
  }

  return userService;
}

export function getClubService(): ClubService {
  if (clubService) return clubService;

  const dbType = getDbType();

  switch (dbType) {
    case 'postgres':
      clubService = new PostgresClubService();
      break;
    case 'sqlite':
    default:
      clubService = new MockClubService();
      break;
  }

  return clubService;
}

export function getCompetitionService(): CompetitionService {
  if (competitionService) return competitionService;

  const dbType = getDbType();

  switch (dbType) {
    case 'postgres':
      competitionService = new PostgresCompetitionService();
      break;
    case 'sqlite':
    default:
      competitionService = new MockCompetitionService();
      break;
  }

  return competitionService;
}

export function getPlayerService(): PlayerService {
  if (playerService) return playerService;

  const dbType = getDbType();

  switch (dbType) {
    case 'postgres':
      playerService = new PostgresPlayerService();
      break;
    case 'sqlite':
    default:
      playerService = new MockPlayerService();
      break;
  }

  return playerService;
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

export function resetPlayerService(): void {
  playerService = null;
}

export function getDrawService(): DrawService {
  if (drawService) return drawService;

  const dbType = getDbType();

  switch (dbType) {
    case 'postgres':
      drawService = new PostgresDrawService();
      break;
    case 'sqlite':
    default:
      drawService = new MockDrawService();
      break;
  }

  return drawService;
}

export function resetDrawService(): void {
  drawService = null;
}

export function getEmailService(): EmailService {
  if (emailService) return emailService;

  const emailProvider = process.env.EMAIL_PROVIDER;

  if (emailProvider === 'smtp') {
    emailService = new SmtpEmailService();
  } else {
    // Default to mock for development
    emailService = new MockEmailService();
  }

  return emailService;
}

export function resetEmailService(): void {
  emailService = null;
}

export function getNotificationService(): NotificationService {
  if (notificationService) return notificationService;

  const dbType = getDbType();
  const email = getEmailService();

  switch (dbType) {
    case 'postgres':
      notificationService = new PostgresNotificationService(email);
      break;
    case 'sqlite':
    default:
      notificationService = new MockNotificationService(email);
      break;
  }

  return notificationService;
}

export function resetNotificationService(): void {
  notificationService = null;
}

export function getLiveScoreService(): LiveScoreService {
  if (liveScoreService) return liveScoreService;

  // Currently only mock implementation available
  // Future: add PostgresLiveScoreService for production
  liveScoreService = new MockLiveScoreService();

  return liveScoreService;
}

export function resetLiveScoreService(): void {
  liveScoreService = null;
}

export function getLiveEventsService(): LiveEventsService {
  if (liveEventsService) return liveEventsService;

  // Use singleton instance for event broadcasting
  liveEventsService = getMockLiveEventsService();

  return liveEventsService;
}

export function resetLiveEventsService(): void {
  liveEventsService = null;
}

export * from './user-service.js';
export * from './club-service.js';
export * from './competition-service.js';
export * from './player-service.js';
export * from './draw-service.js';
export * from './email-service.js';
export * from './notification-service.js';
export * from './live-score-service.js';
export * from './live-events-service.js';
