/**
 * Mock notification service implementation using SQLite
 * For local development only
 */

import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../db/database.js';
import type {
  NotificationService,
  NotificationPreferences,
  Notification,
  NotificationType,
  NotificationStatus,
  UpdatePreferencesInput,
  NotificationResult,
  ProcessQueueResult,
} from './notification-service.js';
import type { EmailService } from './email-service.js';
import {
  matchScheduledTemplate,
  matchReminderTemplate,
  registrationApprovedTemplate,
  registrationRejectedTemplate,
  partnerRequestReceivedTemplate,
  partnerRequestResponseTemplate,
  drawPublishedTemplate,
  announcementTemplate,
  type ClubBranding,
} from '../templates/email-templates.js';

interface DbNotificationPreferences {
  id: string;
  user_id: string;
  match_scheduled: number;
  match_reminder: number;
  registration_status: number;
  partner_requests: number;
  competition_updates: number;
  created_at: string;
  updated_at: string;
}

interface DbNotification {
  id: string;
  user_id: string;
  type: string;
  subject: string;
  body_html: string;
  body_text: string;
  status: string;
  scheduled_at: string;
  sent_at: string | null;
  error: string | null;
  retry_count: number;
  max_retries: number;
  metadata: string | null;
  created_at: string;
  updated_at: string;
}

export class MockNotificationService implements NotificationService {
  private emailService: EmailService;
  private baseUrl: string;

  constructor(emailService: EmailService, baseUrl?: string) {
    this.emailService = emailService;
    this.baseUrl = baseUrl || process.env.APP_BASE_URL || 'https://localhost:3000';
  }

  // ==================== Preferences ====================

