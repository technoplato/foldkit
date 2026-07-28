declare const __BUILD_PROVENANCE__: unknown

/** Logs the immutable source and build identity embedded by the clean build. */
export const logBuildProvenance = (): void => {
  console.info('foldkit.build_provenance', __BUILD_PROVENANCE__)
}
