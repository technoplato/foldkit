import { Array, Match as M, Option } from 'effect'
import {
  type ListItem,
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
  TextRenderable,
  bg,
  bold,
  dim,
  fg,
  stringToStyledText,
  t,
} from '@opentui/core'

const buttonPaddingX = 1

const barWidth = 60

const passageLabelWidth = 8

const matchColor = '#a5b4fc'

const focusColor = '#1d4ed8'

const currentWordColor = '#9a3412'

const currentWordBackground = '#fed7aa'

/** Wires Button tokens to taps and key hints. */
export type PaintOpenTuiOptions = Readonly<{
  keysForToken: (token: string) => ReadonlyArray<string>
  onTap: (token: string) => void
}>

const keyHint = (
  label: string,
  token: string | undefined,
  keysForToken: PaintOpenTuiOptions['keysForToken'],
): string => {
  if (token === undefined) {
    return label
  }
  return Option.getOrElse(Array.head(keysForToken(token)), () => label)
}

const addChildren = (
  ctx: RenderContext,
  parent: Renderable,
  children: ReadonlyArray<UiNode>,
  options: PaintOpenTuiOptions,
): Renderable => {
  for (const child of children) {
    parent.add(paintOpenTui(ctx, child, options))
  }
  return parent
}

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
            options.onTap(action)
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
            options.onTap(labelAction)
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
  row.add(
    new TextRenderable(ctx, {
      content: new StyledText([...chunks]),
      wrapMode: 'word',
      flexGrow: 1,
      flexShrink: 1,
    }),
  )
  return row
}

/**
 * Maps a Program screen tree to an OpenTUI renderable tree. A Button
 * becomes a bordered box: its key hint comes from the Action `keys`
 * metadata and a mouse press taps its token. The painter makes zero
 * business decisions; a Button absent from the tree is simply never
 * constructed.
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
        const hint = keyHint(button.label, button.token, options.keysForToken)
        const name = button.token === undefined ? button.label : button.token
        const isTappable =
          button.token !== undefined && button.disabled !== true
        const token = button.token
        const box = new BoxRenderable(ctx, {
          border: true,
          paddingLeft: buttonPaddingX,
          paddingRight: buttonPaddingX,
          ...(isTappable && token !== undefined
            ? {
                onMouseDown: () => {
                  options.onTap(token)
                },
              }
            : {}),
        })
        box.add(
          new TextRenderable(ctx, {
            content:
              button.disabled === true
                ? t`${dim(`[${hint}] ${name}`)}`
                : t`${bold(`[${hint}]`)} ${name}`,
          }),
        )
        return box
      },
      TextInput: input => new TextRenderable(ctx, { content: input.value }),
      Spacer: spacer => new BoxRenderable(ctx, { height: spacer.rows }),
      Row: row =>
        addChildren(
          ctx,
          new BoxRenderable(ctx, {
            flexDirection: 'row',
            columnGap: row.gap,
          }),
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
            title: shell.title === undefined ? shell.device : shell.title,
          }),
          shell.children,
          options,
        ),
    }),
  )
