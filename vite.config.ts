import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['studyspace-monitor.svg'],
      manifest: {
        name: 'StudySpace Monitor',
        short_name: 'StudySpace',
        description: 'StudySpace teacher and administrator workspace.',
        theme_color: '#242938',
        background_color: '#242938',
        display: 'standalone',
        orientation: 'any',
        id: '/studyspace-monitor/',
        start_url: '/studyspace-monitor/',
        scope: '/studyspace-monitor/',
        display_override: ['standalone', 'minimal-ui'],
        icons: [{ src: '/studyspace-monitor/studyspace-monitor.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }]
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
