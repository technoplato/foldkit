import { Array, Match as M, Option } from 'effect'

import * as Slot from '../behavior/slot.js'
import {
  type Html,
  OnCustomEvent,
  createKeyedLazy,
  html,
} from '../html/index.js'
import {
  type KeyPlatform,
  type MenuView,
  type TextRun,
  controlHintOf,
  hintAttributesOf,
  keyPlatformOf,
  pickShortcutOf,
} from '../interaction/interaction.js'
import { menuStylesheet } from '../interaction/menuStyles.js'
import { screenStylesheet } from '../interaction/screenStyles.js'
import type { EntryView } from '../navigation/declaration.js'
import { type Frame, type FrameLayer, styleTagOf } from '../navigation/frame.js'
import type { Device } from './device.js'
import {
  againEventName,
  itemMenuMount,
  leftPlayheadEventName,
  passageMenuMount,
  seekFieldMount,
  textAgainMount,
  transcriptMount,
  transcriptPressEventName,
  wordMenuMount,
} from './htmlEdge.js'
import {
  holdAttributesOf,
  slotAttributesOf,
  slotHostMount,
  slotPressEventName,
} from './htmlHost.js'
import { iconGlyphs } from './icons.js'
import { resolveLazyNode } from './lazy.js'
import { type MobilePad, type PadAction, padOf } from './pad.js'
import { submittedTagOf } from './textInput.js'
import { transcriptEntriesOf } from './transcriptEntries.js'
import type {
  BoxNode,
  ListNode,
  MenuAction,
  TextPart,
  TranscriptNode,
  TranscriptPassage,
  TranscriptWord,
  UiNode,
} from './types.js'

/**
 * The Mounts the painted parts carry, for a test of a page that paints a
 * Transcript or a List to name when it answers its Mounts:
 * `Scene.Mount.resolveAll([transcriptMount(), SomeFact()])`.
 */
export {
  itemMenuMount,
  passageMenuMount,
  transcriptMount,
  wordMenuMount,
} from './htmlEdge.js'
export { slotHostMount } from './htmlHost.js'

const browserKeyPlatform = (): KeyPlatform =>
  typeof navigator === 'undefined' ? 'Other' : keyPlatformOf(navigator)

/**
 * A memo slot for the passages of one painted Transcript, made with
 * `createPassageSlots` and kept for the life of the page. With it a
 * passage is drawn again only when the passage itself is a new value, so a
 * long recording costs only the passages that changed on each render, not
 * all of them. One slot serves one Transcript on the page.
 */
export type PassageSlots = ReturnType<typeof createKeyedLazy>

/**
 * Makes the memo slot for the passages of one painted Transcript.
 *
 * @example
 * ```typescript
 * const passageSlots = createPassageSlots()
 * paintHtml(transcript, toMessage, { passageSlots })
 * ```
 */
export const createPassageSlots = (): PassageSlots => createKeyedLazy()

/**
 * How `paintHtml` paints. `passageSlots` keeps a Transcript's passages
 * drawn between renders, for a page whose Transcript is long.
 */
export type PaintHtmlOptions = Readonly<{
  passageSlots?: PassageSlots
}>

const SEALED_BAR_WIDTHS: ReadonlyArray<string> = ['4em', '6em', '2.5em', '5em']

const paintWord = (word: TranscriptWord): Html => {
  const h = html<never>()
  return h.span(
    [
      h.Class('fk-word'),
      h.DataAttribute('token', word.token),
      ...(word.startMs === undefined
        ? []
        : [h.DataAttribute('start-ms', word.startMs.toString())]),
      ...(word.isCurrent === true ? [h.DataAttribute('current', 'true')] : []),
      ...(word.mark === undefined ? [] : [h.DataAttribute('mark', word.mark)]),
    ],
    [`${word.text} `],
  )
}

const paintPassageWords = (passage: TranscriptPassage): Html => {
  const h = html<never>()
  if (passage.sealed !== undefined) {
    return h.p(
      [h.Class('fk-passage-sealed'), h.Title(passage.sealed)],
      [
        h.span([h.Class('fk-sr-only')], [passage.sealed]),
        ...Array.map(SEALED_BAR_WIDTHS, width =>
          h.span(
            [h.Class('fk-sealed-bar'), h.AriaHidden(true), h.Style({ width })],
            [],
          ),
        ),
      ],
    )
  } else if (
    Array.isReadonlyArrayEmpty(passage.words) &&
    passage.text !== undefined
  ) {
    return h.p([h.Class('fk-passage-words')], [passage.text])
  } else {
    return h.p(
      [h.Class('fk-passage-words')],
      Array.map(passage.words, paintWord),
    )
  }
}

