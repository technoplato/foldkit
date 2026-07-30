import { Schema as S } from 'effect'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { WalletProfile } from 'wallet-core-example'

import { AsyncEntry } from '@napi-rs/keyring'

const isEnabled =
  process.platform === 'darwin' &&
  process.env['FOLDKIT_RUN_MACOS_KEYCHAIN_INTEGRATION'] === '1'
const packageRoot = fileURLToPath(new URL('..', import.meta.url))
const localVaultModuleUrl = pathToFileURL(
  fileURLToPath(new URL('../dist/index.js', import.meta.url)),
).href
const keychainStorageModuleUrl = pathToFileURL(
  fileURLToPath(
    new URL('../dist/macosKeychainWalletVaultStorage.js', import.meta.url),
  ),
).href
const coreModuleUrl = pathToFileURL(
  fileURLToPath(new URL('../../core/dist/index.js', import.meta.url)),
).href
const liveClientModuleUrl = pathToFileURL(
  fileURLToPath(new URL('../../live-client/dist/index.js', import.meta.url)),
).href
const walletIndexAccount = 'wallet-index'
const walletRecordAccount = (walletId: string): string =>
  `wallet-record:${walletId}`

const childProgram = `
import { Effect } from 'effect'
import {
  WalletCreationRequest,
  WalletVault,
} from ${JSON.stringify(coreModuleUrl)}
import {
  liveWalletNetworkDescriptors,
} from ${JSON.stringify(liveClientModuleUrl)}
import {
  localWalletVaultOwnerKey,
  makePersistentLocalWalletVault,
} from ${JSON.stringify(localVaultModuleUrl)}
import {
  makeMacOSKeychainWalletVaultStorage,
} from ${JSON.stringify(keychainStorageModuleUrl)}
import { AsyncEntry } from '@napi-rs/keyring'

const [, action, service, walletId] = process.argv
const entryFactory = (entryService, account) => {
  const entry = new AsyncEntry(entryService, account)
  return {
    getPassword: () => entry.getPassword(),
    setPassword: password => entry.setPassword(password),
  }
}
const randomBytes = byteCount => {
  const bytes = new Uint8Array(byteCount)
  globalThis.crypto.getRandomValues(bytes)
  return bytes
}
const storage = makeMacOSKeychainWalletVaultStorage(
  entryFactory,
  localWalletVaultOwnerKey,
  service,
)
const vaultLayer = makePersistentLocalWalletVault(randomBytes, storage)
const result = await Effect.runPromise(
  Effect.gen(function* () {
    const vault = yield* WalletVault
    if (action === 'Create') {
      return yield* vault.createWallet(
        WalletCreationRequest.make({
          requestId: walletId,
          displayName: 'Keychain restart proof',
          networks: liveWalletNetworkDescriptors,
        }),
      )
    } else if (action === 'Load') {
      return yield* vault.loadWallets
    } else {
      throw new Error('Unknown Keychain restart action')
    }
  }).pipe(Effect.provide(vaultLayer)),
)
process.stdout.write(JSON.stringify({ processId: process.pid, result }))
`

const ChildResult = S.Struct({
  processId: S.Number,
  result: S.Unknown,
})
type ChildResult = typeof ChildResult.Type

const runChild = (
  action: 'Create' | 'Load',
  service: string,
  walletId: string,
): ChildResult => {
  const result = spawnSync(
    process.execPath,
    ['--input-type=module', '--eval', childProgram, action, service, walletId],
    {
      cwd: packageRoot,
      encoding: 'utf8',
      env: process.env,
      timeout: 30_000,
    },
  )
  if (result.status !== 0) {
    throw new Error(
      `Keychain restart child failed with status ${String(result.status)}: ${result.stderr}`,
    )
  }
  return S.decodeUnknownSync(S.fromJsonString(ChildResult))(result.stdout)
}

const deleteCredential = async (
  service: string,
  account: string,
): Promise<void> => {
  try {
    await new AsyncEntry(service, account).deletePassword()
  } catch {
    return
  }
}

describe.skipIf(!isEnabled)('macOS Keychain Wallet process restoration', () => {
  it('restores the same public Wallet after the creating process exits', async () => {
    const runId = randomUUID()
    const service = `com.foldkit.wallet.restart-proof.${runId}`
    const walletId = `keychain-restart-${runId}`

    try {
      const created = runChild('Create', service, walletId)
      const restored = runChild('Load', service, walletId)
      const createdWallet = S.decodeUnknownSync(WalletProfile)(created.result)
      const restoredWallets = S.decodeUnknownSync(S.Array(WalletProfile))(
        restored.result,
      )

      expect(created.processId).not.toBe(restored.processId)
      expect(createdWallet.accounts).toHaveLength(12)
      expect(restoredWallets).toStrictEqual([createdWallet])
      expect(JSON.stringify(restoredWallets)).not.toContain('privateKey')
      expect(JSON.stringify(restoredWallets)).not.toContain('keys')
    } finally {
      await deleteCredential(service, walletRecordAccount(walletId))
      await deleteCredential(service, walletIndexAccount)
    }
  })
})
