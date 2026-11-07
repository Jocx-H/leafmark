import path from 'node:path'
import { BrowserWindow, app, session } from 'electron'
import { AppState } from './appState'
import { installApplicationMenu } from './menu'
import { registerIpcHandlers } from './ipc/register'
import { createMainWindow, loadRenderer } from './window'

app.setName('LeafMark')
if (process.platform === 'win32') app.setAppUserModelId('app.leafmark.desktop')

let state: AppState | null = null
let mainWindow: BrowserWindow | null = null

function workspaceFromArgv(argv: string[], packaged: boolean): string | null {
  void packaged
  const appPath = path.resolve(app.getAppPath())
  for (const arg of argv.slice(1)) {
    if (arg.startsWith('-')) continue
    const resolved = path.resolve(arg)
    // In development the first positional argument is the app directory itself.
    if (resolved === appPath) continue
    return resolved
  }
  return null
}

function hardenContents(): void {
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-navigate', (event) => event.preventDefault())
    contents.on('will-attach-webview', (event) => event.preventDefault())
    contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  })
}

async function createWindow(): Promise<void> {
  const window = createMainWindow()
  mainWindow = window
  state?.attachWindow(window)

  window.once('ready-to-show', () => window.show())
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null
  })

  await loadRenderer(window)

  const candidate = workspaceFromArgv(process.argv, app.isPackaged)
  await state?.openFromCommandLine(candidate)
}

const hasLock = app.requestSingleInstanceLock()
if (!hasLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
    const candidate = workspaceFromArgv(argv, app.isPackaged)
    if (candidate && state) {
      void state.openFromCommandLine(candidate)
    }
  })

  app.whenReady().then(async () => {
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
    session.defaultSession.setPermissionCheckHandler(() => false)

    state = new AppState(app.getPath('userData'))
    await state.init()
    registerIpcHandlers(state)
    installApplicationMenu()
    hardenContents()
    await createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) void createWindow()
    })
  }).catch((error: unknown) => {
    console.error('LeafMark failed to start', error)
    app.quit()
  })
}

app.on('before-quit', () => {
  state?.dispose()
  state = null
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
