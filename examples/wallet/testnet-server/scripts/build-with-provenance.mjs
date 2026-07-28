import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const exampleRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)
const repositoryRoot = path.resolve(exampleRoot, '../../..')
const outputDirectory = path.join(exampleRoot, 'dist')
const artifactLocation = path.join(outputDirectory, 'entry.js')
const generatedProvenance = path.join(outputDirectory, 'build-provenance.json')

const run = (command, arguments_) => {
  const result = spawnSync(command, arguments_, {
    cwd: exampleRoot,
    encoding: 'utf8',
    stdio: 'inherit',
  })
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1
    throw new Error(`${command} failed`)
  }
}

run('rimraf', [outputDirectory])
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
  'Foldkit Wallet Testnet Server',
  '--version',
  '0.0.0',
  '--configuration',
  'release',
  '--platform',
  'node',
])
run('tsc', ['-p', 'tsconfig.build.json'])
