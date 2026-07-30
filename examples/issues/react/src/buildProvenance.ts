const encodedBuildProvenance = import.meta.env['VITE_BUILD_PROVENANCE']

/** Logs the immutable source and build identity embedded by a release build. */
export const logBuildProvenance = (): void => {
  if (encodedBuildProvenance === undefined) {
    console.info('[build-provenance] unavailable in this development build')
  } else {
    console.info(`[build-provenance] ${encodedBuildProvenance}`)
  }
}