  async getPreferences(userId: string): Promise<NotificationPreferences> {
    const db = getDatabase();

    let row = db
      .prepare('SELECT * FROM notification_preferences WHERE user_id = ?')
      .get(userId) as DbNotificationPreferences | undefined;

    // Create default preferences if not exists
    if (!row) {
      const id = uuidv4();
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO notification_preferences (id, user_id, created_at, updated_at)
        VALUES (?, ?, ?, ?)
      `).run(id, userId, now, now);

      row = db
        .prepare('SELECT * FROM notification_preferences WHERE user_id = ?')
        .get(userId) as DbNotificationPreferences;
    }

    return this.mapRowToPreferences(row);
  }

  async updatePreferences(userId: string, input: UpdatePreferencesInput): Promise<NotificationPreferences> {
    // Ensure preferences exist
    await this.getPreferences(userId);

    const db = getDatabase();
    const updates: string[] = [];
    const values: (number | string)[] = [];

    if (input.matchScheduled !== undefined) {
      updates.push('match_scheduled = ?');
      values.push(input.matchScheduled ? 1 : 0);
    }
    if (input.matchReminder !== undefined) {
      updates.push('match_reminder = ?');
      values.push(input.matchReminder ? 1 : 0);
    }
    if (input.registrationStatus !== undefined) {
      updates.push('registration_status = ?');
      values.push(input.registrationStatus ? 1 : 0);
    }
    if (input.partnerRequests !== undefined) {
      updates.push('partner_requests = ?');
      values.push(input.partnerRequests ? 1 : 0);
    }
    if (input.competitionUpdates !== undefined) {
      updates.push('competition_updates = ?');
      values.push(input.competitionUpdates ? 1 : 0);
    }

    if (updates.length > 0) {
      updates.push('updated_at = ?');
      values.push(new Date().toISOString());
      values.push(userId);

      db.prepare(`UPDATE notification_preferences SET ${updates.join(', ')} WHERE user_id = ?`).run(
        ...values
      );
    }

    return this.getPreferences(userId);
  }

  // ==================== Queue Notifications ====================

  async queueMatchScheduled(matchId: string): Promise<NotificationResult> {
    const db = getDatabase();

    // Get match details with player info
    const match = db.prepare(`
      SELECT
        m.id, m.scheduled_time, m.court,
        d.id as draw_id, d.division_id,
        div.name as division_name,
        c.id as competition_id, c.name as competition_name, c.club_id,
        e1.player_id as player1_id, e1.team_id as team1_id,
        e2.player_id as player2_id, e2.team_id as team2_id
      FROM matches m
      JOIN draws d ON m.draw_id = d.id
      JOIN divisions div ON d.division_id = div.id
      JOIN competitions c ON div.competition_id = c.id
      LEFT JOIN entries e1 ON m.entry1_id = e1.id
      LEFT JOIN entries e2 ON m.entry2_id = e2.id
      WHERE m.id = ?
    `).get(matchId) as any;

    if (!match) {
      return { success: false, error: 'match_not_found', message: 'Match not found' };
    }

    if (!match.scheduled_time) {
      return { success: false, error: 'operation_failed', message: 'Match has no scheduled time' };
    }

    const branding = await this.getClubBranding(match.club_id);

    // Get player IDs for both entries
    const playerIds = await this.getPlayerUserIdsForEntries(
      match.player1_id,
      match.team1_id,
      match.player2_id,
      match.team2_id
    );

    let queued = 0;
    for (const { userId, playerId, playerName } of playerIds) {
      if (!userId) continue;

      const prefs = await this.getPreferences(userId);
      if (!prefs.matchScheduled) continue;

      const user = this.getUserById(userId);
      if (!user?.email) continue;

      // Get opponent name
      const opponentName = await this.getOpponentName(
        playerId,
        match.player1_id,
        match.team1_id,
        match.player2_id,
        match.team2_id
      );

      const template = matchScheduledTemplate({
        playerName: playerName,
        opponentName: opponentName,
        competitionName: match.competition_name,
        divisionName: match.division_name,
        scheduledTime: new Date(match.scheduled_time).toLocaleString(),
        court: match.court || 'TBD',
        matchUrl: `${this.baseUrl}/competitions/${match.competition_id}/matches/${matchId}`,
        branding,
      });

      await this.queueNotification(userId, 'match_scheduled', template.text.split('\n')[0], template.html, template.text, {
        matchId,
        competitionId: match.competition_id,
      });
      queued++;
    }

    if (queued === 0) {
      return { success: false, error: 'operation_failed', message: 'No eligible recipients' };
    }

    return { success: true, notificationId: `queued-${queued}` };
  }

  async queueMatchReminder(matchId: string, hoursBeforeMatch: number): Promise<NotificationResult> {
    const db = getDatabase();

    const match = db.prepare(`
      SELECT
        m.id, m.scheduled_time, m.court,
        d.id as draw_id, d.division_id,
        div.name as division_name,
        c.id as competition_id, c.name as competition_name, c.club_id,
        e1.player_id as player1_id, e1.team_id as team1_id,
        e2.player_id as player2_id, e2.team_id as team2_id
      FROM matches m
      JOIN draws d ON m.draw_id = d.id
      JOIN divisions div ON d.division_id = div.id
      JOIN competitions c ON div.competition_id = c.id
      LEFT JOIN entries e1 ON m.entry1_id = e1.id
      LEFT JOIN entries e2 ON m.entry2_id = e2.id
      WHERE m.id = ?
    `).get(matchId) as any;

    if (!match) {
      return { success: false, error: 'match_not_found', message: 'Match not found' };
    }

    if (!match.scheduled_time) {
      return { success: false, error: 'operation_failed', message: 'Match has no scheduled time' };
    }

    const scheduledTime = new Date(match.scheduled_time);
    const reminderTime = new Date(scheduledTime.getTime() - hoursBeforeMatch * 60 * 60 * 1000);

    // Don't schedule reminders in the past
    if (reminderTime <= new Date()) {
      return { success: false, error: 'operation_failed', message: 'Reminder time is in the past' };
    }

    const branding = await this.getClubBranding(match.club_id);
    const playerIds = await this.getPlayerUserIdsForEntries(
      match.player1_id,
      match.team1_id,
      match.player2_id,
      match.team2_id
    );

    let queued = 0;
    for (const { userId, playerId, playerName } of playerIds) {
      if (!userId) continue;

      const prefs = await this.getPreferences(userId);
      if (!prefs.matchReminder) continue;

      const user = this.getUserById(userId);
      if (!user?.email) continue;

      // Check for duplicate reminder
      const existingReminder = db.prepare(`
        SELECT id FROM notifications
        WHERE user_id = ? AND type = 'match_reminder' AND status = 'pending'
        AND json_extract(metadata, '$.matchId') = ?
        AND json_extract(metadata, '$.hoursBeforeMatch') = ?
      `).get(userId, matchId, hoursBeforeMatch);

      if (existingReminder) continue;

      const opponentName = await this.getOpponentName(
        playerId,
        match.player1_id,
        match.team1_id,
        match.player2_id,
        match.team2_id
      );

      const template = matchReminderTemplate({
        playerName: playerName,
        opponentName: opponentName,
        competitionName: match.competition_name,
        divisionName: match.division_name,
        scheduledTime: scheduledTime.toLocaleString(),
        court: match.court || 'TBD',
        matchUrl: `${this.baseUrl}/competitions/${match.competition_id}/matches/${matchId}`,
        hoursUntilMatch: hoursBeforeMatch,
        branding,
      });

      await this.queueNotification(
        userId,
        'match_reminder',
        template.text.split('\n')[0],
        template.html,
        template.text,
        { matchId, competitionId: match.competition_id, hoursBeforeMatch },
        reminderTime
      );
      queued++;
    }

    if (queued === 0) {
      return { success: false, error: 'operation_failed', message: 'No eligible recipients' };
    }

    return { success: true, notificationId: `queued-${queued}` };
  }

  async queueRegistrationApproved(entryId: string): Promise<NotificationResult> {
    const db = getDatabase();

    const entry = db.prepare(`
      SELECT
        e.id, e.player_id, e.team_id,
        div.id as division_id, div.name as division_name,
        c.id as competition_id, c.name as competition_name, c.club_id
      FROM entries e
      JOIN divisions div ON e.division_id = div.id
      JOIN competitions c ON div.competition_id = c.id
      WHERE e.id = ?
    `).get(entryId) as any;

    if (!entry) {
      return { success: false, error: 'entry_not_found', message: 'Entry not found' };
    }

    const branding = await this.getClubBranding(entry.club_id);
    const playerIds = await this.getPlayerUserIdsForEntry(entry.player_id, entry.team_id);

    let queued = 0;
    for (const { userId, playerName } of playerIds) {
      if (!userId) continue;

      const prefs = await this.getPreferences(userId);
      if (!prefs.registrationStatus) continue;

      const user = this.getUserById(userId);
      if (!user?.email) continue;

      const template = registrationApprovedTemplate({
        playerName: playerName,
        competitionName: entry.competition_name,
        divisionName: entry.division_name,
        competitionUrl: `${this.baseUrl}/competitions/${entry.competition_id}`,
        branding,
      });

      await this.queueNotification(userId, 'registration_approved', template.text.split('\n')[0], template.html, template.text, {
        entryId,
        competitionId: entry.competition_id,
      });
      queued++;
    }

    if (queued === 0) {
      return { success: false, error: 'operation_failed', message: 'No eligible recipients' };
    }

    return { success: true, notificationId: `queued-${queued}` };
  }

  async queueRegistrationRejected(entryId: string, reason?: string): Promise<NotificationResult> {
    const db = getDatabase();

    const entry = db.prepare(`
      SELECT
        e.id, e.player_id, e.team_id,
        div.id as division_id, div.name as division_name,
        c.id as competition_id, c.name as competition_name, c.club_id
      FROM entries e
      JOIN divisions div ON e.division_id = div.id
      JOIN competitions c ON div.competition_id = c.id
      WHERE e.id = ?
    `).get(entryId) as any;

    if (!entry) {
      return { success: false, error: 'entry_not_found', message: 'Entry not found' };
    }

    const branding = await this.getClubBranding(entry.club_id);
    const playerIds = await this.getPlayerUserIdsForEntry(entry.player_id, entry.team_id);

    let queued = 0;
    for (const { userId, playerName } of playerIds) {
      if (!userId) continue;

      const prefs = await this.getPreferences(userId);
      if (!prefs.registrationStatus) continue;

      const user = this.getUserById(userId);
      if (!user?.email) continue;

      const template = registrationRejectedTemplate({
        playerName: playerName,
        competitionName: entry.competition_name,
        divisionName: entry.division_name,
        reason,
        branding,
      });

      await this.queueNotification(userId, 'registration_rejected', template.text.split('\n')[0], template.html, template.text, {
        entryId,
        competitionId: entry.competition_id,
        reason,
      });
      queued++;
    }

    if (queued === 0) {
      return { success: false, error: 'operation_failed', message: 'No eligible recipients' };
    }

    return { success: true, notificationId: `queued-${queued}` };
  }

  async queuePartnerRequestReceived(requestId: string): Promise<NotificationResult> {
    const db = getDatabase();

    const request = db.prepare(`
      SELECT
        pr.id, pr.message, pr.expires_at,
        pr.requester_player_id, pr.invitee_player_id,
        p1.name as requester_name, p1.user_id as requester_user_id,
        p2.name as invitee_name, p2.user_id as invitee_user_id,
        div.id as division_id, div.name as division_name,
        c.id as competition_id, c.name as competition_name, c.club_id
      FROM partner_requests pr
      JOIN players p1 ON pr.requester_player_id = p1.id
      JOIN players p2 ON pr.invitee_player_id = p2.id
      JOIN divisions div ON pr.division_id = div.id
      JOIN competitions c ON div.competition_id = c.id
      WHERE pr.id = ?
    `).get(requestId) as any;

    if (!request) {
      return { success: false, error: 'partner_request_not_found', message: 'Partner request not found' };
    }

    if (!request.invitee_user_id) {
      return { success: false, error: 'operation_failed', message: 'Invitee has no linked user account' };
    }

    const prefs = await this.getPreferences(request.invitee_user_id);
    if (!prefs.partnerRequests) {
      return { success: false, error: 'preference_opted_out', message: 'User has opted out of partner request notifications' };
    }

    const user = this.getUserById(request.invitee_user_id);
    if (!user?.email) {
      return { success: false, error: 'user_not_found', message: 'User has no email' };
    }

    const branding = await this.getClubBranding(request.club_id);

    const template = partnerRequestReceivedTemplate({
      playerName: request.invitee_name,
      requesterName: request.requester_name,
      competitionName: request.competition_name,
      divisionName: request.division_name,
      message: request.message,
      respondUrl: `${this.baseUrl}/dashboard/partner-requests`,
      expiresAt: new Date(request.expires_at).toLocaleString(),
      branding,
    });

    await this.queueNotification(
      request.invitee_user_id,
      'partner_request_received',
      template.text.split('\n')[0],
      template.html,
      template.text,
      { requestId, competitionId: request.competition_id }
    );

    return { success: true, notificationId: `queued-1` };
  }

  async queuePartnerRequestResponse(requestId: string, accepted: boolean): Promise<NotificationResult> {
    const db = getDatabase();

    const request = db.prepare(`
      SELECT
        pr.id,
        pr.requester_player_id, pr.invitee_player_id,
        p1.name as requester_name, p1.user_id as requester_user_id,
        p2.name as invitee_name,
        div.id as division_id, div.name as division_name,
        c.id as competition_id, c.name as competition_name, c.club_id
      FROM partner_requests pr
      JOIN players p1 ON pr.requester_player_id = p1.id
      JOIN players p2 ON pr.invitee_player_id = p2.id
      JOIN divisions div ON pr.division_id = div.id
      JOIN competitions c ON div.competition_id = c.id
      WHERE pr.id = ?
    `).get(requestId) as any;

    if (!request) {
      return { success: false, error: 'partner_request_not_found', message: 'Partner request not found' };
    }

    if (!request.requester_user_id) {
      return { success: false, error: 'operation_failed', message: 'Requester has no linked user account' };
    }

    const prefs = await this.getPreferences(request.requester_user_id);
    if (!prefs.partnerRequests) {
      return { success: false, error: 'preference_opted_out', message: 'User has opted out of partner request notifications' };
    }

    const user = this.getUserById(request.requester_user_id);
    if (!user?.email) {
      return { success: false, error: 'user_not_found', message: 'User has no email' };
    }

    const branding = await this.getClubBranding(request.club_id);

    const template = partnerRequestResponseTemplate({
      playerName: request.requester_name,
      partnerName: request.invitee_name,
      competitionName: request.competition_name,
      divisionName: request.division_name,
      competitionUrl: `${this.baseUrl}/competitions/${request.competition_id}`,
      accepted,
      branding,
    });

    const type = accepted ? 'partner_request_accepted' : 'partner_request_declined';

    await this.queueNotification(
      request.requester_user_id,
      type,
      template.text.split('\n')[0],
      template.html,
      template.text,
      { requestId, competitionId: request.competition_id, accepted }
    );

    return { success: true, notificationId: `queued-1` };
  }

  async queueDrawPublished(drawId: string): Promise<NotificationResult> {
    const db = getDatabase();

    const draw = db.prepare(`
      SELECT
        d.id, d.division_id,
        div.name as division_name,
        c.id as competition_id, c.name as competition_name, c.club_id
      FROM draws d
      JOIN divisions div ON d.division_id = div.id
      JOIN competitions c ON div.competition_id = c.id
      WHERE d.id = ?
    `).get(drawId) as any;

    if (!draw) {
      return { success: false, error: 'draw_not_found', message: 'Draw not found' };
    }

    // Get all players in this division
    const entries = db.prepare(`
      SELECT e.player_id, e.team_id
      FROM entries e
      WHERE e.division_id = ? AND e.status = 'approved'
    `).all(draw.division_id) as any[];

    const branding = await this.getClubBranding(draw.club_id);

    let queued = 0;
    for (const entry of entries) {
      const playerIds = await this.getPlayerUserIdsForEntry(entry.player_id, entry.team_id);

      for (const { userId, playerName } of playerIds) {
        if (!userId) continue;

        const prefs = await this.getPreferences(userId);
        if (!prefs.competitionUpdates) continue;

        const user = this.getUserById(userId);
        if (!user?.email) continue;

        const template = drawPublishedTemplate({
          playerName: playerName,
          competitionName: draw.competition_name,
          divisionName: draw.division_name,
          drawUrl: `${this.baseUrl}/competitions/${draw.competition_id}/draws/${drawId}`,
          branding,
        });

        await this.queueNotification(userId, 'draw_published', template.text.split('\n')[0], template.html, template.text, {
          drawId,
          competitionId: draw.competition_id,
        });
        queued++;
      }
    }

    if (queued === 0) {
      return { success: false, error: 'operation_failed', message: 'No eligible recipients' };
    }

    return { success: true, notificationId: `queued-${queued}` };
  }

  async queueAnnouncement(
    competitionId: string,
    subject: string,
    message: string
  ): Promise<{ success: true; count: number } | { success: false; error: any; message: string }> {
    const db = getDatabase();

    const competition = db.prepare(`
      SELECT c.id, c.name, c.club_id
      FROM competitions c
      WHERE c.id = ?
    `).get(competitionId) as any;

    if (!competition) {
      return { success: false, error: 'competition_not_found', message: 'Competition not found' };
    }

    // Get all players registered for this competition
    const entries = db.prepare(`
      SELECT DISTINCT e.player_id, e.team_id
      FROM entries e
      JOIN divisions div ON e.division_id = div.id
      WHERE div.competition_id = ? AND e.status IN ('pending', 'approved')
    `).all(competitionId) as any[];

    const branding = await this.getClubBranding(competition.club_id);
    const notifiedUserIds = new Set<string>();
    let queued = 0;

    for (const entry of entries) {
      const playerIds = await this.getPlayerUserIdsForEntry(entry.player_id, entry.team_id);

      for (const { userId, playerName } of playerIds) {
        if (!userId || notifiedUserIds.has(userId)) continue;
        notifiedUserIds.add(userId);

        const prefs = await this.getPreferences(userId);
        if (!prefs.competitionUpdates) continue;

        const user = this.getUserById(userId);
        if (!user?.email) continue;

        const template = announcementTemplate({
          playerName: playerName,
          competitionName: competition.name,
          subject,
          message,
          competitionUrl: `${this.baseUrl}/competitions/${competitionId}`,
          branding,
        });

        await this.queueNotification(userId, 'announcement', subject, template.html, template.text, {
          competitionId,
          announcement: { subject, message },
        });
        queued++;
      }
    }

    return { success: true, count: queued };
  }

  // ==================== Process Queue ====================

  async processQueue(): Promise<ProcessQueueResult> {
    const db = getDatabase();
    const now = new Date().toISOString();

    // Get pending notifications that are due
    const notifications = db.prepare(`
      SELECT * FROM notifications
      WHERE status = 'pending' AND scheduled_at <= ?
      ORDER BY scheduled_at ASC
      LIMIT 100
    `).all(now) as DbNotification[];

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const notification of notifications) {
      // Get user email
      const user = this.getUserById(notification.user_id);
      if (!user?.email) {
        // Mark as failed - no email
        db.prepare(`
          UPDATE notifications SET status = 'failed', error = ?, updated_at = ?
          WHERE id = ?
        `).run('User has no email address', now, notification.id);
        failed++;
        continue;
      }

      // Send email
      const result = await this.emailService.send({
        to: user.email,
        subject: notification.subject,
        html: notification.body_html,
        text: notification.body_text,
      });

      if (result.success) {
        db.prepare(`
          UPDATE notifications SET status = 'sent', sent_at = ?, updated_at = ?
          WHERE id = ?
        `).run(now, now, notification.id);
        sent++;
      } else {
        const retryCount = notification.retry_count + 1;
        if (retryCount >= notification.max_retries) {
          db.prepare(`
            UPDATE notifications SET status = 'failed', error = ?, retry_count = ?, updated_at = ?
            WHERE id = ?
          `).run(result.error || 'Unknown error', retryCount, now, notification.id);
          failed++;
        } else {
          // Schedule retry with exponential backoff
          const backoffMinutes = Math.pow(2, retryCount);
          const retryAt = new Date(Date.now() + backoffMinutes * 60 * 1000).toISOString();
          db.prepare(`
            UPDATE notifications SET scheduled_at = ?, error = ?, retry_count = ?, updated_at = ?
            WHERE id = ?
          `).run(retryAt, result.error || 'Unknown error', retryCount, now, notification.id);
          skipped++;
        }
      }
    }

    return { sent, failed, skipped };
  }

  async getQueuedNotifications(status?: NotificationStatus, limit: number = 100): Promise<Notification[]> {
    const db = getDatabase();

    let query = 'SELECT * FROM notifications';
    const params: (string | number)[] = [];

    if (status) {
      query += ' WHERE status = ?';
      params.push(status);
    }

    query += ' ORDER BY scheduled_at DESC LIMIT ?';
    params.push(limit);

    const rows = db.prepare(query).all(...params) as DbNotification[];
    return rows.map((row) => this.mapRowToNotification(row));
  }

  async getNotification(notificationId: string): Promise<Notification | null> {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM notifications WHERE id = ?').get(notificationId) as
      | DbNotification
      | undefined;
    return row ? this.mapRowToNotification(row) : null;
  }

  async cancelNotification(notificationId: string): Promise<NotificationResult> {
    const db = getDatabase();

    const notification = await this.getNotification(notificationId);
    if (!notification) {
      return { success: false, error: 'notification_not_found', message: 'Notification not found' };
    }

    if (notification.status === 'sent') {
      return { success: false, error: 'already_sent', message: 'Notification has already been sent' };
    }

    db.prepare(`
      UPDATE notifications SET status = 'cancelled', updated_at = ?
      WHERE id = ?
    `).run(new Date().toISOString(), notificationId);

    return { success: true, notificationId };
  }

  async getUserNotifications(userId: string, limit: number = 50): Promise<Notification[]> {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT * FROM notifications
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(userId, limit) as DbNotification[];
    return rows.map((row) => this.mapRowToNotification(row));
  }

  // ==================== Private Helpers ====================

  private async queueNotification(
    userId: string,
    type: NotificationType,
    subject: string,
    bodyHtml: string,
    bodyText: string,
    metadata: Record<string, unknown>,
    scheduledAt?: Date
  ): Promise<string> {
    const db = getDatabase();
    const id = uuidv4();
    const now = new Date().toISOString();
    const scheduled = scheduledAt ? scheduledAt.toISOString() : now;

    db.prepare(`
      INSERT INTO notifications (id, user_id, type, subject, body_html, body_text, status, scheduled_at, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)
    `).run(id, userId, type, subject, bodyHtml, bodyText, scheduled, JSON.stringify(metadata), now, now);

    return id;
  }

  private getUserById(userId: string): { id: string; email: string; name: string } | null {
    const db = getDatabase();
    const row = db.prepare('SELECT id, email, name FROM users WHERE id = ?').get(userId) as any;
    return row || null;
  }

  private async getClubBranding(clubId: string): Promise<ClubBranding | undefined> {
    const db = getDatabase();
    const club = db.prepare('SELECT name, primary_color, logo_url FROM clubs WHERE id = ?').get(clubId) as any;
    if (!club) return undefined;
    return {
      name: club.name,
      primaryColor: club.primary_color,
      logoUrl: club.logo_url,
    };
  }

  private async getPlayerUserIdsForEntry(
    playerId: string | null,
    teamId: string | null
  ): Promise<Array<{ userId: string | null; playerId: string; playerName: string }>> {
    const db = getDatabase();
    const result: Array<{ userId: string | null; playerId: string; playerName: string }> = [];

    if (playerId) {
      const player = db.prepare('SELECT id, user_id, name FROM players WHERE id = ?').get(playerId) as any;
      if (player) {
        result.push({ userId: player.user_id, playerId: player.id, playerName: player.name });
      }
    } else if (teamId) {
      const team = db.prepare(`
        SELECT p1.id as p1_id, p1.user_id as p1_user_id, p1.name as p1_name,
               p2.id as p2_id, p2.user_id as p2_user_id, p2.name as p2_name
        FROM teams t
        JOIN players p1 ON t.player1_id = p1.id
        JOIN players p2 ON t.player2_id = p2.id
        WHERE t.id = ?
      `).get(teamId) as any;
      if (team) {
        result.push({ userId: team.p1_user_id, playerId: team.p1_id, playerName: team.p1_name });
        result.push({ userId: team.p2_user_id, playerId: team.p2_id, playerName: team.p2_name });
      }
    }

    return result;
  }

  private async getPlayerUserIdsForEntries(
    player1Id: string | null,
    team1Id: string | null,
    player2Id: string | null,
    team2Id: string | null
  ): Promise<Array<{ userId: string | null; playerId: string; playerName: string }>> {
    const result1 = await this.getPlayerUserIdsForEntry(player1Id, team1Id);
    const result2 = await this.getPlayerUserIdsForEntry(player2Id, team2Id);
    return [...result1, ...result2];
  }

  private async getOpponentName(
    currentPlayerId: string,
    player1Id: string | null,
    team1Id: string | null,
    player2Id: string | null,
    team2Id: string | null
  ): Promise<string> {
    const db = getDatabase();

    // Determine which entry is the opponent
    let opponentPlayerId: string | null = null;
    let opponentTeamId: string | null = null;

    if (player1Id === currentPlayerId || (team1Id && await this.isPlayerInTeam(currentPlayerId, team1Id))) {
      opponentPlayerId = player2Id;
      opponentTeamId = team2Id;
    } else {
      opponentPlayerId = player1Id;
      opponentTeamId = team1Id;
    }

    if (opponentPlayerId) {
      const player = db.prepare('SELECT name FROM players WHERE id = ?').get(opponentPlayerId) as any;
      return player?.name || 'TBD';
    } else if (opponentTeamId) {
      const team = db.prepare('SELECT name FROM teams WHERE id = ?').get(opponentTeamId) as any;
      return team?.name || 'TBD';
    }

    return 'TBD';
  }

  private async isPlayerInTeam(playerId: string, teamId: string): Promise<boolean> {
    const db = getDatabase();
    const team = db.prepare(
      'SELECT 1 FROM teams WHERE id = ? AND (player1_id = ? OR player2_id = ?)'
    ).get(teamId, playerId, playerId);
    return !!team;
  }

  private mapRowToPreferences(row: DbNotificationPreferences): NotificationPreferences {
    return {
      id: row.id,
      userId: row.user_id,
      matchScheduled: row.match_scheduled === 1,
      matchReminder: row.match_reminder === 1,
      registrationStatus: row.registration_status === 1,
      partnerRequests: row.partner_requests === 1,
      competitionUpdates: row.competition_updates === 1,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private mapRowToNotification(row: DbNotification): Notification {
    return {
      id: row.id,
      userId: row.user_id,
      type: row.type as NotificationType,
      subject: row.subject,
      bodyHtml: row.body_html,
      bodyText: row.body_text,
      status: row.status as NotificationStatus,
      scheduledAt: new Date(row.scheduled_at),
      sentAt: row.sent_at ? new Date(row.sent_at) : null,
      error: row.error,
      retryCount: row.retry_count,
      maxRetries: row.max_retries,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
