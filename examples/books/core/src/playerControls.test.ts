import { Array, Option, Record as Record_ } from 'effect'
import { type RowNode, type UiNode, buttonsOf } from 'foldkit/renderers'
import { describe, expect, it } from 'vitest'

import { App, type AppModel } from './app.js'
import { TitleSlug } from './ids.js'
import { Listen, ReceivedChapters, ReceivedShelf } from './message.js'
import { sampleChapters, sampleShelf } from './sample.js'
import { playerScreen } from './screen.js'

const lanternKeeper = TitleSlug.make('the-lantern-keeper')

const listening = (): AppModel => {
  const withShelf = Array.reduce(
    Record_.toEntries(sampleChapters),
    App.update(App.init()[0], ReceivedShelf({ shelf: sampleShelf }))[0],
    (current, [slug, chapters]) =>
      App.update(
        current,
        ReceivedChapters({ slug: TitleSlug.make(slug), chapters }),
      )[0],
  )
  return App.update(withShelf, Listen({ slug: lanternKeeper }))[0]
}

const toolbarsOf = (node: UiNode): ReadonlyArray<RowNode> => {
  if (node._tag === 'Row') {
    return [
      ...(node.arrange === 'Toolbar' ? [node] : []),
      ...Array.flatMap(node.children, toolbarsOf),
    ]
  } else if (
    node._tag === 'Column' ||
    node._tag === 'Box' ||
    node._tag === 'DeviceShell'
  ) {
    return Array.flatMap(node.children, toolbarsOf)
  } else {
    return []
  }
}

describe('the controls of the player', () => {
  it('are a toolbar: what is playing at the start, the transport in the centre, more at the end', () => {
    const [toolbar] = toolbarsOf(playerScreen(listening()))
    const [start, center, end] = Option.getOrThrow(
      Option.fromNullishOr(toolbar),
    ).children
    const actionsOf = (maybeNode: UiNode | undefined) =>
      maybeNode === undefined
        ? []
        : Array.map(buttonsOf(maybeNode), button => button.action)
    expect(start?._tag).toBe('Row')
    expect(actionsOf(center)).toEqual(['SkipBack', 'Pause'])
    expect(actionsOf(end)).toEqual(['ShowSearch', 'ExpandControls'])
  })

  it('offer Search once, in the bar beside the transport, not in a row of its own', () => {
    const searches = Array.filter(
      buttonsOf(playerScreen(listening())),
      button => button.action === 'ShowSearch',
    )
    expect(searches).toHaveLength(1)
  })
})
