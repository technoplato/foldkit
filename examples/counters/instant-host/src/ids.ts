import { type Model } from 'counters-core-example'
import { Array } from 'effect'

/** Allocates the next unused Counter id for a host that creates a row. */
export const nextAllocatedCounterId = (model: Model): string => {
  const usedIds = Array.appendAll(
    Array.map(model.rows, row => row.id),
    model.retiredCounterIds,
  )
  let index = 1
  let candidate = `counter-${index.toString()}`
  while (Array.contains(usedIds, candidate)) {
    index += 1
    candidate = `counter-${index.toString()}`
  }
  return candidate
}
