import { Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Catalog from '../catalog/catalog.js'
import * as Declaration from '../declaration/index.js'
import * as Block from './block.js'
import * as Pace from './pace.js'
import * as Part from './part.js'
import * as Slot from './slot.js'
import * as TreeView from './treeView.js'

const fileTree: ReadonlyArray<TreeView.TreeNode> = [
  {
    id: 'src',
    label: 'src',
    children: [
      { id: 'index', label: 'index.ts' },
      {
        id: 'components',
        label: 'components',
        children: [{ id: 'button', label: 'button.ts' }],
      },
    ],
  },
  {
    id: 'docs',
    label: 'docs',
    children: [{ id: 'readme', label: 'README.md' }],
  },
  { id: 'locked', label: 'locked.key', isDisabled: true },
  { id: 'pkg', label: 'package.json' },
]

const defaultProps: TreeView.Props = {
  id: 'files',
  nodes: fileTree,
  hasLabel: true,
}

const step = (
  state: TreeView.State,
  message: TreeView.Message,
  props: TreeView.Props = defaultProps,
): TreeView.State => TreeView.chart.transition(state, message, props)[0]

describe('TreeView Part', () => {
  it('passes Block.problemsOf, Part.problemsOf, and Declaration checks with zero issues', () => {
    expect(
      Block.problemsOf({ name: 'TreeView', chart: TreeView.chart }),
    ).toEqual([])
    expect(Part.problemsOf(TreeView.part)).toEqual([])
    expect(
      Part.problemsOf(
        TreeView.make({
          name: 'ExplorerTree',
          defaultExpandedIds: ['src'],
          defaultSelectedIds: ['index'],
        }),
      ),
    ).toEqual([])
    expect(Part.problemsOf(TreeView.deviceOnly())).toEqual([])

    TreeView.actions.forEach(action => {
      const declaration = Catalog.declarationOf(action)
      expect(Declaration.problemsOf(declaration)).toEqual([])
      expect(Declaration.clientWordsOf(declaration)).toEqual([])
    })
  })

  it('flattens visibleNodesOf with depth/parent/hasChildren and handles ArrowRight/ArrowLeft/ArrowUp/ArrowDown/Home/End/* keyboard navigation', () => {
    // Initially only top-level rows are visible
    const initialVisible = TreeView.visibleNodesOf(
      TreeView.initial,
      defaultProps,
    )
    expect(initialVisible.map(row => row.id)).toEqual([
      'src',
      'docs',
      'locked',
      'pkg',
    ])
    expect(initialVisible[0]?.depth).toBe(0)
    expect(initialVisible[0]?.hasChildren).toBe(true)
    expect(initialVisible[0]?.maybeParentId).toEqual(Option.none())

    // Focus tree lands on 'src'
    let state = step(TreeView.initial, TreeView.FocusTree())
    expect(TreeView.isFocused(state)).toBe(true)
    expect(TreeView.focusedIdOf(state, defaultProps)).toEqual(
      Option.some('src'),
    )

    // ArrowRight on collapsed branch 'src' expands it
    state = step(state, TreeView.PressedTreeKey({ key: 'ArrowRight' }))
    expect(TreeView.isExpanded(state, 'src')).toBe(true)
    const expandedVisible = TreeView.visibleNodesOf(state, defaultProps)
    expect(expandedVisible.map(row => row.id)).toEqual([
      'src',
      'index',
      'components',
      'docs',
      'locked',
      'pkg',
    ])
    expect(expandedVisible[1]?.depth).toBe(1)
    expect(expandedVisible[1]?.maybeParentId).toEqual(Option.some('src'))

    // Second ArrowRight on expanded 'src' moves focus to first child 'index'
    state = step(state, TreeView.PressedTreeKey({ key: 'ArrowRight' }))
    expect(TreeView.focusedIdOf(state, defaultProps)).toEqual(
      Option.some('index'),
    )

    // ArrowLeft on leaf 'index' moves focus back to parent 'src'
    state = step(state, TreeView.PressedTreeKey({ key: 'ArrowLeft' }))
    expect(TreeView.focusedIdOf(state, defaultProps)).toEqual(
      Option.some('src'),
    )

    // ArrowLeft on expanded branch 'src' collapses it
    state = step(state, TreeView.PressedTreeKey({ key: 'ArrowLeft' }))
    expect(TreeView.isExpanded(state, 'src')).toBe(false)

    // '*' expands all sibling branches at root level ('src' and 'docs')
    state = step(state, TreeView.PressedTreeKey({ key: '*' }))
    expect(TreeView.isExpanded(state, 'src')).toBe(true)
    expect(TreeView.isExpanded(state, 'docs')).toBe(true)

    // End jumps to last enabled visible row ('pkg'), Home jumps to first ('src')
    state = step(state, TreeView.PressedTreeKey({ key: 'End' }))
    expect(TreeView.focusedIdOf(state, defaultProps)).toEqual(
      Option.some('pkg'),
    )

    // ArrowUp skips disabled 'locked' and lands on 'readme'
    state = step(state, TreeView.PressedTreeKey({ key: 'ArrowUp' }))
    expect(TreeView.focusedIdOf(state, defaultProps)).toEqual(
      Option.some('readme'),
    )

    state = step(state, TreeView.PressedTreeKey({ key: 'Home' }))
    expect(TreeView.focusedIdOf(state, defaultProps)).toEqual(
      Option.some('src'),
    )
  })

  it('supports Typeahead jump with WaitToClearTreeSearch command and Single/Multiple selection', () => {
    const start = step(
      TreeView.initialWith({ expandedIds: ['src'] }),
      TreeView.FocusTree(),
    )
    const [typed, commands] = TreeView.chart.transition(
      start,
      TreeView.PressedTreeKey({ key: 'p' }),
      defaultProps,
    )
    expect(TreeView.focusedIdOf(typed, defaultProps)).toEqual(
      Option.some('pkg'),
    )
    expect(TreeView.searchQueryOf(typed)).toBe('p')
    expect(commands).toHaveLength(1)
    expect(commands[0]?.name).toBe('WaitToClearTreeSearch')

    // Clearing search resets query buffer
    const clearedSearch = step(
      typed,
      TreeView.ClearedTreeSearch({ version: 1 }),
    )
    expect(TreeView.searchQueryOf(clearedSearch)).toBe('')

    // Single selection replaces
    const sel1 = step(start, TreeView.SelectTreeItem({ id: 'index' }))
    expect(TreeView.selectedIdsOf(sel1)).toEqual(['index'])
    const sel2 = step(sel1, TreeView.SelectTreeItem({ id: 'pkg' }))
    expect(TreeView.selectedIdsOf(sel2)).toEqual(['pkg'])

    // Multiple selection toggles and supports Shift+ArrowDown range extension and Mod+A
    const multiProps: TreeView.Props = {
      ...defaultProps,
      selectionMode: 'Multiple',
    }
    let multi = step(start, TreeView.SelectTreeItem({ id: 'src' }), multiProps)
    multi = step(
      multi,
      TreeView.PressedTreeKey({ key: 'ArrowDown', isShift: true }),
      multiProps,
    )
    expect(TreeView.selectedIdsOf(multi)).toEqual(['src', 'index'])

    multi = step(
      multi,
      TreeView.PressedTreeKey({ key: 'a', isControl: true }),
      multiProps,
    )
    expect(TreeView.selectedIdsOf(multi)).toEqual([
      'src',
      'index',
      'components',
      'docs',
      'pkg',
    ])

    const cleared = step(multi, TreeView.ClearTreeSelection(), multiProps)
    expect(TreeView.selectedIdsOf(cleared)).toEqual([])
  })

  it('declares sync, atRest, JSON round-trip, and reference-stable SlotBindings', () => {
    expect(TreeView.synced.SelectTreeItem).toEqual(Pace.Synced())
    expect(TreeView.deviceSync().SelectTreeItem).toEqual(
      Pace.Device({ because: 'OwnView' }),
    )

    const focused = step(
      TreeView.initialWith({ expandedIds: ['src'], selectedIds: ['index'] }),
      TreeView.FocusTreeItem({ id: 'src' }),
    )
    const rested = TreeView.atRest(focused)
    expect(TreeView.isFocused(rested)).toBe(false)
    expect(TreeView.expandedIdsOf(rested)).toEqual(['src'])
    expect(TreeView.selectedIdsOf(rested)).toEqual(['index'])

    const encoded = S.encodeSync(TreeView.State)(focused)
    expect(S.decodeUnknownSync(TreeView.State)(encoded)).toEqual(focused)

    const view1 = Part.view(TreeView.part, focused, defaultProps)
    const view2 = Part.view(TreeView.part, focused, { ...defaultProps })
    expect(view1).toBe(view2)
    expect(view1.slot('Item', 'src')).toBe(view2.slot('Item', 'src'))

    expect(Slot.ariaOf(view1.slot('Tree'))['role']).toBe('listbox')
    expect(Slot.ariaOf(view1.slot('Tree'))['aria-activedescendant']).toBe(
      'files-item-src',
    )
    expect(Slot.ariaOf(view1.slot('Item', 'src'))['aria-expanded']).toBe('true')
    expect(Slot.ariaOf(view1.slot('Item', 'src'))['aria-current']).toBe('true')
    expect(Slot.ariaOf(view1.slot('Item', 'src'))['tabindex']).toBe('0')
    expect(Slot.ariaOf(view1.slot('Item', 'index'))['aria-selected']).toBe(
      'true',
    )
    expect(
      Slot.ariaOf(view1.slot('Item', 'index'))['aria-expanded'],
    ).toBeUndefined()
    expect(
      Slot.ariaOf(view1.slot('BranchToggle', 'src'))['aria-expanded'],
    ).toBe('true')
    expect(Slot.ariaOf(view1.slot('BranchToggle', 'index'))['hidden']).toBe('')

    const toggled = step(focused, TreeView.ToggleTreeBranch({ id: 'docs' }))
    const view3 = Part.view(TreeView.part, toggled, defaultProps)
    expect(view3.slot('Item', 'index')).toBe(view1.slot('Item', 'index'))
    expect(view3.slot('BranchToggle', 'docs')).not.toBe(
      view1.slot('BranchToggle', 'docs'),
    )
  })
})
