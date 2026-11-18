import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const builtExit = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'dist',
  'exit.js',
)

const EIGHT_MEGABYTES = 8_000_000

describe('the CLI exit', () => {
  it('exits once its output is written, whatever is still pending, and loses no byte', () => {
    const child = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `import { exitOnceWritten } from ${JSON.stringify(builtExit)}
setTimeout(() => {}, 60_000)
process.stdout.write('x'.repeat(${EIGHT_MEGABYTES.toString()}))
exitOnceWritten(3)`,
      ],
      { maxBuffer: 2 * EIGHT_MEGABYTES, timeout: 10_000 },
    )

    expect(child.error).toBeUndefined()
    expect(child.status).toBe(3)
    expect(child.stdout.length).toBe(EIGHT_MEGABYTES)
  })
})
