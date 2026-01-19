/**
 * PostgreSQL notification service implementation
 * For production use
 */

import { v4 as uuidv4 } from 'uuid';
import { getPool } from '../db/postgres.js';
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

export class PostgresNotificationService implements NotificationService {
  private emailService: EmailService;
  private baseUrl: string;

  constructor(emailService: EmailService, baseUrl?: string) {
    this.emailService = emailService;
    this.baseUrl = baseUrl || process.env.APP_BASE_URL || 'https://localhost:3000';
  }

  // ==================== Preferences ====================

  async getPreferences(userId: string): Promise<NotificationPreferences> {
    const pool = getPool();

    let result = await pool.query('SELECT * FROM notification_preferences WHERE user_id = $1', [userId]);

    // Create default preferences if not exists
    if (result.rows.length === 0) {
      const id = uuidv4();
      await pool.query(
        `INSERT INTO notification_preferences (id, user_id) VALUES ($1, $2)`,
        [id, userId]
      );
      result = await pool.query('SELECT * FROM notification_preferences WHERE user_id = $1', [userId]);
    }

    return this.mapRowToPreferences(result.rows[0]);
  }

  async updatePreferences(userId: string, input: UpdatePreferencesInput): Promise<NotificationPreferences> {
    // Ensure preferences exist
    await this.getPreferences(userId);

    const pool = getPool();
    const updates: string[] = [];
    const values: (boolean | string)[] = [];
    let paramIndex = 1;

    if (input.matchScheduled !== undefined) {
      updates.push(`match_scheduled = $${paramIndex++}`);
      values.push(input.matchScheduled);
    }
    if (input.matchReminder !== undefined) {
      updates.push(`match_reminder = $${paramIndex++}`);
      values.push(input.matchReminder);
    }
    if (input.registrationStatus !== undefined) {
      updates.push(`registration_status = $${paramIndex++}`);
      values.push(input.registrationStatus);
    }
    if (input.partnerRequests !== undefined) {
      updates.push(`partner_requests = $${paramIndex++}`);
      values.push(input.partnerRequests);
    }
    if (input.competitionUpdates !== undefined) {
      updates.push(`competition_updates = $${paramIndex++}`);
      values.push(input.competitionUpdates);
    }

    if (updates.length > 0) {
      values.push(userId);
      await pool.query(
        `UPDATE notification_preferences SET ${updates.join(', ')} WHERE user_id = $${paramIndex}`,
        values
      );
    }

    return this.getPreferences(userId);
  }

  // ==================== Queue Notifications ====================

