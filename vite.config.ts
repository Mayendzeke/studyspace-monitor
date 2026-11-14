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
        name: 'Study Space Monitor',
        short_name: 'Monitor',
        description: 'StudySpace teacher and administrator workspace.',
        theme_color: '#242938',
        background_color: '#242938',
        display: 'standalone',
        display_override: ['standalone'],
        orientation: 'any',
        id: 'https://mayendzeke.github.io/studyspace-monitor/',
        start_url: '/studyspace-monitor/',
        scope: '/studyspace-monitor/',
        prefer_related_applications: false,
        icons: [
          { src: '/studyspace-monitor/studyspace-monitor.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/studyspace-monitor/monitor-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/studyspace-monitor/monitor-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/studyspace-monitor/monitor-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/studyspace-monitor/monitor-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
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
