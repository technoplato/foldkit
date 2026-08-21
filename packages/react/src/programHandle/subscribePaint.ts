/**
 * Coalesces handle notifies to one paint per animation frame.
 * Node hosts paint immediately. Browser hosts skip intermediate
 * snapshots in a burst so React stays on the latest Model.
 */
export const subscribePaint = (
  subscribe: (listener: () => void) => () => void,
  listener: () => void,
): (() => void) => {
  let isPending = false
  let frame = 0
  const paint = (): void => {
    isPending = false
    frame = 0
    listener()
  }
  const stop = subscribe(() => {
    if (isPending) {
      return
    }
    if (typeof requestAnimationFrame !== 'function') {
      listener()
      return
    }
    isPending = true
    frame = requestAnimationFrame(paint)
  })
  return () => {
    if (frame !== 0 && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(frame)
    }
    isPending = false
    frame = 0
    stop()
  }
}
