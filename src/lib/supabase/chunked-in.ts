/** PostgREST puts `.in()` values in the URL. ~800 ids is rejected with HTTP 400. */
export const POSTGREST_IN_BATCH = 40

export function chunkIds<T>(ids: readonly T[], size = POSTGREST_IN_BATCH): T[][] {
  const batches: T[][] = []
  for (let i = 0; i < ids.length; i += size) {
    batches.push(ids.slice(i, i + size))
  }
  return batches
}

type BatchResult<T> = {
  data: T[] | null
  error: { message: string } | null
}

/** Run a filtered read once per id batch and concatenate the rows. */
export async function queryInBatches<T>(
  ids: readonly string[],
  run: (batch: readonly string[]) => PromiseLike<BatchResult<T>>
): Promise<T[]> {
  if (ids.length === 0) return []

  const rows: T[] = []
  const batches = chunkIds(ids)
  const concurrency = 4
  for (let i = 0; i < batches.length; i += concurrency) {
    const wave = batches.slice(i, i + concurrency)
    const results = await Promise.all(
      wave.map(async (batch) => {
        const { data, error } = await run(batch)
        if (error) throw new Error(error.message)
        return data ?? []
      })
    )
    for (const part of results) rows.push(...part)
  }
  return rows
}
