import {
  Context,
  Data,
  Effect,
  Layer,
  Option,
  Redacted,
  Ref,
  Schema as S,
} from 'effect'
import { spawn } from 'node:child_process'
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from 'node:crypto'
import { chmod, mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import type { ImportOwner } from './libraryImport.js'

// VAULT

/**
 * Why the vault refused: the Keychain did not give Books its key, a saved
 * login could not be opened with it, or a login could not be written.
 */
export const VaultErrorKind = S.Literals([
  'KeychainRefused',
  'Unopenable',
  'Unwritable',
])
/** Why the vault refused. */
export type VaultErrorKind = typeof VaultErrorKind.Type

/** The vault refused, and why. */
export class VaultError extends Data.TaggedError('VaultError')<{
  readonly kind: VaultErrorKind
}> {}

/**
 * Where each family member's Audible login is kept: encrypted on this
 * computer, one file per member, with the key in the macOS Keychain.
 * `ensureKey` makes the key on first use and fails when the Keychain
 * refuses, so a sign-in can stop before Amazon registers a device that
 * could not be saved. Never in Instant, a browser, or a log.
 */
export class CredentialsVault extends Context.Service<
  CredentialsVault,
  Readonly<{
    ensureKey: Effect.Effect<void, VaultError>
    load: (
      owner: ImportOwner,
    ) => Effect.Effect<Option.Option<Redacted.Redacted<string>>, VaultError>
    save: (
      owner: ImportOwner,
      credentials: Redacted.Redacted<string>,
    ) => Effect.Effect<void, VaultError>
  }>
>()('books/CredentialsVault') {}

/**
 * The one secret the vault keeps in the Keychain, as 64 hex digits: read
 * it, None while there is none yet, and make it.
 */
export type KeychainKey = Readonly<{
  read: Effect.Effect<Option.Option<Redacted.Redacted<string>>, VaultError>
  create: (keyHex: Redacted.Redacted<string>) => Effect.Effect<void, VaultError>
}>

/** The Keychain item that holds the key, `books-audible-kek`. */
export const keychainService = 'books-audible-kek'

const keychainAccount = 'books'

const notFoundExit = 44

const securityPath = '/usr/bin/security'

type Ran = Readonly<{ code: number | null; stdout: string }>

const runSecurity = (
  args: ReadonlyArray<string>,
  input: string,
): Effect.Effect<Ran, VaultError> =>
  Effect.callback<Ran, VaultError>(resume => {
    const child = spawn(securityPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const chunks: Array<string> = []
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      chunks.push(chunk)
    })
    child.stderr.resume()
    child.on('error', () => {
      resume(Effect.fail(new VaultError({ kind: 'KeychainRefused' })))
    })
    child.on('close', code => {
      resume(Effect.succeed({ code, stdout: chunks.join('') }))
    })
    child.stdin.on('error', () => {})
    child.stdin.end(input)
    return Effect.sync(() => {
      child.kill('SIGKILL')
    })
  })

const keyHexPattern = /^[0-9a-f]{64}$/

/**
 * The key in this Mac's login Keychain, through `security`. The key goes
 * in on stdin, never as an argument any process could read, and is read
 * back with `find-generic-password -w`.
 *
 * @example
 * ```typescript
 * keychainVault({ directory: defaultCredentialsDirectory, keychain: macKeychain() })
 * ```
 */
export const macKeychain = (
  service: string = keychainService,
): KeychainKey => ({
  read: Effect.flatMap(
    runSecurity(
      ['find-generic-password', '-s', service, '-a', keychainAccount, '-w'],
      '',
    ),
    ({ code, stdout }) => {
      const keyHex = stdout.trim()
      if (code === notFoundExit) {
        return Effect.succeed(Option.none())
      } else if (code === 0 && keyHexPattern.test(keyHex)) {
        return Effect.succeed(Option.some(Redacted.make(keyHex)))
      } else {
        return Effect.fail(new VaultError({ kind: 'KeychainRefused' }))
      }
    },
  ),
  create: keyHex =>
    Effect.flatMap(
      runSecurity(
        ['-i'],
        `add-generic-password -s ${service} -a ${keychainAccount} -l "Books Audible logins" -w ${Redacted.value(keyHex)}\n`,
      ),
      ({ code }) =>
        code === 0
          ? Effect.void
          : Effect.fail(new VaultError({ kind: 'KeychainRefused' })),
    ),
})

/** Where the encrypted logins live: `~/.config/knophy-host/books/audible`. */
export const defaultCredentialsDirectory = join(
  homedir(),
  '.config',
  'knophy-host',
  'books',
  'audible',
)

