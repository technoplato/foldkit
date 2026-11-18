import { Effect, Exit, Option, Redacted } from 'effect'
import { mkdtemp, readFile, readdir, rename, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  CredentialsVault,
  type KeychainKey,
  type VaultError,
  credentialsFileName,
  keychainVault,
  makeMemoryKeychain,
} from './vault.node.js'

const listener = { email: 'listener@example.invalid' }

const sibling = { email: 'sibling@example.invalid' }

const credentials = Redacted.make(
  '{"adp_token":"made-up-adp-token","device_private_key":"made-up-key"}',
)

const directories: Array<string> = []

const freshDirectory = async (): Promise<string> => {
  const parent = await mkdtemp(join(tmpdir(), 'books-vault-test-'))
  directories.push(parent)
  return join(parent, 'audible')
}

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map(directory => rm(directory, { recursive: true, force: true })),
  )
})

const withVault = <A, E>(
  directory: string,
  keychain: KeychainKey,
  use: (vault: CredentialsVault['Service']) => Effect.Effect<A, E>,
): Promise<Exit.Exit<A, E | VaultError>> =>
  Effect.runPromiseExit(
    Effect.provide(
      Effect.gen(function* () {
        const vault = yield* CredentialsVault
        return yield* use(vault)
      }),
      keychainVault({ directory, keychain }),
    ),
  )

const permissionsOf = async (path: string): Promise<number> =>
  (await stat(path)).mode & 0o777

describe('the Keychain vault', () => {
  it('saves a login encrypted, mode 600 in a folder of mode 700, and opens it again', async () => {
    const directory = await freshDirectory()
    const { keychain, stored } = await Effect.runPromise(
      makeMemoryKeychain({ isRefusing: false }),
    )
    const exit = await withVault(directory, keychain, vault =>
      Effect.andThen(vault.save(listener, credentials), vault.load(listener)),
    )
    expect(
      Exit.map(exit, maybeLogin => Option.map(maybeLogin, Redacted.value)),
    ).toEqual(Exit.succeed(Option.some(Redacted.value(credentials))))
    const path = join(directory, credentialsFileName(listener))
    expect(await permissionsOf(path)).toBe(0o600)
    expect(await permissionsOf(directory)).toBe(0o700)
    const onDisk = await readFile(path, 'utf8')
    expect(onDisk).not.toContain('made-up-adp-token')
    expect(onDisk).not.toContain('listener@example.invalid')
    expect(JSON.parse(onDisk)).toEqual(
      expect.objectContaining({
        format: 'books-audible-credentials',
        version: 1,
      }),
    )
    const maybeKey = await Effect.runPromise(stored)
    expect(
      Option.map(maybeKey, key => /^[0-9a-f]{64}$/.test(Redacted.value(key))),
    ).toEqual(Option.some(true))
    expect(onDisk).not.toContain(
      Option.getOrElse(Option.map(maybeKey, Redacted.value), () => 'no key'),
    )
  })

  it('opens a saved login after a restart with the key the Keychain kept', async () => {
    const directory = await freshDirectory()
    const { keychain } = await Effect.runPromise(
      makeMemoryKeychain({ isRefusing: false }),
    )
    await withVault(directory, keychain, vault =>
      vault.save(listener, credentials),
    )
    const exit = await withVault(directory, keychain, vault =>
      vault.load(listener),
    )
    expect(
      Exit.map(exit, maybeLogin => Option.map(maybeLogin, Redacted.value)),
    ).toEqual(Exit.succeed(Option.some(Redacted.value(credentials))))
  })

  it('has no login for a member who never connected', async () => {
    const directory = await freshDirectory()
    const { keychain } = await Effect.runPromise(
      makeMemoryKeychain({ isRefusing: false }),
    )
    expect(
      await withVault(directory, keychain, vault => vault.load(sibling)),
    ).toEqual(Exit.succeed(Option.none()))
  })

  it('never opens one member’s login as another’s', async () => {
    const directory = await freshDirectory()
    const { keychain } = await Effect.runPromise(
      makeMemoryKeychain({ isRefusing: false }),
    )
    await withVault(directory, keychain, vault =>
      vault.save(listener, credentials),
    )
    await rename(
      join(directory, credentialsFileName(listener)),
      join(directory, credentialsFileName(sibling)),
    )
    const exit = await withVault(directory, keychain, vault =>
      vault.load(sibling),
    )
    expect(Exit.isFailure(exit)).toBe(true)
    expect(JSON.stringify(exit)).toContain('Unopenable')
  })

  it('refuses when the Keychain refuses, and writes nothing', async () => {
    const directory = await freshDirectory()
    const { keychain } = await Effect.runPromise(
      makeMemoryKeychain({ isRefusing: true }),
    )
    const ensured = await withVault(
      directory,
      keychain,
      vault => vault.ensureKey,
    )
    expect(JSON.stringify(ensured)).toContain('KeychainRefused')
    const saved = await withVault(directory, keychain, vault =>
      vault.save(listener, credentials),
    )
    expect(Exit.isFailure(saved)).toBe(true)
    expect(JSON.stringify(saved)).toContain('KeychainRefused')
    const written = await readdir(directory).catch(() => [])
    expect(written).toEqual([])
  })
})
