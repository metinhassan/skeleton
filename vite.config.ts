import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@authlib/core': resolve(__dirname, 'src/authlib/packages/auth-core/src'),
      '@authlib/mock': resolve(__dirname, 'src/authlib/packages/auth-mock/src'),
    },
  },
  server: {
    port: 5173,
    // Don't auto-open - use Express server at https://localhost:3000
    open: false,
  },
});
