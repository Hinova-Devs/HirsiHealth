import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  envDir: '../..',
  server: {
    port: 3001,
    proxy: {
      '/api': {
        target: 'https://api.medplum.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
        secure: true,
        configure: (proxy) => {
          // Binary reads 302 to storage.medplum.com, which sends no CORS headers.
          // Point the redirect back through our own origin so fetch can follow it.
          proxy.on('proxyRes', (proxyRes) => {
            const location = proxyRes.headers.location;
            if (location?.startsWith('https://storage.medplum.com')) {
              proxyRes.headers.location = location.replace(
                'https://storage.medplum.com',
                '/storage-proxy'
              );
            }
          });
        },
      },
      '/storage-proxy': {
        target: 'https://storage.medplum.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/storage-proxy/, ''),
        secure: true,
        configure: (proxy) => {
          // The redirect is same-origin now, so the browser keeps the Medplum
          // Authorization header. S3 rejects presigned URLs that also carry one.
          proxy.on('proxyReq', (proxyReq) => proxyReq.removeHeader('authorization'));
        },
      },
    },
  },
});