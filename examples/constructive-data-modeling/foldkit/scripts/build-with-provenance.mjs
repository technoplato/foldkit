import { spawnSync } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const exampleRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)
const repositoryRoot = path.resolve(exampleRoot, '../../..')
const artifactLocation = path.join(exampleRoot, 'dist')
const generatedDirectory = await mkdtemp(
  path.join(tmpdir(), 'foldkit-constructive-data-modeling-'),
)
const generatedProvenance = path.join(
  generatedDirectory,
  'build-provenance.json',
)

const run = (command, arguments_, options = {}) => {
  const result = spawnSync(command, arguments_, {
    cwd: exampleRoot,
    encoding: 'utf8',
    stdio: 'inherit',
    ...options,
  })
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1
    throw new Error(`${command} failed`)
  }
}

try {
  run('python3', [
    path.join(repositoryRoot, 'scripts/change-log/build_provenance.py'),
    '--repo',
    repositoryRoot,
    '--format',
    'json',
    '--output',
    generatedProvenance,
    '--artifact-location',
    artifactLocation,
    '--project-name',
    'constructive-data-modeling-foldkit',
    '--version',
    '0.0.0',
    '--configuration',
    'production',
    '--platform',
    'web',
  ])
  run('vite', ['build'], {
    env: {
      ...process.env,
      FOLDKIT_BUILD_PROVENANCE_JSON: readFileSync(generatedProvenance, 'utf8'),
    },
  })
} finally {
  rmSync(generatedDirectory, { force: true, recursive: true })
}
