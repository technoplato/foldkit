import { describe, expect, expectTypeOf, it } from 'vitest'

import * as Slot from '../behavior/slot.js'
import { renderPlainCli } from './cliPaint.js'
import { paintHtml } from './html.js'
import * as Jsx from './jsx.js'
import { Fragment, type JSX, jsx, jsxDEV, jsxs } from './jsxRuntime.js'
import { renderScreen } from './render.js'
import type { UiNode } from './types.js'

describe('Zero-React JSX-to-UiNode factory', () => {
  it('exposes JSX.Element as UiNode and automatic runtime factories', () => {
    expectTypeOf<JSX.Element>().toEqualTypeOf<UiNode>()
    expect(typeof jsx).toBe('function')
    expect(typeof jsxs).toBe('function')
    expect(typeof jsxDEV).toBe('function')
    expect(typeof Fragment).toBe('function')
  })

  it('builds plain Foldkit UiNode trees from PascalCase components', () => {
    const tree = jsxs(Jsx.Column, {
      gap: 1,
      children: [
        jsx(Jsx.Heading, { children: 'Release status' }),
        jsxs(Jsx.Row, {
          gap: 2,
          children: [
            jsx(Jsx.Text, { children: ['Build ', 42] }),
            jsx(Jsx.Badge, { tone: 'Positive', children: 'Passing' }),
          ],
        }),
        jsx(Jsx.Separator, { width: 24 }),
        jsx(Jsx.TextInput, { value: 'main', placeholder: 'Branch' }),
        jsx(Jsx.Spacer, { rows: 1 }),
        jsx(Jsx.Button, { action: 'Deploy', children: 'Deploy now' }),
        jsx(Jsx.Dock, {
          children: jsx(Jsx.Text, { dim: true, children: 'Ready' }),
        }),
      ],
    })

    expect(tree._tag).toBe('Column')
    if (tree._tag === 'Column') {
      expect(tree.gap).toBe(1)
      expect(tree.children.map(child => child._tag)).toEqual([
        'Text',
        'Row',
        'Text',
        'TextInput',
        'Spacer',
        'Button',
        'Box',
      ])
    }

    const plain = renderPlainCli(tree, { width: 60 })
    expect(plain).toContain('Release status')
    expect(plain).toContain('Build 42')
    expect(plain).toContain('[Passing]')
    expect(plain).toContain('────────────────────────')
    expect(plain).toContain('[ Deploy now ]')
    expect(plain).toContain('Ready')

    const htmlPainted = JSON.stringify(paintHtml(tree, tag => tag))
    expect(htmlPainted).toContain('Release status')
    expect(htmlPainted).toContain('Badge:Positive')
    expect(htmlPainted).toContain('Deploy now')
  })

  it('builds identical UiNode trees from lowercase intrinsic tags and jsxDEV', () => {
    const tree = jsxDEV(
      'column',
      {
        gap: 1,
        children: [
          jsx('heading', { children: 'Inventory' }),
          jsx('row', {
            gap: 1,
            children: [
              jsx('badge', { tone: 'Warning', children: 'Low stock' }),
              jsx('button', { label: 'Restock', action: 'Restock' }),
            ],
          }),
          jsx('list', {
            label: 'Items',
            items: [{ key: '1', title: 'Lantern' }],
          }),
        ],
      },
      'root',
      true,
    )

    expect(tree._tag).toBe('Column')
    const screen = renderScreen(tree, 50)
    expect(screen).toContain('Inventory')
    expect(screen).toContain('[Low stock]')
    expect(screen).toContain('[ Restock ]')
    expect(screen).toContain('Lantern')
  })

  it('flattens Fragment children inside Row/Column/Box and skips falsy conditionals', () => {
    const isAdmin = false
    const isVerified = true

    const rowTree = jsxs(Jsx.Row, {
      gap: 1,
      children: [
        jsx(Fragment, {
          children: [
            jsx(Jsx.Text, { children: 'Alpha' }),
            isAdmin && jsx(Jsx.Text, { children: 'Hidden' }),
            null,
            undefined,
            isVerified && jsx(Jsx.Text, { children: 'Beta' }),
          ],
        }),
        'Gamma',
        7,
      ],
    })

    expect(rowTree._tag).toBe('Row')
    if (rowTree._tag === 'Row') {
      expect(rowTree.children).toHaveLength(4)
      expect(
        rowTree.children.map(node =>
          node._tag === 'Text' ? node.content : node._tag,
        ),
      ).toEqual(['Alpha', 'Beta', 'Gamma', '7'])
    }

    const standaloneFragment = jsx(Fragment, {
      children: [
        jsx(Jsx.Text, { children: 'Line 1' }),
        jsx(Jsx.Text, { children: 'Line 2' }),
      ],
    })
    expect(standaloneFragment._tag).toBe('Column')
    expect(renderPlainCli(standaloneFragment)).toBe('Line 1\nLine 2')
  })

  it('supports pure function components and Slot bindings seamlessly', () => {
    const StatusCard: Jsx.FunctionComponent<
      Readonly<{ title: string; isEnabled: boolean }>
    > = ({ title, isEnabled }) =>
      jsx(Jsx.Box, {
        padding: 1,
        slot: Slot.bound([], { role: 'Group', label: title }),
        children: jsx(Jsx.Button, {
          label: 'Auto-sync',
          slot: Slot.bound([], { role: 'Switch', isChecked: isEnabled }),
        }),
      })

    const tree = jsx(StatusCard, { title: 'Sync', isEnabled: true })
    const plain = renderPlainCli(tree, { width: 40 })
    expect(plain).toContain('┌─ Sync')
    expect(plain).toContain('[● ON] Auto-sync')
  })

  it('supports Toolbar, Split, ReadingMeasure, Progress, Seek, and RichText', () => {
    const tree = jsxs(Jsx.Column, {
      gap: 0,
      children: [
        jsx(Jsx.Toolbar, {
          start: jsx(Jsx.Text, { children: 'Left' }),
          center: jsx(Jsx.Text, { children: 'Center' }),
          end: jsx(Jsx.Text, { children: 'Right' }),
        }),
        jsx(Jsx.Split, {
          side: jsx(Jsx.Text, { children: 'Nav' }),
          main: jsx(Jsx.ReadingMeasure, {
            children: jsx(Jsx.Text, { children: 'Body' }),
          }),
        }),
        jsx(Jsx.Progress, { value: 50, max: 100, label: '50%' }),
        jsx(Jsx.Seek, {
          value: 30,
          max: 60,
          action: 'Seek',
          label: 'Timeline',
          valueText: '0:30 / 1:00',
        }),
      ],
    })

    const plain = renderPlainCli(tree, { width: 60 })
    expect(plain).toContain('Left')
    expect(plain).toContain('Center')
    expect(plain).toContain('Right')
    expect(plain).toContain('Nav')
    expect(plain).toContain('Body')
    expect(plain).toContain('50%')
    expect(plain).toContain('0:30 / 1:00')
  })
})
