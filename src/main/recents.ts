import { promises as fs } from 'node:fs'
import path from 'node:path'

const MAX_RECENT = 8

/** Local (per device) list of recently opened workspaces. Never synced. */
export class RecentWorkspaces {
  private entries: string[] = []

  constructor(private readonly filePath: string) {}

  async load(): Promise<string[]> {
    try {
      const text = await fs.readFile(this.filePath, 'utf8')
      const parsed: unknown = JSON.parse(text)
      if (typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as { workspaces?: unknown }).workspaces)) {
        this.entries = ((parsed as { workspaces: unknown[] }).workspaces.filter(
          (item): item is string => typeof item === 'string'
        )).slice(0, MAX_RECENT)
      }
    } catch {
      this.entries = []
    }
    return [...this.entries]
  }

  list(): string[] {
    return [...this.entries]
  }

  async add(workspacePath: string): Promise<string[]> {
    const resolved = path.resolve(workspacePath)
    this.entries = [resolved, ...this.entries.filter((entry) => entry !== resolved)].slice(0, MAX_RECENT)
    await this.persist()
    return this.list()
  }

  async remove(workspacePath: string): Promise<string[]> {
    const resolved = path.resolve(workspacePath)
    this.entries = this.entries.filter((entry) => entry !== resolved)
    await this.persist()
    return this.list()
  }

  private async persist(): Promise<void> {
    const payload = `${JSON.stringify({ workspaces: this.entries }, null, 2)}\n`
    const temporary = `${this.filePath}.${process.pid}.tmp`
    try {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true })
      await fs.writeFile(temporary, payload, 'utf8')
      await fs.rename(temporary, this.filePath)
    } catch {
      await fs.unlink(temporary).catch(() => undefined)
    }
  }
}
