/**
 * Unit tests for PostgresUserService
 * These tests require PostgreSQL to be running (npm run db:up)
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { PostgresUserService } from '../../server/services/postgres-user-service.js';
import { resetPostgresDatabase, closePool, testConnection } from '../../server/db/postgres.js';

// Skip these tests if PostgreSQL is not available
const postgresAvailable = await testConnection();

describe.skipIf(!postgresAvailable)('PostgresUserService', () => {
  let userService: PostgresUserService;

  beforeAll(async () => {
    await resetPostgresDatabase();
  });

  beforeEach(async () => {
    await resetPostgresDatabase();
    userService = new PostgresUserService();
  });

  afterAll(async () => {
    await closePool();
  });

  describe('register', () => {
    it('should register a new user successfully', async () => {
      const result = await userService.register({
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.email).toBe('test@example.com');
      expect(result.data!.name).toBe('Test User');
      expect(result.data!.id).toBeDefined();
    });

    it('should normalize email to lowercase', async () => {
      const result = await userService.register({
        email: 'TEST@EXAMPLE.COM',
        password: 'password123',
        name: 'Test User',
      });

      expect(result.success).toBe(true);
      expect(result.data!.email).toBe('test@example.com');
    });

    it('should reject duplicate email', async () => {
      await userService.register({
        email: 'test@example.com',
        password: 'password123',
        name: 'First User',
      });

      const result = await userService.register({
        email: 'test@example.com',
        password: 'password456',
        name: 'Second User',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('email_exists');
    });

    it('should reject weak password', async () => {
      const result = await userService.register({
        email: 'test@example.com',
        password: 'short',
        name: 'Test User',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('weak_password');
    });
  });

  describe('verifyCredentials', () => {
    beforeEach(async () => {
      await userService.register({
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
      });
    });

    it('should verify correct credentials', async () => {
      const user = await userService.verifyCredentials('test@example.com', 'password123');

      expect(user).toBeDefined();
      expect(user!.email).toBe('test@example.com');
    });

    it('should reject incorrect password', async () => {
      const user = await userService.verifyCredentials('test@example.com', 'wrongpassword');

      expect(user).toBeNull();
    });
  });

  describe('updateProfile', () => {
    let userId: string;

    beforeEach(async () => {
      const result = await userService.register({
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
      });
      userId = result.data!.id;
    });

    it('should update name', async () => {
      const result = await userService.updateProfile(userId, { name: 'New Name' });

      expect(result.success).toBe(true);
      expect(result.data!.name).toBe('New Name');
    });

    it('should update email', async () => {
      const result = await userService.updateProfile(userId, { email: 'new@example.com' });

      expect(result.success).toBe(true);
      expect(result.data!.email).toBe('new@example.com');
    });
  });

  describe('changePassword', () => {
    let userId: string;

    beforeEach(async () => {
      const result = await userService.register({
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
      });
      userId = result.data!.id;
    });

    it('should change password with correct old password', async () => {
      const result = await userService.changePassword(userId, {
        oldPassword: 'password123',
        newPassword: 'newpassword456',
      });

      expect(result.success).toBe(true);

      // Verify new password works
      const user = await userService.verifyCredentials('test@example.com', 'newpassword456');
      expect(user).toBeDefined();
    });

    it('should reject incorrect old password', async () => {
      const result = await userService.changePassword(userId, {
        oldPassword: 'wrongpassword',
        newPassword: 'newpassword456',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('invalid_password');
    });
  });
});
