import { build as esbuild } from 'esbuild'
import { build as viteBuild } from 'vite'
import { rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
process.chdir(project)

await rm(path.join(project, 'out'), { recursive: true, force: true })

const common = {
  entryPoints: ['src/main/index.ts', 'src/preload/index.ts'],
  outdir: 'out',
  outbase: 'src',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
  sourcemap: false,
  logLevel: 'info',
  tsconfig: 'tsconfig.node.json',
  legalComments: 'none',
  define: { 'process.env.NODE_ENV': '"production"' }
}

await esbuild(common)
await viteBuild({ configFile: 'vite.config.ts', mode: 'production', logLevel: 'info' })

console.log('LeafMark build complete: out/main, out/preload, out/renderer')
