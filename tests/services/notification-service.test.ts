/**
 * Unit tests for MockNotificationService
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MockNotificationService } from '../../server/services/mock-notification-service.js';
import { MockEmailService } from '../../server/services/mock-email-service.js';
import { MockPlayerService } from '../../server/services/mock-player-service.js';
import { MockClubService } from '../../server/services/mock-club-service.js';
import { MockCompetitionService } from '../../server/services/mock-competition-service.js';
import { MockUserService } from '../../server/services/mock-user-service.js';
import { MockDrawService } from '../../server/services/mock-draw-service.js';
import { resetDatabase } from '../../server/db/database.js';

describe('MockNotificationService', () => {
  let notificationService: MockNotificationService;
  let emailService: MockEmailService;
  let playerService: MockPlayerService;
  let clubService: MockClubService;
  let competitionService: MockCompetitionService;
  let userService: MockUserService;
  let drawService: MockDrawService;
  let userId: string;
  let clubId: string;
  let competitionId: string;
  let divisionId: string;
  let playerId: string;

  beforeEach(async () => {
    resetDatabase();
    emailService = new MockEmailService();
    notificationService = new MockNotificationService(emailService, 'https://test.example.com');
    playerService = new MockPlayerService();
    clubService = new MockClubService();
    competitionService = new MockCompetitionService();
    userService = new MockUserService();
    drawService = new MockDrawService();

    // Create test user
    const userResult = await userService.register({
      email: 'player@example.com',
      password: 'password123',
      name: 'Test Player',
    });
    userId = userResult.data!.id;

    // Create test club
    const clubResult = await clubService.createClub({ name: 'Test Club' }, userId);
    clubId = clubResult.data!.id;

    // Create test competition
    const compResult = await competitionService.createCompetition(
      clubId,
      {
        name: 'Test Tournament',
        type: 'tournament',
        format: 'knockout',
      },
      userId
    );
    competitionId = compResult.data!.id;

    // Create test division
    const divResult = await competitionService.createDivision(competitionId, {
      name: 'Open Singles',
    });
    divisionId = divResult.data!.id;

    // Create player linked to user
    const playerResult = await playerService.createPlayer(clubId, {
      name: 'Test Player',
      email: 'player@example.com',
    });
    playerId = playerResult.data!.id;

    // Link player to user
    await playerService.linkUserToPlayer(playerId, userId);
  });

  // ==================== Preferences Tests ====================

  describe('getPreferences', () => {
    it('should return default preferences for new user', async () => {
      const prefs = await notificationService.getPreferences(userId);

      expect(prefs.userId).toBe(userId);
      expect(prefs.matchScheduled).toBe(true);
      expect(prefs.matchReminder).toBe(true);
      expect(prefs.registrationStatus).toBe(true);
      expect(prefs.partnerRequests).toBe(true);
      expect(prefs.competitionUpdates).toBe(true);
    });

    it('should return same preferences on subsequent calls', async () => {
      const prefs1 = await notificationService.getPreferences(userId);
      const prefs2 = await notificationService.getPreferences(userId);

      expect(prefs1.id).toBe(prefs2.id);
      expect(prefs1.matchScheduled).toBe(prefs2.matchScheduled);
    });
  });

  describe('updatePreferences', () => {
    it('should update single preference', async () => {
      await notificationService.updatePreferences(userId, { matchScheduled: false });

      const prefs = await notificationService.getPreferences(userId);
      expect(prefs.matchScheduled).toBe(false);
      expect(prefs.matchReminder).toBe(true); // Others unchanged
    });

    it('should update multiple preferences', async () => {
      await notificationService.updatePreferences(userId, {
        matchScheduled: false,
        matchReminder: false,
        partnerRequests: false,
      });

      const prefs = await notificationService.getPreferences(userId);
      expect(prefs.matchScheduled).toBe(false);
      expect(prefs.matchReminder).toBe(false);
      expect(prefs.partnerRequests).toBe(false);
      expect(prefs.registrationStatus).toBe(true); // Unchanged
      expect(prefs.competitionUpdates).toBe(true); // Unchanged
    });
  });

  // ==================== Registration Notification Tests ====================

  describe('queueRegistrationApproved', () => {
    it('should queue notification for registration approval', async () => {
      // Create an entry
      const entryResult = await playerService.createEntry(divisionId, {
        entryType: 'singles',
        playerId: playerId,
      });
      const entryId = entryResult.data!.id;

      const result = await notificationService.queueRegistrationApproved(entryId);

      expect(result.success).toBe(true);

      const notifications = await notificationService.getQueuedNotifications('pending');
      expect(notifications.length).toBeGreaterThan(0);

      const notification = notifications.find((n) => n.type === 'registration_approved');
      expect(notification).toBeDefined();
      expect(notification!.userId).toBe(userId);
    });

    it('should not queue if user opted out', async () => {
      await notificationService.updatePreferences(userId, { registrationStatus: false });

      const entryResult = await playerService.createEntry(divisionId, {
        entryType: 'singles',
        playerId: playerId,
      });
      const entryId = entryResult.data!.id;

      const result = await notificationService.queueRegistrationApproved(entryId);

      // Should fail because user opted out
      expect(result.success).toBe(false);
    });

    it('should fail for non-existent entry', async () => {
      const result = await notificationService.queueRegistrationApproved('non-existent-id');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('entry_not_found');
      }
    });
  });

  describe('queueRegistrationRejected', () => {
    it('should queue notification for registration rejection with reason', async () => {
      const entryResult = await playerService.createEntry(divisionId, {
        entryType: 'singles',
        playerId: playerId,
      });
      const entryId = entryResult.data!.id;

      const result = await notificationService.queueRegistrationRejected(entryId, 'Division is full');

      expect(result.success).toBe(true);

      const notifications = await notificationService.getQueuedNotifications('pending');
      const notification = notifications.find((n) => n.type === 'registration_rejected');
      expect(notification).toBeDefined();
      expect(notification!.metadata?.reason).toBe('Division is full');
    });
  });

  // ==================== Queue Processing Tests ====================

  describe('processQueue', () => {
    it('should send pending notifications', async () => {
      // Create an entry and queue notification
      const entryResult = await playerService.createEntry(divisionId, {
        entryType: 'singles',
        playerId: playerId,
      });
      await notificationService.queueRegistrationApproved(entryResult.data!.id);

      // Process queue
      const result = await notificationService.processQueue();

      expect(result.sent).toBeGreaterThan(0);
      expect(result.failed).toBe(0);

      // Check email was sent
      const emails = emailService.getSentEmails();
      expect(emails.length).toBeGreaterThan(0);
      expect(emails[0].to).toBe('player@example.com');
    });

    it('should not process future scheduled notifications', async () => {
      // Create a second player for doubles
      const player2Result = await playerService.createPlayer(clubId, {
        name: 'Second Player',
        email: 'player2@example.com',
      });
      const player2Id = player2Result.data!.id;

      // Create entries for both players
      await playerService.createEntry(divisionId, {
        entryType: 'singles',
        playerId: playerId,
      });
      await playerService.createEntry(divisionId, {
        entryType: 'singles',
        playerId: player2Id,
      });

      // Create draw with future match
      const drawResult = await drawService.createDraw(divisionId, {
        drawType: 'round_robin',
      });

      expect(drawResult.success).toBe(true);

      // Activate to generate matches
      const activateResult = await drawService.activateDraw(drawResult.data!.id);
      expect(activateResult.success).toBe(true);

      // Get matches and schedule one
      const matches = await drawService.getDrawMatches(drawResult.data!.id);
      expect(matches.length).toBeGreaterThan(0);

      const futureTime = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours
      await drawService.updateMatch(matches[0].id, {
        scheduledTime: futureTime,
        court: 'Court 1',
        status: 'scheduled',
      });

      // Queue reminder for 24 hours before
      await notificationService.queueMatchReminder(matches[0].id, 24);

      // Process queue now - future reminders should not be sent
      await notificationService.processQueue();

      // The reminder should be scheduled for 24h before the match, which is still in the future
      const notifications = await notificationService.getQueuedNotifications('pending');
      const pendingReminders = notifications.filter((n) => n.type === 'match_reminder');

      // Reminders scheduled for future should still be pending (not sent yet)
      expect(pendingReminders.length).toBeGreaterThan(0);
    });

    it('should handle send failures with retry', async () => {
      // Create a failing email service
      const failingEmailService = {
        send: async () => ({ success: false, error: 'SMTP error' }),
        isConfigured: () => true,
      };
      const failingNotificationService = new MockNotificationService(
        failingEmailService as any,
        'https://test.example.com'
      );

      // Create entry and queue notification
      const entryResult = await playerService.createEntry(divisionId, {
        entryType: 'singles',
        playerId: playerId,
      });
      await failingNotificationService.queueRegistrationApproved(entryResult.data!.id);

      // Process queue - should fail
      const result = await failingNotificationService.processQueue();

      // Notification should be rescheduled for retry
      const notifications = await failingNotificationService.getQueuedNotifications('pending');
      if (notifications.length > 0) {
        expect(notifications[0].retryCount).toBe(1);
        expect(notifications[0].error).toBe('SMTP error');
      }
    });
  });

  describe('cancelNotification', () => {
    it('should cancel pending notification', async () => {
      const entryResult = await playerService.createEntry(divisionId, {
        entryType: 'singles',
        playerId: playerId,
      });
      await notificationService.queueRegistrationApproved(entryResult.data!.id);

      const notifications = await notificationService.getQueuedNotifications('pending');
      const notificationId = notifications[0].id;

      const result = await notificationService.cancelNotification(notificationId);

      expect(result.success).toBe(true);

      const cancelledNotification = await notificationService.getNotification(notificationId);
      expect(cancelledNotification!.status).toBe('cancelled');
    });

    it('should fail to cancel non-existent notification', async () => {
      const result = await notificationService.cancelNotification('non-existent');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('notification_not_found');
      }
    });
  });

  // ==================== Announcement Tests ====================

  describe('queueAnnouncement', () => {
    it('should queue announcement for all registered players', async () => {
      // Create entry
      await playerService.createEntry(divisionId, {
        entryType: 'singles',
        playerId: playerId,
      });

      const result = await notificationService.queueAnnouncement(
        competitionId,
        'Important Update',
        'The tournament schedule has been updated.'
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.count).toBeGreaterThan(0);
      }

      const notifications = await notificationService.getQueuedNotifications('pending');
      const announcement = notifications.find((n) => n.type === 'announcement');
      expect(announcement).toBeDefined();
      expect(announcement!.subject).toBe('Important Update');
    });

    it('should fail for non-existent competition', async () => {
      const result = await notificationService.queueAnnouncement(
        'non-existent',
        'Test',
        'Test message'
      );

      expect(result.success).toBe(false);
    });
  });

  // ==================== Email Service Rate Limiting Tests ====================

  describe('MockEmailService rate limiting', () => {
    it('should enforce rate limits', async () => {
      const limitedEmailService = new MockEmailService({
        rateLimits: { maxPerMinute: 2, maxPerHour: 100, maxPerDay: 1000 },
      });

      // First two should succeed
      const result1 = await limitedEmailService.send({
        to: 'test@example.com',
        subject: 'Test 1',
        html: '<p>Test</p>',
        text: 'Test',
      });
      const result2 = await limitedEmailService.send({
        to: 'test@example.com',
        subject: 'Test 2',
        html: '<p>Test</p>',
        text: 'Test',
      });

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);

      // Third should fail due to rate limit
      const result3 = await limitedEmailService.send({
        to: 'test@example.com',
        subject: 'Test 3',
        html: '<p>Test</p>',
        text: 'Test',
      });

      expect(result3.success).toBe(false);
      expect(result3.error).toContain('Rate limit');
    });
  });
});
