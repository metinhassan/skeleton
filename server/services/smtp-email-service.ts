/**
 * SMTP email service implementation
 * Uses nodemailer to send emails via SMTP
 */

import type { EmailService, EmailMessage, EmailResult, RateLimitConfig } from './email-service.js';
import { DEFAULT_RATE_LIMITS } from './email-service.js';

// Dynamic import for nodemailer to handle cases where it's not installed
let nodemailer: any = null;
try {
  nodemailer = await import('nodemailer');
} catch {
  console.warn('nodemailer not available - SMTP email service will not work');
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure?: boolean;
  user?: string;
  pass?: string;
  from: string;
}

interface RateLimitState {
  minuteCount: number;
  minuteReset: number;
  hourCount: number;
  hourReset: number;
  dayCount: number;
  dayReset: number;
}

export class SmtpEmailService implements EmailService {
  private transporter: any = null;
  private config: SmtpConfig | null = null;
  private rateLimits: RateLimitConfig;
  private rateLimitState: RateLimitState;

  constructor(options?: { rateLimits?: Partial<RateLimitConfig> }) {
    this.rateLimits = { ...DEFAULT_RATE_LIMITS, ...options?.rateLimits };
    this.rateLimitState = {
      minuteCount: 0,
      minuteReset: Date.now() + 60000,
      hourCount: 0,
      hourReset: Date.now() + 3600000,
      dayCount: 0,
      dayReset: Date.now() + 86400000,
    };

    // Initialize from environment variables
    this.initializeFromEnv();
  }

  private initializeFromEnv(): void {
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = process.env.SMTP_FROM;

    if (host && from) {
      this.configure({
        host,
        port,
        secure: port === 465,
        user,
        pass,
        from,
      });
    }
  }

  /**
   * Configure the SMTP service
   */
  configure(config: SmtpConfig): void {
    if (!nodemailer) {
      console.error('nodemailer is not installed - SMTP configuration skipped');
      return;
    }

    this.config = config;

    const transportConfig: any = {
      host: config.host,
      port: config.port,
      secure: config.secure ?? config.port === 465,
    } as nodemailer.TransportOptions;

    if (config.user && config.pass) {
      (transportConfig as any).auth = {
        user: config.user,
        pass: config.pass,
      };
    }

    this.transporter = nodemailer.createTransport(transportConfig);
  }

  isConfigured(): boolean {
    return this.transporter !== null && this.config !== null;
  }

  async send(message: EmailMessage): Promise<EmailResult> {
    if (!this.isConfigured() || !this.transporter || !this.config) {
      return { success: false, error: 'SMTP not configured' };
    }

    // Check rate limits
    const rateLimitError = this.checkRateLimits();
    if (rateLimitError) {
      return { success: false, error: rateLimitError };
    }

    try {
      const result = await this.transporter.sendMail({
        from: this.config.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });

      // Update rate limit counters
      this.updateRateLimits();

      return { success: true, messageId: result.messageId };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('SMTP send error:', errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Verify the SMTP connection
   */
  async verify(): Promise<boolean> {
    if (!this.transporter) {
      return false;
    }

    try {
      await this.transporter.verify();
      return true;
    } catch {
      return false;
    }
  }

  private checkRateLimits(): string | null {
    const now = Date.now();

    // Reset counters if windows have passed
    if (now > this.rateLimitState.minuteReset) {
      this.rateLimitState.minuteCount = 0;
      this.rateLimitState.minuteReset = now + 60000;
    }
    if (now > this.rateLimitState.hourReset) {
      this.rateLimitState.hourCount = 0;
      this.rateLimitState.hourReset = now + 3600000;
    }
    if (now > this.rateLimitState.dayReset) {
      this.rateLimitState.dayCount = 0;
      this.rateLimitState.dayReset = now + 86400000;
    }

    // Check limits
    if (this.rateLimitState.minuteCount >= this.rateLimits.maxPerMinute) {
      return 'Rate limit exceeded: too many emails per minute';
    }
    if (this.rateLimitState.hourCount >= this.rateLimits.maxPerHour) {
      return 'Rate limit exceeded: too many emails per hour';
    }
    if (this.rateLimitState.dayCount >= this.rateLimits.maxPerDay) {
      return 'Rate limit exceeded: too many emails per day';
    }

    return null;
  }

  private updateRateLimits(): void {
    this.rateLimitState.minuteCount++;
    this.rateLimitState.hourCount++;
    this.rateLimitState.dayCount++;
  }
}
