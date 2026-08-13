import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Console, Effect } from 'effect'
import { emptyModel, runIndex } from 'orbit-core-example'

const receiptPath = resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../foldkit/public/prebuild-receipt.json',
)

/** Runs the 16 index steps and writes the prebuild receipt. */
export const runHeadless = (): Effect.Effect<void, Error> =>
  Effect.gen(function* () {
    const { receipt } = runIndex(emptyModel())
    const body = `${JSON.stringify(receipt, null, 2)}\n`
    mkdirSync(dirname(receiptPath), { recursive: true })
    writeFileSync(receiptPath, body)
    yield* Console.log(body)
    if (!receipt.ok) {
      return yield* Effect.fail(
        new Error('orbit index failed; foldkit build must not continue'),
      )
    }
  })
