/** A browser Client whose owned resources can be stopped. */
export type MultipleCountersV3StoppableBrowserApp = Readonly<{
  stop: () => Promise<void>
}>

/** Preserves a bfcache-frozen Client and stops only a true page teardown. */
export const stopMultipleCountersV3BrowserAppOnPageHide = (
  app: MultipleCountersV3StoppableBrowserApp,
  event: Pick<PageTransitionEvent, 'persisted'>,
): void => {
  if (!event.persisted) {
    void app.stop()
  }
}
