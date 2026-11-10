import { defineConfig } from 'vite';

export default defineConfig({
  base: './',            // dist/ works from any folder or static host
  server: { port: 5173 },
  build: { chunkSizeWarningLimit: 1000 },
});
