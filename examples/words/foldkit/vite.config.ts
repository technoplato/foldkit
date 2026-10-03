import { execFileSync } from 'node:child_process'
import path from 'path'
import { defineConfig } from 'vite'

import { foldkit } from '@foldkit/vite-plugin'
import tailwindcss from '@tailwindcss/vite'

import { foldkitAliases, instantBrowserAlias } from '../../vite.aliases'
import {
  appleAppSiteAssociation,
  devImpersonation,
  wordsHostedIdentity,
} from './vitePlugins'

const gitOutput = (args: ReadonlyArray<string>): string => {
  try {
    return execFileSync('git', [...args], {
      cwd: __dirname,
      encoding: 'utf8',
    }).trim()
  } catch {
    return ''
  }
}

const buildCommit = gitOutput(['rev-parse', 'HEAD'])
const isDirty = gitOutput(['status', '--porcelain', '--', '..']) !== ''

export default defineConfig({
  appType: 'spa',
  define: {
    'import.meta.env.VITE_WORDS_BUILD_COMMIT':
      buildCommit === ''
        ? 'undefined'
        : JSON.stringify(`${buildCommit}${isDirty ? '-dirty' : ''}`),
    'import.meta.env.VITE_WORDS_BUILD_BRANCH': JSON.stringify(
      gitOutput(['rev-parse', '--abbrev-ref', 'HEAD']),
    ),
    'import.meta.env.VITE_WORDS_BUILD_TIME': JSON.stringify(
      new Date().toISOString(),
    ),
    'import.meta.env.VITE_WORDS_BUILD_WORKTREE': JSON.stringify(
      gitOutput(['rev-parse', '--show-toplevel']),
    ),
  },
  plugins: [
    tailwindcss(),
    foldkit({ devToolsMcpPort: 9996 }),
    appleAppSiteAssociation(),
    devImpersonation(),
    wordsHostedIdentity(),
  ],
  resolve: {
    alias: {
      'words-core-example': path.resolve(__dirname, '../core/src/index.ts'),
      ...instantBrowserAlias,
      ...foldkitAliases(path.resolve(__dirname, '..')),
    },
  },
  server: {
    port: 5231,
    allowedHosts: ['words.knophy.com', 'words.pisspoursoftware.xyz'],
    fs: { allow: ['../../../'] },
  },
  preview: {
    host: '127.0.0.1',
    port: 5232,
    allowedHosts: ['words.knophy.com', 'words.pisspoursoftware.xyz'],
  },
})