// NOTE: a passage is drawn from the passage alone, with no handlers, so a
// page can keep it between renders with `passageSlots`. Its label and its
// words name their presses as attributes, which the edge hears.
const paintPassage = (passage: TranscriptPassage): Html => {
  const h = html<never>()
  return h.article(
    [
      h.Key(`passage:${passage.key}`),
      h.Class('fk-passage'),
      h.DataAttribute('key', passage.key),
      ...(passage.startMs === undefined
        ? []
        : [h.DataAttribute('start-ms', passage.startMs.toString())]),
      ...(passage.isCurrent === true
        ? [h.DataAttribute('current', 'true')]
        : []),
      ...(passage.isFocused === true
        ? [h.DataAttribute('focused', 'true')]
        : []),
      ...(passage.isTentative === true
        ? [h.DataAttribute('tentative', 'true')]
        : []),
    ],
    [
      ...(passage.heading === undefined
        ? []
        : [h.h3([h.Class('fk-passage-heading')], [passage.heading])]),
      ...(passage.speaker === undefined
        ? []
        : [h.p([h.Class('fk-passage-speaker')], [passage.speaker])]),
      passage.labelAction === undefined
        ? h.span([h.Class('fk-passage-label')], [passage.label])
        : h.button(
            [
              h.Type('button'),
              h.Class('fk-passage-label'),
              h.DataAttribute('press', passage.labelAction),
            ],
            [passage.label],
          ),
      paintPassageWords(passage),
    ],
  )
}

/**
 * Paints a Program screen tree as Foldkit HTML. A Button's Catalog `action`,
 * or its legacy `token`, becomes a click through `toMessage`. A Button
 * carries its hint as attributes: what a press does, its keys, and why it
 * is unavailable, which `Interaction.listenForHints` shows.
 */
