import { context } from 'esbuild'
import { createServer } from 'vite'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const electronPath = require('electron')
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
process.chdir(project)

const server = await createServer({ configFile: 'vite.config.ts', mode: 'development' })
await server.listen()
const url = server.resolvedUrls?.local?.[0]
if (!url) {
  console.error('Vite dev server did not report a local URL')
  process.exit(1)
}

let child = null
let restarting = false
let shuttingDown = false

function sandboxArgs() {
  return process.env.LEAFMARK_NO_SANDBOX === '1' ? ['--no-sandbox'] : []
}

const extraArgs = process.argv.slice(2)

function startElectron() {
  child = spawn(electronPath, ['.', ...sandboxArgs(), ...extraArgs], {
    stdio: 'inherit',
    env: { ...process.env, ELECTRON_RENDERER_URL: url }
  })
  child.on('exit', (code) => {
    child = null
    if (!restarting && !shuttingDown) void shutdown(code ?? 0)
  })
}

let restartTimer = null
function scheduleRestart() {
  if (restartTimer) clearTimeout(restartTimer)
  restartTimer = setTimeout(() => {
    restartTimer = null
    if (shuttingDown) return
    if (child) {
      restarting = true
      child.once('exit', () => {
        restarting = false
        startElectron()
      })
      child.kill()
    } else {
      startElectron()
    }
  }, 200)
}

const buildContext = await context({
  entryPoints: ['src/main/index.ts', 'src/preload/index.ts'],
  outdir: 'out',
  outbase: 'src',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
  sourcemap: true,
  logLevel: 'silent',
  tsconfig: 'tsconfig.node.json',
  define: { 'process.env.NODE_ENV': '"development"' },
  plugins: [
    {
      name: 'restart-electron',
      setup(build) {
        build.onEnd((result) => {
          if (result.errors.length > 0) return
          scheduleRestart()
        })
      }
    }
  ]
})

await buildContext.watch()
console.log(`LeafMark dev server: ${url}`)

async function shutdown(code) {
  if (shuttingDown) return
  shuttingDown = true
  if (restartTimer) clearTimeout(restartTimer)
  await buildContext.dispose().catch(() => undefined)
  await server.close().catch(() => undefined)
  if (child) {
    child.kill()
    child = null
  }
  process.exit(code)
}

process.on('SIGINT', () => void shutdown(0))
process.on('SIGTERM', () => void shutdown(0))
