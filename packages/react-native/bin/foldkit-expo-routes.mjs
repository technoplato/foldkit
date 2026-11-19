#!/usr/bin/env node
// Writes, or checks, an Expo Router app's route files from the routes a
// Foldkit Program declares.
//
//   foldkit-expo-routes generate --navigation <module>#<export> [--app app] [--max-depth 6]
//   foldkit-expo-routes check    --navigation <module>#<export> [--app app] [--max-depth 6]
//
// `<module>#<export>` names a Program, or its navigation, as the app
// would import it: `books-core-example#SyncedBooks`. `generate` writes
// one file for each address the Program can be at, with the catch-all
// and the bare address, and takes away generated files no address asks
// for. `check` writes nothing and fails, naming each file, when the files
// are not what the Program declares. Files a person wrote are never
// touched. An app may also keep only the catch-all and the bare address:
// every address is then shown through the catch-all.
import { addressesOf } from 'foldkit/navigation/route-table'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  generatedMark,
  routeFilesOf,
  staleRouteFilesOf,
} from '../dist/expoRouter/routeFiles.js'

const usage =
  'foldkit-expo-routes <generate|check> --navigation <module>#<export> [--app app] [--max-depth 6]'

const fail = sentence => {
  process.stderr.write(`${sentence}\n`)
  process.exit(1)
}

const [command, ...rest] = process.argv.slice(2)
const flag = name => {
  const at = rest.indexOf(`--${name}`)
  return at === -1 ? undefined : rest[at + 1]
}

if (command !== 'generate' && command !== 'check') {
  fail(usage)
}
const named = flag('navigation')
if (named === undefined || !named.includes('#')) {
  fail(`Name the Program to read the routes from.\n${usage}`)
}
const appFolder = join(process.cwd(), flag('app') ?? 'app')
const maxDepth = Number(flag('max-depth') ?? '6')

const [moduleName, exportName] = named.split('#')
const resolved = createRequire(join(process.cwd(), 'package.json')).resolve(
  moduleName,
)
const loaded = await import(pathToFileURL(resolved).href)
const exported = loaded[exportName]
if (exported === undefined) {
  fail(`${moduleName} exports nothing named ${exportName}.`)
}
const navigation = exported.navigation ?? exported
if (navigation === undefined || !Array.isArray(navigation.routes)) {
  fail(`${named} is not a Program with navigation, nor a navigation.`)
}

const expected = routeFilesOf(addressesOf(navigation, { maxDepth }))

const filesIn = folder =>
  existsSync(folder)
    ? readdirSync(folder, { withFileTypes: true }).flatMap(entry =>
        entry.isDirectory()
          ? filesIn(join(folder, entry.name))
          : [join(folder, entry.name)],
      )
    : []

const onDisk = new Map(
  filesIn(appFolder)
    .filter(file => file.endsWith('.tsx'))
    .map(file => [relative(appFolder, file), readFileSync(file, 'utf8')]),
)

const stale = staleRouteFilesOf(expected, onDisk)

const sentenceOf = ({ _tag, path }) => {
  if (_tag === 'Missing') {
    return `${path} is missing.`
  } else if (_tag === 'Changed') {
    return `${path} is not what the Program declares.`
  } else {
    return `${path} is for an address the Program no longer declares.`
  }
}

if (command === 'check') {
  if (stale.length === 0) {
    process.stdout.write(
      `${expected.length.toString()} route files are what ${named} declares.\n`,
    )
  } else {
    fail(
      [
        ...stale.map(sentenceOf),
        `Run it again to write them: foldkit-expo-routes generate --navigation ${named}`,
      ].join('\n'),
    )
  }
} else {
  for (const file of expected) {
    const target = join(appFolder, file.path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, file.contents)
  }
  for (const { _tag, path } of stale) {
    const held = onDisk.get(path)
    if (
      _tag === 'Unasked' &&
      held !== undefined &&
      held.startsWith(generatedMark)
    ) {
      rmSync(join(appFolder, path))
    }
  }
  process.stdout.write(
    `Wrote ${expected.length.toString()} route files for ${named} in ${relative(process.cwd(), appFolder) || '.'}.\n`,
  )
}