export const paintHtml = <Message>(
  node: UiNode,
  toMessage: (token: string) => Message | undefined,
  options: PaintHtmlOptions = {},
): Html => {
  const h = html<Message>()
  const hostAttributes = (
    attributes: ReadonlyArray<readonly [name: string, value: string]>,
  ) => Array.map(attributes, ([name, value]) => h.Attribute(name, value))
  const slotPresses = OnCustomEvent<Message>({
    name: slotPressEventName,
    f: event =>
      typeof event.detail === 'string' ? toMessage(event.detail) : undefined,
  })
  const leaveAttributes = (transcript: TranscriptNode) => {
    const maybeLeave =
      transcript.leaveAction === undefined
        ? undefined
        : toMessage(transcript.leaveAction)
    return maybeLeave === undefined
      ? []
      : [
          h.DataAttribute('leave', 'true'),
          OnCustomEvent<Message>({
            name: leftPlayheadEventName,
            f: () => maybeLeave,
          }),
        ]
  }

  const paintMenuItems = (items: ReadonlyArray<MenuAction>): Array<Html> =>
    Array.map(items, item => {
      const message = toMessage(item.action)
      return h.button(
        [
          h.Type('button'),
          h.Role('menuitem'),
          h.Class('fk-word-menu-item'),
          ...(message === undefined ? [] : [h.OnClick(message)]),
        ],
        [
          ...(item.icon === undefined
            ? []
            : [
                h.span(
                  [h.Class('fk-icon'), h.AriaHidden(true)],
                  [iconGlyphs[item.icon]],
                ),
              ]),
          item.label,
        ],
      )
    })

  const paintMenuBackdrop = (dismiss: Message | undefined): Html =>
    h.div(
      [
        h.Class('fk-word-menu-backdrop'),
        h.AriaHidden(true),
        ...(dismiss === undefined ? [] : [h.OnClick(dismiss)]),
      ],
      [],
    )

  // NOTE: the menu a Program holds open on one word. The view draws its
  // items and a backdrop that closes it; the edge puts it by its word and
  // reports Escape. Whether it is open is the Program's.
  const paintWordMenu = (transcript: TranscriptNode): ReadonlyArray<Html> => {
    const menu = transcript.wordMenu
    if (menu === undefined) {
      return []
    }
    const dismiss = toMessage(menu.dismissAction)
    return [
      paintMenuBackdrop(dismiss),
      h.div(
        [
          h.Class('fk-word-menu'),
          h.Role('menu'),
          ...(dismiss === undefined
            ? []
            : [h.OnMount(wordMenuMount<Message>(menu.token, dismiss))]),
        ],
        paintMenuItems(menu.items),
      ),
    ]
  }

  const paintPassageMenu = (
    transcript: TranscriptNode,
  ): ReadonlyArray<Html> => {
    const menu = transcript.passageMenu
    if (menu === undefined) {
      return []
    }
    const dismiss = toMessage(menu.dismissAction)
    const maybePassage = Array.findFirst(
      transcript.passages,
      passage => passage.key === menu.key,
    )
    return [
      paintMenuBackdrop(dismiss),
      h.div(
        [
          h.Class('fk-word-menu'),
          h.Role('menu'),
          ...Array.map(Array.fromOption(maybePassage), passage =>
            h.AriaLabel(`Section at ${passage.label}`),
          ),
          ...(dismiss === undefined
            ? []
            : [h.OnMount(passageMenuMount<Message>(menu.key, dismiss))]),
        ],
        paintMenuItems(menu.items),
      ),
    ]
  }

  // NOTE: the menu a Program holds open on one row of a List, drawn as the
  // word's is and held in a row of its own, so the list stays a list. The
  // edge puts it by its row and reports Escape.
  const paintItemMenu = (list: ListNode): ReadonlyArray<Html> => {
    const menu = list.menu
    if (menu === undefined) {
      return []
    }
    const dismiss = toMessage(menu.dismissAction)
    const maybeTitle = Array.findFirst(
      list.items,
      item => item.key === menu.key,
    )
    return [
      h.li(
        [h.Class('fk-item-menu-host'), h.Role('presentation')],
        [
          paintMenuBackdrop(dismiss),
          h.div(
            [
              h.Class('fk-word-menu'),
              h.Role('menu'),
              ...Array.map(Array.fromOption(maybeTitle), item =>
                h.AriaLabel(item.title),
              ),
              ...(dismiss === undefined
                ? []
                : [h.OnMount(itemMenuMount<Message>(menu.key, dismiss))]),
            ],
            paintMenuItems(menu.items),
          ),
        ],
      ),
    ]
  }
  const paintPart = (part: TextPart): Html | string =>
    M.value(part).pipe(
      M.withReturnType<Html | string>(),
      M.tagsExhaustive({
        Plain: ({ text }) => text,
        Reference: reference => {
          const attributes = [
            h.Class('fk-ref'),
            ...(reference.kind === undefined
              ? []
              : [h.DataAttribute('kind', reference.kind)]),
            ...(reference.state === undefined
              ? []
              : [h.DataAttribute('state', reference.state)]),
            ...(reference.detail === undefined
              ? []
              : [h.Title(Array.join(reference.detail, '\n'))]),
          ]
          const children = [
            h.span([h.Class('fk-ref-label')], [reference.label]),
            ...(reference.title === undefined
              ? []
              : [h.span([h.Class('fk-ref-title')], [reference.title])]),
            ...(reference.state === undefined
              ? []
              : [h.span([h.Class('fk-ref-state')], [reference.state])]),
          ]
          return reference.href === undefined
            ? h.span(attributes, children)
            : h.a([h.Href(reference.href), ...attributes], children)
        },
      }),
    )
  const paintLayer = (
    box: BoxNode,
    layer: NonNullable<BoxNode['layer']>,
  ): Html => {
    const maybeDismiss = Option.fromUndefinedOr(
      layer.dismissToken === undefined
        ? undefined
        : toMessage(layer.dismissToken),
    )
    return h.div(
      [h.Class('fk-layer'), h.DataAttribute('layer', layer.kind)],
      [
        h.div(
          [
            h.Class('fk-layer-backdrop'),
            ...Option.match(maybeDismiss, {
              onNone: () => [],
              onSome: message => [h.OnClick(message)],
            }),
          ],
          [],
        ),
        h.div(
          [
            h.Class('fk-layer-surface'),
            h.Role('dialog'),
            h.AriaModal(layer.kind === 'Dialog'),
            h.AriaLabel(layer.label),
          ],
          Array.map(box.children, paint),
        ),
      ],
    )
  }
  const paint = (current: UiNode): Html =>
    M.value(current).pipe(
      M.withReturnType<Html>(),
      M.tagsExhaustive({
        Text: text => {
          const attributes = [
            h.Class('fk-text'),
            ...(text.label === undefined ? [] : [h.AriaLabel(text.label)]),
            ...(text.dim === true ? [h.DataAttribute('dim', 'true')] : []),
            ...(text.mono === true ? [h.DataAttribute('mono', 'true')] : []),
            ...(text.emphasis === undefined
              ? []
              : [h.DataAttribute('emphasis', text.emphasis)]),
            ...(text.copyable === true
              ? [h.DataAttribute('copyable', 'true')]
              : []),
          ]
          const inner =
            text.image === undefined
              ? text.content
              : h.img([
                  h.Class('fk-image'),
                  h.Src(text.image.src),
                  h.Alt(text.content),
                  h.Width(text.image.width.toString()),
                  h.Height(text.image.height.toString()),
                ])
          if (text.copyable === true) {
            return h.div(attributes, [
              h.span([h.Class('fk-copyable-text')], [text.content]),
            ])
          } else if (text.parts !== undefined && text.image === undefined) {
            return h.div(attributes, Array.map(text.parts, paintPart))
          } else if (text.href === undefined) {
            return h.div(attributes, [inner])
          }
          return h.div(attributes, [
            h.a([h.Href(text.href), h.Class('fk-text-link')], [inner]),
          ])
        },
        Button: button => {
          const key = button.action ?? button.token
          const message = key === undefined ? undefined : toMessage(key)
          const click =
            message !== undefined && button.disabled !== true
              ? [h.OnClick(message)]
              : []
          const disabled = button.disabled === true ? [h.Disabled(true)] : []
          const hint = Option.match(
            controlHintOf(button, browserKeyPlatform(), 'Browser'),
            {
              onNone: () => [],
              onSome: found =>
                Array.map(
                  Object.entries(hintAttributesOf(found)),
                  ([name, value]) => h.Attribute(name, value),
                ),
            },
          )
          const keys =
            button.keys === undefined
              ? []
              : [h.DataAttribute('keys', button.keys.join(' '))]
          const variant =
            button.variant === undefined
              ? []
              : [h.DataAttribute('variant', button.variant)]
          const iconOnly =
            button.isIconOnly === true
              ? [
                  h.DataAttribute('icon-only', 'true'),
                  h.AriaLabel(button.label),
                ]
              : []
          const current =
            button.isCurrent === true
              ? [h.DataAttribute('current', 'true')]
              : []
          const glyph =
            button.icon === undefined
              ? []
              : [
                  h.span(
                    [h.Class('fk-icon'), h.AriaHidden(true)],
                    [iconGlyphs[button.icon]],
                  ),
                ]
          const slot = Option.match(Slot.ofButton(button), {
            onNone: () => [],
            onSome: binding => [
              ...hostAttributes(slotAttributesOf(binding)),
              ...hostAttributes(holdAttributesOf(button.hold)),
              slotPresses,
              h.OnMount(slotHostMount<Message>()),
            ],
          })
          return h.button(
            [
              h.Type('button'),
              h.Class('fk-button'),
              ...click,
              ...disabled,
              ...hint,
              ...keys,
              ...variant,
              ...iconOnly,
              ...current,
              ...slot,
            ],
            [...glyph, ...(button.isIconOnly === true ? [] : [button.label])],
          )
        },
        TextInput: input => {
          const token = input.token
          const messageFromToken = (nextToken: string): Message => {
            const message = toMessage(nextToken)
            if (message !== undefined) {
              return message
            }
            throw new Error(`unknown screen token: ${nextToken}`)
          }
          const submittedMessage = (value: string): Message =>
            Option.getOrThrowWith(
              Option.flatMap(submittedTagOf(input, value), tag =>
                Option.fromNullishOr(toMessage(tag)),
              ),
              () => new Error(`nothing to submit: ${input.action ?? ''}`),
            )
          const againMessage =
            input.againAction === undefined
              ? undefined
              : toMessage(input.againAction)
          const attrs = [
            h.Type('text'),
            h.Class('fk-text-input'),
            h.Value(input.value),
            ...(input.placeholder === undefined
              ? []
              : [h.Placeholder(input.placeholder)]),
            ...(input.label === undefined ? [] : [h.AriaLabel(input.label)]),
            ...(input.focused === true ? [h.Autofocus(true)] : []),
            ...(input.slot === undefined
              ? []
              : hostAttributes(slotAttributesOf(input.slot))),
            ...(token === undefined
              ? []
              : [h.OnInput(value => messageFromToken(`${token}${value}`))]),
            ...(input.action === undefined
              ? []
              : [h.EnterKeyHint('done'), h.OnChange(submittedMessage)]),
            // NOTE: Enter on text the field already shows presses its again
            // action, such as the next match. The edge notices the key and
            // the unchanged text, and the view answers its event.
            ...(againMessage === undefined
              ? []
              : [
                  h.DataAttribute('shown', input.value),
                  OnCustomEvent<Message>({
                    name: againEventName,
                    f: () => againMessage,
                  }),
                  h.OnMount(textAgainMount<Message>()),
                ]),
          ]
          return h.input(attrs)
        },
        Spacer: () => h.div([h.Class('fk-spacer')], []),
        Row: row =>
          h.div(
            [
              h.Class(row.isBoard === true ? 'fk-row fk-board' : 'fk-row'),
              ...(row.arrange === undefined
                ? []
                : [h.DataAttribute('arrange', row.arrange)]),
              ...(row.slot === undefined
                ? []
                : hostAttributes(slotAttributesOf(row.slot))),
            ],
            Array.map(row.children, paint),
          ),
        Column: column =>
          h.div(
            [
              h.Class('fk-column'),
              ...(column.slot === undefined
                ? []
                : hostAttributes(slotAttributesOf(column.slot))),
            ],
            Array.map(column.children, paint),
          ),
        Box: box =>
          box.layer === undefined
            ? h.div(
                [
                  h.Class(box.isDock === true ? 'fk-dock' : 'fk-box'),
                  ...(box.measure === undefined
                    ? []
                    : [h.DataAttribute('measure', box.measure)]),
                  ...(box.slot === undefined
                    ? []
                    : hostAttributes(slotAttributesOf(box.slot))),
                ],
                Array.map(box.children, paint),
              )
            : paintLayer(box, box.layer),
        Progress: progress =>
          h.progress(
            [
              h.Class('fk-progress'),
              h.Max(progress.max.toString()),
              h.Value(progress.value.toString()),
              h.AriaLabel(progress.label),
            ],
            [],
          ),
        List: list =>
          h.ul(
            [
              h.Class('fk-list'),
              h.AriaLabel(list.label),
              ...(Array.some(list.items, item =>
                Option.isSome(Slot.ofItem(item)),
              )
                ? [
                    ...hostAttributes(holdAttributesOf(list.hold)),
                    slotPresses,
                    h.OnMount(slotHostMount<Message>()),
                  ]
                : []),
            ],
            [
              ...Array.map(list.items, item => {
                const message =
                  item.action === undefined ? undefined : toMessage(item.action)
                const pressAttributes =
                  item.href === undefined
                    ? [
                        h.Type('button'),
                        h.Class('fk-item-press'),
                        ...(message === undefined
                          ? [h.Disabled(true)]
                          : [h.OnClick(message)]),
                      ]
                    : [h.Class('fk-item-press'), h.Href(item.href)]
                const press = item.href === undefined ? h.button : h.a
                return h.li(
                  [
                    h.Class('fk-item'),
                    h.DataAttribute('key', item.key),
                    ...(item.isCurrent === true
                      ? [h.DataAttribute('current', 'true')]
                      : []),
                    ...Option.match(Slot.ofItem(item), {
                      onNone: () => [],
                      onSome: binding => [
                        h.DataAttribute('menu', 'true'),
                        ...hostAttributes(slotAttributesOf(binding)),
                      ],
                    }),
                  ],
                  [
                    ...Array.map(Array.fromNullishOr(item.check), check => {
                      const checkMessage =
                        check.action === undefined
                          ? undefined
                          : toMessage(check.action)
                      return h.button(
                        [
                          h.Type('button'),
                          h.Class('fk-item-check'),
                          h.Role('checkbox'),
                          h.AriaChecked(check.isChecked),
                          h.AriaLabel(check.label),
                          ...(check.isChecked
                            ? [h.DataAttribute('checked', 'true')]
                            : []),
                          ...(checkMessage === undefined
                            ? [h.Disabled(true)]
                            : [h.OnClick(checkMessage)]),
                        ],
                        [],
                      )
                    }),
                    press(pressAttributes, [
                      ...(item.image === undefined
                        ? []
                        : [
                            h.img([
                              h.Class('fk-item-image'),
                              h.Src(item.image.src),
                              h.Alt(item.image.alt),
                              h.Width(item.image.width.toString()),
                              h.Height(item.image.height.toString()),
                            ]),
                          ]),
                      h.span(
                        [h.Class('fk-item-body')],
                        [
                          h.span(
                            [h.Class('fk-item-title')],
                            item.titleMark === undefined
                              ? [item.title]
                              : [
                                  item.title.slice(0, item.titleMark.start),
                                  h.mark(
                                    [h.Class('fk-item-mark')],
                                    [
                                      item.title.slice(
                                        item.titleMark.start,
                                        item.titleMark.end,
                                      ),
                                    ],
                                  ),
                                  item.title.slice(item.titleMark.end),
                                ],
                          ),
                          ...Array.map(item.lines ?? [], line =>
                            h.span([h.Class('fk-item-line')], [line]),
                          ),
                          ...(item.progress === undefined
                            ? []
                            : [
                                h.progress(
                                  [
                                    h.Class('fk-progress'),
                                    h.Max(item.progress.max.toString()),
                                    h.Value(item.progress.value.toString()),
                                  ],
                                  [],
                                ),
                              ]),
                        ],
                      ),
                      ...Array.map(item.columns ?? [], column =>
                        h.span([h.Class('fk-item-column')], [column]),
                      ),
                    ]),
                    ...Array.map(item.trailing ?? [], paint),
                  ],
                )
              }),
              ...paintItemMenu(list),
            ],
          ),
        Seek: seek => {
          const messageAt = (value: string): Message => {
            const message = toMessage(`${seek.action}:${value}`)
            if (message !== undefined) {
              return message
            }
            throw new Error(`unknown seek: ${seek.action}:${value}`)
          }
          const bar = h.input([
            h.Type('range'),
            h.Class('fk-seek'),
            h.Min((seek.min ?? 0).toString()),
            h.Max(seek.max.toString()),
            h.Step(seek.step.toString()),
            h.Value(seek.value.toString()),
            h.AriaLabel(seek.label),
            h.AriaValuetext(seek.valueText),
            ...(seek.disabled === true
              ? [h.Disabled(true)]
              : [h.OnChange(messageAt)]),
          ])
          // NOTE: a bar that names what a drag lands on is painted beside a
          // place for the name; the view says the landings, and the edge
          // shows the one under the drag. A bar with none is the bar alone.
          return seek.landings === undefined || seek.landings.length === 0
            ? bar
            : h.span(
                [
                  h.Class('fk-seek-field'),
                  h.DataAttribute('landings', JSON.stringify(seek.landings)),
                  h.OnMount(seekFieldMount<Message>()),
                ],
                [
                  bar,
                  h.output([h.Class('fk-seek-landing'), h.Hidden(true)], []),
                ],
              )
        },
        Transcript: transcript =>
          h.section(
            [
              h.Class('fk-transcript'),
              h.AriaLabel(transcript.label),
              // NOTE: the view says the clock and whether a word has a menu;
              // the edge reads on from the clock, moving the mark on the
              // word between reports, and opens the menu on a long press.
              ...(transcript.clock === undefined
                ? []
                : [
                    h.DataAttribute(
                      'clock-place-ms',
                      transcript.clock.placeMs.toString(),
                    ),
                    h.DataAttribute(
                      'clock-at-ms',
                      transcript.clock.atMs.toString(),
                    ),
                    h.DataAttribute(
                      'clock-rate',
                      transcript.clock.rate.toString(),
                    ),
                  ]),
              // NOTE: the words carry no handlers. The edge hears every
              // press on them with one listener and sends the press event,
              // which the view answers here.
              h.DataAttribute('word-action', transcript.action),
              // NOTE: a word's menu is asked through the words' one binding.
              // The second button stays with the edge's own listener, which
              // leaves a right click on selected words to the browser; a
              // hold is the host's, told to core's rule.
              ...Option.match(Slot.ofWords(transcript), {
                onNone: () => [],
                onSome: binding => [
                  ...Array.map(
                    Array.filter(
                      binding.gestures,
                      each => each.gesture === 'PressedSecondary',
                    ),
                    each => h.DataAttribute('word-menu-action', each.press),
                  ),
                  ...hostAttributes(
                    Array.filter(
                      slotAttributesOf(binding, 'data-token'),
                      ([name]) => name !== 'data-slot-secondary',
                    ),
                  ),
                  ...hostAttributes(holdAttributesOf(transcript.hold)),
                ],
              }),
              OnCustomEvent<Message>({
                name: transcriptPressEventName,
                f: event =>
                  typeof event.detail === 'string'
                    ? toMessage(event.detail)
                    : undefined,
              }),
              // NOTE: whether the words follow the voice, and which word to
              // show, are the Program's; the edge keeps the spoken word in
              // the middle and sends this event when the reader scrolls it
              // away, which the view answers with the leave press.
              h.DataAttribute(
                'following',
                transcript.isFollowing === false ? 'false' : 'true',
              ),
              ...(transcript.focusToken === undefined
                ? []
                : [h.DataAttribute('focus-token', transcript.focusToken)]),
              ...leaveAttributes(transcript),
              h.OnMount(transcriptMount<Message>()),
            ],
            [
              ...(Array.isReadonlyArrayNonEmpty(transcript.passages)
                ? []
                : [
                    h.p(
                      [h.Class('fk-transcript-empty')],
                      [transcript.emptyText],
                    ),
                  ]),
              // NOTE: the timeline's order is the shared reading's: each
              // passage, and what sits between the passages at its time.
              ...Array.map(transcriptEntriesOf(transcript), entry => {
                if (entry._tag === 'ItemEntry') {
                  return h.aside(
                    [
                      h.Key(`item:${entry.item.key}`),
                      h.Class('fk-transcript-item'),
                      h.DataAttribute('key', entry.item.key),
                    ],
                    [
                      h.span([h.Class('fk-passage-label')], [entry.item.label]),
                      paint(entry.item.node),
                    ],
                  )
                }
                return options.passageSlots === undefined
                  ? paintPassage(entry.passage)
                  : options.passageSlots(entry.passage.key, paintPassage, [
                      entry.passage,
                    ])
              }),
              ...paintWordMenu(transcript),
              ...paintPassageMenu(transcript),
            ],
          ),
        DeviceShell: shell =>
          h.div(
            [h.Class(`fk-device fk-device-${shell.device}`)],
            Array.map(shell.children, paint),
          ),
        Lazy: lazy => paint(resolveLazyNode(lazy)),
      }),
    )
  return paint(node)
}

