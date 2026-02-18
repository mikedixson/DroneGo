import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'robots.txt', 'apple-touch-icon.png'],
      manifest: {
        name: 'DroneGo Flight Zone Map',
        short_name: 'DroneGo',
        description: 'UK drone flight restriction zones and TOAL sites',
        theme_color: '#1976d2',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'any',
        scope: '/',
        start_url: '/',
        categories: ['navigation', 'maps', 'aviation'],
        icons: [
          {
            src: '/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        // Cache-first strategy for map tiles
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.tile\.openstreetmap\.org\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles-cache',
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          // Stale-while-revalidate for restriction zones
          {
            urlPattern: /^http:\/\/localhost:3000\/api\/v1\/zones/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'api-zones-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24, // 24 hours
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          // Network-first with fallback for NOTAMs and location checks
          {
            urlPattern: /^http:\/\/localhost:3000\/api\/v1\/(location|toal)/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-location-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 2, // 2 hours
              },
              networkTimeoutSeconds: 5,
            },
          },
        ],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
  server: {
    port: 5173,
    // Note: geolocation API works on localhost even without HTTPS
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'es2020',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          leaflet: ['leaflet'],
          turf: ['@turf/turf'],
        },
      },
    },
  },
});
