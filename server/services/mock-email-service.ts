/**
 * Mock email service implementation
 * Logs emails to console and optionally to file for development
 */

import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type { EmailService, EmailMessage, EmailResult, RateLimitConfig } from './email-service.js';
import { DEFAULT_RATE_LIMITS } from './email-service.js';

interface EmailLogEntry {
  id: string;
  timestamp: string;
  to: string;
  subject: string;
  text: string;
  html: string;
}

interface RateLimitState {
  minuteCount: number;
  minuteReset: number;
  hourCount: number;
  hourReset: number;
  dayCount: number;
  dayReset: number;
}

export class MockEmailService implements EmailService {
  private logFile: string | null;
  private rateLimits: RateLimitConfig;
  private rateLimitState: RateLimitState;
  private sentEmails: EmailLogEntry[] = [];

  constructor(options?: { logFile?: string; rateLimits?: Partial<RateLimitConfig> }) {
    this.logFile = options?.logFile || null;
    this.rateLimits = { ...DEFAULT_RATE_LIMITS, ...options?.rateLimits };
    this.rateLimitState = {
      minuteCount: 0,
      minuteReset: Date.now() + 60000,
      hourCount: 0,
      hourReset: Date.now() + 3600000,
      dayCount: 0,
      dayReset: Date.now() + 86400000,
    };
  }

  isConfigured(): boolean {
    return true; // Mock is always "configured"
  }

  async send(message: EmailMessage): Promise<EmailResult> {
    // Check rate limits
    const rateLimitError = this.checkRateLimits();
    if (rateLimitError) {
      return { success: false, error: rateLimitError };
    }

    const messageId = uuidv4();
    const logEntry: EmailLogEntry = {
      id: messageId,
      timestamp: new Date().toISOString(),
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    };

    // Store in memory
    this.sentEmails.push(logEntry);

    // Log to console
    console.log('\n========== MOCK EMAIL ==========');
    console.log(`ID: ${messageId}`);
    console.log(`To: ${message.to}`);
    console.log(`Subject: ${message.subject}`);
    console.log('--- Text Body ---');
    console.log(message.text);
    console.log('================================\n');

    // Log to file if configured
    if (this.logFile) {
      try {
        const logDir = path.dirname(this.logFile);
        if (!fs.existsSync(logDir)) {
          fs.mkdirSync(logDir, { recursive: true });
        }
        fs.appendFileSync(this.logFile, JSON.stringify(logEntry) + '\n');
      } catch (error) {
        console.error('Failed to write email log:', error);
      }
    }

    // Update rate limit counters
    this.updateRateLimits();

    return { success: true, messageId };
  }

  /**
   * Get all sent emails (useful for testing)
   */
  getSentEmails(): EmailLogEntry[] {
    return [...this.sentEmails];
  }

  /**
   * Clear sent emails (useful for testing)
   */
  clearSentEmails(): void {
    this.sentEmails = [];
  }

  /**
   * Get the most recent email sent to a specific address
   */
  getLastEmailTo(email: string): EmailLogEntry | undefined {
    return [...this.sentEmails].reverse().find((e) => e.to === email);
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

  /**
   * Reset rate limits (useful for testing)
   */
  resetRateLimits(): void {
    this.rateLimitState = {
      minuteCount: 0,
      minuteReset: Date.now() + 60000,
      hourCount: 0,
      hourReset: Date.now() + 3600000,
      dayCount: 0,
      dayReset: Date.now() + 86400000,
    };
  }
}
