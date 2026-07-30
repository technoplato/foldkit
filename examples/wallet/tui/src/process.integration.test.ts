import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const tuiEntryPath = fileURLToPath(new URL('../dist/entry.js', import.meta.url))
const isBunAvailable = spawnSync('bun', ['--version']).status === 0

describe('Wallet OpenTUI process', () => {
  it.skipIf(!isBunAvailable)(
    'accepts q and tears down the renderer cleanly',
    async () => {
      const result = await new Promise<
        Readonly<{ code: number | null; stderr: string }>
      >((resolve, reject) => {
        const child = spawn('bun', ['run', tuiEntryPath], {
          env: {
            ...process.env,
            FOLDKIT_WALLET_RESOURCES: 'simulated',
          },
          stdio: ['pipe', 'pipe', 'pipe'],
        })
        const stderrChunks: Array<Buffer> = []
        child.stderr.on('data', chunk => stderrChunks.push(Buffer.from(chunk)))
        child.stdout.resume()
        const quitTimer = setTimeout(() => child.stdin.end('q'), 750)
        const timeout = setTimeout(() => {
          child.kill()
          reject(new Error('OpenTUI process did not exit after q'))
        }, 5_000)
        child.on('error', reject)
        child.on('close', code => {
          clearTimeout(quitTimer)
          clearTimeout(timeout)
          resolve({
            code,
            stderr: Buffer.concat(stderrChunks).toString('utf8'),
          })
        })
      })

      expect(result.code, result.stderr).toBe(0)
      expect(result.stderr).toBe('')
    },
  )
})
