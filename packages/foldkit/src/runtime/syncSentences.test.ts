import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const quoted = /'([^'\n]*)'/g

const sentencesOf = (file: string): ReadonlyArray<string> =>
  Array.from(
    readFileSync(join(process.cwd(), file), 'utf8').matchAll(quoted),
    match => match[1] ?? '',
  ).filter(text => /\s/.test(text) && /[.!?]$/.test(text))

describe('what a person is told when sync fails', () => {
  it('names the sync engine, whichever one it is, never one product', () => {
    const naming = sentencesOf('src/runtime/start.ts').filter(sentence =>
      /Instant/.test(sentence),
    )
    expect(naming).toEqual([])
  })

  it('still says what happened, what it means, and what to do', () => {
    const sentences = sentencesOf('src/runtime/start.ts')
    expect(sentences).toContain('The sync engine did not accept this Message.')
    expect(sentences).toContain(
      'The sync engine did not return the Message log.',
    )
    expect(sentences).toContain('Check the sync engine and try again.')
  })
})
