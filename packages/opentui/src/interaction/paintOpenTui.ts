import { Array, Match as M, Option } from 'effect'
import { Interaction, type Navigation } from 'foldkit'
import {
  type ButtonNode,
  type ListItem,
  type TextNode,
  type TranscriptPassage,
  type UiNode,
  progressLineOf,
  seekLineOf,
} from 'foldkit/renderers'

import {
  BoxRenderable,
  type RenderContext,
  type Renderable,
  StyledText,
  type TextChunk,
  TextRenderable,
  bg,
  bold,
  dim,
  fg,
  stringToStyledText,
  t,
  underline,
} from '@opentui/core'

const buttonPaddingX = 1

const textContentOf = (text: TextNode): StyledText => {
  if (text.dim === true) {
    return t`${dim(text.content)}`
  } else if (text.emphasis === 'Display' || text.emphasis === 'Headline') {
    return t`${bold(text.content)}`
  } else {
    return stringToStyledText(text.content)
  }
}

/** How a painted OpenTUI tree reports presses. */
export type PaintOpenTuiOptions = Readonly<{
  onPress: (button: ButtonNode) => void
}>

/** How a painted action menu reports choices and dismissal. */
export type PaintOpenTuiMenuOptions = Readonly<{
  onChoose: (tag: string) => void
  onDismiss: () => void
}>

const barWidth = 60

const passageLabelWidth = 8

const currentWordColor = '#9a3412'

const currentWordBackground = '#fed7aa'

const pressOf = (action: string, label: string): ButtonNode => ({
  _tag: 'Button',
  label,
  action,
})

const paintItem = (
  ctx: RenderContext,
  item: ListItem,
  options: PaintOpenTuiOptions,
): Renderable => {
  const action = item.action
  const row = new BoxRenderable(ctx, {
    flexDirection: 'row',
    columnGap: 2,
    ...(item.focused === true ? { backgroundColor: focusColor } : {}),
  })
  const title = new BoxRenderable(ctx, {
    ...(action === undefined
      ? {}
      : {
          onMouseDown: () => {
            options.onPress(pressOf(action, item.title))
          },
        }),
  })
  title.add(
    new TextRenderable(ctx, {
      content:
        item.isCurrent === true
          ? t`${bold(fg(matchColor)(`• ${item.title}`))}`
          : t`${bold(`  ${item.title}`)}`,
    }),
  )
  row.add(title)
  Array.match(item.lines ?? [], {
    onEmpty: () => undefined,
    onNonEmpty: lines => {
      row.add(
        new TextRenderable(ctx, {
          content: t`${dim(Array.join(lines, ' · '))}`,
        }),
      )
    },
  })
  return addChildren(ctx, row, item.trailing ?? [], options)
}

const paintPassage = (
  ctx: RenderContext,
  passage: TranscriptPassage,
  options: PaintOpenTuiOptions,
): Renderable => {
  const row = new BoxRenderable(ctx, { flexDirection: 'row' })
  const labelAction = passage.labelAction
  const label = new BoxRenderable(ctx, {
    width: passageLabelWidth,
    ...(labelAction === undefined
      ? {}
      : {
          onMouseDown: () => {
            options.onPress(pressOf(labelAction, passage.label))
          },
        }),
  })
  label.add(
    new TextRenderable(ctx, {
      content:
        passage.isCurrent === true
          ? t`${bold(`›${passage.label}`)}`
          : t`${dim(` ${passage.label}`)}`,
    }),
  )
  row.add(label)
  const chunks = Array.flatMap(passage.words, (word, index) => [
    ...(index === 0 ? [] : stringToStyledText(' ').chunks),
    ...(word.isCurrent === true
      ? [bg(currentWordBackground)(fg(currentWordColor)(bold(word.text)))]
      : stringToStyledText(word.text).chunks),
  ])
  const words = new TextRenderable(ctx, {
    content: new StyledText([...chunks]),
    wrapMode: 'word',
    flexGrow: 1,
    flexShrink: 1,
  })
  row.add(words)
  return row
}

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
 * with its sentence, and the highlighted one gets a heavy, colored border.
 */
export const paintOpenTui = (
  ctx: RenderContext,
  node: UiNode,
  options: PaintOpenTuiOptions,
): Renderable =>
  M.value(node).pipe(
    M.withReturnType<Renderable>(),
    M.tagsExhaustive({
      Text: text => new TextRenderable(ctx, { content: textContentOf(text) }),
      Button: button => {
        const isPressable = button.disabled !== true
        const box = new BoxRenderable(ctx, {
          border: true,
          ...(button.focused === true
            ? { borderStyle: 'heavy', borderColor: matchColor }
            : {}),
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
      Progress: progress =>
        new TextRenderable(ctx, {
          content: t`${dim(progressLineOf(progress, barWidth))}`,
        }),
      List: list => {
        const column = new BoxRenderable(ctx, { flexDirection: 'column' })
        Array.forEach(list.items, item => {
          column.add(paintItem(ctx, item, options))
        })
        return column
      },
      Seek: seek =>
        new TextRenderable(ctx, { content: seekLineOf(seek, barWidth) }),
      Transcript: transcript => {
        const column = new BoxRenderable(ctx, {
          flexDirection: 'column',
          rowGap: 1,
        })
        Array.match(transcript.passages, {
          onEmpty: () => {
            column.add(
              new TextRenderable(ctx, {
                content: t`${dim(transcript.emptyText)}`,
              }),
            )
          },
          onNonEmpty: passages => {
            Array.forEach(passages, passage => {
              column.add(paintPassage(ctx, passage, options))
            })
          },
        })
        return column
      },
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

const focusColor = '#1d4ed8'

const menuBackground = '#0f172a'

const menuLeft = 2

const menuChrome = menuLeft + 4

const chunksOf = (run: Interaction.TerminalRun): ReadonlyArray<TextChunk> =>
  M.value(run.tone).pipe(
    M.withReturnType<ReadonlyArray<TextChunk>>(),
    M.when('Plain', () => stringToStyledText(run.text).chunks),
    M.when('Strong', () => [bold(run.text)]),
    M.when('Quiet', () => [dim(run.text)]),
    M.when('Match', () => [underline(fg(matchColor)(bold(run.text)))]),
    M.exhaustive,
  )

const paintMenuLine = (
  ctx: RenderContext,
  line: Interaction.TerminalLine,
  options: PaintOpenTuiMenuOptions,
): Renderable => {
  const lineBox = new BoxRenderable(ctx, {
    ...(line.isFocused ? { backgroundColor: focusColor } : {}),
    ...Option.match(line.maybeChoice, {
      onNone: () => ({}),
      onSome: tag => ({
        onMouseDown: () => {
          options.onChoose(tag)
        },
      }),
    }),
  })
  lineBox.add(
    new TextRenderable(ctx, {
      content: new StyledText([...Array.flatMap(line.runs, chunksOf)]),
      wrapMode: 'none',
    }),
  )
  return lineBox
}

const paintMenu = (
  ctx: RenderContext,
  menu: Interaction.MenuView,
  options: PaintOpenTuiMenuOptions,
): Renderable => {
  const overlay = new BoxRenderable(ctx, {
    backgroundColor: menuBackground,
    border: true,
    left: menuLeft,
    padding: 1,
    position: 'absolute',
    top: 0,
    zIndex: 20,
  })
  Array.forEach(
    Interaction.terminalMenuLines(menu, ctx.width - menuChrome),
    line => {
      overlay.add(paintMenuLine(ctx, line, options))
    },
  )
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
          backgroundColor: menuBackground,
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
