import { spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const cliEntryPath = fileURLToPath(new URL('../dist/entry.js', import.meta.url))

const runCli = (
  args: ReadonlyArray<string>,
  sessionDir: string,
): {
  readonly status: number | null
  readonly stdout: string
  readonly stderr: string
} => {
  const result = spawnSync(process.execPath, [cliEntryPath, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PERSONAL_CFO_LEDGER: 'memory',
      PERSONAL_CFO_NOTIFY: '0',
      PERSONAL_CFO_SESSION_DIR: sessionDir,
    },
  })
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  }
}

describe('Personal CFO CLI process', () => {
  it('proves login, accounts, vault, radar, notify, and grounded chat', () => {
    const sessionDir = mkdtempSync(join(tmpdir(), 'personal-cfo-'))
    const proved = runCli(['prove'], sessionDir)
    expect(proved.status, proved.stderr).toBe(0)
    expect(proved.stdout).toContain('ok login')
    expect(proved.stdout).toContain('ok accounts add')
    expect(proved.stdout).toContain('ok vault list')
    expect(proved.stdout).toContain('ok radar tick')
    expect(proved.stdout).toContain('ok notify')
    expect(proved.stdout).toContain('ok chat grounded')
    expect(proved.stdout).toContain('prove ok')
  })

  it('rejects transfer as an unknown command', () => {
    const sessionDir = mkdtempSync(join(tmpdir(), 'personal-cfo-'))
    const transferred = runCli(['transfer'], sessionDir)
    expect(transferred.status).toBe(1)
    expect(transferred.stderr).toContain('Unknown command "transfer"')
  })
})
