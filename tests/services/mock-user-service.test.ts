/**
 * Unit tests for MockUserService
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MockUserService } from '../../server/services/mock-user-service.js';
import { resetDatabase } from '../../server/db/database.js';

describe('MockUserService', () => {
  let userService: MockUserService;

  beforeEach(() => {
    resetDatabase();
    userService = new MockUserService();
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

    it('should reject invalid email format', async () => {
      const result = await userService.register({
        email: 'not-an-email',
        password: 'password123',
        name: 'Test User',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('invalid_email');
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

    it('should reject non-existent email', async () => {
      const user = await userService.verifyCredentials('noone@example.com', 'password123');

      expect(user).toBeNull();
    });

    it('should handle case-insensitive email', async () => {
      const user = await userService.verifyCredentials('TEST@EXAMPLE.COM', 'password123');

      expect(user).toBeDefined();
      expect(user!.email).toBe('test@example.com');
    });
  });

  describe('findByEmail', () => {
    it('should find existing user', async () => {
      await userService.register({
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
      });

      const user = await userService.findByEmail('test@example.com');

      expect(user).toBeDefined();
      expect(user!.email).toBe('test@example.com');
    });

    it('should return null for non-existent user', async () => {
      const user = await userService.findByEmail('noone@example.com');

      expect(user).toBeNull();
    });
  });

  describe('findById', () => {
    it('should find existing user by id', async () => {
      const result = await userService.register({
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
      });

      const user = await userService.findById(result.data!.id);

      expect(user).toBeDefined();
      expect(user!.id).toBe(result.data!.id);
    });

    it('should return null for non-existent id', async () => {
      const user = await userService.findById('non-existent-id');

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

    it('should update both name and email', async () => {
      const result = await userService.updateProfile(userId, {
        name: 'New Name',
        email: 'new@example.com',
      });

      expect(result.success).toBe(true);
      expect(result.data!.name).toBe('New Name');
      expect(result.data!.email).toBe('new@example.com');
    });

    it('should reject duplicate email', async () => {
      await userService.register({
        email: 'other@example.com',
        password: 'password123',
        name: 'Other User',
      });

      const result = await userService.updateProfile(userId, { email: 'other@example.com' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('email_exists');
    });

    it('should allow keeping same email', async () => {
      const result = await userService.updateProfile(userId, {
        name: 'New Name',
        email: 'test@example.com',
      });

      expect(result.success).toBe(true);
    });

    it('should fail for non-existent user', async () => {
      const result = await userService.updateProfile('non-existent', { name: 'New Name' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('user_not_found');
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

      // Verify old password no longer works
      const oldUser = await userService.verifyCredentials('test@example.com', 'password123');
      expect(oldUser).toBeNull();
    });

    it('should reject incorrect old password', async () => {
      const result = await userService.changePassword(userId, {
        oldPassword: 'wrongpassword',
        newPassword: 'newpassword456',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('invalid_password');
    });

    it('should reject weak new password', async () => {
      const result = await userService.changePassword(userId, {
        oldPassword: 'password123',
        newPassword: 'short',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('weak_password');
    });

    it('should fail for non-existent user', async () => {
      const result = await userService.changePassword('non-existent', {
        oldPassword: 'password123',
        newPassword: 'newpassword456',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('user_not_found');
    });
  });
});
