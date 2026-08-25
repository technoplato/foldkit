import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Structure from './structure.js'

type Destination = 'Home' | 'Library' | 'Search' | 'Settings' | 'Profile'

const stackAtRoot = (root: Destination) => Structure.stackAtRoot(root)

const entry = Structure.presented

const applyAll = (
  stack: Structure.NavigationStack<Destination>,
  instructions: ReadonlyArray<Structure.StackInstruction<Destination>>,
): Structure.NavigationStack<Destination> =>
  Structure.applyStackInstructions(stack, instructions)

describe('ElementAnchor', () => {
  it('constructs from a plain string', () => {
    expect(Structure.ElementAnchor.make('menu-trigger')).toBe('menu-trigger')
  })

  it('rejects an empty anchor', () => {
    expect(() => Structure.ElementAnchor.make('')).toThrow()
  })
})

describe('PresentationStyle', () => {
  it('builds each style member as a tagged value', () => {
    expect(Structure.Push()).toEqual({ _tag: 'Push' })
    expect(Structure.Sheet()).toEqual({ _tag: 'Sheet' })
    expect(Structure.BottomSheet()).toEqual({ _tag: 'BottomSheet' })
    expect(Structure.FullScreenCover()).toEqual({ _tag: 'FullScreenCover' })
    expect(Structure.Dialog()).toEqual({ _tag: 'Dialog' })
    expect(
      Structure.Popover({ anchor: Structure.ElementAnchor.make('trigger') }),
    ).toEqual({ _tag: 'Popover', anchor: 'trigger' })
    expect(Structure.DrawerFromLeft()).toEqual({ _tag: 'DrawerFromLeft' })
    expect(Structure.DrawerFromRight()).toEqual({ _tag: 'DrawerFromRight' })
  })

  it('carries the anchor on a Popover entry', () => {
    const help = entry(
      'Search',
      Structure.Popover({
        anchor: Structure.ElementAnchor.make('search-icon'),
      }),
    )
    expect(help.style._tag).toBe('Popover')
  })
})

describe('builders and accessors', () => {
  it('stackAtRoot shows the bare root with no top entry', () => {
    const stack = stackAtRoot('Home')
    expect(stack.root).toBe('Home')
    expect(stack.presented).toEqual({ _tag: 'NothingPresented' })
    expect(Option.isNone(Structure.topEntry(stack))).toBe(true)
  })

  it('stackWithEntries exposes the topmost entry', () => {
    const stack = Structure.stackWithEntries('Home', [
      entry('Library', Structure.Push()),
      entry('Settings', Structure.Sheet()),
    ])
    expect(Option.getOrThrow(Structure.topEntry(stack))).toEqual(
      entry('Settings', Structure.Sheet()),
    )
  })

  it('pushed appends entries over a bare root', () => {
    const next = Structure.pushed(
      stackAtRoot('Home'),
      entry('Search', Structure.Push()),
    )
    expect(next.presented).toEqual({
      _tag: 'PresentingEntries',
      entries: [entry('Search', Structure.Push())],
    })
  })

  it('popped removes the top entry and reveals the root when empty', () => {
    const single = Structure.pushed(
      stackAtRoot('Home'),
      entry('Search', Structure.Push()),
    )
    expect(Option.getOrThrow(Structure.popped(single))).toEqual(
      stackAtRoot('Home'),
    )

    const deeper = Structure.pushed(single, entry('Profile', Structure.Sheet()))
    expect(Option.getOrThrow(Structure.popped(deeper))).toEqual(single)
  })

  it('popped returns none at a bare root', () => {
    expect(Option.isNone(Structure.popped(stackAtRoot('Home')))).toBe(true)
  })

  it('replacedRoot keeps every entry', () => {
    const stack = Structure.stackWithEntries('Home', [
      entry('Library', Structure.Push()),
      entry('Profile', Structure.Sheet()),
    ])
    const replaced = Structure.replacedRoot(stack, 'Settings')
    expect(replaced.root).toBe('Settings')
    expect(replaced.presented).toEqual(stack.presented)
  })
})

