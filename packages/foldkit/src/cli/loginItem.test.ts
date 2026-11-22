/// <reference types="node" />
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  type LoginItems,
  installLoginItem,
  isLoginItemInstalled,
  launchAgentOf,
  loginItemOf,
  uninstallLoginItem,
} from './loginItem.js'

const item = loginItemOf({
  name: 'publisher',
  socketPath: '/tmp/fkc-0a1b2c3d4e5f.sock',
  home: '/Users/ada',
  launch: ['/opt/node/bin/node', '/Users/ada/app/dist/entry.js'],
  environment: { PATH: '/opt/node/bin:/usr/bin' },
  logPath: '/Users/ada/Library/Logs/foldkit/publisher-background-processor.log',
})

type Did = Readonly<{ did: string; with: string }>

const fakeSystem = (
  options: Readonly<{ platform?: string; failing?: string }> = {},
): Readonly<{ system: LoginItems; done: Array<Did>; files: Set<string> }> => {
  const done: Array<Did> = []
  const files = new Set<string>()
  return {
    done,
    files,
    system: {
      platform: options.platform ?? 'darwin',
      userId: 501,
      home: '/Users/ada',
      exists: path => files.has(path),
      write: (path, text) => {
        files.add(path)
        done.push({ did: 'write', with: `${path} ${text.length.toString()}` })
      },
      remove: path => {
        files.delete(path)
        done.push({ did: 'remove', with: path })
      },
      launchctl: words => {
        done.push({ did: 'launchctl', with: words.join(' ') })
        return words[0] === options.failing
          ? { exitCode: 5, said: 'Bootstrap failed: 5: Input/output error' }
          : { exitCode: 0, said: '' }
      },
    },
  }
}

describe('what starts a Background Processor at login', () => {
  it('is named for its command and its socket, and kept with the person’s other login items', () => {
    expect(item.label).toBe('foldkit.publisher.fkc-0a1b2c3d4e5f')
    expect(item.path).toBe(
      '/Users/ada/Library/LaunchAgents/foldkit.publisher.fkc-0a1b2c3d4e5f.plist',
    )
  })

  it('starts the host as its Background Processor, with the flag terminal() reads', () => {
    expect(item.arguments).toEqual([
      '/opt/node/bin/node',
      '/Users/ada/app/dist/entry.js',
      '--foldkit-background-processor',
    ])
  })

  it('says to start at login, to start again after it dies, and not after it was stopped', () => {
    const plist = launchAgentOf(item)
    expect(plist).toContain(
      '<key>Label</key>\n  <string>foldkit.publisher.fkc-0a1b2c3d4e5f</string>',
    )
    expect(plist).toContain('<key>RunAtLoad</key>\n  <true/>')
    expect(plist).toContain(
      '<key>ProcessType</key>\n  <string>Interactive</string>',
    )
    expect(plist).toContain(
      '<key>KeepAlive</key>\n  <dict>\n    <key>SuccessfulExit</key>\n    <false/>\n  </dict>',
    )
    expect(plist).toContain(
      '<string>/Users/ada/app/dist/entry.js</string>\n    <string>--foldkit-background-processor</string>',
    )
    expect(plist).toContain(
      '<key>PATH</key>\n    <string>/opt/node/bin:/usr/bin</string>',
    )
    expect(plist).toContain(
      '<key>StandardErrorPath</key>\n  <string>/Users/ada/Library/Logs/foldkit/publisher-background-processor.log</string>',
    )
  })

  it('keeps a path with a sign XML reads as its own', () => {
    const odd = loginItemOf({
      name: 'publisher',
      socketPath: '/tmp/fkc-0a1b2c3d4e5f.sock',
      home: '/Users/ada',
      launch: ['/Users/ada/R&D <new>/launcher'],
      environment: {},
      logPath: '/tmp/log',
    })
    expect(launchAgentOf(odd)).toContain(
      '<string>/Users/ada/R&amp;D &lt;new&gt;/launcher</string>',
    )
  })

  it.runIf(process.platform === 'darwin')(
    'is a property list macOS reads',
    () => {
      const path = join(
        mkdtempSync(join(tmpdir(), 'foldkit-login-item-')),
        'item.plist',
      )
      writeFileSync(path, launchAgentOf(item))
      const linted = spawnSync('plutil', ['-lint', path], { encoding: 'utf8' })
      expect(linted.stdout).toContain('OK')
      expect(linted.status).toBe(0)
    },
  )
})

describe('installing and removing it', () => {
  it('writes the file, then has launchd forget any older one and load this one', () => {
    const { system, done, files } = fakeSystem()
    const installed = installLoginItem(item, system)
    expect(installed).toEqual({ _tag: 'Installed', path: item.path })
    expect(done.map(step => step.did)).toEqual([
      'write',
      'launchctl',
      'launchctl',
    ])
    expect(done.slice(1).map(step => step.with)).toEqual([
      'bootout gui/501/foldkit.publisher.fkc-0a1b2c3d4e5f',
      `bootstrap gui/501 ${item.path}`,
    ])
    expect(files.has(item.path)).toBe(true)
    expect(isLoginItemInstalled(item, system)).toBe(true)
  })

  it('says what launchd said when it will not load it, and leaves no file behind', () => {
    const { system, files } = fakeSystem({ failing: 'bootstrap' })
    expect(installLoginItem(item, system)).toEqual({
      _tag: 'Refused',
      why: 'launchd would not load it: Bootstrap failed: 5: Input/output error',
    })
    expect(files.has(item.path)).toBe(false)
  })

  it('says so where starting at login is not built', () => {
    const { system, done } = fakeSystem({ platform: 'linux' })
    expect(installLoginItem(item, system)).toEqual({
      _tag: 'Refused',
      why: 'Starting at login is built for macOS only, and this is linux.',
    })
    expect(done).toEqual([])
  })

  it('has launchd forget it, then removes the file', () => {
    const { system, done, files } = fakeSystem()
    installLoginItem(item, system)
    done.splice(0)
    expect(uninstallLoginItem(item, system)).toEqual({
      _tag: 'Removed',
      path: item.path,
    })
    expect(done).toEqual([
      {
        did: 'launchctl',
        with: 'bootout gui/501/foldkit.publisher.fkc-0a1b2c3d4e5f',
      },
      { did: 'remove', with: item.path },
    ])
    expect(files.has(item.path)).toBe(false)
    expect(uninstallLoginItem(item, system)).toEqual({ _tag: 'NotInstalled' })
  })
})
