import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ mode }) => {
  // Keep the dev proxy on the same port as the API, including server/.env.
  // VITE_BACKEND_URL remains an explicit override for remote backends.
  const serverEnv = loadEnv(mode, fileURLToPath(new URL('../server/', import.meta.url)), 'PORT');
  const backend = process.env.VITE_BACKEND_URL || `http://localhost:${process.env.PORT || serverEnv.PORT || 3020}`;
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api/portal': { target: backend, changeOrigin: false },
        '/api': { target: backend, changeOrigin: true },
        '/uploads': { target: backend, changeOrigin: true },
        '/socket.io': { target: backend, ws: true },
      },
    },
    build: { outDir: 'dist', sourcemap: false },
  };
});
