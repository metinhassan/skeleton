import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@auth': resolve(__dirname, 'src/auth'),
    },
  },
  server: {
    port: 3000,
    open: true,
  },
});
