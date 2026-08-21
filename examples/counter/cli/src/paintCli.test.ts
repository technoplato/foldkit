import { Model, counterScreen } from 'counter-core-example'
import { Box, Button, Column, Row, Spacer, Text } from 'foldkit/renderers'
import { describe, expect, it } from 'vitest'

import { paintCli } from './paintCli.js'

const describeToken = (token: string): string => `does ${token}`

const paint = (node: Parameters<typeof paintCli>[0]) =>
  paintCli(node, { binaryName: 'counter-screen', whatFor: describeToken })

describe('paintCli', () => {
  it('paints the Counter tree as text with Button tokens', () => {
    const painting = paint(counterScreen(Model.make({ count: 0 })))

    expect(painting.screen).toBe('0\n[increment] [decrement]')
  })

  it('hides reset from the tree and the usage listing at 0', () => {
    const painting = paint(counterScreen(Model.make({ count: 0 })))

    expect(painting.screen).not.toContain('reset')
    expect(painting.usage).not.toContain('reset')
    expect(painting.commands.map(command => command.token)).toEqual([
      'increment',
      'decrement',
    ])
  })

  it('lists reset once the count is above 0', () => {
    const painting = paint(counterScreen(Model.make({ count: 2 })))

    expect(painting.screen).toBe('2\n[increment] [decrement] [reset]')
    expect(painting.usage).toContain('reset')
    expect(painting.commands.map(command => command.token)).toEqual([
      'increment',
      'decrement',
      'reset',
    ])
  })

  it('derives usage from the tree plus the what sentences', () => {
    const painting = paint(counterScreen(Model.make({ count: 1 })))

    expect(painting.usage).toContain('commands')
    expect(painting.usage).toContain('increment   does increment')
    expect(painting.usage).toContain('run: counter-screen <command>')
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
