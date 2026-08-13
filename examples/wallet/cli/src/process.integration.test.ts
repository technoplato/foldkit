import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

const cliEntryPath = fileURLToPath(new URL('../dist/entry.js', import.meta.url))
const oneShotProcessTimeoutMs = 15_000
const leftoverHandleIntervalMs = 60_000
const simulatedWalletEnvironment = {
  ...process.env,
  FOLDKIT_WALLET_RESOURCES: 'simulated',
}
delete simulatedWalletEnvironment.FORCE_COLOR
delete simulatedWalletEnvironment.NO_COLOR

const runWalletCliProcess = (
  arguments_: ReadonlyArray<string>,
  options: Readonly<{
    leftoverHandle?: boolean
  }> = {},
) => {
  const executableArguments = options.leftoverHandle
    ? ['--import', leftoverHandleModuleUrl(), cliEntryPath, ...arguments_]
    : [cliEntryPath, ...arguments_]
  return spawnSync(process.execPath, executableArguments, {
    encoding: 'utf8',
    env: simulatedWalletEnvironment,
    timeout: oneShotProcessTimeoutMs,
  })
}

const leftoverHandleModuleUrl = (): string => {
  const leftoverHandlePath = join(
    tmpdir(),
    'wallet-cli-leftover-handle.fixture.mjs',
  )
  writeFileSync(
    leftoverHandlePath,
    `setInterval(() => {}, ${leftoverHandleIntervalMs.toString()})\n`,
  )
  return pathToFileURL(leftoverHandlePath).href
}

const simulatedEthereumTransferArguments = [
  '--transfer-id',
  'cli-process-transfer',
  '--mode',
  'testnet',
  '--chain',
  'ethereum',
  '--network',
  'ethereum:sepolia',
  '--account',
  'simulated-ethereum-account',
  '--asset',
  'ethereum:sepolia:eth',
  '--to',
  '0x2222222222222222222222222222222222222222',
  '--amount',
  '1000000000000000',
]

describe('raw Wallet CLI process', () => {
  it('rejects send operations without explicit transaction data', () => {
    const result = runWalletCliProcess(['send'])

    expect(result.status).not.toBe(0)
    expect(result.stdout).toBe('')
    expect(result.stderr).toContain('Missing required flag --transfer-id')
  })

  it('prints only a concise settled result for explicit transfer data', () => {
    const result = runWalletCliProcess([
      'send',
      ...simulatedEthereumTransferArguments,
    ])

    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('Submitted simulated-')
    expect(result.stdout).toContain('Observed: yes')
    expect(result.stdout).not.toContain('Model:')
    expect(result.stderr).toBe('')
  })

  it('exits a one-shot command even when a leftover handle remains', () => {
    const result = runWalletCliProcess(
      ['send', ...simulatedEthereumTransferArguments],
      { leftoverHandle: true },
    )

    expect(result.error).toBeUndefined()
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('Observed: yes')
  })

  it('keeps failures on stderr', () => {
    const result = runWalletCliProcess([
      'receive',
      '--account',
      'missing',
      '--asset',
      'ethereum:sepolia:eth',
    ])

    expect(result.status).not.toBe(0)
    expect(result.stdout).toBe('')
    expect(result.stderr).toContain(
      'No ethereum:sepolia:eth receiving instruction for missing',
    )
  })

  it('submits a deep-link preview and prints every source property', () => {
    const carrier =
      'foldkit://showcase/wallet/intent/send?mode=Testnet&chain=sui&network=sui%3Atestnet&account=simulated-sui-testnet-account&asset=sui%3Atestnet%3Asui&amount=1000000&to=0x2222222222222222222222222222222222222222222222222222222222222222'
    const result = runWalletCliProcess(['send', '--uri', carrier])

    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('Network mode: Testnet')
    expect(result.stdout).toContain('Chain: sui')
    expect(result.stdout).toContain('Network: sui:testnet')
    expect(result.stdout).toContain('Account: simulated-sui-testnet-account')
    expect(result.stdout).toContain('Asset: sui:testnet:sui')
    expect(result.stdout).toContain('Amount atomic units: 1000000')
    expect(result.stdout).toContain(
      'To: 0x2222222222222222222222222222222222222222222222222222222222222222',
    )
    expect(result.stdout).toContain('Observed: yes')
    expect(result.stderr).toBe('')
  })

  it('includes progress and the full Model only with verbose output', () => {
    const result = runWalletCliProcess([
      'preview',
      ...simulatedEthereumTransferArguments,
      '--verbose',
    ])

    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('Progress: SucceededLoadWallet')
    expect(result.stdout).toContain('SucceededPreviewTransaction')
    expect(result.stdout).toContain('Model:')
    expect(result.stdout).toContain('"PreviewedTransaction"')
  })
})
