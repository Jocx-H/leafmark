import { spawn } from 'node:child_process'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const electronPath = require('electron')
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
process.chdir(project)

await import('./build.mjs')

const args = process.argv.slice(2)
const sandboxArgs = process.env.LEAFMARK_NO_SANDBOX === '1' ? ['--no-sandbox'] : []
const child = spawn(electronPath, ['.', ...sandboxArgs, ...args], { stdio: 'inherit' })
child.on('exit', (code) => process.exit(code ?? 0))
