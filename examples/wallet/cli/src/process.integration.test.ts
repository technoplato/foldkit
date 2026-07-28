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
