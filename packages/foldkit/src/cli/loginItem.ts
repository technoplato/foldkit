/// <reference types="node" />
/**
 * Starting a Background Processor at login, and again after it dies: the
 * login item a host with `lifetime: 'AlwaysOn'` installs. On a Mac it is
 * a launchd agent, one file in `~/Library/LaunchAgents`.
 *
 * This module imports no Effect and no Program, so the thin half of a
 * terminal host reads it. What the file says is a pure reading of the
 * host (`loginItemOf`, `launchAgentOf`); writing it and telling launchd
 * go through a port, `LoginItems`, so a test never adds a login item to
 * the person running it.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'

import { backgroundProcessorFlag } from './words.js'

// ITEM

/**
 * One Background Processor's login item: the name launchd knows it by,
 * the file that declares it, what it runs, the environment it runs in,
 * and where what it prints goes.
 */
export type LoginItem = Readonly<{
  label: string
  path: string
  arguments: ReadonlyArray<string>
  environment: Readonly<Record<string, string>>
  logPath: string
}>

const SOCKET_EXTENSION = '.sock'

/**
 * The login item of the Background Processor on a socket. Its name
 * carries the socket's own, so each Processor has one item and a
 * checkout with a Processor of its own never replaces another's.
 * `launch` is what starts the host, such as Node and the host's entry,
 * or a launcher script that prepares its environment first.
 *
 * @example
 * ```typescript
 * loginItemOf({
 *   name: 'publisher',
 *   socketPath: '/tmp/fkc-0a1b2c3d4e5f.sock',
 *   home: '/Users/ada',
 *   launch: ['/opt/node/bin/node', '/Users/ada/app/dist/entry.js'],
 *   environment: { PATH: '/opt/node/bin:/usr/bin' },
 *   logPath: terminalLogPath('publisher'),
 * }).label // 'foldkit.publisher.fkc-0a1b2c3d4e5f'
 * ```
 */
export const loginItemOf = (
  options: Readonly<{
    name: string
    socketPath: string
    home: string
    launch: ReadonlyArray<string>
    environment: Readonly<Record<string, string>>
    logPath: string
  }>,
): LoginItem => {
  const label = `foldkit.${options.name}.${basename(options.socketPath, SOCKET_EXTENSION)}`
  return {
    label,
    path: join(options.home, 'Library', 'LaunchAgents', `${label}.plist`),
    arguments: [...options.launch, backgroundProcessorFlag],
    environment: options.environment,
    logPath: options.logPath,
  }
}

const escaped = (text: string): string =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

const stringOf = (text: string, indent: string): string =>
  `${indent}<string>${escaped(text)}</string>`

const keyOf = (text: string, indent: string): string =>
  `${indent}<key>${escaped(text)}</key>`

/**
 * The launchd agent that declares a login item, as the text of its
 * property list. launchd starts it at login (`RunAtLoad`) and again
 * whenever it ends any way but cleanly (`KeepAlive`, `SuccessfulExit`
 * false): a crash or a kill starts it again, and a Processor a person
 * stopped, which exits cleanly, stays stopped until the next command or
 * the next login.
 *
 * It is marked `Interactive`, so launchd gives it an app's priority and
 * not a background job's. A Processor answers commands and does a
 * person's work; on a busy Mac the fixture host took 11 and 26 seconds
 * to answer after launchd started it without the mark, and about half
 * a second with it (2026-11-22, load average 123).
 *
 * @example
 * ```typescript
 * writeFileSync(item.path, launchAgentOf(item))
 * ```
 */
export const launchAgentOf = (item: LoginItem): string =>
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    keyOf('Label', '  '),
    stringOf(item.label, '  '),
    keyOf('ProgramArguments', '  '),
    '  <array>',
    ...item.arguments.map(argument => stringOf(argument, '    ')),
    '  </array>',
    keyOf('EnvironmentVariables', '  '),
    '  <dict>',
    ...Object.entries(item.environment).flatMap(([name, value]) => [
      keyOf(name, '    '),
      stringOf(value, '    '),
    ]),
    '  </dict>',
    keyOf('RunAtLoad', '  '),
    '  <true/>',
    keyOf('KeepAlive', '  '),
    '  <dict>',
    keyOf('SuccessfulExit', '    '),
    '    <false/>',
    '  </dict>',
    keyOf('ProcessType', '  '),
    stringOf('Interactive', '  '),
    keyOf('StandardOutPath', '  '),
    stringOf(item.logPath, '  '),
    keyOf('StandardErrorPath', '  '),
    stringOf(item.logPath, '  '),
    '</dict>',
    '</plist>',
    '',
  ].join('\n')

