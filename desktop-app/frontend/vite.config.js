import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  envDir: false,
  base: '/',
  define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify('/api/v1') },
  build: {
    outDir: '../build/ui', emptyOutDir: true,
    rollupOptions: {
      input: {
        app: fileURLToPath(new URL('./index.html', import.meta.url)),
        setup: fileURLToPath(new URL('./setup.html', import.meta.url)),
      },
    },
  },
});