const CredentialsFile = S.Struct({
  format: S.Literal('books-audible-credentials'),
  version: S.Literal(1),
  iv: S.String,
  tag: S.String,
  ciphertext: S.String,
})
type CredentialsFile = typeof CredentialsFile.Type

const CredentialsFileJson = S.fromJsonString(CredentialsFile)

const ivBytes = 12

const keyBytes = 32

const directoryMode = 0o700

const fileMode = 0o600

/**
 * A family member's files' shared name: the SHA-256 of their lowercased
 * email, so the folder never shows who has connected.
 *
 * @example
 * ```typescript
 * memberFileStem({ email: 'listener@example.invalid' }) // '4f…e1'
 * ```
 */
export const memberFileStem = (owner: ImportOwner): string =>
  createHash('sha256').update(owner.email.toLowerCase()).digest('hex')

/**
 * A family member's encrypted login file: `<stem>.json`.
 *
 * @example
 * ```typescript
 * credentialsFileName({ email: 'listener@example.invalid' }) // '4f…e1.json'
 * ```
 */
export const credentialsFileName = (owner: ImportOwner): string =>
  `${memberFileStem(owner)}.json`

const isMissing = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === 'ENOENT'

/** The text of the file at `path`, None when there is none. Fails with Unopenable. */
export const textIfPresentAt = (path: string) =>
  Effect.tryPromise({
    try: () =>
      readFile(path, 'utf8').then(
        text => Option.some(text),
        error =>
          isMissing(error) ? Option.none<string>() : Promise.reject(error),
      ),
    catch: () => new VaultError({ kind: 'Unopenable' }),
  })

/** Makes `directory` if need be, mode 700. Fails with Unwritable. */
export const directoryReadyAt = (directory: string) =>
  Effect.tryPromise({
    try: async () => {
      await mkdir(directory, { recursive: true, mode: directoryMode })
      await chmod(directory, directoryMode)
    },
    catch: () => new VaultError({ kind: 'Unwritable' }),
  })

const associatedDataOf = (owner: ImportOwner): Buffer =>
  Buffer.from(`books-audible|v1|${owner.email.toLowerCase()}`)

const sealed = (
  key: Buffer,
  owner: ImportOwner,
  credentials: Redacted.Redacted<string>,
): CredentialsFile => {
  const iv = randomBytes(ivBytes)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(associatedDataOf(owner))
  const ciphertext = Buffer.concat([
    cipher.update(Redacted.value(credentials), 'utf8'),
    cipher.final(),
  ])
  return {
    format: 'books-audible-credentials',
    version: 1,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  }
}

const opened = (
  key: Buffer,
  owner: ImportOwner,
  file: CredentialsFile,
): Effect.Effect<Redacted.Redacted<string>, VaultError> =>
  Effect.try({
    try: () => {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        key,
        Buffer.from(file.iv, 'base64'),
      )
      decipher.setAAD(associatedDataOf(owner))
      decipher.setAuthTag(Buffer.from(file.tag, 'base64'))
      return Redacted.make(
        Buffer.concat([
          decipher.update(Buffer.from(file.ciphertext, 'base64')),
          decipher.final(),
        ]).toString('utf8'),
      )
    },
    catch: () => new VaultError({ kind: 'Unopenable' }),
  })

/**
 * The key another request made first, when creating one failed because it
 * already exists. Still none means the Keychain refused.
 */
const storedKeyOf = (
  keychain: KeychainKey,
): Effect.Effect<Redacted.Redacted<string>, VaultError> =>
  Effect.flatMap(keychain.read, maybeKey =>
    Option.match(maybeKey, {
      onNone: () => Effect.fail(new VaultError({ kind: 'KeychainRefused' })),
      onSome: Effect.succeed,
    }),
  )

/**
 * Writes `contents` to `path` with mode 600 and no moment when another
 * user could read it: a new file opened with that mode, then renamed into
 * place. Fails with Unwritable.
 */
export const writtenPrivately = (path: string, contents: string) =>
  Effect.tryPromise({
    try: async () => {
      const temporary = `${path}.${randomUUID()}.tmp`
      const handle = await open(temporary, 'wx', fileMode)
      try {
        await handle.writeFile(contents, 'utf8')
        await handle.sync()
      } finally {
        await handle.close()
      }
      await chmod(temporary, fileMode)
      await rename(temporary, path).catch(async error => {
        await rm(temporary, { force: true })
        throw error
      })
    },
    catch: () => new VaultError({ kind: 'Unwritable' }),
  })

