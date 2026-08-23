import * as NodePath from 'node:path'
import { fileURLToPath } from 'node:url'

/** Package root for configs, rungs, and traces. */
export const packageRoot = NodePath.resolve(
  NodePath.dirname(fileURLToPath(import.meta.url)),
  '..',
)

/** Default Vercel-shaped request config. */
export const defaultConfigPath = NodePath.join(
  packageRoot,
  'configs',
  'default.json',
)

/** Live Counter rung A Maestro file. */
export const liveCounterRungPath = NodePath.join(
  packageRoot,
  'rungs',
  'a.build-a-counter.yaml',
)

/** Rung catalog including future stub names. */
export const rungCatalogPath = NodePath.join(
  packageRoot,
  'rungs',
  'catalog.yaml',
)

/** Trace JSON directory. */
export const tracesDirectory = NodePath.join(packageRoot, 'traces')

/** Last-run copy for GROK-REPORT. */
export const lastRunPath = NodePath.join(packageRoot, '.look', 'last-run.json')
