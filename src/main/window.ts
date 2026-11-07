import path from 'node:path'
import { BrowserWindow } from 'electron'

const isMac = process.platform === 'darwin'

export function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1060,
    minHeight: 660,
    show: false,
    backgroundColor: '#f7f7f3',
    title: 'LeafMark',
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    ...(isMac ? { trafficLightPosition: { x: 18, y: 20 } } : {}),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
      devTools: !process.env.LEAFMARK_DISABLE_DEVTOOLS
    }
  })

  if (!isMac) window.setMenuBarVisibility(false)
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  return window
}

export async function loadRenderer(window: BrowserWindow): Promise<void> {
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) {
    await window.loadURL(devUrl)
    return
  }
  await window.loadFile(path.join(__dirname, '../renderer/index.html'))
}
