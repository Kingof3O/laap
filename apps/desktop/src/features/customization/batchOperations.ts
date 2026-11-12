export interface BatchResult {
  succeeded: string[]
  failed: { id: string; error: string }[]
  cancelled: string[]
}

/** Cancellation stops scheduling; already committed native writes remain successful. */
export async function runBatch(ids: readonly string[], operation: (id: string) => Promise<unknown>,
  signal: AbortSignal, progress: (completed: number, total: number) => void = () => {}): Promise<BatchResult> {
  const result: BatchResult = { succeeded: [], failed: [], cancelled: [] }
  const unique = [...new Set(ids)]
  for (const [index, id] of unique.entries()) {
    if (signal.aborted) {
      result.cancelled.push(...unique.slice(index))
      break
    }
    try { await operation(id); result.succeeded.push(id) }
    catch (cause) { result.failed.push({ id, error: cause instanceof Error ? cause.message : String(cause) }) }
    progress(index + 1, unique.length)
  }
  return result
}
