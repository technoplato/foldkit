import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const tuiEntryPath = fileURLToPath(new URL('../dist/entry.js', import.meta.url))
const isBunAvailable = spawnSync('bun', ['--version']).status === 0
const processTimeoutMilliseconds = 12_000
const testTimeoutMilliseconds = 15_000
const readySignal = 'foldkit-wallet-tui-ready'

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
            FOLDKIT_WALLET_PROCESS_READY_SIGNAL: readySignal,
            FOLDKIT_WALLET_RESOURCES: 'simulated',
          },
          stdio: ['pipe', 'pipe', 'pipe'],
        })
        const stderrChunks: Array<Buffer> = []
        let hasWrittenQuit = false
        let isSettled = false
        const clearProcessTimeout = () => clearTimeout(processTimeout)
        const rejectOnce = (error: Error) => {
          if (!isSettled) {
            isSettled = true
            clearProcessTimeout()
            reject(error)
          }
        }
        child.stderr.on('data', chunk => {
          stderrChunks.push(Buffer.from(chunk))
          const stderr = Buffer.concat(stderrChunks).toString('utf8')
          if (!hasWrittenQuit && stderr.includes(readySignal)) {
            hasWrittenQuit = true
            child.stdin.end('q')
          }
        })
        child.stdout.resume()
        const processTimeout = setTimeout(() => {
          child.kill()
          rejectOnce(new Error('OpenTUI process did not exit after q'))
        }, processTimeoutMilliseconds)
        child.on('error', error => rejectOnce(error))
        child.on('close', code => {
          if (!isSettled) {
            isSettled = true
            clearProcessTimeout()
            if (!hasWrittenQuit) {
              reject(
                new Error(
                  'OpenTUI process exited before rendering and accepting q',
                ),
              )
            } else {
              resolve({
                code,
                stderr: Buffer.concat(stderrChunks)
                  .toString('utf8')
                  .replace(readySignal, ''),
              })
            }
          }
        })
      })

      expect(result.code, result.stderr).toBe(0)
      expect(result.stderr).toBe('')
    },
    testTimeoutMilliseconds,
  )
})
