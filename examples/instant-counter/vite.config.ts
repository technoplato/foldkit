import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { type Plugin, defineConfig } from 'vite'

import { foldkit } from '@foldkit/vite-plugin'

const buildAssetMarker = '__FOLDKIT_BUILD_ASSETS__'
const serviceWorkerFileName = 'instant-counter-sw.js'

const precacheBuildAssets = (): Plugin => {
  let outputDirectory = ''
  let assetPaths: ReadonlyArray<string> = []

  return {
    name: 'instant-counter-precache-build-assets',
    configResolved(config): void {
      outputDirectory = resolve(config.root, config.build.outDir)
    },
    generateBundle(_options, bundle): void {
      assetPaths = Object.values(bundle)
        .filter(output => output.fileName !== 'index.html')
        .map(output => `/${output.fileName}`)
        .sort()
    },
    closeBundle: async (): Promise<void> => {
      const serviceWorkerPath = resolve(outputDirectory, serviceWorkerFileName)
      const source = await readFile(serviceWorkerPath, 'utf8')
      const marker = `'${buildAssetMarker}'`
      if (!source.includes(marker)) {
        throw new Error('The Instant counter service worker marker is missing.')
      }
      await writeFile(
        serviceWorkerPath,
        source.replace(
          marker,
          assetPaths.map(path => JSON.stringify(path)).join(', '),
        ),
      )
    },
  }
}

export default defineConfig({
  plugins: [foldkit(), precacheBuildAssets()],
})
