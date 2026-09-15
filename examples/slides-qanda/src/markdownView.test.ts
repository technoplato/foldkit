import { Array, Option } from 'effect'
import { describe, expect, test } from 'vitest'

import { splitMarkdownBlocks } from './markdownView'

describe('splitMarkdownBlocks', () => {
  test('keeps a fence with a blank line as one block', () => {
    const markdown = [
      '# Lock-in',
      '',
      '```text',
      '$ death start ios/expo/ts',
      'started  device=ios',
      '',
      '$ death lock-in counter:level:show',
      'ok  id=counter:level:show',
      '```',
    ].join('\n')
    const blocks = splitMarkdownBlocks(markdown)
    expect(blocks.length).toBe(2)
    const maybeFence = Array.get(blocks, 1)
    expect(Option.isSome(maybeFence)).toBe(true)
    if (Option.isSome(maybeFence)) {
      expect(maybeFence.value.startsWith('```text')).toBe(true)
      expect(
        maybeFence.value.includes('$ death lock-in counter:level:show'),
      ).toBe(true)
      expect(maybeFence.value.endsWith('```')).toBe(true)
    }
  })

  test('keeps two fences as two zinc blocks', () => {
    const markdown = [
      '```text',
      '$ death start ios/expo/ts',
      'started  copy=1',
      '```',
      '',
      '```text',
      '$ death start ios/expo/ts',
      'started  copy=2',
      '```',
    ].join('\n')
    const blocks = splitMarkdownBlocks(markdown)
    expect(blocks.length).toBe(2)
    const maybeFirst = Array.get(blocks, 0)
    const maybeSecond = Array.get(blocks, 1)
    expect(Option.isSome(maybeFirst)).toBe(true)
    expect(Option.isSome(maybeSecond)).toBe(true)
    if (Option.isSome(maybeFirst) && Option.isSome(maybeSecond)) {
      expect(maybeFirst.value.includes('copy=1')).toBe(true)
      expect(maybeSecond.value.includes('copy=2')).toBe(true)
      expect(maybeSecond.value.includes('```')).toBe(true)
    }
  })
})
