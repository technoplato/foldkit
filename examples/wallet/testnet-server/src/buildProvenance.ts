import { Effect } from 'effect'
import { readFileSync } from 'node:fs'

const buildProvenanceUrl = new URL('./build-provenance.json', import.meta.url)

/** Logs the immutable source and build identity embedded in the server artifact. */
export const logBuildProvenance = Effect.sync(() =>
  readFileSync(buildProvenanceUrl, 'utf8'),
).pipe(
  Effect.flatMap(buildProvenance =>
    Effect.logInfo('foldkit.build_provenance', buildProvenance),
  ),
)
