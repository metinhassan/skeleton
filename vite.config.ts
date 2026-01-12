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
    port: 3000,
    open: true,
  },
});
