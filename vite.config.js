// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: {
        name: 'EN Trainer',
        short_name: 'EN Trainer',
        start_url: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0b1020',
        theme_color: '#10b981',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        // Exclude .wasm from precache to avoid the 2 MB limit,
        // but still precache normal assets:
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
        // Allow larger JS chunks if needed:
        maximumFileSizeToCacheInBytes: 30 * 1024 * 1024,
        // Cache WASM at runtime instead:
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.endsWith('.wasm'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'wasm-cache',
              expiration: { maxEntries: 4, maxAgeSeconds: 7 * 24 * 60 * 60 },
            },
          },
        ],
      },
      // If you ever need the SW disabled during dev, uncomment:
      // devOptions: { enabled: false },
    }),
  ],
})
