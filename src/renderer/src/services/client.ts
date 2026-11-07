import type { Result } from '@shared/ipc-contracts'

/** Runs an IPC call and converts failures into a user facing message. */
export async function invoke<T>(
  operation: () => Promise<Result<T>>,
  onError?: (message: string) => void
): Promise<T | null> {
  try {
    const result = await operation()
    if (result.ok) return result.value
    onError?.(result.error.message)
    return null
  } catch (error) {
    onError?.((error as Error).message)
    return null
  }
}
