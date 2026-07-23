import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { exampleSlugs } from '../packages/website/src/page/example/meta'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '..')
const EXAMPLES_DIR = resolve(REPO_ROOT, 'examples')
const OUTPUT_DIR = resolve(
  REPO_ROOT,
  'packages/website/public/example-apps-embed',
)
const BRIDGE_SCRIPT_PATH = resolve(REPO_ROOT, 'scripts/example-bridge.js')
const BRIDGE_SCRIPT_TAG = '<script src="bridge.js"></script></head>'

const resolveExampleAppDirectory = (exampleDirectory: string): string => {
  const foldkitDirectory = resolve(exampleDirectory, 'foldkit')
  if (existsSync(resolve(foldkitDirectory, 'package.json'))) {
    return foldkitDirectory
  } else {
    return exampleDirectory
  }
}

const buildExampleCore = (exampleDirectory: string): void => {
  const coreDirectory = resolve(exampleDirectory, 'core')
  if (!existsSync(resolve(coreDirectory, 'package.json'))) {
    return
  }

  const result = spawnSync('pnpm', ['run', 'build'], {
    cwd: coreDirectory,
    stdio: 'inherit',
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

const buildExample = (slug: string): void => {
  console.log(`Building example: ${slug}`)

  const exampleDir = resolve(EXAMPLES_DIR, slug)
  const exampleAppDir = resolveExampleAppDirectory(exampleDir)
  const outputDir = resolve(OUTPUT_DIR, slug)

  buildExampleCore(exampleDir)

  const result = spawnSync(
    'npx',
    [
      'vite',
      'build',
      '--base',
      `/example-apps-embed/${slug}/`,
      '--outDir',
      outputDir,
    ],
    { cwd: exampleAppDir, stdio: 'inherit' },
  )

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }

  copyFileSync(BRIDGE_SCRIPT_PATH, resolve(outputDir, 'bridge.js'))

  const htmlPath = resolve(outputDir, 'index.html')
  if (existsSync(htmlPath)) {
    const html = readFileSync(htmlPath, 'utf8')
    writeFileSync(htmlPath, html.replace('</head>', BRIDGE_SCRIPT_TAG))
    console.log('  → injected bridge script')
  }

  console.log(`  → ${outputDir}`)
}

if (existsSync(OUTPUT_DIR)) {
  rmSync(OUTPUT_DIR, { recursive: true, force: true })
}
mkdirSync(OUTPUT_DIR, { recursive: true })

for (const slug of exampleSlugs) {
  buildExample(slug)
}

console.log('')
console.log(`Built ${exampleSlugs.length} examples into ${OUTPUT_DIR}`)
