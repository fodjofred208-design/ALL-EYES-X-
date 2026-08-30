import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Test-only config. The production build keeps using vite.config.ts.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.tsx', 'src/**/*.test.ts'],
  },
});