/** Screen, Action catalog, and token dispatch for a mobile Host. */
export type MobilePaintOptions<Model, Message> = Readonly<{
  screen: (model: Model, context?: Readonly<{ device?: Device }>) => UiNode
  actions: (
    model: Model,
    context?: Readonly<{ device?: Device }>,
  ) => ReadonlyArray<PadAction>
  toMessage: (token: string) => Message | undefined
  device?: Device
}>

const paintPadControl = <Message>(
  className: string,
  label: string,
  token: string,
  toMessage: (token: string) => Message | undefined,
): Html => {
  const h = html<Message>()
  const message = toMessage(token)
  const click = message === undefined ? [] : [h.OnClick(message)]
  return h.button([h.Type('button'), h.Class(className), ...click], [label])
}

/**
 * Paints a Program screen plus the pad derived from that tree.
 * Pad taps send the same tokens CLI argv and the TUI keymap send.
 */
export const paintMobile = <Message>(
  screen: UiNode,
  pad: MobilePad,
  toMessage: (token: string) => Message | undefined,
): Html => {
  const h = html<Message>()
  return h.div(
    [h.Class('fk-mobile')],
    [
      h.div([h.Class('fk-mobile-screen')], [paintHtml(screen, toMessage)]),
      h.div(
        [h.Class('fk-mobile-pad')],
        [
          h.div(
            [h.Class('fk-mobile-keys')],
            Array.map(pad.keys, key =>
              paintPadControl('fk-mobile-key', key.key, key.token, toMessage),
            ),
          ),
          h.div(
            [h.Class('fk-mobile-buttons')],
            Array.map(pad.buttons, button =>
              paintPadControl(
                'fk-mobile-button',
                button.label,
                button.token,
                toMessage,
              ),
            ),
          ),
        ],
      ),
    ],
  )
}

