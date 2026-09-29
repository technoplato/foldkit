import { Array, Match as M, Option, Schema as S } from 'effect'
import { type Html, html } from 'foldkit/html'
import type { Message } from 'words-core-example'

import { type IconName, icon } from './icon.js'

/** How a button presents: the one filled action, tinted, gray, or plain text. */
export const ButtonStyle = S.Literals([
  'Prominent',
  'Tinted',
  'Gray',
  'Plain',
  'Destructive',
])
/** How a button presents. */
export type ButtonStyle = typeof ButtonStyle.Type

const buttonBase =
  'inline-flex min-h-11 select-none items-center justify-center gap-2 rounded-full px-5 text-[15px] font-semibold transition duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100'

/** The classes for a button of a given style. */
export const buttonClass = (style: ButtonStyle): string =>
  M.value(style).pipe(
    M.withReturnType<string>(),
    M.when(
      'Prominent',
      () =>
        `${buttonBase} bg-accent text-white shadow-[0_1px_2px_rgb(0_0_0/0.12)] hover:bg-accent-strong`,
    ),
    M.when(
      'Tinted',
      () => `${buttonBase} bg-tint-soft text-tint hover:brightness-95`,
    ),
    M.when(
      'Gray',
      () => `${buttonBase} bg-fill text-label hover:bg-fill-strong`,
    ),
    M.when('Plain', () => `${buttonBase} px-3 text-tint hover:bg-tint-soft`),
    M.when(
      'Destructive',
      () => `${buttonBase} bg-accent-soft text-accent hover:brightness-95`,
    ),
    M.exhaustive,
  )

/** A button with an optional leading icon. */
export const button = (
  label: string,
  message: Message,
  style: ButtonStyle,
  maybeIcon: Option.Option<IconName> = Option.none(),
  isDisabled = false,
): Html => {
  const h = html<Message>()
  return h.button(
    [
      h.Type('button'),
      h.OnClick(message),
      h.Disabled(isDisabled),
      h.Class(buttonClass(style)),
    ],
    [
      ...Option.toArray(
        Option.map(maybeIcon, name => icon(name, 'size-[18px]')),
      ),
      h.span([], [label]),
    ],
  )
}

/** A 44 point round button that shows only an icon; `label` names it for assistive technology. */
export const iconButton = (
  label: string,
  name: IconName,
  message: Message,
  className = 'bg-fill text-label hover:bg-fill-strong',
): Html => {
  const h = html<Message>()
  return h.button(
    [
      h.Type('button'),
      h.AriaLabel(label),
      h.Title(label),
      h.OnClick(message),
      h.Class(
        `inline-flex size-11 shrink-0 items-center justify-center rounded-full transition duration-150 active:scale-95 ${className}`,
      ),
    ],
    [icon(name)],
  )
}

/** The tone of a status badge. */
export const BadgeTone = S.Literals(['Live', 'Positive', 'Caution', 'Neutral'])
/** The tone of a status badge. */
export type BadgeTone = typeof BadgeTone.Type

/** A small status capsule; `Live` shows a breathing dot. */
export const badge = (tone: BadgeTone, text: string): Html => {
  const h = html<Message>()
  const toneClass = M.value(tone).pipe(
    M.withReturnType<string>(),
    M.when('Live', () => 'bg-accent text-white'),
    M.when('Positive', () => 'bg-positive-soft text-positive'),
    M.when('Caution', () => 'bg-caution-soft text-caution'),
    M.when('Neutral', () => 'bg-fill text-secondary'),
    M.exhaustive,
  )
  return h.span(
    [
      h.Class(
        `inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-semibold tracking-wide ${toneClass}`,
      ),
    ],
    [
      ...(tone === 'Live'
        ? [
            h.span(
              [h.Class('size-1.5 rounded-full bg-white animate-breathe')],
              [],
            ),
          ]
        : []),
      text,
    ],
  )
}

