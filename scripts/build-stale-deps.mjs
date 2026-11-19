#!/usr/bin/env node
// Builds the workspace packages the package in this folder depends on,
// but only the stale ones: a package whose sources are newer than its
// built output, or that was never built, and every package that depends
// on one of those. Which packages those are is asked of the workspace
// (`pnpm --filter '<name>^...'`), never listed by hand.
//
// A package's `prebuild`, `predev` or `pretypecheck` runs it:
//
//   "deps": "node ../../../scripts/build-stale-deps.mjs"
//
// NOTE: The built output is each package's `dist` folder. A build that
// was stopped half way leaves output that looks fresh; `pnpm run build`
// in that package puts it right.
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const builtFolder = 'dist'

const notSources = new Set([builtFolder, 'node_modules'])

const isTest = name => /\.test\.[a-z]+$/.test(name)

// What a build writes beside its output, after it: never a source.
const isBuildRecord = name => name.endsWith('.tsbuildinfo')

const newestIn = (directory, isLeftOut) =>
  existsSync(directory)
    ? readdirSync(directory, { withFileTypes: true }).reduce(
        (newest, entry) => {
          if (isLeftOut(entry.name)) {
            return newest
          } else if (entry.isDirectory()) {
            return Math.max(
              newest,
              newestIn(join(directory, entry.name), isLeftOut),
            )
          } else {
            return Math.max(
              newest,
              statSync(join(directory, entry.name)).mtimeMs,
            )
          }
        },
        0,
      )
    : 0

/**
 * When a package's sources last changed and when it was last built, in
 * milliseconds: the newest file a build reads (not its tests, installed
 * packages, hidden files, its own output or the record a build writes
 * beside it), and the newest file of its
 * output, 0 when it was never built.
 */
export const timesOf = root => ({
  sourceMs: newestIn(
    root,
    name =>
      notSources.has(name) ||
      name.startsWith('.') ||
      isTest(name) ||
      isBuildRecord(name),
  ),
  builtMs: newestIn(join(root, builtFolder), () => false),
})

/**
 * The packages that are stale, in the order given: never built, with
 * sources newer than their output, or built before the output of a
 * package they depend on, which they were then built against.
 */
export const staleNamesOf = packages => {
  const builtAt = new Map(packages.map(each => [each.name, each.builtMs]))
  return packages
    .filter(
      each =>
        each.builtMs === 0 ||
        each.sourceMs > each.builtMs ||
        (each.dependsOn ?? []).some(
          name => (builtAt.get(name) ?? 0) > each.builtMs,
        ),
    )
    .map(each => each.name)
}

/**
 * The packages to build, in the order given: each stale one and every
 * package that depends on one of them, however far.
 */
export const toBuildOf = (packages, stale) => {
  const grown = packages
    .filter(
      each =>
        !stale.includes(each.name) &&
        each.dependsOn.some(name => stale.includes(name)),
    )
    .map(each => each.name)
  return grown.length === 0
    ? packages.map(each => each.name).filter(name => stale.includes(name))
    : toBuildOf(packages, [...stale, ...grown])
}

const manifestOf = root =>
  JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

const namedIn = manifest => [
  ...Object.keys(manifest.dependencies ?? {}),
  ...Object.keys(manifest.devDependencies ?? {}),
  ...Object.keys(manifest.peerDependencies ?? {}),
]

// What every package's build reads besides its own folder: the settings
// they all extend and the versions of what they install. A change to
// either makes every package stale once.
const sharedByAll = ['tsconfig.base.json', 'pnpm-lock.yaml']

const workspaceRoot = fileURLToPath(new URL('..', import.meta.url))

const sharedMsOf = root =>
  Math.max(
    0,
    ...sharedByAll
      .map(name => join(root, name))
      .filter(path => existsSync(path))
      .map(path => statSync(path).mtimeMs),
  )

const main = () => {
  const own = manifestOf(process.cwd()).name
  const sharedMs = sharedMsOf(workspaceRoot)
  const listed = JSON.parse(
    execFileSync(
      'pnpm',
      ['--filter', `${own}^...`, 'ls', '--depth', '-1', '--json'],
      { encoding: 'utf8' },
    ),
  )
  const packages = listed
    .map(each => ({ ...each, manifest: manifestOf(each.path) }))
    .filter(each => each.manifest.scripts?.build !== undefined)
    .map(each => {
      const times = timesOf(each.path)
      return {
        name: each.name,
        dependsOn: namedIn(each.manifest),
        sourceMs: Math.max(times.sourceMs, sharedMs),
        builtMs: times.builtMs,
      }
    })
  const building = toBuildOf(packages, staleNamesOf(packages))
  if (building.length === 0) {
    console.log(
      `${own}: all ${packages.length.toString()} workspace dependencies are built.`,
    )
    return 0
  } else {
    console.log(
      `${own}: building ${building.length.toString()} of ${packages.length.toString()} workspace dependencies: ${building.join(', ')}.`,
    )
    const built = spawnSync(
      'pnpm',
      [...building.flatMap(name => ['--filter', name]), 'run', 'build'],
      { stdio: 'inherit' },
    )
    return built.status ?? 1
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main())
}
