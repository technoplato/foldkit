import { Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Catalog from '../catalog/catalog.js'
import * as Declaration from '../declaration/index.js'
import { make } from '../program/program.js'
import * as Block from './block.js'
import * as Pace from './pace.js'
import * as Part from './part.js'
import * as Slot from './slot.js'
import * as TableOfContents from './tableOfContents.js'

const headings: ReadonlyArray<TableOfContents.TocHeading> = [
  { id: 'intro', label: 'Introduction', depth: 1 },
  { id: 'install', label: 'Installation', depth: 2 },
  { id: 'usage', label: 'Usage', depth: 2 },
  { id: 'api', label: 'API Reference', depth: 1 },
]

const positions: TableOfContents.HeadingPositions = {
  intro: 100,
  install: 400,
  usage: 800,
  api: 1200,
}

const baseProps: TableOfContents.Props = {
  id: 'doc-toc',
  headings,
  offsetPx: 40,
}

const step = (
  state: TableOfContents.State,
  message: TableOfContents.Message,
  props: TableOfContents.Props = baseProps,
): TableOfContents.State =>
  TableOfContents.chart.transition(state, message, props)[0]

describe('TableOfContents Part', () => {
  it('passes Block.problemsOf, Part.problemsOf, and Declaration checks with zero issues', () => {
    expect(
      Block.problemsOf({
        name: 'TableOfContents',
        chart: TableOfContents.chart,
      }),
    ).toEqual([])
    expect(Part.problemsOf(TableOfContents.part)).toEqual([])
    expect(
      Part.problemsOf(
        TableOfContents.make({ defaultActiveId: 'intro', sampleMs: 100 }),
      ),
    ).toEqual([])
    expect(Part.problemsOf(TableOfContents.deviceOnly())).toEqual([])

    TableOfContents.actions.forEach(action => {
      const declaration = Catalog.declarationOf(action)
      expect(Declaration.problemsOf(declaration)).toEqual([])
      expect(Declaration.clientWordsOf(declaration)).toEqual([])
    })
  })

  it('resolves the active heading purely from headings, positions, scrollTop, and offsetPx', () => {
    expect(TableOfContents.rootId('doc-toc')).toBe('doc-toc-root')
    expect(TableOfContents.itemId('doc-toc', 'intro')).toBe(
      'doc-toc-item-intro',
    )

    expect(TableOfContents.resolveActiveHeading([], positions, 500, 0)).toEqual(
      Option.none(),
    )
    expect(
      TableOfContents.resolveActiveHeading(headings, positions, 0, 0),
    ).toEqual(Option.none())
    expect(
      TableOfContents.resolveActiveHeading(headings, positions, 60, 40),
    ).toEqual(Option.some('intro'))
    expect(
      TableOfContents.resolveActiveHeading(headings, positions, 399, 0),
    ).toEqual(Option.some('intro'))
    expect(
      TableOfContents.resolveActiveHeading(headings, positions, 400, 0),
    ).toEqual(Option.some('install'))
    expect(
      TableOfContents.resolveActiveHeading(headings, positions, 770, 40),
    ).toEqual(Option.some('usage'))
    expect(
      TableOfContents.resolveActiveHeading(headings, positions, 1500, 0),
    ).toEqual(Option.some('api'))
  })

  it('tracks active heading across ObserveScroll, ObserveVisibleHeadings, SelectHeading, and ClearActiveHeading', () => {
    const s1 = step(
      TableOfContents.initial,
      TableOfContents.ObserveScroll({ scrollTop: 370, positions }),
    )
    // 370 + offsetPx(40) = 410 >= 400 ('install')
    expect(TableOfContents.activeIdOf(s1)).toEqual(Option.some('install'))
    expect(TableOfContents.activeIndexOf(s1, baseProps)).toEqual(Option.some(1))
    expect(TableOfContents.activeHeadingOf(s1, baseProps)).toEqual(
      Option.some(headings[1]),
    )

    const s2 = step(s1, TableOfContents.SelectHeading({ id: 'api' }))
    expect(TableOfContents.activeIdOf(s2)).toEqual(Option.some('api'))
    expect(TableOfContents.activeIndexOf(s2, baseProps)).toEqual(Option.some(3))

    // Unknown heading id is ignored
    const sIgnored = step(s2, TableOfContents.SelectHeading({ id: 'missing' }))
    expect(sIgnored).toBe(s2)

    // Visible headings picks the first heading in document order
    const s3 = step(
      s2,
      TableOfContents.ObserveVisibleHeadings({
        visibleIds: ['usage', 'install'],
      }),
    )
    expect(TableOfContents.activeIdOf(s3)).toEqual(Option.some('install'))

    const s4 = step(s3, TableOfContents.ClearActiveHeading())
    expect(TableOfContents.activeIdOf(s4)).toEqual(Option.none())
    expect(TableOfContents.activeIndexOf(s4, baseProps)).toEqual(Option.none())
  })

  it('projects reference-stable SlotBindings with isCurrent on Item', () => {
    const state = TableOfContents.initialActive('intro')
    const view1 = Part.view(TableOfContents.part, state, baseProps)
    const view2 = Part.view(TableOfContents.part, state, baseProps)
    expect(view1).toBe(view2)

    expect(Slot.ariaOf(view1.slot('Root'))).toMatchObject({
      id: 'doc-toc-root',
      role: 'region',
      'aria-label': 'Table of contents',
    })

    const introSlot = view1.slot('Item', 'intro')
    const installSlot = view1.slot('Item', 'install')
    const apiSlot = view1.slot('Item', 'api')
    expect(Slot.ariaOf(introSlot)['aria-current']).toBe('true')
    expect(Slot.ariaOf(installSlot)['aria-current']).toBe('false')
    expect(Slot.ariaOf(apiSlot)['aria-current']).toBe('false')

    // Changing active from intro -> install keeps unchanged api slot by reference
    const nextState = step(
      state,
      TableOfContents.SelectHeading({ id: 'install' }),
    )
    const nextView = Part.view(TableOfContents.part, nextState, baseProps)
    expect(nextView.slot('Item', 'api')).toBe(apiSlot)
    expect(nextView.slot('Item', 'install')).not.toBe(installSlot)
    expect(Slot.ariaOf(nextView.slot('Item', 'install'))['aria-current']).toBe(
      'true',
    )
  })

  it('composes with Sampled ObserveScroll, Synced SelectHeading, atRest, and deviceOnly', () => {
    const Base = make({
      id: 'toc-test',
      version: 1,
      Model: S.Struct({ ready: S.Boolean }),
      Message: S.Union([
        Catalog.action('Ping', {
          what: 'Pings',
          why: 'To verify',
          meta: { label: 'Ping', keys: [] },
        }),
      ]),
      init: () => [{ ready: true }, []],
      update: model => [model, []],
    })

    const SyncedApp = Part.compose({
      of: Base,
      parts: [
        Part.given(
          TableOfContents.make({ defaultActiveId: 'intro', sampleMs: 75 }),
          () => baseProps,
        ),
      ],
    })
    expect(
      SyncedApp.synchronization?.messageCategory(
        TableOfContents.SelectHeading({ id: 'api' }),
      ),
    ).toBe('Navigation')
    expect(
      SyncedApp.synchronization?.paceOf?.(
        TableOfContents.ObserveScroll({ scrollTop: 100, positions }),
      ),
    ).toEqual(Pace.Sampled({ everyMs: 75 }))
    expect(
      SyncedApp.synchronization?.paceOf?.(
        TableOfContents.SelectHeading({ id: 'api' }),
      ),
    ).toEqual(Pace.Synced())
    expect(
      TableOfContents.atRest(TableOfContents.initialActive('usage')),
    ).toEqual(TableOfContents.Active({ maybeActiveId: Option.some('usage') }))

    const LocalApp = Part.compose({
      of: Base,
      parts: [Part.given(TableOfContents.deviceOnly(), () => baseProps)],
    })
    expect(
      LocalApp.synchronization?.isLocalOnly?.(
        TableOfContents.SelectHeading({ id: 'api' }),
      ),
    ).toBe(true)
    const [localModel] = LocalApp.init()
    expect(S.encodeSync(LocalApp.Model)(localModel)).toEqual({ ready: true })
  })
})
