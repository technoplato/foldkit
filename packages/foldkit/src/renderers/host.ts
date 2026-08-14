import { Schema as S } from 'effect'

/** How a Program process runs. This is not Device chrome. */
export const Host = S.Literals([
  'cli',
  'tui',
  'headless',
  'foldkit',
  'react',
  'expo',
])
/** How a Program process runs. */
export type Host = typeof Host.Type
