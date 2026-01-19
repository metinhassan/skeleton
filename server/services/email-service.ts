/**
 * Email service interface
 * Abstracts email sending for notifications
 */

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface EmailService {
  /**
   * Send an email message
   */
  send(message: EmailMessage): Promise<EmailResult>;

  /**
   * Check if the email service is configured and ready
   */
  isConfigured(): boolean;
}

/**
 * Rate limiting configuration
 */
export interface RateLimitConfig {
  maxPerMinute: number;
  maxPerHour: number;
  maxPerDay: number;
}

/**
 * Default rate limits
 */
export const DEFAULT_RATE_LIMITS: RateLimitConfig = {
  maxPerMinute: 10,
  maxPerHour: 100,
  maxPerDay: 1000,
};
