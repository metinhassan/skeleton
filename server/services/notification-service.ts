/**
 * Notification service interface
 * Abstracts notification queueing, preferences, and delivery
 */

export type NotificationType =
  | 'match_scheduled'
  | 'match_reminder'
  | 'registration_approved'
  | 'registration_rejected'
  | 'partner_request_received'
  | 'partner_request_accepted'
  | 'partner_request_declined'
  | 'draw_published'
  | 'competition_update'
  | 'announcement';

export type NotificationStatus = 'pending' | 'sent' | 'failed' | 'cancelled';

export interface NotificationPreferences {
  id: string;
  userId: string;
  matchScheduled: boolean;
  matchReminder: boolean;
  registrationStatus: boolean;
  partnerRequests: boolean;
  competitionUpdates: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  status: NotificationStatus;
  scheduledAt: Date;
  sentAt: Date | null;
  error: string | null;
  retryCount: number;
  maxRetries: number;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdatePreferencesInput {
  matchScheduled?: boolean;
  matchReminder?: boolean;
  registrationStatus?: boolean;
  partnerRequests?: boolean;
  competitionUpdates?: boolean;
}

export interface QueueResult {
  success: true;
  notificationId: string;
}

export interface QueueError {
  success: false;
  error: NotificationErrorCode;
  message: string;
}

export type NotificationErrorCode =
  | 'user_not_found'
  | 'preference_opted_out'
  | 'match_not_found'
  | 'entry_not_found'
  | 'partner_request_not_found'
  | 'draw_not_found'
  | 'competition_not_found'
  | 'notification_not_found'
  | 'already_sent'
  | 'operation_failed';

export type NotificationResult = QueueResult | QueueError;

export interface ProcessQueueResult {
  sent: number;
  failed: number;
  skipped: number;
}

export interface NotificationService {
  // Preferences
  getPreferences(userId: string): Promise<NotificationPreferences>;
  updatePreferences(userId: string, input: UpdatePreferencesInput): Promise<NotificationPreferences>;

  // Queue notifications
  queueMatchScheduled(matchId: string): Promise<NotificationResult>;
  queueMatchReminder(matchId: string, hoursBeforeMatch: number): Promise<NotificationResult>;
  queueRegistrationApproved(entryId: string): Promise<NotificationResult>;
  queueRegistrationRejected(entryId: string, reason?: string): Promise<NotificationResult>;
  queuePartnerRequestReceived(requestId: string): Promise<NotificationResult>;
  queuePartnerRequestResponse(requestId: string, accepted: boolean): Promise<NotificationResult>;
  queueDrawPublished(drawId: string): Promise<NotificationResult>;
  queueAnnouncement(
    competitionId: string,
    subject: string,
    message: string
  ): Promise<{ success: true; count: number } | QueueError>;

  // Process queue
  processQueue(): Promise<ProcessQueueResult>;
  getQueuedNotifications(status?: NotificationStatus, limit?: number): Promise<Notification[]>;
  getNotification(notificationId: string): Promise<Notification | null>;
  cancelNotification(notificationId: string): Promise<NotificationResult>;

  // Utility
  getUserNotifications(userId: string, limit?: number): Promise<Notification[]>;
}