describe('stackInstructions', () => {
  it('yields no instructions for identical stacks built separately', () => {
    const build = () =>
      Structure.stackWithEntries('Home', [
        entry('Library', Structure.Push()),
        entry('Settings', Structure.Sheet()),
      ])
    expect(Structure.stackInstructions(build(), build())).toEqual([])
  })

  it('pushes for a pure push cycle', () => {
    const previous = stackAtRoot('Home')
    const next = Structure.pushed(previous, entry('Search', Structure.Push()))
    expect(Structure.stackInstructions(previous, next)).toEqual([
      Structure.push('Search', Structure.Push()),
    ])
    expect(Structure.stackInstructions(next, previous)).toEqual([
      Structure.pop(),
    ])
  })

  it('treats a styled present and its dismiss as push and pop', () => {
    const previous = stackAtRoot('Home')
    const next = Structure.pushed(
      previous,
      entry('Profile', Structure.BottomSheet()),
    )
    expect(Structure.stackInstructions(previous, next)).toEqual([
      Structure.push('Profile', Structure.BottomSheet()),
    ])
    expect(Structure.stackInstructions(next, previous)).toEqual([
      Structure.pop(),
    ])
  })

  it('multi-pops back to the bare root', () => {
    const previous = Structure.stackWithEntries('Home', [
      entry('Library', Structure.Push()),
      entry('Settings', Structure.Push()),
      entry('Profile', Structure.Sheet()),
    ])
    expect(Structure.stackInstructions(previous, stackAtRoot('Home'))).toEqual([
      Structure.pop(),
      Structure.pop(),
      Structure.pop(),
    ])
  })

  it('collapses a same-depth jump to one ReplaceTop', () => {
    const previous = Structure.stackWithEntries('Home', [
      entry('Settings', Structure.Push()),
      entry('Library', Structure.Push()),
    ])
    const next = Structure.stackWithEntries('Home', [
      entry('Settings', Structure.Push()),
      entry('Profile', Structure.Push()),
    ])
    expect(Structure.stackInstructions(previous, next)).toEqual([
      Structure.replaceTop(entry('Profile', Structure.Push())),
    ])
  })

  it('emits ReplaceTop when only the style of the top entry changes', () => {
    const previous = Structure.stackWithEntries('Home', [
      entry('Profile', Structure.Sheet()),
    ])
    const next = Structure.stackWithEntries('Home', [
      entry('Profile', Structure.Dialog()),
    ])
    expect(Structure.stackInstructions(previous, next)).toEqual([
      Structure.replaceTop(entry('Profile', Structure.Dialog())),
    ])
  })

  it('shrinks then retargets the new top in order', () => {
    const previous = Structure.stackWithEntries('Home', [
      entry('Library', Structure.Push()),
      entry('Settings', Structure.Push()),
      entry('Profile', Structure.Sheet()),
    ])
    const next = Structure.stackWithEntries('Home', [
      entry('Library', Structure.Push()),
      entry('Search', Structure.Dialog()),
    ])
    expect(Structure.stackInstructions(previous, next)).toEqual([
      Structure.pop(),
      Structure.replaceTop(entry('Search', Structure.Dialog())),
    ])
  })

  it('grows by two pushes above the shared prefix', () => {
    const previous = Structure.pushed(
      stackAtRoot('Home'),
      entry('Library', Structure.Push()),
    )
    const next = Structure.stackWithEntries('Home', [
      entry('Library', Structure.Push()),
      entry('Settings', Structure.Sheet()),
      entry('Profile', Structure.Dialog()),
    ])
    expect(Structure.stackInstructions(previous, next)).toEqual([
      Structure.push('Settings', Structure.Sheet()),
      Structure.push('Profile', Structure.Dialog()),
    ])
  })

  it('rebases the root last after entry changes', () => {
    const previous = Structure.stackWithEntries('Home', [
      entry('Library', Structure.Push()),
      entry('Settings', Structure.Sheet()),
    ])
    const next = Structure.stackWithEntries('Search', [
      entry('Library', Structure.Push()),
      entry('Profile', Structure.Sheet()),
    ])
    expect(Structure.stackInstructions(previous, next)).toEqual([
      Structure.replaceTop(entry('Profile', Structure.Sheet())),
      Structure.setRoot('Search'),
    ])
  })

  it('emits only SetRoot when the root alone moves', () => {
    expect(
      Structure.stackInstructions(stackAtRoot('Home'), stackAtRoot('Settings')),
    ).toEqual([Structure.setRoot('Settings')])
  })

  it('is deterministic across reruns', () => {
    const previous = Structure.stackWithEntries('Home', [
      entry('Library', Structure.Push()),
      entry('Profile', Structure.Sheet()),
    ])
    const next = Structure.stackWithEntries('Home', [
      entry('Settings', Structure.Dialog()),
      entry('Search', Structure.Push()),
    ])
    const firstRun = Structure.stackInstructions(previous, next)
    expect(Structure.stackInstructions(previous, next)).toEqual(firstRun)
    expect(firstRun.length).toBeGreaterThan(0)
  })
})

