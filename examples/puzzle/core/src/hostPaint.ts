/**
 * Coalesces handle notifies to one paint per animation frame.
 * Node Hosts paint immediately. Browser Hosts skip intermediate counts
 * in a burst so Svelte and React stay on the latest Ready count.
 */
export const subscribeHostPaint = (
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
