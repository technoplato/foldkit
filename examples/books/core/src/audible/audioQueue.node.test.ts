import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Effect, Exit, Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { audioQueueFromEnv, processAudioQueue } from './audioQueue.node.js'
import { Asin } from './title.js'

const status = {
  titles: [{ asin: 'B0FAKE0007', name: 'The Quiet Orchard', state: { _tag: 'Done' } }],
  next: null,
  running: null,
}

const fakeQueue = (body: string): string => {
  const folder = mkdtempSync(join(tmpdir(), 'books-audio-queue-'))
  const script = join(folder, 'queue.sh')
  writeFileSync(script, `#!/bin/sh\necho "$@" > ${join(folder, 'args')}\n${body}\n`)
  chmodSync(script, 0o700)
  return script
}

describe('the audio queue on this computer', () => {
  it('reads every owned book\'s audio from the queue command', async () => {
    const script = fakeQueue(`echo '${JSON.stringify(status)}'`)
    const queue = processAudioQueue({ command: '/bin/sh', script })
    const answer = await Effect.runPromise(queue.status({ email: 'owner@example.com' }))
    expect(answer.titles.map(title => title.state._tag)).toEqual(['Done'])
  })

  it('asks for a book with the owner, and turns a refusal into its problem', async () => {
    const script = fakeQueue(`echo '{"problem": "that is not one of your Audible books without audio"}'; exit 1`)
    const queue = processAudioQueue({ command: '/bin/sh', script })
    const exit = await Effect.runPromiseExit(
      queue.queue({ email: 'owner@example.com' }, Asin.make('B0NOTOWNED')),
    )
    expect(exit).toEqual(
      Exit.fail({ _tag: 'Unavailable', reason: 'that is not one of your Audible books without audio' }),
    )
  })

  it('is set up only when its command and script are named', () => {
    expect(Option.isNone(audioQueueFromEnv({}))).toBe(true)
    expect(
      audioQueueFromEnv({ BOOKS_AUDIO_QUEUE_COMMAND: '/usr/bin/python3', BOOKS_AUDIO_QUEUE_SCRIPT: '/x/books_ingest.py' }),
    ).toEqual(Option.some({ command: '/usr/bin/python3', script: '/x/books_ingest.py' }))
  })
})