/**
 * Paints any Program.screen with phone chrome and a pad from that tree.
 * The Host supplies token dispatch. This is not a second product.
 */
export const paintMobileScreen = <Model, Message>(
  model: Model,
  options: MobilePaintOptions<Model, Message>,
): Html => {
  const device = options.device ?? 'phone'
  const context = { device }
  const screen = options.screen(model, context)
  return paintMobile(
    screen,
    padOf(screen, options.actions(model, context)),
    options.toMessage,
  )
}

const menuRowIdOf = (tag: string): string => `fk-action-menu-${tag}`

const menuListId = 'fk-action-menu-list'

/** The Messages a painted action menu reports. */
export type MenuMessages<Message> = Readonly<{
  typed: (query: string) => Message
  chose: (tag: string) => Message
  dismissed: () => Message
}>

/**
 * Paints a presented action menu as Foldkit HTML: a backdrop, a combo box
 * filter, a listbox of Catalog rows with matched letters marked and their
 * shortcut keys, a live summary for screen readers, and a footer of the
 * keys that work right now. It carries `Interaction.menuStylesheet`, so the
 * menu looks right with no app CSS. Keys are routed separately by
 * `Interaction.listenToDocumentKeys`; the filter only carries typing.
 *
 * @example
 * ```typescript
 * Option.match(interaction.menu(model), {
 *   onNone: () => [],
 *   onSome: menu => [paintMenuHtml(menu, gestureMessages)],
 * })
 * ```
 */