/**
 * The vault on this computer: AES-256-GCM, a fresh 96-bit IV for every
 * write, the member's email as associated data so a file renamed to
 * another member's never opens, and the key from `keychain`, made on
 * first use and kept in memory after the first read. Files are mode 600
 * in a folder of mode 700. If the Keychain refuses, so does the vault:
 * nothing is ever written in plain text.
 *
 * @example
 * ```typescript
 * keychainVault({ directory: defaultCredentialsDirectory, keychain: macKeychain() })
 * ```
 */
export const keychainVault = (
  config: Readonly<{ directory: string; keychain: KeychainKey }>,
) =>
  Layer.effect(
    CredentialsVault,
    Effect.map(Ref.make<Option.Option<Buffer>>(Option.none()), cachedKey => {
      const keyNow: Effect.Effect<Buffer, VaultError> = Effect.flatMap(
        Ref.get(cachedKey),
        maybeKey =>
          Option.match(maybeKey, {
            onSome: Effect.succeed,
            onNone: () =>
              Effect.flatMap(config.keychain.read, maybeStored =>
                Effect.flatMap(
                  Option.match(maybeStored, {
                    onSome: Effect.succeed,
                    onNone: () => {
                      const keyHex = Redacted.make(
                        randomBytes(keyBytes).toString('hex'),
                      )
                      return Effect.as(
                        config.keychain.create(keyHex),
                        keyHex,
                      ).pipe(Effect.catch(() => storedKeyOf(config.keychain)))
                    },
                  }),
                  keyHex => {
                    const key = Buffer.from(Redacted.value(keyHex), 'hex')
                    return Effect.as(Ref.set(cachedKey, Option.some(key)), key)
                  },
                ),
              ),
          }),
      )

      const pathOf = (owner: ImportOwner): string =>
        join(config.directory, credentialsFileName(owner))

      return CredentialsVault.of({
        ensureKey: Effect.asVoid(keyNow),
        load: owner =>
          Effect.flatMap(textIfPresentAt(pathOf(owner)), maybeText =>
            Option.match(maybeText, {
              onNone: () => Effect.succeed(Option.none()),
              onSome: text =>
                Effect.flatMap(
                  Effect.mapError(
                    S.decodeUnknownEffect(CredentialsFileJson)(text),
                    () => new VaultError({ kind: 'Unopenable' }),
                  ),
                  file =>
                    Effect.flatMap(keyNow, key =>
                      Effect.map(opened(key, owner, file), Option.some),
                    ),
                ),
            }),
          ),
        save: (owner, credentials) =>
          Effect.flatMap(keyNow, key =>
            Effect.andThen(
              directoryReadyAt(config.directory),
              writtenPrivately(
                pathOf(owner),
                S.encodeSync(CredentialsFileJson)(
                  sealed(key, owner, credentials),
                ),
              ),
            ),
          ),
      })
    }),
  )

/**
 * A vault held in memory, for tests and the demo: each member's login in
 * a map, gone when the server stops. Every Books server ships the
 * Keychain vault.
 *
 * @example
 * ```typescript
 * Layer.mergeAll(memoryVault, …)
 * ```
 */
export const memoryVault = Layer.effect(
  CredentialsVault,
  Effect.map(Ref.make(new Map<string, Redacted.Redacted<string>>()), logins =>
    CredentialsVault.of({
      ensureKey: Effect.void,
      load: owner =>
        Effect.map(Ref.get(logins), all =>
          Option.fromNullishOr(all.get(credentialsFileName(owner))),
        ),
      save: (owner, credentials) =>
        Ref.update(
          logins,
          all => new Map([...all, [credentialsFileName(owner), credentials]]),
        ),
    }),
  ),
)

/**
 * A Keychain held in memory, for tests and the demo: it starts with no
 * key, or refuses everything when `isRefusing`.
 *
 * @example
 * ```typescript
 * const keychain = yield* makeMemoryKeychain({ isRefusing: false })
 * ```
 */
export const makeMemoryKeychain = (
  options: Readonly<{ isRefusing: boolean }>,
) =>
  Effect.map(
    Ref.make<Option.Option<Redacted.Redacted<string>>>(Option.none()),
    stored => {
      const refused = Effect.fail(new VaultError({ kind: 'KeychainRefused' }))
      const keychain: KeychainKey = options.isRefusing
        ? { read: refused, create: () => refused }
        : {
            read: Ref.get(stored),
            create: keyHex => Ref.set(stored, Option.some(keyHex)),
          }
      return { keychain, stored: Ref.get(stored) }
    },
  )
