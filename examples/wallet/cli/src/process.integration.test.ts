import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const cliEntryPath = fileURLToPath(new URL('../dist/entry.js', import.meta.url))

describe('raw Wallet CLI process', () => {
  it('prints only a concise settled result by default', () => {
    const result = spawnSync(process.execPath, [cliEntryPath, 'send'], {
      encoding: 'utf8',
    })

    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('Submitted simulated-')
    expect(result.stdout).toContain('Observed: yes')
    expect(result.stdout).not.toContain('Model:')
    expect(result.stderr).toBe('')
  })

  it('keeps failures on stderr', () => {
    const result = spawnSync(
      process.execPath,
      [cliEntryPath, 'receive', '--account', 'missing'],
      { encoding: 'utf8' },
    )

    expect(result.status).not.toBe(0)
    expect(result.stdout).toBe('')
    expect(result.stderr).toContain(
      'No ethereum:sepolia:eth receiving instruction for missing',
    )
  })

  it('submits a deep-link preview and prints every source property', () => {
    const carrier =
      'foldkit://showcase/wallet/intent/send?mode=Testnet&chain=sui&network=sui%3Atestnet&account=simulated-sui-testnet-account&asset=sui%3Atestnet%3Asui&amount=1000000&to=0x2222222222222222222222222222222222222222222222222222222222222222'
    const result = spawnSync(
      process.execPath,
      [cliEntryPath, 'send', '--uri', carrier],
      { encoding: 'utf8' },
    )

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
    const result = spawnSync(
      process.execPath,
      [cliEntryPath, 'preview', '--verbose'],
      { encoding: 'utf8' },
    )

    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('Progress: SucceededLoadWallet')
    expect(result.stdout).toContain('SucceededPreviewTransaction')
    expect(result.stdout).toContain('Model:')
    expect(result.stdout).toContain('"PreviewedTransaction"')
  })
})