export const paintMenuHtml = <Message>(
  menu: MenuView,
  messages: MenuMessages<Message>,
): Html => {
  const h = html<Message>()
  const runs = (
    textRuns: ReadonlyArray<TextRun>,
  ): ReadonlyArray<Html | string> =>
    Array.map(textRuns, run =>
      run.isMatch
        ? h.mark([h.Class('fk-action-menu-match')], [run.text])
        : run.text,
    )
  const platform = browserKeyPlatform()
  const keys = (keyLabels: ReadonlyArray<string>): ReadonlyArray<Html> =>
    Array.map(keyLabels, key => h.kbd([h.Class('fk-action-menu-key')], [key]))
  const activeDescendant = Option.match(
    Array.findFirst(menu.rows, row => row.isHighlighted),
    {
      onNone: () => [],
      onSome: row => [h.AriaActiveDescendant(menuRowIdOf(row.entry.tag))],
    },
  )
  const rows = Array.map(menu.rows, row =>
    h.li(
      [
        h.Id(menuRowIdOf(row.entry.tag)),
        h.Role('option'),
        h.Class('fk-action-menu-row'),
        h.AriaSelected(row.isHighlighted),
        h.AriaDisabled(row.entry.availability._tag === 'Disabled'),
        h.DataAttribute('focused', row.isFocused ? 'true' : 'false'),
        h.DataAttribute('nested', row.isNested ? 'true' : 'false'),
        h.DataAttribute(
          'first-unavailable',
          row.isFirstUnavailable ? 'true' : 'false',
        ),
        h.OnClick(messages.chose(row.entry.tag)),
      ],
      [
        h.span(
          [h.Class('fk-action-menu-text')],
          [
            h.span([h.Class('fk-action-menu-label')], runs(row.title)),
            h.span([h.Class('fk-action-menu-what')], runs(row.description)),
            ...M.value(row.entry.availability).pipe(
              M.withReturnType<ReadonlyArray<Html>>(),
              M.tagsExhaustive({
                Enabled: () => [],
                Disabled: ({ because }) => [
                  h.span([h.Class('fk-action-menu-because')], [because]),
                ],
              }),
            ),
          ],
        ),
        ...Array.match(row.keys, {
          onEmpty: () => [],
          onNonEmpty: rowKeys => [
            h.span(
              [
                h.Class('fk-action-menu-keys'),
                h.AriaHidden(true),
                h.DataAttribute('hint', menu.rowKeysHint),
              ],
              keys(rowKeys),
            ),
          ],
        }),
        ...Array.fromOption(
          Option.map(
            Option.flatMap(row.maybePick, pick =>
              pickShortcutOf(pick, platform, 'Browser'),
            ),
            shortcut =>
              h.kbd(
                [h.Class('fk-action-menu-pick'), h.AriaHidden(true)],
                [shortcut],
              ),
          ),
        ),
      ],
    ),
  )
  return h.div(
    [h.Class('fk-action-menu-layer')],
    [
      h.style([], [menuStylesheet]),
      h.div(
        [
          h.Class('fk-action-menu-backdrop'),
          h.AriaHidden(true),
          h.OnClick(messages.dismissed()),
        ],
        [],
      ),
      h.div(
        [
          h.Role('dialog'),
          h.AriaModal(true),
          h.AriaLabelledBy('fk-action-menu-title'),
          h.Class('fk-action-menu'),
          h.DataAttribute('style', menu.style._tag),
          h.DataAttribute('keys-live', menu.areRowKeysLive ? 'true' : 'false'),
        ],
        [
          h.h2(
            [h.Id('fk-action-menu-title'), h.Class('fk-action-menu-title')],
            [menu.title],
          ),
          h.input([
            h.Role('combobox'),
            h.AriaExpanded(true),
            h.AriaControls(menuListId),
            h.AriaAutocomplete('list'),
            h.AriaLabel(menu.filterLabel),
            h.Placeholder(menu.filterLabel),
            h.Autocomplete('off'),
            h.Spellcheck(false),
            h.Class('fk-action-menu-filter'),
            h.Value(menu.query),
            h.Readonly(!menu.isFilterFocused),
            h.Autofocus(true),
            h.OnInput(messages.typed),
            ...activeDescendant,
          ]),
          h.ul(
            [
              h.Id(menuListId),
              h.Role('listbox'),
              h.AriaLabel(menu.title),
              h.Class('fk-action-menu-rows'),
            ],
            rows,
          ),
          ...Array.match(menu.rows, {
            onEmpty: () => [
              h.p([h.Class('fk-action-menu-empty')], [menu.summary]),
            ],
            onNonEmpty: () => [],
          }),
          h.p(
            [
              h.Class('fk-action-menu-status'),
              h.Role('status'),
              h.AriaLive('polite'),
            ],
            [menu.summary],
          ),
          h.p(
            [h.Class('fk-action-menu-footer'), h.AriaHidden(true)],
            [
              ...Array.map(menu.hints, hint =>
                h.span(
                  [h.Class('fk-action-menu-hint')],
                  [...keys(hint.keys), hint.does],
                ),
              ),
              h.span([h.Class('fk-action-menu-count')], [menu.summary]),
            ],
          ),
        ],
      ),
    ],
  )
}

