import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5273,
    proxy: {
      '/api': {
        target: process.env.ABI_SERVER ?? 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
  build: { target: 'es2022' },
});
