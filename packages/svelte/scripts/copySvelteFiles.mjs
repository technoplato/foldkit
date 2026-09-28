import { cpSync, statSync } from 'node:fs'

const isShipped = source =>
  statSync(source).isDirectory() ||
  source.endsWith('.svelte') ||
  source.endsWith('.svelte.d.ts')

cpSync('src', 'dist', { recursive: true, filter: isShipped })
