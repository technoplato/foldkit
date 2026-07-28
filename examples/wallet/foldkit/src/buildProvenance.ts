const encodedBuildProvenance = import.meta.env['VITE_BUILD_PROVENANCE']

/** Logs the build identity embedded by the reproducible Foldkit build. */
export const logBuildProvenance = (): void => {
  if (encodedBuildProvenance === undefined) {
    console.info('[build-provenance] unavailable in this development build')
  } else {
    console.info(`[build-provenance] ${encodedBuildProvenance}`)
  }
}