/**
 * Paints a Program's Starting or Failed description as Foldkit HTML with
 * the shared screen styles, so a host writes no status text of its own.
 *
 * @example
 * ```typescript
 * paintStatusHtml('Starting Counter…')
 * // <style>…</style><p class="fk-status" role="status">Starting Counter…</p>
 * ```
 */
export const paintStatusHtml = <Message>(
  description: string,
): ReadonlyArray<Html> => {
  const h = html<Message>()
  return [
    h.style([], [screenStylesheet]),
    h.p([h.Class('fk-status'), h.Role('status')], [description]),
  ]
}

/** The Messages a painted navigation frame reports. */
export type FrameMessages<Message> = Readonly<{
  toMessage: (token: string) => Message | undefined
  menu: MenuMessages<Message>
}>

/**
 * Paints a navigation frame as Foldkit HTML: the shared screen styles,
 * the base screen, then each entry presented over it. A presented screen
 * sits in a dialog whose `data-style` names its presentation; the action
 * menu paints as {@link paintMenuHtml}.
 *
 * @example
 * ```typescript
 * Option.match(Interaction.frameOfModel(SyncedCounter, model), {
 *   onNone: () => [],
 *   onSome: frame => paintFrameHtml(frame, { toMessage, menu: gestures }),
 * })
 * ```
 */
export const paintFrameHtml = <Message>(
  frame: Frame,
  messages: FrameMessages<Message>,
): ReadonlyArray<Html> => {
  const h = html<Message>()
  const paintView = (view: EntryView): Html =>
    M.value(view).pipe(
      M.withReturnType<Html>(),
      M.tagsExhaustive({
        Screen: ({ node }) => paintHtml(node, messages.toMessage),
        Menu: ({ menu }) => paintMenuHtml(menu, messages.menu),
      }),
    )
  const paintOverlay = (layer: FrameLayer): Html =>
    M.value(layer.view).pipe(
      M.withReturnType<Html>(),
      M.tagsExhaustive({
        Screen: () =>
          h.div(
            [
              h.Role('dialog'),
              h.AriaModal(true),
              h.Class('fk-overlay'),
              h.DataAttribute('style', styleTagOf(layer)),
              h.DataAttribute('key', layer.key),
            ],
            [paintView(layer.view)],
          ),
        Menu: () => paintView(layer.view),
      }),
    )
  return [
    h.style([], [screenStylesheet]),
    paintView(frame.base.view),
    ...Array.map(frame.overlays, paintOverlay),
  ]
}
