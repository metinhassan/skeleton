/**
 * Vitest test setup
 */

import { beforeAll, afterAll, afterEach } from 'vitest';
import { resetDatabase } from '../server/db/database.js';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.AUTH_MODE = 'mock';

// Reset database before all tests
beforeAll(() => {
  resetDatabase();
});

// Clean up after each test if needed
afterEach(() => {
  // Individual test cleanup can be added here
});

// Close connections after all tests
afterAll(() => {
  // Cleanup handled by resetDatabase or individual tests
});
