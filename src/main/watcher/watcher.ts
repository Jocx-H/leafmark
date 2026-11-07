import { watch, type FSWatcher } from 'node:fs'
import path from 'node:path'

export interface WatcherCallbacks {
  onBatch(paths: string[], overflow: boolean): void
  onStatus(active: boolean, reason?: string): void
}

/**
 * Thin wrapper around the platform file system watcher.
 *
 * Events are debounced and coalesced; when the platform reports an event without a
 * file name the batch is flagged as `overflow` and the caller falls back to a full scan.
 */
export class WorkspaceWatcher {
  private watcher: FSWatcher | null = null
  private timer: NodeJS.Timeout | null = null
  private readonly pending = new Set<string>()
  private overflow = false
  private stopped = false

  constructor(
    private readonly root: string,
    private readonly callbacks: WatcherCallbacks,
    private readonly debounceMs = 400
  ) {}

  start(): void {
    if (this.watcher !== null) return
    try {
      this.watcher = watch(this.root, { recursive: true, persistent: true, encoding: 'utf8' }, (_event, filename) => {
        if (typeof filename === 'string' && filename.length > 0) {
          this.pending.add(filename.split(path.sep).join('/'))
        } else {
          this.overflow = true
        }
        this.schedule()
      })
      this.watcher.on('error', (error) => {
        this.overflow = true
        this.callbacks.onStatus(false, (error as Error).message)
        this.schedule()
      })
      this.callbacks.onStatus(true)
    } catch (error) {
      this.callbacks.onStatus(false, (error as Error).message)
    }
  }

  stop(): void {
    this.stopped = true
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.watcher?.close()
    this.watcher = null
  }

  private schedule(): void {
    if (this.stopped) return
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      const paths = [...this.pending]
      const overflow = this.overflow
      this.pending.clear()
      this.overflow = false
      if (paths.length === 0 && !overflow) return
      this.callbacks.onBatch(paths, overflow)
    }, this.debounceMs)
  }
}
