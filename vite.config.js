import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
import { contentSecurityPolicy, productionApiProblems } from './security-headers.js'

/**
 * Normal build (dist/): emits sw.js with the full list of built files, so the installed app works offline
 * after the first visit, including screens not opened yet.
 */
function serviceWorker() {
  return {
    name: 'familyroots-service-worker',
    apply: 'build',
    generateBundle(_, bundle) {
      const files = [...Object.keys(bundle), ...readdirSync('public')].filter((f) => f !== 'sw.js')
      const version = createHash('sha1').update(files.sort().join('|')).digest('hex').slice(0, 10)
      const source = readFileSync('src/sw.js', 'utf8')
        .replace('__VERSION__', version)
        .replace('__PRECACHE__', JSON.stringify(['./', ...files]))
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

/**
 * Normal build: the Content-Security-Policy as the first thing in <head> (see security-headers.js), built from the
 * same VITE_API_URL the app uses. A Vercel production build stops if that address is missing, not https, or local,
 * so a deployed app can never quietly be the demo or talk to a developer's computer.
 */
function securityPolicy(apiUrl) {
  return {
    name: 'familyroots-csp',
    apply: 'build',
    buildStart() {
      const problems = process.env.VERCEL_ENV === 'production' ? productionApiProblems(apiUrl) : []
      if (problems.length) this.error(`Production build refused:\n- ${problems.join('\n- ')}`)
    },
    transformIndexHtml() {
      return [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: contentSecurityPolicy(apiUrl) }, injectTo: 'head-prepend' }]
    },
  }
}

/**
 * Single-file build (release/FamilyRoots.html): inlines the script, styles, fonts and icon into one HTML file
 * that opens by double-click, with no server, npm or internet connection. Browsers block module script
 * files on file://, so the code has to live inside the page.
 */
function singleFile() {
  const favicon = `data:image/svg+xml;base64,${readFileSync('public/favicon.svg').toString('base64')}`
  return {
    name: 'familyroots-single-file',
    apply: 'build',
    enforce: 'post',
    transformIndexHtml(html) {
      return html
        .replace(/<link rel="manifest"[^>]*>\s*/, '')
        .replace(/<link rel="apple-touch-icon"[^>]*>\s*/, '')
        .replace(/href="\.?\/?favicon\.svg"/, `href="${favicon}"`)
    },
    generateBundle(_, bundle) {
      const page = bundle['index.html']
      let html = page.source
      for (const [name, item] of Object.entries(bundle)) {
        if (item.type === 'chunk' && item.isEntry) {
          // "</script" inside the code would end the inline script early. With everything in one file there is
          // nothing to preload, so any leftover preload placeholder becomes a no-op.
          const code = item.code.replace(/<\/script/gi, '<\\/script').replaceAll('__VITE_PRELOAD__', 'void 0')
          html = html.replace(new RegExp(`<script[^>]*src="[^"]*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*></script>`), () => `<script type="module">${code}</script>`)
          delete bundle[name]
        } else if (name.endsWith('.css')) {
          html = html.replace(new RegExp(`<link[^>]*href="[^"]*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>`), () => `<style>${item.source}</style>`)
          delete bundle[name]
        }
      }
      delete bundle['index.html']
      this.emitFile({ type: 'asset', fileName: 'FamilyRoots.html', source: html })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const single = mode === 'single'
  const apiUrl = loadEnv(mode, process.cwd(), 'VITE_').VITE_API_URL || ''
  return {
    // Relative paths, so the build works from any folder or sub-path.
    base: './',
    plugins: [react(), tailwindcss(), ...(single ? [singleFile()] : [serviceWorker(), securityPolicy(apiUrl)])],
    publicDir: single ? false : 'public',
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.js'],
      clearMocks: true,
    },
    build: single
      ? {
          outDir: 'release',
          emptyOutDir: true,
          assetsInlineLimit: Number.MAX_SAFE_INTEGER,
          cssCodeSplit: false,
          modulePreload: false,
          rolldownOptions: { output: { inlineDynamicImports: true } },
        }
      : {},
  }
})
