import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['studyspace-monitor.svg', 'monitor-icon-192.png', 'monitor-icon-512.png'],
      manifest: {
        name: 'Studyspace Monitor',
        short_name: 'SS Monitor',
        description: 'StudySpace teacher and administrator workspace.',
        theme_color: '#242938',
        background_color: '#242938',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        orientation: 'any',
        id: 'https://mayendzeke.github.io/studyspace-monitor/',
        start_url: '/studyspace-monitor/',
        scope: '/studyspace-monitor/',
        prefer_related_applications: false,
        icons: [
          { src: '/studyspace-monitor/monitor-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/studyspace-monitor/monitor-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          { src: '/studyspace-monitor/studyspace-monitor.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }
        ]
      },
      workbox: {
        navigateFallback: '/studyspace-monitor/index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,mjs,wasm,webmanifest}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024
      }
    })
  ],
  base: '/studyspace-monitor/',
})
