import type { LeafmarkApi } from '@shared/ipc-contracts'

declare global {
  interface Window {
    leafmark: LeafmarkApi
  }
}

export {}
