import { Array, Match as M, Option } from 'effect'
import { Interaction, type Navigation } from 'foldkit'
import { type ButtonNode, type UiNode } from 'foldkit/renderers'

import {
  BoxRenderable,
  type RenderContext,
  type Renderable,
  StyledText,
  type TextChunk,
  TextRenderable,
  bold,
  dim,
  fg,
  t,
  underline,
} from '@opentui/core'

const buttonPaddingX = 1

/** How a painted OpenTUI tree reports presses. */
export type PaintOpenTuiOptions = Readonly<{
  onPress: (button: ButtonNode) => void
}>

/** How a painted action menu reports choices and dismissal. */
export type PaintOpenTuiMenuOptions = Readonly<{
  onChoose: (tag: string) => void
  onDismiss: () => void
}>

const addChildren = (
  ctx: RenderContext,
  parent: Renderable,
  children: ReadonlyArray<UiNode>,
  options: PaintOpenTuiOptions,
): Renderable => {
  Array.forEach(children, child => {
    parent.add(paintOpenTui(ctx, child, options))
  })
  return parent
}

/**
 * Maps a Program screen tree to an OpenTUI renderable tree. A Button
 * becomes a bordered box hinted with its Catalog key; a mouse press reports
 * the node so the Client presses its `action`. A disabled Button paints dim
 * with its sentence.
 */
export const paintOpenTui = (
  ctx: RenderContext,
  node: UiNode,
  options: PaintOpenTuiOptions,
): Renderable =>
  M.value(node).pipe(
    M.withReturnType<Renderable>(),
    M.tagsExhaustive({
      Text: text =>
        new TextRenderable(ctx, {
          content:
            text.dim === true
              ? t`${dim(text.content)}`
              : t`${bold(text.content)}`,
        }),
      Button: button => {
        const isPressable = button.disabled !== true
        const box = new BoxRenderable(ctx, {
          border: true,
          paddingLeft: buttonPaddingX,
          paddingRight: buttonPaddingX,
          ...(isPressable
            ? {
                onMouseDown: () => {
                  options.onPress(button)
                },
              }
            : {}),
        })
        const label = button.label
        box.add(
          new TextRenderable(ctx, {
            content: isPressable ? t`${bold(label)}` : t`${dim(label)}`,
          }),
        )
        return box
      },
      TextInput: input => new TextRenderable(ctx, { content: input.value }),
      Spacer: spacer => new BoxRenderable(ctx, { height: spacer.rows }),
      Row: row =>
        addChildren(
          ctx,
          new BoxRenderable(ctx, { flexDirection: 'row', columnGap: row.gap }),
          row.children,
          options,
        ),
      Column: column =>
        addChildren(
          ctx,
          new BoxRenderable(ctx, {
            flexDirection: 'column',
            rowGap: column.gap,
          }),
          column.children,
          options,
        ),
      Box: box =>
        addChildren(
          ctx,
          new BoxRenderable(ctx, {
            flexDirection: 'column',
            padding: box.padding,
          }),
          box.children,
          options,
        ),
      DeviceShell: shell =>
        addChildren(
          ctx,
          new BoxRenderable(ctx, {
            flexDirection: 'column',
            border: true,
            title: shell.title ?? shell.device,
          }),
          shell.children,
          options,
        ),
    }),
  )

const matchColor = '#a5b4fc'

const rowMark = (row: Interaction.MenuRow): string =>
  row.isHighlighted ? '> ' : '  '

const runChunks = (
  runs: ReadonlyArray<Interaction.TextRun>,
  style: (text: string) => TextChunk,
): Array<TextChunk> =>
  Array.map(runs, run =>
    run.isMatch ? underline(fg(matchColor)(bold(run.text))) : style(run.text),
  )

const rowContent = (row: Interaction.MenuRow): StyledText => {
  const isDisabled = row.entry.availability._tag === 'Disabled'
  const keys = Array.match(row.keys, {
    onEmpty: () => [],
    onNonEmpty: rowKeys => [dim(`  [${Array.join(rowKeys, ' ')}]`)],
  })
  const because =
    row.entry.availability._tag === 'Disabled'
      ? [dim(` (${row.entry.availability.because})`)]
      : []
  return new StyledText([
    isDisabled ? dim(rowMark(row)) : bold(rowMark(row)),
    ...runChunks(row.title, isDisabled ? dim : bold),
    dim('  '),
    ...runChunks(row.description, dim),
    ...because,
    ...keys,
  ])
}

