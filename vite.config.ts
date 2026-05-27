import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      disable: process.env.NODE_ENV === 'development',
      registerType: 'autoUpdate',
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        maximumFileSizeToCacheInBytes: 5000000,
      },
      includeAssets: [
        'favicon.svg',
        'icons.svg',
        'pwa-192.png',
        'pwa-512.png',
        'planos/plano-a.jpeg',
        'planos/plano-b.jpeg',
        'planos/plano-c.jpeg',
        'planos/plano-d.jpeg',
        'planos/plano-e.jpeg',
        'planos/plano-f.jpeg',
        'planos/plano-g.jpeg',
        'planos/plano-h.jpeg',
      ],
      manifest: {
        name: 'App Tecnica Campo Juno',
        short_name: 'Tecnica Juno',
        description: 'Levantamiento tecnico offline para persianas, ensamble e instalacion',
        id: '/',
        start_url: '/',
        scope: '/',
        theme_color: '#f3f6f4',
        background_color: '#f3f6f4',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: 'pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          },
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml'
          }
        ]
      }
    })
  ],
})
