import { Array, Option, Schema as S } from 'effect'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

import { persistPostedPaste } from '../answerPersist'
import { AnswerLog, notesOf } from './domain'

describe('persistPostedPaste', () => {
  test('a second sim paste changes the file and keeps the first verbatim', async () => {
    const answersDir = await mkdtemp(path.join(tmpdir(), 'slides-qanda-sim-'))
    const firstBody = JSON.stringify({
      verbatim: 'fee should sit with the bundle',
    })
    const secondBody = JSON.stringify({
      verbatim: 'stake is the second payment',
    })

    await persistPostedPaste(answersDir, 'sim', firstBody)
    const afterFirst = await readFile(path.join(answersDir, 'sim.json'), 'utf8')

    const second = await persistPostedPaste(answersDir, 'sim', secondBody)
    const afterSecond = await readFile(path.join(answersDir, 'sim.json'), 'utf8')

    expect(afterSecond).not.toBe(afterFirst)
    expect(second.slideId).toBe('sim')
    const maybeHead = Array.head(second.answers)
    expect(Option.isSome(maybeHead)).toBe(true)
    if (Option.isSome(maybeHead)) {
      expect(maybeHead.value.verbatim).toBe('fee should sit with the bundle')
      const maybeNote = Array.head(notesOf(maybeHead.value))
      expect(Option.isSome(maybeNote)).toBe(true)
      if (Option.isSome(maybeNote)) {
        expect(maybeNote.value.verbatim).toBe('stake is the second payment')
      }
    }
    const onDisk = S.decodeUnknownSync(AnswerLog)(JSON.parse(afterSecond))
    const maybeDiskHead = Array.head(onDisk.answers)
    expect(Option.isSome(maybeDiskHead)).toBe(true)
    if (Option.isSome(maybeDiskHead)) {
      expect(maybeDiskHead.value.verbatim).toBe(
        'fee should sit with the bundle',
      )
      const maybeDiskNote = Array.head(notesOf(maybeDiskHead.value))
      expect(Option.isSome(maybeDiskNote)).toBe(true)
      if (Option.isSome(maybeDiskNote)) {
        expect(maybeDiskNote.value.verbatim).toBe('stake is the second payment')
      }
    }
  })
})
