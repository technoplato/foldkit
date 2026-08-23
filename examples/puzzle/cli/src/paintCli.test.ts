import { Box, Button, Column, Row, Spacer, Text } from 'foldkit/renderers'
import { demoModel, emptyModel, puzzleScreen } from 'puzzle-core-example'
import { describe, expect, it } from 'vitest'

import { paintCli } from './paintCli.js'

const describeToken = (token: string): string => `does ${token}`

const paint = (node: Parameters<typeof paintCli>[0]) =>
  paintCli(node, { binaryName: 'puzzle-screen', whatFor: describeToken })

describe('paintCli', () => {
  it('paints the Puzzle tree as text with Button tokens', () => {
    const painting = paint(puzzleScreen(emptyModel()))

    expect(painting.screen).toContain('/puzzle#next')
    expect(painting.screen).toContain('https://puzzle.knophy.com')
    expect(painting.screen).toContain('https://replicate.knophy.com')
    expect(painting.screen).toContain('https://grok.knophy.com')
    expect(painting.screen).toContain(
      '[yes] [no] [hint] [operator] [replicate]',
    )
    expect(painting.screen).not.toContain('github.com')
  })

  it('hides reset from the tree and the usage listing on an empty tape', () => {
    const painting = paint(puzzleScreen(emptyModel()))

    expect(painting.screen).not.toContain('reset')
    expect(painting.usage).not.toContain('reset')
    expect(painting.commands.map(command => command.token)).toEqual([
      'yes',
      'no',
      'hint',
      'operator',
      'replicate',
    ])
  })

  it('lists reset on the demo ReplicateStep tree', () => {
    const painting = paint(puzzleScreen(demoModel()))

    expect(painting.screen).toContain('[reset]')
    expect(painting.screen).toContain('https://puzzle.knophy.com/replicate.sh')
    expect(painting.usage).toContain('reset')
    expect(painting.commands.map(command => command.token)).toEqual(['reset'])
  })

  it('derives usage from the tree plus the what sentences', () => {
    const painting = paint(puzzleScreen(emptyModel()))

    expect(painting.usage).toContain('commands')
    expect(painting.usage).toContain('yes         does yes')
    expect(painting.usage).toContain('run: puzzle-screen <command>')
  })

  it('paints Box padding, Spacer rows, and skips disabled Buttons', () => {
    const painting = paint(
      Column(
        {},
        Box({ padding: 2 }, Text('boxed')),
        Spacer(2),
        Row(
          {},
          Button({ label: 'on', token: 'on' }),
          Button({ label: 'off', token: 'off', disabled: true }),
        ),
      ),
    )

    expect(painting.screen).toBe('  boxed\n\n\n[on] [off]')
    expect(painting.commands.map(command => command.token)).toEqual(['on'])
    expect(painting.usage).not.toContain('off')
  })
})
