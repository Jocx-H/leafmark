import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

const sharedDir = fileURLToPath(new URL('./src/shared', import.meta.url))

const PRODUCTION_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'"
].join('; ')

/** Replaces the development CSP with the strict production policy at build time. */
const cspPlugin: Plugin = {
  name: 'leafmark-production-csp',
  apply: 'build',
  transformIndexHtml(html) {
    return html.replace(
      /<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?\/>/,
      `<meta http-equiv="Content-Security-Policy" content="${PRODUCTION_CSP}" />`
    )
  }
}

export default defineConfig({
  root: 'src/renderer',
  base: './',
  resolve: {
    alias: {
      '@shared': sharedDir
    }
  },
  plugins: [react(), cspPlugin],
  build: {
    outDir: fileURLToPath(new URL('./out/renderer', import.meta.url)),
    emptyOutDir: true,
    target: 'chrome140'
  },
  server: {
    port: 5173,
    strictPort: true
  }
})
