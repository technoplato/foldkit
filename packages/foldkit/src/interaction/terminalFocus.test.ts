import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { screenView } from '../navigation/declaration.js'
import type { Frame } from '../navigation/frame.js'
import { Push, Sheet } from '../navigation/structure.js'
import { Button, Column, List, Row, Transcript } from '../renderers/elements.js'
import { keyInput, terminalKeyInput } from './interaction.js'
import { focusedTagOf, noTerminalFocus } from './terminalFocus.js'

const playerAt = (place: string): Frame => ({
  uri: `/books/a-new-earth/listen/${place}`,
  maybeTitle: Option.some('Now playing'),
  base: {
    key: `/books/a-new-earth/listen/${place}`,
    identity: '/books/a-new-earth/listen/0s',
    maybeStyle: Option.none(),
    view: screenView(
      Column(
        {},
        Row(
          {},
          Button({ label: '↺30', action: 'SkipBack' }),
          Button({ label: '❚❚', action: 'Pause' }),
        ),
      ),
    ),
  },
  overlays: [],
})

const contentsWithChapter2Playing: Frame = {
  uri: '/books/a-new-earth/contents',
  maybeTitle: Option.some('Contents'),
  base: {
    key: '/books/a-new-earth',
    identity: '/books/a-new-earth',
    maybeStyle: Option.none(),
    view: screenView(Column()),
  },
  overlays: [
    {
      key: '/books/a-new-earth/contents',
      identity: '/books/a-new-earth/contents',
      maybeStyle: Option.some(Sheet()),
      view: screenView(
        List({
          label: 'Chapters',
          items: [
            { key: '1', title: 'Chapter 1', action: 'JumpToChapter:1' },
            { key: '2', title: 'Chapter 2', isCurrent: true },
            { key: '3', title: 'Chapter 3', action: 'JumpToChapter:3' },
          ],
        }),
      ),
    },
  ],
}

describe('terminalKeyInput', () => {
  it('reads Escape as plain Escape, though readline reports it with Meta', () => {
    expect(
      terminalKeyInput({
        sequence: '\u001b',
        name: 'escape',
        isMeta: true,
        isControl: false,
        isShift: false,
      }),
    ).toEqual(keyInput('Escape'))
  })

  it('keeps Meta on any other key', () => {
    expect(
      terminalKeyInput({
        sequence: '\u001bk',
        name: 'k',
        isMeta: true,
        isControl: false,
        isShift: false,
      }),
    ).toEqual(keyInput('k', { isMeta: true }))
  })
})

describe('focusedTagOf', () => {
  it('keeps the highlight on a page whose address follows its place', () => {
    const focus = { '/books/a-new-earth/listen/0s': 'Pause' }
    expect(focusedTagOf(playerAt('12m03s'), focus)).toEqual(
      Option.some('Pause'),
    )
    expect(focusedTagOf(playerAt('12m04s'), focus)).toEqual(
      Option.some('Pause'),
    )
  })

  it('leaves a pushed page that follows the words unhighlighted until an arrow', () => {
    const pushedPlayer = (isSpeaking: boolean): Frame => ({
      ...playerAt('12m03s'),
      base: {
        ...playerAt('12m03s').base,
        maybeStyle: Option.some(Push()),
        view: screenView(
          Column(
            {},
            Button({ label: 'Back', action: 'GoBack' }),
            Transcript({
              label: 'Transcript',
              action: 'SeekToWord',
              emptyText: 'Loading the words…',
              passages: [
                {
                  key: 'w0',
                  label: '12:00',
                  isCurrent: isSpeaking,
                  words: [{ token: 'w0', text: 'Now', isCurrent: isSpeaking }],
                },
              ],
            }),
          ),
        ),
      },
    })
    expect(focusedTagOf(pushedPlayer(true), noTerminalFocus)).toEqual(
      Option.none(),
    )
    expect(focusedTagOf(pushedPlayer(false), noTerminalFocus)).toEqual(
      Option.some('GoBack'),
    )
  })

  it('opens a sheet on the row after the current one when that row cannot press', () => {
    expect(focusedTagOf(contentsWithChapter2Playing, noTerminalFocus)).toEqual(
      Option.some('JumpToChapter:3'),
    )
  })
})
