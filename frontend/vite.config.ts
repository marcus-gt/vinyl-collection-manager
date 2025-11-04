import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            // Disable caching for API responses
            proxyRes.headers['cache-control'] = 'no-store, no-cache, must-revalidate';
          });
        },
      },
      '/lookup': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