const paintMenu = (
  ctx: RenderContext,
  menu: Interaction.MenuView,
  options: PaintOpenTuiMenuOptions,
): Renderable => {
  const overlay = new BoxRenderable(ctx, {
    backgroundColor: '#0f172a',
    border: true,
    left: 2,
    padding: 1,
    position: 'absolute',
    title: menu.title,
    top: 0,
    zIndex: 20,
  })
  overlay.add(
    new TextRenderable(ctx, {
      content: t`${dim(Interaction.hintLineOf(menu.hints))}`,
    }),
  )
  overlay.add(
    new TextRenderable(ctx, {
      content: menu.isFilterFocused
        ? t`${bold(`${menu.filterLabel}: ${menu.query}_`)}`
        : t`${dim(`${menu.filterLabel}: ${menu.query}`)}`,
    }),
  )
  Array.forEach(menu.rows, row => {
    const isDisabled = row.entry.availability._tag === 'Disabled'
    const rowBox = new BoxRenderable(ctx, {
      ...(row.isFocused ? { backgroundColor: '#1d4ed8' } : {}),
      ...(isDisabled
        ? {}
        : {
            onMouseDown: () => {
              options.onChoose(row.entry.tag)
            },
          }),
    })
    rowBox.add(
      new TextRenderable(ctx, { content: rowContent(row), wrapMode: 'none' }),
    )
    overlay.add(rowBox)
  })
  if (Array.isReadonlyArrayEmpty(menu.rows)) {
    overlay.add(new TextRenderable(ctx, { content: t`${dim(menu.summary)}` }))
  }
  const close = new BoxRenderable(ctx, {
    onMouseDown: () => {
      options.onDismiss()
    },
  })
  close.add(new TextRenderable(ctx, { content: t`${dim(menu.dismissLabel)}` }))
  overlay.add(close)
  return overlay
}

/**
 * Paints the screen tree, then floats the presented action menu over it.
 * Menu rows come from the generic MenuView; they are not screen Buttons.
 *
 * @example
 * ```typescript
 * renderer.root.add(
 *   paintOpenTuiFrame(renderer, bound.screen(), bound.menu(), options),
 * )
 * ```
 */
export const paintOpenTuiFrame = (
  ctx: RenderContext,
  maybeScreen: Option.Option<UiNode>,
  maybeMenu: Option.Option<Interaction.MenuView>,
  options: PaintOpenTuiOptions & PaintOpenTuiMenuOptions,
): Renderable => {
  const frame = new BoxRenderable(ctx, {
    flexDirection: 'column',
    flexGrow: 1,
    position: 'relative',
  })
  if (Option.isSome(maybeScreen)) {
    frame.add(paintOpenTui(ctx, maybeScreen.value, options))
  }
  if (Option.isSome(maybeMenu)) {
    frame.add(paintMenu(ctx, maybeMenu.value, options))
  }
  return frame
}

const overlayOffset = 2
const overlayZIndex = 20

const paintView = (
  ctx: RenderContext,
  view: Navigation.EntryView,
  options: PaintOpenTuiOptions & PaintOpenTuiMenuOptions,
): Renderable =>
  M.value(view).pipe(
    M.withReturnType<Renderable>(),
    M.tagsExhaustive({
      Screen: ({ node }) => paintOpenTui(ctx, node, options),
      Menu: ({ menu }) => paintMenu(ctx, menu, options),
    }),
  )

const paintOverlay = (
  ctx: RenderContext,
  layer: Navigation.FrameLayer,
  options: PaintOpenTuiOptions & PaintOpenTuiMenuOptions,
): Renderable =>
  M.value(layer.view).pipe(
    M.withReturnType<Renderable>(),
    M.tagsExhaustive({
      Menu: ({ menu }) => paintMenu(ctx, menu, options),
      Screen: ({ node }) => {
        const overlay = new BoxRenderable(ctx, {
          backgroundColor: '#0f172a',
          border: true,
          left: overlayOffset,
          padding: 1,
          position: 'absolute',
          top: 0,
          zIndex: overlayZIndex,
        })
        overlay.add(paintOpenTui(ctx, node, options))
        return overlay
      },
    }),
  )

/**
 * Paints one navigation frame: where the Program is on its own line, then
 * the base screen with every entry presented over it, floated in order. The action menu paints
 * from its MenuView like {@link paintOpenTuiFrame}.
 *
 * @example
 * ```typescript
 * Option.map(Navigation.frameOf(bound), frame =>
 *   renderer.root.add(paintOpenTuiNavigationFrame(renderer, frame, options)),
 * )
 * ```
 */
export const paintOpenTuiNavigationFrame = (
  ctx: RenderContext,
  frame: Navigation.Frame,
  options: PaintOpenTuiOptions & PaintOpenTuiMenuOptions,
): Renderable => {
  const box = new BoxRenderable(ctx, { flexDirection: 'column', flexGrow: 1 })
  const stage = new BoxRenderable(ctx, {
    flexDirection: 'column',
    flexGrow: 1,
    position: 'relative',
  })
  stage.add(paintView(ctx, frame.base.view, options))
  Array.forEach(frame.overlays, layer => {
    stage.add(paintOverlay(ctx, layer, options))
  })
  box.add(new TextRenderable(ctx, { content: t`${dim(frame.uri)}` }))
  box.add(stage)
  return box
}