// SYSTEM

/**
 * What installing a login item needs of the machine: which system it
 * is, whose login it is, their home, their files, and launchd.
 * `launchctl` runs one launchd command and answers how it ended and
 * what it said.
 */
export type LoginItems = Readonly<{
  platform: string
  userId: number
  home: string
  exists: (path: string) => boolean
  write: (path: string, text: string) => void
  remove: (path: string) => void
  launchctl: (
    words: ReadonlyArray<string>,
  ) => Readonly<{ exitCode: number; said: string }>
}>

const NO_USER = -1

/**
 * The person's own login items: their home, their files, and the real
 * launchd.
 *
 * @example
 * ```typescript
 * installLoginItem(item, systemLoginItems())
 * ```
 */
export const systemLoginItems = (): LoginItems => ({
  platform: process.platform,
  userId: process.getuid === undefined ? NO_USER : process.getuid(),
  home: homedir(),
  exists: existsSync,
  write: (path, text) => {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, text, 'utf8')
  },
  remove: path => {
    rmSync(path, { force: true })
  },
  launchctl: words => {
    const ran = spawnSync('launchctl', [...words], { encoding: 'utf8' })
    return {
      exitCode: ran.status ?? 1,
      said: `${ran.stderr}${ran.stdout}`.trim(),
    }
  },
})

const MAC = 'darwin'

const domainOf = (system: LoginItems): string =>
  `gui/${system.userId.toString()}`

const targetOf = (item: LoginItem, system: LoginItems): string =>
  `${domainOf(system)}/${item.label}`

// INSTALL

/** How installing a login item ended. */
export type Installed =
  | Readonly<{ _tag: 'Installed'; path: string }>
  | Readonly<{ _tag: 'Refused'; why: string }>

/** How removing a login item ended. */
export type Removed =
  | Readonly<{ _tag: 'Removed'; path: string }>
  | Readonly<{ _tag: 'NotInstalled' }>

/** True when a login item's file is in place. */
export const isLoginItemInstalled = (
  item: LoginItem,
  system: LoginItems,
): boolean => system.exists(item.path)

/**
 * Writes a login item's file and has launchd load it, which starts the
 * Background Processor now. An older item of the same name is forgotten
 * first, so installing again takes the new file. When launchd will not
 * load it, the file is removed and what launchd said is returned.
 *
 * @example
 * ```typescript
 * installLoginItem(item, systemLoginItems())
 * // { _tag: 'Installed', path: '/Users/ada/Library/LaunchAgents/foldkit.publisher.fkc-0a1b2c3d4e5f.plist' }
 * ```
 */
export const installLoginItem = (
  item: LoginItem,
  system: LoginItems,
): Installed => {
  if (system.platform !== MAC) {
    return {
      _tag: 'Refused',
      why: `Starting at login is built for macOS only, and this is ${system.platform}.`,
    }
  }
  system.write(item.path, launchAgentOf(item))
  system.launchctl(['bootout', targetOf(item, system)])
  const loaded = system.launchctl(['bootstrap', domainOf(system), item.path])
  if (loaded.exitCode === 0) {
    return { _tag: 'Installed', path: item.path }
  } else {
    system.remove(item.path)
    return {
      _tag: 'Refused',
      why: `launchd would not load it: ${loaded.said}`,
    }
  }
}

/**
 * Has launchd forget a login item, which ends the Background Processor
 * it started, and removes its file.
 *
 * @example
 * ```typescript
 * uninstallLoginItem(item, systemLoginItems()) // { _tag: 'Removed', path }
 * ```
 */
export const uninstallLoginItem = (
  item: LoginItem,
  system: LoginItems,
): Removed => {
  if (isLoginItemInstalled(item, system)) {
    system.launchctl(['bootout', targetOf(item, system)])
    system.remove(item.path)
    return { _tag: 'Removed', path: item.path }
  } else {
    return { _tag: 'NotInstalled' }
  }
}

/**
 * Asks launchd to start an installed login item that is not running,
 * such as one a person stopped. launchd starts it once however many
 * commands ask, and starts it again if it dies.
 *
 * @example
 * ```typescript
 * startLoginItem(item, systemLoginItems())
 * ```
 */
export const startLoginItem = (item: LoginItem, system: LoginItems): void => {
  system.launchctl(['kickstart', targetOf(item, system)])
}