describe('applyStackInstructions round trip', () => {
  const scenarios: ReadonlyArray<{
    readonly name: string
    readonly previous: Structure.NavigationStack<Destination>
    readonly next: Structure.NavigationStack<Destination>
  }> = [
    {
      name: 'identical separately built stacks',
      previous: Structure.stackWithEntries('Home', [
        entry('Library', Structure.Push()),
      ]),
      next: Structure.stackWithEntries('Home', [
        entry('Library', Structure.Push()),
      ]),
    },
    {
      name: 'push cycle',
      previous: stackAtRoot('Home'),
      next: Structure.pushed(
        stackAtRoot('Home'),
        entry('Search', Structure.Push()),
      ),
    },
    {
      name: 'styled present to dismiss',
      previous: stackAtRoot('Home'),
      next: Structure.pushed(
        stackAtRoot('Home'),
        entry('Profile', Structure.BottomSheet()),
      ),
    },
    {
      name: 'multi-pop to root',
      previous: Structure.stackWithEntries('Home', [
        entry('Library', Structure.Push()),
        entry('Settings', Structure.Push()),
        entry('Profile', Structure.Sheet()),
      ]),
      next: stackAtRoot('Home'),
    },
    {
      name: 'same-depth jump',
      previous: Structure.stackWithEntries('Home', [
        entry('Settings', Structure.Push()),
        entry('Library', Structure.Push()),
      ]),
      next: Structure.stackWithEntries('Home', [
        entry('Settings', Structure.Push()),
        entry('Profile', Structure.Push()),
      ]),
    },
    {
      name: 'style change on top',
      previous: Structure.stackWithEntries('Home', [
        entry('Profile', Structure.Sheet()),
      ]),
      next: Structure.stackWithEntries('Home', [
        entry('Profile', Structure.Dialog()),
      ]),
    },
    {
      name: 'shrink with retarget',
      previous: Structure.stackWithEntries('Home', [
        entry('Library', Structure.Push()),
        entry('Settings', Structure.Push()),
        entry('Profile', Structure.Sheet()),
      ]),
      next: Structure.stackWithEntries('Home', [
        entry('Library', Structure.Push()),
        entry('Search', Structure.Dialog()),
      ]),
    },
    {
      name: 'grow two',
      previous: Structure.pushed(
        stackAtRoot('Home'),
        entry('Library', Structure.Push()),
      ),
      next: Structure.stackWithEntries('Home', [
        entry('Library', Structure.Push()),
        entry('Settings', Structure.Sheet()),
        entry('Profile', Structure.Dialog()),
      ]),
    },
    {
      name: 'root rebase with entries',
      previous: Structure.stackWithEntries('Home', [
        entry('Library', Structure.Push()),
        entry('Settings', Structure.Sheet()),
      ]),
      next: Structure.stackWithEntries('Search', [
        entry('Library', Structure.Push()),
        entry('Profile', Structure.Sheet()),
      ]),
    },
    {
      name: 'joint drawer and popover presentation',
      previous: Structure.stackWithEntries('Home', [
        entry('Settings', Structure.DrawerFromRight()),
      ]),
      next: Structure.stackWithEntries('Home', [
        entry('Settings', Structure.DrawerFromRight()),
        entry(
          'Search',
          Structure.Popover({
            anchor: Structure.ElementAnchor.make('search-icon'),
          }),
        ),
      ]),
    },
    {
      name: 'joint presentation retargeting the popover',
      previous: Structure.stackWithEntries('Home', [
        entry('Settings', Structure.DrawerFromRight()),
        entry(
          'Search',
          Structure.Popover({
            anchor: Structure.ElementAnchor.make('search-icon'),
          }),
        ),
      ]),
      next: Structure.stackWithEntries('Home', [
        entry('Settings', Structure.DrawerFromRight()),
        entry(
          'Library',
          Structure.Popover({
            anchor: Structure.ElementAnchor.make('library-row'),
          }),
        ),
      ]),
    },
    {
      name: 'joint presentation dismissing both layers',
      previous: Structure.stackWithEntries('Home', [
        entry('Settings', Structure.DrawerFromRight()),
        entry(
          'Search',
          Structure.Popover({
            anchor: Structure.ElementAnchor.make('search-icon'),
          }),
        ),
      ]),
      next: stackAtRoot('Home'),
    },
  ]

  it.each(scenarios.map(scenario => [scenario.name, scenario] as const))(
    'round trips %s',
    (_name, scenario) => {
      const instructions = Structure.stackInstructions(
        scenario.previous,
        scenario.next,
      )
      expect(applyAll(scenario.previous, instructions)).toEqual(scenario.next)
    },
  )

  it('keeps a DrawerFromRight entry and a Popover entry stacked together', () => {
    const drawerOpen = Structure.stackWithEntries('Home', [
      entry('Settings', Structure.DrawerFromRight()),
    ])
    const withPopover = Structure.stackWithEntries('Home', [
      entry('Settings', Structure.DrawerFromRight()),
      entry(
        'Search',
        Structure.Popover({
          anchor: Structure.ElementAnchor.make('search-icon'),
        }),
      ),
    ])

    const presenting = withPopover.presented
    if (presenting._tag !== 'PresentingEntries') {
      throw new Error('expected two stacked entries')
    }
    expect(presenting.entries).toHaveLength(2)
    expect(Option.getOrThrow(Structure.topEntry(withPopover))).toEqual(
      entry(
        'Search',
        Structure.Popover({
          anchor: Structure.ElementAnchor.make('search-icon'),
        }),
      ),
    )

    expect(Structure.stackInstructions(drawerOpen, withPopover)).toEqual([
      Structure.push(
        'Search',
        Structure.Popover({
          anchor: Structure.ElementAnchor.make('search-icon'),
        }),
      ),
    ])
    expect(Structure.stackInstructions(withPopover, drawerOpen)).toEqual([
      Structure.pop(),
    ])
  })

  it('diffs joint-presentation states into ordered instructions', () => {
    const previous = Structure.stackWithEntries('Home', [
      entry('Settings', Structure.DrawerFromRight()),
      entry(
        'Search',
        Structure.Popover({
          anchor: Structure.ElementAnchor.make('search-icon'),
        }),
      ),
    ])
    const next = Structure.stackWithEntries('Library', [
      entry('Settings', Structure.DrawerFromLeft()),
      entry(
        'Search',
        Structure.Popover({
          anchor: Structure.ElementAnchor.make('library-row'),
        }),
      ),
      entry('Profile', Structure.Sheet()),
    ])

    const instructions = Structure.stackInstructions(previous, next)
    expect(instructions).toEqual([
      Structure.pop(),
      Structure.replaceTop(entry('Settings', Structure.DrawerFromLeft())),
      Structure.push(
        'Search',
        Structure.Popover({
          anchor: Structure.ElementAnchor.make('library-row'),
        }),
      ),
      Structure.push('Profile', Structure.Sheet()),
      Structure.setRoot('Library'),
    ])
    expect(instructions.map(instruction => instruction._tag)).toEqual([
      'Pop',
      'ReplaceTop',
      'Push',
      'Push',
      'SetRoot',
    ])
  })

  it('leaves a bare-root stack unchanged under Pop and ReplaceTop', () => {
    const bare = stackAtRoot('Home')
    expect(
      applyAll(bare, [
        Structure.pop(),
        Structure.replaceTop(entry('Search', Structure.Push())),
      ]),
    ).toEqual(bare)
  })
})
