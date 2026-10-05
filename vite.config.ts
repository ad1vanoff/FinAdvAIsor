import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': { target: `http://localhost:${process.env.ASSISTANT_PORT ?? '8791'}`, changeOrigin: false } },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