  async queueMatchScheduled(matchId: string): Promise<NotificationResult> {
    const pool = getPool();

    const matchResult = await pool.query(`
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
      WHERE m.id = $1
    `, [matchId]);

    if (matchResult.rows.length === 0) {
      return { success: false, error: 'match_not_found', message: 'Match not found' };
    }

    const match = matchResult.rows[0];

    if (!match.scheduled_time) {
      return { success: false, error: 'operation_failed', message: 'Match has no scheduled time' };
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
      if (!prefs.matchScheduled) continue;

      const user = await this.getUserById(userId);
      if (!user?.email) continue;

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
    const pool = getPool();

    const matchResult = await pool.query(`
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
      WHERE m.id = $1
    `, [matchId]);

    if (matchResult.rows.length === 0) {
      return { success: false, error: 'match_not_found', message: 'Match not found' };
    }

    const match = matchResult.rows[0];

    if (!match.scheduled_time) {
      return { success: false, error: 'operation_failed', message: 'Match has no scheduled time' };
    }

    const scheduledTime = new Date(match.scheduled_time);
    const reminderTime = new Date(scheduledTime.getTime() - hoursBeforeMatch * 60 * 60 * 1000);

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

      const user = await this.getUserById(userId);
      if (!user?.email) continue;

      // Check for duplicate reminder
      const existingResult = await pool.query(`
        SELECT id FROM notifications
        WHERE user_id = $1 AND type = 'match_reminder' AND status = 'pending'
        AND metadata->>'matchId' = $2
        AND (metadata->>'hoursBeforeMatch')::int = $3
      `, [userId, matchId, hoursBeforeMatch]);

      if (existingResult.rows.length > 0) continue;

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
    const pool = getPool();

    const entryResult = await pool.query(`
      SELECT
        e.id, e.player_id, e.team_id,
        div.id as division_id, div.name as division_name,
        c.id as competition_id, c.name as competition_name, c.club_id
      FROM entries e
      JOIN divisions div ON e.division_id = div.id
      JOIN competitions c ON div.competition_id = c.id
      WHERE e.id = $1
    `, [entryId]);

    if (entryResult.rows.length === 0) {
      return { success: false, error: 'entry_not_found', message: 'Entry not found' };
    }

    const entry = entryResult.rows[0];
    const branding = await this.getClubBranding(entry.club_id);
    const playerIds = await this.getPlayerUserIdsForEntry(entry.player_id, entry.team_id);

    let queued = 0;
    for (const { userId, playerName } of playerIds) {
      if (!userId) continue;

      const prefs = await this.getPreferences(userId);
      if (!prefs.registrationStatus) continue;

      const user = await this.getUserById(userId);
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
    const pool = getPool();

    const entryResult = await pool.query(`
      SELECT
        e.id, e.player_id, e.team_id,
        div.id as division_id, div.name as division_name,
        c.id as competition_id, c.name as competition_name, c.club_id
      FROM entries e
      JOIN divisions div ON e.division_id = div.id
      JOIN competitions c ON div.competition_id = c.id
      WHERE e.id = $1
    `, [entryId]);

    if (entryResult.rows.length === 0) {
      return { success: false, error: 'entry_not_found', message: 'Entry not found' };
    }

    const entry = entryResult.rows[0];
    const branding = await this.getClubBranding(entry.club_id);
    const playerIds = await this.getPlayerUserIdsForEntry(entry.player_id, entry.team_id);

    let queued = 0;
    for (const { userId, playerName } of playerIds) {
      if (!userId) continue;

      const prefs = await this.getPreferences(userId);
      if (!prefs.registrationStatus) continue;

      const user = await this.getUserById(userId);
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
    const pool = getPool();

    const requestResult = await pool.query(`
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
      WHERE pr.id = $1
    `, [requestId]);

    if (requestResult.rows.length === 0) {
      return { success: false, error: 'partner_request_not_found', message: 'Partner request not found' };
    }

    const request = requestResult.rows[0];

    if (!request.invitee_user_id) {
      return { success: false, error: 'operation_failed', message: 'Invitee has no linked user account' };
    }

    const prefs = await this.getPreferences(request.invitee_user_id);
    if (!prefs.partnerRequests) {
      return { success: false, error: 'preference_opted_out', message: 'User has opted out of partner request notifications' };
    }

    const user = await this.getUserById(request.invitee_user_id);
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
    const pool = getPool();

    const requestResult = await pool.query(`
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
      WHERE pr.id = $1
    `, [requestId]);

    if (requestResult.rows.length === 0) {
      return { success: false, error: 'partner_request_not_found', message: 'Partner request not found' };
    }

    const request = requestResult.rows[0];

    if (!request.requester_user_id) {
      return { success: false, error: 'operation_failed', message: 'Requester has no linked user account' };
    }

    const prefs = await this.getPreferences(request.requester_user_id);
    if (!prefs.partnerRequests) {
      return { success: false, error: 'preference_opted_out', message: 'User has opted out of partner request notifications' };
    }

    const user = await this.getUserById(request.requester_user_id);
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
    const pool = getPool();

    const drawResult = await pool.query(`
      SELECT
        d.id, d.division_id,
        div.name as division_name,
        c.id as competition_id, c.name as competition_name, c.club_id
      FROM draws d
      JOIN divisions div ON d.division_id = div.id
      JOIN competitions c ON div.competition_id = c.id
      WHERE d.id = $1
    `, [drawId]);

    if (drawResult.rows.length === 0) {
      return { success: false, error: 'draw_not_found', message: 'Draw not found' };
    }

    const draw = drawResult.rows[0];

    const entriesResult = await pool.query(`
      SELECT e.player_id, e.team_id
      FROM entries e
      WHERE e.division_id = $1 AND e.status = 'approved'
    `, [draw.division_id]);

    const branding = await this.getClubBranding(draw.club_id);

    let queued = 0;
    for (const entry of entriesResult.rows) {
      const playerIds = await this.getPlayerUserIdsForEntry(entry.player_id, entry.team_id);

      for (const { userId, playerName } of playerIds) {
        if (!userId) continue;

        const prefs = await this.getPreferences(userId);
        if (!prefs.competitionUpdates) continue;

        const user = await this.getUserById(userId);
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
    const pool = getPool();

    const competitionResult = await pool.query(`
      SELECT c.id, c.name, c.club_id
      FROM competitions c
      WHERE c.id = $1
    `, [competitionId]);

    if (competitionResult.rows.length === 0) {
      return { success: false, error: 'competition_not_found', message: 'Competition not found' };
    }

    const competition = competitionResult.rows[0];

    const entriesResult = await pool.query(`
      SELECT DISTINCT e.player_id, e.team_id
      FROM entries e
      JOIN divisions div ON e.division_id = div.id
      WHERE div.competition_id = $1 AND e.status IN ('pending', 'approved')
    `, [competitionId]);

    const branding = await this.getClubBranding(competition.club_id);
    const notifiedUserIds = new Set<string>();
    let queued = 0;

    for (const entry of entriesResult.rows) {
      const playerIds = await this.getPlayerUserIdsForEntry(entry.player_id, entry.team_id);

      for (const { userId, playerName } of playerIds) {
        if (!userId || notifiedUserIds.has(userId)) continue;
        notifiedUserIds.add(userId);

        const prefs = await this.getPreferences(userId);
        if (!prefs.competitionUpdates) continue;

        const user = await this.getUserById(userId);
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
    const pool = getPool();
    const now = new Date();

    const notificationsResult = await pool.query(`
      SELECT * FROM notifications
      WHERE status = 'pending' AND scheduled_at <= $1
      ORDER BY scheduled_at ASC
      LIMIT 100
    `, [now]);

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const notification of notificationsResult.rows) {
      const user = await this.getUserById(notification.user_id);
      if (!user?.email) {
        await pool.query(`
          UPDATE notifications SET status = 'failed', error = $1
          WHERE id = $2
        `, ['User has no email address', notification.id]);
        failed++;
        continue;
      }

      const result = await this.emailService.send({
        to: user.email,
        subject: notification.subject,
        html: notification.body_html,
        text: notification.body_text,
      });

      if (result.success) {
        await pool.query(`
          UPDATE notifications SET status = 'sent', sent_at = $1
          WHERE id = $2
        `, [now, notification.id]);
        sent++;
      } else {
        const retryCount = notification.retry_count + 1;
        if (retryCount >= notification.max_retries) {
          await pool.query(`
            UPDATE notifications SET status = 'failed', error = $1, retry_count = $2
            WHERE id = $3
          `, [result.error || 'Unknown error', retryCount, notification.id]);
          failed++;
        } else {
          const backoffMinutes = Math.pow(2, retryCount);
          const retryAt = new Date(Date.now() + backoffMinutes * 60 * 1000);
          await pool.query(`
            UPDATE notifications SET scheduled_at = $1, error = $2, retry_count = $3
            WHERE id = $4
          `, [retryAt, result.error || 'Unknown error', retryCount, notification.id]);
          skipped++;
        }
      }
    }

    return { sent, failed, skipped };
  }

  async getQueuedNotifications(status?: NotificationStatus, limit: number = 100): Promise<Notification[]> {
    const pool = getPool();

    let query = 'SELECT * FROM notifications';
    const params: (string | number)[] = [];
    let paramIndex = 1;

    if (status) {
      query += ` WHERE status = $${paramIndex++}`;
      params.push(status);
    }

    query += ` ORDER BY scheduled_at DESC LIMIT $${paramIndex}`;
    params.push(limit);

    const result = await pool.query(query, params);
    return result.rows.map((row) => this.mapRowToNotification(row));
  }

  async getNotification(notificationId: string): Promise<Notification | null> {
    const pool = getPool();
    const result = await pool.query('SELECT * FROM notifications WHERE id = $1', [notificationId]);
    return result.rows.length > 0 ? this.mapRowToNotification(result.rows[0]) : null;
  }

  async cancelNotification(notificationId: string): Promise<NotificationResult> {
    const pool = getPool();

    const notification = await this.getNotification(notificationId);
    if (!notification) {
      return { success: false, error: 'notification_not_found', message: 'Notification not found' };
    }

    if (notification.status === 'sent') {
      return { success: false, error: 'already_sent', message: 'Notification has already been sent' };
    }

    await pool.query(`UPDATE notifications SET status = 'cancelled' WHERE id = $1`, [notificationId]);

    return { success: true, notificationId };
  }

  async getUserNotifications(userId: string, limit: number = 50): Promise<Notification[]> {
    const pool = getPool();
    const result = await pool.query(`
      SELECT * FROM notifications
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `, [userId, limit]);
    return result.rows.map((row) => this.mapRowToNotification(row));
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
    const pool = getPool();
    const id = uuidv4();
    const scheduled = scheduledAt || new Date();

    await pool.query(`
      INSERT INTO notifications (id, user_id, type, subject, body_html, body_text, status, scheduled_at, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8)
    `, [id, userId, type, subject, bodyHtml, bodyText, scheduled, JSON.stringify(metadata)]);

    return id;
  }

  private async getUserById(userId: string): Promise<{ id: string; email: string; name: string } | null> {
    const pool = getPool();
    const result = await pool.query('SELECT id, email, name FROM users WHERE id = $1', [userId]);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  private async getClubBranding(clubId: string): Promise<ClubBranding | undefined> {
    const pool = getPool();
    const result = await pool.query('SELECT name, primary_color, logo_url FROM clubs WHERE id = $1', [clubId]);
    if (result.rows.length === 0) return undefined;
    const club = result.rows[0];
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
    const pool = getPool();
    const result: Array<{ userId: string | null; playerId: string; playerName: string }> = [];

    if (playerId) {
      const playerResult = await pool.query('SELECT id, user_id, name FROM players WHERE id = $1', [playerId]);
      if (playerResult.rows.length > 0) {
        const player = playerResult.rows[0];
        result.push({ userId: player.user_id, playerId: player.id, playerName: player.name });
      }
    } else if (teamId) {
      const teamResult = await pool.query(`
        SELECT p1.id as p1_id, p1.user_id as p1_user_id, p1.name as p1_name,
               p2.id as p2_id, p2.user_id as p2_user_id, p2.name as p2_name
        FROM teams t
        JOIN players p1 ON t.player1_id = p1.id
        JOIN players p2 ON t.player2_id = p2.id
        WHERE t.id = $1
      `, [teamId]);
      if (teamResult.rows.length > 0) {
        const team = teamResult.rows[0];
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
    const pool = getPool();

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
      const result = await pool.query('SELECT name FROM players WHERE id = $1', [opponentPlayerId]);
      return result.rows[0]?.name || 'TBD';
    } else if (opponentTeamId) {
      const result = await pool.query('SELECT name FROM teams WHERE id = $1', [opponentTeamId]);
      return result.rows[0]?.name || 'TBD';
    }

    return 'TBD';
  }

  private async isPlayerInTeam(playerId: string, teamId: string): Promise<boolean> {
    const pool = getPool();
    const result = await pool.query(
      'SELECT 1 FROM teams WHERE id = $1 AND (player1_id = $2 OR player2_id = $2)',
      [teamId, playerId]
    );
    return result.rows.length > 0;
  }

  private mapRowToPreferences(row: any): NotificationPreferences {
    return {
      id: row.id,
      userId: row.user_id,
      matchScheduled: row.match_scheduled,
      matchReminder: row.match_reminder,
      registrationStatus: row.registration_status,
      partnerRequests: row.partner_requests,
      competitionUpdates: row.competition_updates,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private mapRowToNotification(row: any): Notification {
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
      metadata: row.metadata,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
