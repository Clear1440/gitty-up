import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const SERVER_PORT = process.env.GITTY_UP_PORT ?? 4317;

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': `http://127.0.0.1:${SERVER_PORT}`,
    },
  },
  test: {
    include: ['server/**/*.test.js', 'src/**/*.test.js', 'electron/**/*.test.js'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
