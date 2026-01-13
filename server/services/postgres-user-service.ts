/**
 * PostgreSQL user service implementation
 * For local development with Docker PostgreSQL
 */

import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { getPool } from '../db/postgres.js';
import type {
  UserService,
  User,
  CreateUserInput,
  UpdateProfileInput,
  ChangePasswordInput,
  UserResult,
} from './user-service.js';

const SALT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 8;

// Email validation regex (RFC 5322 simplified)
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface DbUser {
  id: string;
  email: string;
  name: string;
  groups: string[];
  created_at: Date;
  updated_at: Date;
}

interface DbUserWithPassword extends DbUser {
  password_hash: string;
}

export class PostgresUserService implements UserService {
  async register(input: CreateUserInput): Promise<UserResult<User>> {
    const { email, password, name } = input;

    // Validate email format
    if (!EMAIL_REGEX.test(email)) {
      return { success: false, error: 'invalid_email', message: 'Invalid email format' };
    }

    // Validate password strength
    if (password.length < MIN_PASSWORD_LENGTH) {
      return {
        success: false,
        error: 'weak_password',
        message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      };
    }

    // Check if email already exists
    const existing = await this.findByEmail(email);
    if (existing) {
      return { success: false, error: 'email_exists', message: 'Email already registered' };
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Generate user ID
    const id = uuidv4();

    const pool = getPool();

    try {
      const result = await pool.query<DbUser>(
        `INSERT INTO users (id, email, password_hash, name, groups)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, email, name, groups, created_at, updated_at`,
        [id, email.toLowerCase(), passwordHash, name, JSON.stringify(['users'])]
      );

      const row = result.rows[0];
      return {
        success: true,
        data: this.mapRowToUser(row),
      };
    } catch (error) {
      console.error('Failed to create user:', error);
      return { success: false, error: 'operation_failed', message: 'Failed to create user' };
    }
  }

  async updateProfile(userId: string, input: UpdateProfileInput): Promise<UserResult<User>> {
    const existing = await this.findById(userId);
    if (!existing) {
      return { success: false, error: 'user_not_found', message: 'User not found' };
    }

    // Validate email if provided
    if (input.email && !EMAIL_REGEX.test(input.email)) {
      return { success: false, error: 'invalid_email', message: 'Invalid email format' };
    }

    // Check email uniqueness if changing
    if (input.email && input.email.toLowerCase() !== existing.email) {
      const emailExists = await this.findByEmail(input.email);
      if (emailExists) {
        return { success: false, error: 'email_exists', message: 'Email already in use' };
      }
    }

    const updates: string[] = [];
    const values: (string | number)[] = [];
    let paramIndex = 1;

    if (input.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(input.name);
    }

    if (input.email !== undefined) {
      updates.push(`email = $${paramIndex++}`);
      values.push(input.email.toLowerCase());
    }

    if (updates.length === 0) {
      return { success: true, data: existing };
    }

    values.push(userId);

    const pool = getPool();
    await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      values
    );

    const updated = await this.findById(userId);
    return { success: true, data: updated! };
  }

  async changePassword(userId: string, input: ChangePasswordInput): Promise<UserResult<void>> {
    const { oldPassword, newPassword } = input;

    // Validate new password strength
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return {
        success: false,
        error: 'weak_password',
        message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      };
    }

    const pool = getPool();
    const result = await pool.query<{ password_hash: string }>(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return { success: false, error: 'user_not_found', message: 'User not found' };
    }

    const row = result.rows[0];

    // Verify old password
    const isValid = await bcrypt.compare(oldPassword, row.password_hash);
    if (!isValid) {
      return { success: false, error: 'invalid_password', message: 'Current password is incorrect' };
    }

    // Hash and save new password
    const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await pool.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [newHash, userId]
    );

    return { success: true, data: undefined };
  }

  async findByEmail(email: string): Promise<User | null> {
    const pool = getPool();
    const result = await pool.query<DbUser>(
      'SELECT id, email, name, groups, created_at, updated_at FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    return result.rows.length > 0 ? this.mapRowToUser(result.rows[0]) : null;
  }

  async findById(userId: string): Promise<User | null> {
    const pool = getPool();
    const result = await pool.query<DbUser>(
      'SELECT id, email, name, groups, created_at, updated_at FROM users WHERE id = $1',
      [userId]
    );
    return result.rows.length > 0 ? this.mapRowToUser(result.rows[0]) : null;
  }

  async verifyCredentials(email: string, password: string): Promise<User | null> {
    const pool = getPool();
    const result = await pool.query<DbUserWithPassword>(
      'SELECT * FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    const isValid = await bcrypt.compare(password, row.password_hash);
    if (!isValid) return null;

    return this.mapRowToUser(row);
  }

  private mapRowToUser(row: DbUser): User {
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      groups: Array.isArray(row.groups) ? row.groups : JSON.parse(row.groups as unknown as string),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
