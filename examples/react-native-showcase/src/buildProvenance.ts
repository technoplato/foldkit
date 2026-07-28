const encodedBuildProvenance = process.env.EXPO_PUBLIC_BUILD_PROVENANCE

/** Logs the build identity embedded by the reproducible Expo build. */
export const logBuildProvenance = (): void => {
  if (encodedBuildProvenance === undefined) {
    console.info('[build-provenance] unavailable in this development build')
  } else {
    console.info(`[build-provenance] ${encodedBuildProvenance}`)
  }
}
