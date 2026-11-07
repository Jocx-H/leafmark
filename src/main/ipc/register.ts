import { app, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { ISSUE, LeafmarkError, toLeafmarkError } from '@shared/errors'
import { IPC, type AppInfo, type Result } from '@shared/ipc-contracts'
import type { AppState } from '../appState'
import type { LeafmarkConfig } from '@shared/config/types'

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new LeafmarkError(ISSUE.invalidInput, `${label} 必须是对象`)
  }
  return value as Record<string, unknown>
}

function asString(value: unknown, label: string, maxLength = 2048): string {
  if (typeof value !== 'string') {
    throw new LeafmarkError(ISSUE.invalidInput, `${label} 必须是字符串`)
  }
  if (value.length > maxLength) {
    throw new LeafmarkError(ISSUE.invalidInput, `${label} 过长`)
  }
  return value
}

function asStringArray(value: unknown, label: string, maxItems = 64, maxLength = 256): string[] {
  if (!Array.isArray(value)) {
    throw new LeafmarkError(ISSUE.invalidInput, `${label} 必须是数组`)
  }
  if (value.length > maxItems) {
    throw new LeafmarkError(ISSUE.invalidInput, `${label} 数量过多`)
  }
  return value.map((item, index) => asString(item, `${label}[${index}]`, maxLength))
}

function isTrustedUrl(url: string): boolean {
  if (url.startsWith('file://')) return true
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (!devUrl) return false
  return url.startsWith(devUrl.replace(/\/$/, ''))
}

function assertTrustedSender(appState: AppState, event: IpcMainInvokeEvent): void {
  const window = appState.getWindow()
  if (!window || window.isDestroyed() || event.sender !== window.webContents) {
    throw new LeafmarkError(ISSUE.invalidInput, '拒绝来自未知窗口的调用')
  }
  if (event.senderFrame !== window.webContents.mainFrame) {
    throw new LeafmarkError(ISSUE.invalidInput, '拒绝来自子框架的调用')
  }
  if (!isTrustedUrl(event.senderFrame.url)) {
    throw new LeafmarkError(ISSUE.invalidInput, '拒绝来自非本地页面的调用')
  }
}

export function registerIpcHandlers(appState: AppState): void {
  function handle<T>(channel: string, handler: (...args: unknown[]) => Promise<T> | T): void {
    ipcMain.handle(channel, async (event, ...args: unknown[]): Promise<Result<T>> => {
      try {
        assertTrustedSender(appState, event)
        return { ok: true, value: await handler(...args) }
      } catch (error) {
        const leafmarkError = toLeafmarkError(error, '操作失败')
        return { ok: false, error: { code: leafmarkError.code, message: leafmarkError.message } }
      }
    })
  }

  handle(IPC.getSnapshot, () => appState.snapshot())
  handle(IPC.chooseWorkspace, () => appState.chooseWorkspace())
  handle(IPC.openRecentWorkspace, (workspacePath) =>
    appState.openRecentWorkspace(asString(workspacePath, 'workspacePath'))
  )
  handle(IPC.rescan, () => appState.rescan())
  handle(IPC.previewRename, (input) => {
    const record = asRecord(input, 'renameInput')
    return appState.previewRename({
      sourceRelativePath: asString(record.sourceRelativePath, 'sourceRelativePath'),
      primaryCode: asString(record.primaryCode, 'primaryCode', 8),
      secondaryCode: asString(record.secondaryCode, 'secondaryCode', 8),
      sequenceCode: asString(record.sequenceCode, 'sequenceCode', 8),
      tags: asStringArray(record.tags, 'tags', 64, 200),
      title: asString(record.title, 'title', 500)
    })
  })
  handle(IPC.commitRename, (planId) => appState.commitRename(asString(planId, 'planId', 128)))
  handle(IPC.cancelPlan, (planId) => appState.cancelPlan(asString(planId, 'planId', 128)))
  handle(IPC.createDocument, (input) => {
    const record = asRecord(input, 'createInput')
    return appState.createDocument({
      primaryCode: asString(record.primaryCode, 'primaryCode', 8),
      secondaryCode: asString(record.secondaryCode, 'secondaryCode', 8),
      sequenceCode: asString(record.sequenceCode, 'sequenceCode', 8),
      tags: asStringArray(record.tags, 'tags', 64, 200),
      title: asString(record.title, 'title', 500)
    })
  })
  handle(IPC.undoLastRename, () => appState.undoLastRename())
  handle(IPC.updateConfig, (config) => {
    asRecord(config, 'config')
    return appState.updateConfig(config as LeafmarkConfig)
  })
  handle(IPC.resetConfig, () => appState.resetConfig())
  handle(IPC.getAppInfo, (): AppInfo => ({
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron ?? '',
    platform: process.platform,
    arch: process.arch
  }))
}
