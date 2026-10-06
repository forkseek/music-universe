import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: { chunkSizeWarningLimit: 1600 },
  // Music World (127.0.0.1:3002) sends no CORS headers, so the browser has to reach
  // it through this dev server. Its session cookie is host-scoped, and 127.0.0.1 is a
  // single site for SameSite=Lax, so the anonymous library survives the hop.
  server: {
    proxy: {
      '/mw': {
        target: 'http://127.0.0.1:3002',
        // Music World validates Origin against its own configured origin and rejects
        // anything else, so this gateway presents the upstream's host and origin
        // rather than the browser's. Writes then work no matter how the 3002 process
        // was launched, while its own pages still match themselves.
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/mw/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => { proxyReq.setHeader('origin', 'http://127.0.0.1:3002') })
        },
      },
    },
  },
})
