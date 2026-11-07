import { contextBridge, ipcRenderer } from 'electron'
import type { LeafmarkApi, Notice, Snapshot } from '@shared/ipc-contracts'
import { IPC } from '@shared/ipc-contracts'

/**
 * Preload entry. Only whitelisted business level calls are exposed; the renderer never
 * receives `ipcRenderer`, `fs`, `path`, shell access or any generic file operation.
 */
const api: LeafmarkApi = {
  getSnapshot: () => ipcRenderer.invoke(IPC.getSnapshot),
  chooseWorkspace: () => ipcRenderer.invoke(IPC.chooseWorkspace),
  openRecentWorkspace: (path) => ipcRenderer.invoke(IPC.openRecentWorkspace, path),
  rescan: () => ipcRenderer.invoke(IPC.rescan),
  previewRename: (input) => ipcRenderer.invoke(IPC.previewRename, input),
  commitRename: (planId) => ipcRenderer.invoke(IPC.commitRename, planId),
  cancelPlan: (planId) => ipcRenderer.invoke(IPC.cancelPlan, planId),
  createDocument: (input) => ipcRenderer.invoke(IPC.createDocument, input),
  undoLastRename: () => ipcRenderer.invoke(IPC.undoLastRename),
  updateConfig: (config) => ipcRenderer.invoke(IPC.updateConfig, config),
  resetConfig: () => ipcRenderer.invoke(IPC.resetConfig),
  getAppInfo: () => ipcRenderer.invoke(IPC.getAppInfo),
  onSnapshot: (listener) => {
    const handler = (_event: unknown, snapshot: Snapshot): void => listener(snapshot)
    ipcRenderer.on(IPC.snapshotEvent, handler)
    return () => {
      ipcRenderer.removeListener(IPC.snapshotEvent, handler)
    }
  },
  onNotice: (listener) => {
    const handler = (_event: unknown, notice: Notice): void => listener(notice)
    ipcRenderer.on(IPC.noticeEvent, handler)
    return () => {
      ipcRenderer.removeListener(IPC.noticeEvent, handler)
    }
  }
}

contextBridge.exposeInMainWorld('leafmark', api)
