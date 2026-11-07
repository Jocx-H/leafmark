/** Runs `worker` over `items` with a small concurrency limit, preserving order. */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return []
  const results = new Array<R>(items.length)
  let cursor = 0

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor
      cursor += 1
      if (index >= items.length) return
      const item = items[index] as T
      results[index] = await worker(item, index)
    }
  })

  await Promise.all(runners)
  return results
}
