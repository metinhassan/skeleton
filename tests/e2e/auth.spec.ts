import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    // Start fresh - clear cookies
    await page.context().clearCookies();
  });

  test.describe('Login', () => {
    test('should show login form by default', async ({ page }) => {
      await page.goto('/');

      await expect(page.locator('#login-view')).toBeVisible();
      await expect(page.locator('#email')).toBeVisible();
      await expect(page.locator('#password')).toBeVisible();
    });

    test('should login with valid credentials', async ({ page }) => {
      await page.goto('/');
      await expect(page.locator('#login-view')).toBeVisible();

      await page.fill('#email', 'admin@example.com');
      await page.fill('#password', 'admin123');
      await page.click('#login-btn');

      // Wait for dashboard to appear
      await expect(page.locator('#dashboard-view')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('#user-name')).toContainText('Welcome');
    });

    test('should show error with invalid credentials', async ({ page }) => {
      await page.goto('/');

      await page.fill('#email', 'admin@example.com');
      await page.fill('#password', 'wrongpassword');
      await page.click('#login-btn');

      await expect(page.locator('#error-message')).toBeVisible();
      await expect(page.locator('#error-message')).toContainText('Invalid');
    });

    test('should require email field', async ({ page }) => {
      await page.goto('/');

      // HTML5 validation prevents submission - check the email field is required
      const emailInput = page.locator('#email');
      await expect(emailInput).toHaveAttribute('required', '');
    });
  });

  test.describe('Registration', () => {
    test('should navigate to registration form', async ({ page }) => {
      await page.goto('/');
      await expect(page.locator('#login-view')).toBeVisible();

      await page.click('#switch-to-register');

      await expect(page.locator('#register-view')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('#register-name')).toBeVisible();
      await expect(page.locator('#register-email')).toBeVisible();
    });

    test('should register new user successfully', async ({ page }) => {
      const uniqueEmail = `test-${Date.now()}@example.com`;

      await page.goto('/');
      await page.click('#switch-to-register');

      await page.fill('#register-name', 'New Test User');
      await page.fill('#register-email', uniqueEmail);
      await page.fill('#register-password', 'testpassword123');
      await page.fill('#register-confirm', 'testpassword123');
      await page.click('#register-btn');

      // Should auto-login and show dashboard
      await expect(page.locator('#dashboard-view')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('#user-name')).toContainText('New Test User');
    });

    test('should show error for duplicate email', async ({ page }) => {
      await page.goto('/');
      await page.click('#switch-to-register');

      await page.fill('#register-name', 'Admin Copy');
      await page.fill('#register-email', 'admin@example.com');
      await page.fill('#register-password', 'testpassword123');
      await page.fill('#register-confirm', 'testpassword123');
      await page.click('#register-btn');

      await expect(page.locator('#register-error')).toBeVisible();
      await expect(page.locator('#register-error')).toContainText('already registered');
    });

    test('should show error for mismatched passwords', async ({ page }) => {
      await page.goto('/');
      await page.click('#switch-to-register');

      await page.fill('#register-name', 'Test User');
      await page.fill('#register-email', 'mismatch@example.com');
      await page.fill('#register-password', 'testpassword123');
      await page.fill('#register-confirm', 'differentpassword');
      await page.click('#register-btn');

      await expect(page.locator('#register-error')).toBeVisible();
      await expect(page.locator('#register-error')).toContainText('do not match');
    });

    test('should switch back to login form', async ({ page }) => {
      await page.goto('/');
      await page.click('#switch-to-register');

      await expect(page.locator('#register-view')).toBeVisible();

      await page.click('#switch-to-login');

      await expect(page.locator('#login-view')).toBeVisible();
    });
  });

  test.describe('Profile Edit', () => {
    test.beforeEach(async ({ page }) => {
      // Login first
      await page.goto('/');
      await page.fill('#email', 'admin@example.com');
      await page.fill('#password', 'admin123');
      await page.click('#login-btn');
      await expect(page.locator('#dashboard-view')).toBeVisible({ timeout: 5000 });
    });

    test('should open profile edit view', async ({ page }) => {
      await page.click('#edit-profile-btn');

      await expect(page.locator('#profile-view')).toBeVisible();
      await expect(page.locator('#profile-name')).toBeVisible();
      await expect(page.locator('#profile-email')).toBeVisible();
    });

    test('should update profile name', async ({ page }) => {
      await page.click('#edit-profile-btn');
      await expect(page.locator('#profile-view')).toBeVisible();

      await page.fill('#profile-name', 'Updated Admin Name');
      await page.click('#profile-form button[type="submit"]');

      await expect(page.locator('#profile-success')).toBeVisible();
      await expect(page.locator('#profile-success')).toContainText('successfully');
    });

    test('should close profile and return to dashboard', async ({ page }) => {
      await page.click('#edit-profile-btn');
      await expect(page.locator('#profile-view')).toBeVisible();

      await page.click('#close-profile');

      await expect(page.locator('#dashboard-view')).toBeVisible();
    });
  });

  test.describe('Password Change', () => {
    test.beforeEach(async ({ page }) => {
      // Register a new user for password tests with unique email
      const testEmail = `pwchange-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
      await page.goto('/');
      await page.click('#switch-to-register');
      await page.fill('#register-name', 'Password Test User');
      await page.fill('#register-email', testEmail);
      await page.fill('#register-password', 'oldpassword123');
      await page.fill('#register-confirm', 'oldpassword123');
      await page.click('#register-btn');
      await expect(page.locator('#dashboard-view')).toBeVisible({ timeout: 5000 });
    });

    test('should show password change form', async ({ page }) => {
      await page.click('#edit-profile-btn');

      await expect(page.locator('#current-password')).toBeVisible();
      await expect(page.locator('#new-password')).toBeVisible();
      await expect(page.locator('#confirm-new-password')).toBeVisible();
    });

    test('should change password successfully', async ({ page }) => {
      await page.click('#edit-profile-btn');

      await page.fill('#current-password', 'oldpassword123');
      await page.fill('#new-password', 'newpassword456');
      await page.fill('#confirm-new-password', 'newpassword456');
      await page.click('#password-form button[type="submit"]');

      await expect(page.locator('#password-success')).toBeVisible();
      await expect(page.locator('#password-success')).toContainText('successfully');
    });

    test('should show error for wrong current password', async ({ page }) => {
      await page.click('#edit-profile-btn');

      await page.fill('#current-password', 'wrongpassword');
      await page.fill('#new-password', 'newpassword456');
      await page.fill('#confirm-new-password', 'newpassword456');
      await page.click('#password-form button[type="submit"]');

      await expect(page.locator('#password-error')).toBeVisible();
    });

    test('should show error for mismatched new passwords', async ({ page }) => {
      await page.click('#edit-profile-btn');

      await page.fill('#current-password', 'oldpassword123');
      await page.fill('#new-password', 'newpassword456');
      await page.fill('#confirm-new-password', 'differentpassword');
      await page.click('#password-form button[type="submit"]');

      await expect(page.locator('#password-error')).toBeVisible();
      await expect(page.locator('#password-error')).toContainText('do not match');
    });
  });

  test.describe('Logout', () => {
    test('should logout successfully', async ({ page }) => {
      // Login first
      await page.goto('/');
      await page.fill('#email', 'admin@example.com');
      await page.fill('#password', 'admin123');
      await page.click('#login-btn');
      await expect(page.locator('#dashboard-view')).toBeVisible({ timeout: 5000 });

      // Logout
      await page.click('#logout-btn');

      // Should see login form again
      await expect(page.locator('#login-view')).toBeVisible();
    });

    test('should not persist session after logout', async ({ page }) => {
      // Login
      await page.goto('/');
      await page.fill('#email', 'admin@example.com');
      await page.fill('#password', 'admin123');
      await page.click('#login-btn');
      await expect(page.locator('#dashboard-view')).toBeVisible({ timeout: 5000 });

      // Logout
      await page.click('#logout-btn');
      await expect(page.locator('#login-view')).toBeVisible();

      // Refresh page - should still see login
      await page.reload();
      await expect(page.locator('#login-view')).toBeVisible();
    });
  });

  test.describe('Session Persistence', () => {
    test('should persist session after page reload', async ({ page }) => {
      // Login
      await page.goto('/');
      await page.fill('#email', 'admin@example.com');
      await page.fill('#password', 'admin123');
      await page.click('#login-btn');
      await expect(page.locator('#dashboard-view')).toBeVisible({ timeout: 5000 });

      // Reload page
      await page.reload();

      // Should still be logged in
      await expect(page.locator('#dashboard-view')).toBeVisible({ timeout: 5000 });
    });
  });
});