/** A small activity indicator, like the system spinner. */
export const spinner = (className = 'size-4 text-secondary'): Html => {
  const h = html<Message>()
  return h.svg(
    [
      h.ViewBox('0 0 24 24'),
      h.Class(`${className} animate-spin-slow`),
      h.AriaHidden(true),
      h.Fill('none'),
    ],
    [
      h.circle(
        [
          h.Cx('12'),
          h.Cy('12'),
          h.R('9'),
          h.Stroke('currentColor'),
          h.StrokeWidth('2.5'),
          h.StrokeOpacity('0.2'),
        ],
        [],
      ),
      h.path(
        [
          h.D('M21 12a9 9 0 00-9-9'),
          h.Stroke('currentColor'),
          h.StrokeWidth('2.5'),
          h.StrokeLinecap('round'),
        ],
        [],
      ),
    ],
  )
}

/** A grouped list's title, in title case like iOS 26 lists. */
export const groupTitle = (text: string): Html => {
  const h = html<Message>()
  return h.h2(
    [h.Class('px-4 pb-2 pt-7 text-[13px] font-semibold text-secondary')],
    [text],
  )
}

/** A grouped list's footnote. */
export const groupFootnote = (children: ReadonlyArray<Html | string>): Html => {
  const h = html<Message>()
  return h.p(
    [h.Class('px-4 pt-2 text-[13px] leading-5 text-secondary')],
    children,
  )
}

/** A rounded group of rows separated by inset hairlines, like an inset grouped list. */
export const group = (rows: ReadonlyArray<Html>): Html => {
  const h = html<Message>()
  return h.div(
    [
      h.Class(
        'card overflow-hidden rounded-[22px] [&>*+*]:border-t [&>*+*]:border-separator',
      ),
    ],
    rows,
  )
}

/** One row of a grouped list: an optional icon, a title, a detail, and trailing content. */
export const groupRow = (
  title: string,
  detail: ReadonlyArray<Html | string>,
  maybeLeading: Option.Option<Html> = Option.none(),
  trailing: ReadonlyArray<Html> = [],
): Html => {
  const h = html<Message>()
  return h.div(
    [h.Class('flex min-h-12 items-center gap-3 px-4 py-2.5')],
    [
      ...Option.toArray(maybeLeading),
      h.div(
        [h.Class('flex min-w-0 flex-1 flex-col gap-0.5')],
        [
          h.span([h.Class('text-[15px] text-label')], [title]),
          ...Array.match(detail, {
            onEmpty: () => [],
            onNonEmpty: children => [
              h.span(
                [h.Class('break-words text-[13px] leading-5 text-secondary')],
                children,
              ),
            ],
          }),
        ],
      ),
      ...trailing,
    ],
  )
}

/** A rounded tile behind a row's icon, colored like Settings icons. */
export const rowIcon = (name: IconName, colorClass: string): Html => {
  const h = html<Message>()
  return h.span(
    [
      h.Class(
        `inline-flex size-8 shrink-0 items-center justify-center rounded-[9px] text-white ${colorClass}`,
      ),
    ],
    [icon(name, 'size-[18px]')],
  )
}

const initialsOf = (email: string): string => {
  const name = Option.getOrElse(Array.head(email.split('@')), () => email)
  const letters = name.replace(/[^a-zA-Z]/g, '').slice(0, 2)
  if (letters !== '') {
    return letters.toUpperCase()
  } else {
    return (name.slice(0, 1) || '?').toUpperCase()
  }
}

/** A round avatar with the email's initials. */
export const avatar = (
  email: string,
  className = 'size-8 text-[13px]',
): Html => {
  const h = html<Message>()
  return h.span(
    [
      h.AriaHidden(true),
      h.Class(
        `inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#ff8a65] to-[#ff3b30] font-semibold text-white ${className}`,
      ),
    ],
    [initialsOf(email)],
  )
}
