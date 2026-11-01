// INSTANT

/** The options the page opens Instant with. */
export type BrandonInstantConfig = Readonly<{ appId: string; devtool: false }>

/**
 * How the page opens Instant: signed out, with Instant's devtool off, so
 * nothing of Instant's is drawn or styled beside the wallet, on localhost
 * or anywhere else.
 *
 * @example
 * ```typescript
 * init(brandonInstantConfig(appId))
 * ```
 */
export const brandonInstantConfig = (appId: string): BrandonInstantConfig => ({
  appId,
  devtool: false,
})
