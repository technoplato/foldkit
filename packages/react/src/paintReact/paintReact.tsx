import { Array, Match as M, Option } from 'effect'
import { Interaction, Navigation } from 'foldkit'
import { Placement, Slot, TranscriptFollow } from 'foldkit/behavior'
import {
  type BoxLayer,
  type BoxNode,
  type ButtonNode,
  type IconName,
  type ItemCheck,
  type ItemMenu,
  type ListItem,
  type ListNode,
  type MenuAction,
  type PlacedBookmark,
  type ReferencePart,
  type SeekNode,
  type SpokenUnit,
  type TextEmbed,
  type TextInputNode,
  type TextNode,
  type TextPart,
  type TranscriptNode,
  type TranscriptPassage,
  type UiNode,
  bookmarksInPassage,
  filterListItems,
  groupedItemsOf,
  iconDrawings,
  isClearedOnSubmit,
  isSubmittedOnLeave,
  resolveLazyNode,
  seekLandingAt,
  spokenUnitAt,
  submittedTagOf,
  transcriptAt,
  transcriptEntriesOf,
} from 'foldkit/renderers'
import {
  type DragEvent,
  Fragment,
  type ReactElement,
  type ReactNode,
  createContext,
  memo,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { SlotHost, holdPropsOf, slotPropsOf, useSlotHost } from './host.js'

/** Extra class per node kind, appended after the fk-* base class. */
export type PaintClassNames = Partial<Record<UiNode['_tag'], string>>

/**
 * What a host's embed draws from: its embed, and the Text it stands in
 * for, whose words and link are what to show when the view cannot load.
 */
export type EmbedProps = Readonly<{
  embed: TextEmbed
  text: TextNode
}>

/**
 * The live views a host draws, by embed kind, such as a Google Books
 * preview for `GoogleBooksPreview`. A Text whose embed has no view here
 * paints as its words.
 */
export type EmbedPainters = Readonly<
  Record<string, (props: EmbedProps) => ReactElement>
>

const noEmbedPainters: EmbedPainters = {}

const EmbedPaintersContext = createContext<EmbedPainters>(noEmbedPainters)

/**
 * Gives every tree painted inside the host's embeds, so a Text with an
 * embed of a registered kind shows that live view.
 *
 * @example
 * ```tsx
 * <EmbedPaintersProvider value={{ GoogleBooksPreview }}>
 *   <NavigationFrame />
 * </EmbedPaintersProvider>
 * ```
 */
export const EmbedPaintersProvider = EmbedPaintersContext.Provider

const EmbedView = ({
  embed,
  text,
  children,
}: Readonly<{
  embed: TextEmbed
  text: TextNode
  children: ReactElement
}>): ReactElement => {
  const painters = useContext(EmbedPaintersContext)
  const Painter = painters[embed.kind]
  return Painter === undefined ? (
    children
  ) : (
    <Painter embed={embed} text={text} />
  )
}

const copiedResetMs = 1500

const CopyButton = ({ text }: Readonly<{ text: string }>): ReactElement => {
  const [isCopied, setIsCopied] = useState(false)
  useEffect(() => {
    if (!isCopied) {
      return undefined
    }
    const timer = setTimeout(() => {
      setIsCopied(false)
    }, copiedResetMs)
    return () => {
      clearTimeout(timer)
    }
  }, [isCopied])
  return (
    <button
      type="button"
      className="fk-copy-button"
      title={text}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setIsCopied(true)
        })
      }}
    >
      {Interaction.copyButtonLabelOf(isCopied)}
    </button>
  )
}

/** One icon from the shared set, drawn in the text color. */
const Icon = ({ name }: Readonly<{ name: IconName }>): ReactElement => {
  const drawing = iconDrawings[name]
  return (
    <svg
      className="fk-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {Array.map(drawing.strokes, (path, index) => (
        <path key={`stroke-${index.toString()}`} d={path} />
      ))}
      {Array.map(drawing.fills, (path, index) => (
        <path
          key={`fill-${index.toString()}`}
          d={path}
          fill="currentColor"
          stroke="none"
        />
      ))}
      {drawing.figure === undefined ? null : (
        <text
          className="fk-icon-figure"
          x="12"
          y="14.5"
          textAnchor="middle"
          fill="currentColor"
          stroke="none"
        >
          {drawing.figure}
        </text>
      )}
    </svg>
  )
}

const dockHeightProperty = '--fk-dock-height'

const draggedRowType = 'application/x-fk-row'

/**
 * A box pinned to the bottom of the screen. It keeps the page's bottom
 * padding at its own height, so nothing on the page is hidden under it.
 */
const DockBox = ({
  className,
  children,
}: Readonly<{ className: string; children: ReactNode }>): ReactElement => {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const dock = ref.current
    if (dock === null) {
      return undefined
    }
    const root = document.documentElement
    const observer = new ResizeObserver(() => {
      root.style.setProperty(
        dockHeightProperty,
        `${dock.getBoundingClientRect().height.toString()}px`,
      )
    })
    observer.observe(dock)
    return () => {
      observer.disconnect()
      root.style.removeProperty(dockHeightProperty)
    }
  }, [])
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}

const layerSurfaceClass = 'fk-layer-surface'

const focusedElement = (): Option.Option<HTMLElement> =>
  typeof document !== 'undefined' &&
  document.activeElement instanceof HTMLElement
    ? Option.some(document.activeElement)
    : Option.none()

const isKeyboardOnPage = (): boolean =>
  document.activeElement === null || document.activeElement === document.body

/**
 * A layer's surface. It takes the keyboard when it opens, unless a field in it
 * already did, so Enter and the arrows act on the layer and never press a
 * control behind it, such as the chip that opened it. When its contents
 * change and the keyboard falls to the page, it takes it back. When it closes
 * it gives the keyboard back to what had it before, unless something else took
 * the keyboard meanwhile.
 */
const LayerSurface = ({
  children,
  className,
  kind,
  label,
}: Readonly<{
  children: ReactNode
  className: string
  kind: BoxLayer['kind']
  label: string
}>): ReactElement => {
  const ref = useRef<HTMLDivElement>(null)
  const [maybeOpener] = useState(focusedElement)
  useEffect(() => {
    const surface = ref.current
    if (surface !== null && !surface.contains(document.activeElement)) {
      surface.focus({ preventScroll: true })
    }
    return () => {
      Option.map(maybeOpener, opener => {
        if (opener.isConnected && isKeyboardOnPage()) {
          opener.focus({ preventScroll: true })
        }
      })
    }
  }, [maybeOpener])
  useEffect(() => {
    const surface = ref.current
    if (surface !== null && isKeyboardOnPage()) {
      surface.focus({ preventScroll: true })
    }
  })
  return (
    <div
      ref={ref}
      tabIndex={-1}
      className={className}
      role="dialog"
      aria-modal={kind === 'Dialog'}
      aria-label={label}
      data-layer={kind}
    >
      {children}
    </div>
  )
}

const browserKeyPlatform = (): Interaction.KeyPlatform =>
  typeof navigator === 'undefined'
    ? 'Other'
    : Interaction.keyPlatformOf(navigator)

/**
 * The attributes that carry a Button's hint: what a press does, the keys
 * that press it in a browser, and why it is unavailable.
 */
const hintPropsOf = (button: ButtonNode): Interaction.HintAttributes =>
  Option.match(
    Interaction.controlHintOf(button, browserKeyPlatform(), 'Browser'),
    { onNone: () => ({}), onSome: Interaction.hintAttributesOf },
  )

/**
 * Moves the keyboard off a control, such as a button a person clicked, when
 * the page takes a key from it: to the open layer's surface when the control
 * is inside one, so Enter picks the marked row, else to the page, so Enter
 * after `j` opens the row under the cursor and does not press the control
 * again. A host binding keys calls it before it sends the key's token.
 */
export const moveKeyboardOffControl = (control: HTMLElement): void => {
  const surface = control.closest(`.${layerSurfaceClass}`)
  if (surface instanceof HTMLElement) {
    surface.focus({ preventScroll: true })
  } else {
    control.blur()
  }
}

const pressOf = (action: string, label: string): ButtonNode => ({
  _tag: 'Button',
  label,
  action,
})

/**
 * A seek bar. It follows the Program's place until a person grabs it,
 * shows where they drag, and presses `SeekTo:<value>` once, when they let
 * go, so dragging never restarts the audio at every step. While they
 * drag, it names what the drag will land on, such as the paragraph
 * there, from the bar's own landings.
 */
const SeekBar = ({
  seek,
  className,
  onPress,
}: Readonly<{
  seek: SeekNode
  className: string
  onPress: (button: ButtonNode) => void
}>): ReactElement => {
  const ref = useRef<HTMLInputElement>(null)
  const [maybeDragged, setMaybeDragged] = useState<Option.Option<number>>(
    Option.none(),
  )
  useEffect(() => {
    const input = ref.current
    if (input === null) {
      return undefined
    }
    const commit = (): void => {
      setMaybeDragged(Option.none())
      onPress(pressOf(`${seek.action}:${input.value}`, seek.label))
    }
    input.addEventListener('change', commit)
    return () => {
      input.removeEventListener('change', commit)
    }
  }, [seek.action, seek.label, onPress])
  const maybeLanding = Option.flatMap(maybeDragged, dragged =>
    seekLandingAt(seek, dragged),
  )
  return (
    <>
      <input
        ref={ref}
        type="range"
        className={className}
        min={seek.min ?? 0}
        max={seek.max}
        step={seek.step}
        value={Option.getOrElse(maybeDragged, () => seek.value)}
        disabled={seek.disabled === true}
        aria-label={seek.label}
        aria-valuetext={Option.match(maybeLanding, {
          onNone: () => seek.valueText,
          onSome: landing => landing.text,
        })}
        onChange={event => {
          setMaybeDragged(Option.some(Number(event.currentTarget.value)))
        }}
      />
      {Option.match(maybeLanding, {
        onNone: () => null,
        onSome: landing => (
          <output className="fk-seek-landing">{landing.text}</output>
        ),
      })}
    </>
  )
}

/**
 * A text field that presses its Action when it is submitted: on Enter,
 * and for a field that edits, such as a title, when a person leaves it
 * after a change. It holds what is typed until then, as the seek bar holds
 * a drag, so typing never sends a Message per keystroke, and a field that
 * adds, such as `New reminder`, empties for the next entry. Enter on text
 * that has not changed presses the field's `againAction` when it has one,
 * such as the next match of a search.
 */
const TextField = ({
  input,
  className,
  onPress,
}: Readonly<{
  input: TextInputNode
  className: string
  onPress: (button: ButtonNode) => void
}>): ReactElement => {
  const [draft, setDraft] = useState(input.value)
  const lastSubmitted = useRef<Option.Option<string>>(Option.none())
  useEffect(() => {
    setDraft(input.value)
  }, [input.value])
  const againAction = input.againAction
  const isUnchanged = draft.trim() !== '' && draft.trim() === input.value.trim()
  const submit = (how: 'Enter' | 'Leave'): void => {
    if (how === 'Enter' && againAction !== undefined && isUnchanged) {
      onPress(pressOf(againAction, input.label ?? input.placeholder ?? draft))
      return
    }
    if (Option.contains(lastSubmitted.current, draft)) {
      return
    }
    const maybeTag = submittedTagOf(input, draft)
    if (Option.isSome(maybeTag)) {
      lastSubmitted.current = Option.some(draft)
      onPress(
        pressOf(maybeTag.value, input.label ?? input.placeholder ?? draft),
      )
    }
    if (isClearedOnSubmit(input)) {
      lastSubmitted.current = Option.none()
      setDraft('')
    }
  }
  return (
    <form
      className="fk-text-form"
      onSubmit={event => {
        event.preventDefault()
        submit('Enter')
      }}
    >
      <input
        type="text"
        className={className}
        value={draft}
        placeholder={input.placeholder}
        aria-label={input.label}
        autoFocus={input.focused === true}
        enterKeyHint="done"
        onChange={event => {
          lastSubmitted.current = Option.none()
          setDraft(event.currentTarget.value)
        }}
        onBlur={() => {
          if (isSubmittedOnLeave(input)) {
            submit('Leave')
          }
        }}
      />
    </form>
  )
}

const pressOfToken = (token: string, label: string): ButtonNode => ({
  _tag: 'Button',
  label,
  token,
})

/**
 * A text field that sends every keystroke. It takes the focus when the Model
 * says `focused`, and with a `blurToken` lets go of it when the Model stops
 * saying so, and it tells the Model when it gains and loses the focus.
 */
const TokenField = ({
  input,
  className,
  onPress,
  onInput,
}: Readonly<{
  input: TextInputNode
  className: string
  onPress: (button: ButtonNode) => void
  onInput: ((token: string, value: string) => void) | undefined
}>): ReactElement => {
  const ref = useRef<HTMLInputElement>(null)
  const isFocused = input.focused === true
  const token = input.token
  const focusToken = input.focusToken
  const blurToken = input.blurToken
  const label = input.label ?? input.placeholder ?? ''
  const isBlurredByModel = blurToken !== undefined
  useEffect(() => {
    const field = ref.current
    if (field === null) {
      return
    }
    const isActive = document.activeElement === field
    if (isFocused && !isActive) {
      field.focus()
    } else if (!isFocused && isActive && isBlurredByModel) {
      field.blur()
    }
  }, [isFocused, isBlurredByModel])
  return (
    <input
      ref={ref}
      type="text"
      className={className}
      value={input.value}
      placeholder={input.placeholder}
      aria-label={input.label}
      autoFocus={isFocused}
      onChange={event => {
        if (token !== undefined && onInput !== undefined) {
          onInput(token, event.currentTarget.value)
        }
      }}
      onFocus={
        focusToken === undefined
          ? undefined
          : () => {
              onPress(pressOfToken(focusToken, label))
            }
      }
      onBlur={
        blurToken === undefined
          ? undefined
          : () => {
              onPress(pressOfToken(blurToken, label))
            }
      }
    />
  )
}

/**
 * The round box at the start of a list row a person ticks, such as a
 * reminder's completion circle: a checkbox that presses its Action, or its
 * extend Action with Shift held.
 */
const CheckButton = ({
  check,
  onPress,
}: Readonly<{
  check: ItemCheck
  onPress: (button: ButtonNode) => void
}>): ReactElement => {
  const action = check.action
  const extendAction = check.extendAction
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={check.isChecked}
      aria-label={check.label}
      className="fk-item-check"
      data-checked={check.isChecked ? true : undefined}
      disabled={action === undefined}
      onClick={
        action === undefined
          ? undefined
          : event => {
              onPress(
                pressOf(
                  event.shiftKey && extendAction !== undefined
                    ? extendAction
                    : action,
                  check.label,
                ),
              )
            }
      }
    />
  )
}

const currentTokenOf = (passage: TranscriptPassage): string | undefined =>
  Option.getOrUndefined(
    Option.map(
      Array.findFirst(passage.words, word => word.isCurrent === true),
      word => word.token,
    ),
  )

const noBookmarks: ReadonlyArray<PlacedBookmark> = []

/**
 * What tells one passage's bookmarks from another's between paints:
 * each one's word, note and press, so a passage repaints when a bookmark on it
 * is made, noted or removed, and not when one elsewhere is.
 */
const bookmarksKeyOf = (bookmarks: ReadonlyArray<PlacedBookmark>): string =>
  Array.join(
    Array.map(
      bookmarks,
      ({ token, bookmark }) =>
        `${token}|${bookmark.note ?? ''}|${bookmark.action ?? ''}|${bookmark.label}`,
    ),
    '\n',
  )

const marksOf = (passage: TranscriptPassage): string =>
  Array.join(
    Array.flatMap(passage.words, word =>
      word.mark === undefined ? [] : [`${word.token}:${word.mark}`],
    ),
    ' ',
  )

const PassageView = memo(
  ({
    passage,
    action,
    bookmarks,
    onPress,
  }: Readonly<{
    passage: TranscriptPassage
    action: string
    bookmarks: ReadonlyArray<PlacedBookmark>
    onPress: (button: ButtonNode) => void
  }>): ReactElement => {
    const labelAction = passage.labelAction
    const bookmarkOf = (token: string): Option.Option<PlacedBookmark> =>
      Array.findFirst(bookmarks, placed => placed.token === token)
    const pressBookmark = (placed: PlacedBookmark): void => {
      const bookmarkAction = placed.bookmark.action
      if (bookmarkAction !== undefined) {
        onPress(pressOf(bookmarkAction, placed.bookmark.label))
      }
    }
    return (
      <article
        className="fk-passage"
        data-current={passage.isCurrent === true ? true : undefined}
      >
        {passage.heading === undefined ? null : (
          <h3 className="fk-passage-heading">{passage.heading}</h3>
        )}
        {passage.speaker === undefined ? null : (
          <p className="fk-passage-speaker">{passage.speaker}</p>
        )}
        {labelAction === undefined ? (
          <span className="fk-passage-label">{passage.label}</span>
        ) : (
          <button
            type="button"
            className="fk-passage-label"
            onClick={() => {
              onPress(pressOf(labelAction, passage.label))
            }}
          >
            {passage.label}
          </button>
        )}
        <p className="fk-passage-words">
          {Array.map(passage.words, word => {
            const maybeBookmark = bookmarkOf(word.token)
            return (
              <span
                key={word.token}
                className="fk-word"
                data-token={word.token}
                data-current={word.isCurrent === true ? true : undefined}
                data-mark={word.mark}
                data-ribbon={Option.isSome(maybeBookmark) ? true : undefined}
                onClick={() => {
                  onPress(pressOf(`${action}:${word.token}`, word.text))
                }}
              >
                {Option.match(maybeBookmark, {
                  onNone: () => null,
                  onSome: placed => (
                    <button
                      type="button"
                      className="fk-word-ribbon"
                      aria-label={placed.bookmark.label}
                      title={placed.bookmark.note ?? placed.bookmark.label}
                      onClick={event => {
                        event.stopPropagation()
                        pressBookmark(placed)
                      }}
                    />
                  ),
                })}
                {`${word.text} `}
              </span>
            )
          })}
        </p>
        {Array.map(
          Array.filter(bookmarks, placed => placed.bookmark.note !== undefined),
          placed => (
            <button
              key={placed.token}
              type="button"
              className="fk-passage-note"
              onClick={() => {
                pressBookmark(placed)
              }}
            >
              {placed.bookmark.note}
            </button>
          ),
        )}
      </article>
    )
  },
  (before, after) =>
    before.passage.key === after.passage.key &&
    before.passage.heading === after.passage.heading &&
    before.passage.speaker === after.passage.speaker &&
    before.passage.isCurrent === after.passage.isCurrent &&
    before.passage.words.length === after.passage.words.length &&
    currentTokenOf(before.passage) === currentTokenOf(after.passage) &&
    marksOf(before.passage) === marksOf(after.passage) &&
    before.action === after.action &&
    bookmarksKeyOf(before.bookmarks) === bookmarksKeyOf(after.bookmarks) &&
    before.onPress === after.onPress,
)

const sightOf = (
  root: HTMLElement,
  word: HTMLElement,
): TranscriptFollow.Sight => {
  const isScrollArea = root.scrollHeight > root.clientHeight
  const view = isScrollArea
    ? root.getBoundingClientRect()
    : { top: 0, height: window.innerHeight }
  const bounds = word.getBoundingClientRect()
  return {
    top: bounds.top,
    bottom: bounds.bottom,
    viewStart: view.top,
    viewSize: view.height,
  }
}

/**
 * Brings a word to the middle of the transcript: inside the transcript's
 * own scroll area when it has one, so the controls above stay put, else
 * in the window.
 */
const centerWord = (root: HTMLElement, word: HTMLElement): void => {
  const isScrollArea = root.scrollHeight > root.clientHeight
  if (isScrollArea) {
    const view = root.getBoundingClientRect()
    const bounds = word.getBoundingClientRect()
    root.scrollTo({
      top: root.scrollTop + (bounds.top - view.top) - root.clientHeight / 2,
      behavior: 'smooth',
    })
  } else {
    word.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }
}

const wordIn = (root: HTMLElement, token: string): HTMLElement | null =>
  root.querySelector<HTMLElement>(`[data-token="${CSS.escape(token)}"]`)

const wordAnchorOf =
  (root: () => HTMLElement | null, token: string) => (): Element | null => {
    const container = root()
    return container === null ? null : wordIn(container, token)
  }

/**
 * Words to read along with. It keeps the word sounding in the middle of
 * the window as it moves, and lets a person scroll away to read ahead: it
 * follows again a few seconds after they stop.
 */
const liveWordEveryMs = 50

const spokenKeyOf = (unit: SpokenUnit): string =>
  unit._tag === 'SpokenWord' ? `word:${unit.token}` : `passage:${unit.key}`

/**
 * A Transcript as it reads right now. While its clock runs, what is being
 * spoken (a word, or a passage with no words) is read from the clock many
 * times a second and the Transcript is marked again only when that
 * changes, so the mark moves on the word while the Program hears the place
 * once a second. A Transcript with no clock, or one standing still, is
 * painted as given.
 */
const useLiveTranscript = (transcript: TranscriptNode): TranscriptNode => {
  const isRunning = transcript.clock !== undefined && transcript.clock.rate > 0
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    if (!isRunning) {
      return
    }
    setNowMs(Date.now())
    const timer = setInterval(() => {
      setNowMs(Date.now())
    }, liveWordEveryMs)
    return () => {
      clearInterval(timer)
    }
  }, [isRunning])
  const liveUnit = isRunning
    ? Option.getOrUndefined(
        Option.map(spokenUnitAt(transcript, nowMs), spokenKeyOf),
      )
    : undefined
  return useMemo(
    () =>
      liveUnit === undefined ? transcript : transcriptAt(transcript, nowMs),
    // NOTE: `nowMs` is left out on purpose: the Transcript is marked again
    // when what is spoken changes, not on every tick of the clock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transcript, liveUnit],
  )
}

/**
 * A menu the Program holds open on one part of the page, such as a word
 * or a list row, drawn by that part: its items as a menu, a press outside
 * or Escape closing it. `anchor` finds the part and `anchorKey` names it,
 * so the menu is placed again only when it opens on another part. It is
 * named `label`, or else for the part's own words. It draws only what it
 * is given and presses what a person picks; whether it is open is the
 * Program's.
 */
const AnchoredMenu = ({
  items,
  dismissAction,
  anchorKey,
  anchor,
  label,
  onPress,
}: Readonly<{
  items: ReadonlyArray<MenuAction>
  dismissAction: string
  anchorKey: string
  anchor: () => Element | null
  label?: string | undefined
  onPress: (button: ButtonNode) => void
}>): ReactElement => {
  const ref = useRef<HTMLDivElement>(null)
  const [anchorText, setAnchorText] = useState('')
  const dismiss = (): void => {
    onPress(pressOf(dismissAction, 'Close'))
  }
  useLayoutEffect(() => {
    const part = anchor()
    const panel = ref.current
    if (part === null || panel === null) {
      return
    }
    // NOTE: where the menu goes is core's to say. This measures the two
    // rectangles and puts the menu there before the browser paints, so it
    // is never drawn at the corner first.
    const placed = Placement.place({
      anchor: part.getBoundingClientRect(),
      size: panel.getBoundingClientRect(),
      view: { width: window.innerWidth, height: window.innerHeight },
    })
    panel.style.left = `${placed.left.toString()}px`
    panel.style.top = `${placed.top.toString()}px`
    setAnchorText(part.textContent?.trim() ?? '')
    // NOTE: `anchor` is a stable reader of the page; the menu is placed
    // again only when it opens on another part.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchorKey])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onPress(pressOf(dismissAction, 'Close'))
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [dismissAction, onPress])
  return (
    <>
      <div className="fk-word-menu-backdrop" aria-hidden onClick={dismiss} />
      <div
        ref={ref}
        role="menu"
        aria-label={label ?? anchorText}
        className="fk-word-menu"
      >
        {Array.map(items, item => (
          <button
            key={item.action}
            type="button"
            role="menuitem"
            className="fk-word-menu-item"
            onClick={() => {
              onPress(pressOf(item.action, item.label))
            }}
          >
            {item.icon === undefined ? null : <Icon name={item.icon} />}
            {item.label}
          </button>
        ))}
      </div>
    </>
  )
}

/**
 * Words to read along with. While the Transcript says the view follows
 * the word sounding, it keeps that word in the middle as it moves. When a
 * person scrolls it out of the middle it tells the Program, with the
 * Transcript's `leaveAction`, and from then the view stays where they put
 * it until the Program says it follows again: it never pulls the view
 * back by itself. A `focusToken` is brought to the middle once, when it
 * is named. A Transcript with no `leaveAction` follows again a few
 * seconds after a person stops scrolling, as before. A secondary click or
 * a long press on a word asks the Program for the word's menu, and the
 * menu the Program holds is drawn by its word.
 */
const TranscriptView = ({
  transcript: given,
  className,
  onPress,
  paintNode,
}: Readonly<{
  transcript: TranscriptNode
  className: string
  onPress: (button: ButtonNode) => void
  paintNode: (node: UiNode) => ReactElement
}>): ReactElement => {
  const transcript = useLiveTranscript(given)
  const entries = useMemo(() => transcriptEntriesOf(transcript), [transcript])
  const ref = useRef<HTMLElement>(null)
  const follow = useRef<TranscriptFollow.Running | undefined>(undefined)
  const maybeCurrentToken = Array.findFirst(
    Array.flatMap(transcript.passages, passage =>
      Array.fromNullishOr(currentTokenOf(passage)),
    ),
    () => true,
  )
  const currentToken = Option.getOrUndefined(maybeCurrentToken)
  const isFollowing = transcript.isFollowing !== false
  const leaveAction = transcript.leaveAction
  const focusToken = transcript.focusToken
  const isFocusWordHere =
    focusToken !== undefined &&
    Array.some(transcript.passages, passage =>
      Array.some(passage.words, word => word.token === focusToken),
    )
  const live = useRef({
    currentToken,
    focusToken,
    isFollowing,
    leaveAction,
    onPress,
  })
  live.current = { currentToken, focusToken, isFollowing, leaveAction, onPress }
  // NOTE: when to follow, when to leave the view alone and when the reader
  // has left are `TranscriptFollow`'s to say, as for every painter. This
  // is the browser's part: it measures, scrolls, listens and presses.
  useEffect(() => {
    const wordOf = (token: string | undefined): HTMLElement | null => {
      const root = ref.current
      return root === null || token === undefined ? null : wordIn(root, token)
    }
    const running = TranscriptFollow.start({
      now: () => Date.now(),
      wait: (afterMs, elapsed) => {
        const timer = setTimeout(elapsed, afterMs)
        return () => {
          clearTimeout(timer)
        }
      },
      told: () => ({
        isFollowing: live.current.isFollowing,
        hasLeave: live.current.leaveAction !== undefined,
      }),
      measure: (_purpose, answer) => {
        const root = ref.current
        const word = wordOf(live.current.currentToken)
        if (root !== null && word !== null) {
          answer(Option.some(sightOf(root, word)))
        }
      },
      bringToMiddle: which => {
        const root = ref.current
        const word = wordOf(
          which === 'Spoken'
            ? live.current.currentToken
            : live.current.focusToken,
        )
        if (root !== null && word !== null) {
          centerWord(root, word)
        }
      },
      pressLeave: () => {
        const now = live.current
        if (now.leaveAction !== undefined) {
          now.onPress(pressOf(now.leaveAction, 'Read elsewhere'))
        }
      },
    })
    follow.current = running
    const noteReaderScroll = (): void => {
      running.tell(TranscriptFollow.ScrolledByReader())
    }
    const noteScroll = (): void => {
      running.tell(TranscriptFollow.ScrolledView())
    }
    const root = ref.current
    window.addEventListener('wheel', noteReaderScroll, { passive: true })
    window.addEventListener('touchmove', noteReaderScroll, { passive: true })
    window.addEventListener('scroll', noteScroll, { passive: true })
    root?.addEventListener('scroll', noteScroll, { passive: true })
    return () => {
      running.stop()
      follow.current = undefined
      window.removeEventListener('wheel', noteReaderScroll)
      window.removeEventListener('touchmove', noteReaderScroll)
      window.removeEventListener('scroll', noteScroll)
      root?.removeEventListener('scroll', noteScroll)
    }
  }, [])
  const wasFollowing = useRef(isFollowing)
  useEffect(() => {
    const isFollowingAgain = isFollowing && !wasFollowing.current
    wasFollowing.current = isFollowing
    follow.current?.tell(
      isFollowingAgain
        ? TranscriptFollow.ResumedFollowing()
        : TranscriptFollow.ChangedSpokenWord(),
    )
  }, [currentToken, isFollowing])
  useEffect(() => {
    if (focusToken !== undefined && isFocusWordHere) {
      follow.current?.tell(TranscriptFollow.NamedWord())
    }
  }, [focusToken, isFocusWordHere])
  useSlotHost(ref, press => {
    onPress(pressOf(press, 'Word menu'))
  })
  const wordSlotProps = Option.match(Slot.ofWords(transcript), {
    onNone: () => ({}),
    onSome: binding => slotPropsOf(binding, 'data-token'),
  })
  return (
    <>
      <section
        ref={ref}
        className={className}
        aria-label={transcript.label}
        data-following={isFollowing ? undefined : 'false'}
        {...wordSlotProps}
        {...holdPropsOf(transcript.hold)}
      >
        {Array.match(entries, {
          onEmpty: () => (
            <p className="fk-transcript-empty">{transcript.emptyText}</p>
          ),
          onNonEmpty: timelineEntries =>
            Array.map(timelineEntries, entry =>
              entry._tag === 'ItemEntry' ? (
                <aside
                  key={entry.item.key}
                  className="fk-transcript-item"
                  data-key={entry.item.key}
                >
                  <span className="fk-passage-label">{entry.item.label}</span>
                  {paintNode(entry.item.node)}
                </aside>
              ) : (
                <PassageView
                  key={entry.passage.key}
                  passage={entry.passage}
                  action={transcript.action}
                  bookmarks={
                    transcript.bookmarks === undefined
                      ? noBookmarks
                      : bookmarksInPassage(entry.passage, transcript.bookmarks)
                  }
                  onPress={onPress}
                />
              ),
            ),
        })}
      </section>
      {transcript.wordMenu === undefined ? null : (
        <AnchoredMenu
          items={transcript.wordMenu.items}
          dismissAction={transcript.wordMenu.dismissAction}
          anchorKey={transcript.wordMenu.token}
          anchor={wordAnchorOf(() => ref.current, transcript.wordMenu.token)}
          onPress={onPress}
        />
      )}
    </>
  )
}

/**
 * One list row. A current row scrolls to the middle of its list when the
 * list first paints, so a long chapter list opens on the chapter playing,
 * and into view when it becomes current later.
 */
const ListRow = ({
  item,
  children,
}: Readonly<{
  item: ListItem
  children: ReactNode
}>): ReactElement => {
  const ref = useRef<HTMLLIElement>(null)
  const hasPainted = useRef(false)
  const isCurrent = item.isCurrent === true
  const isDraggable = item.isDraggable === true
  useEffect(() => {
    if (isCurrent) {
      ref.current?.scrollIntoView({
        block: hasPainted.current ? 'nearest' : 'center',
      })
    }
    hasPainted.current = true
  }, [isCurrent])
  return (
    <li
      ref={ref}
      className="fk-item"
      data-key={item.key}
      {...Option.match(Slot.ofItem(item), {
        onNone: () => ({}),
        onSome: binding => ({ 'data-menu': true, ...slotPropsOf(binding) }),
      })}
      data-current={isCurrent ? true : undefined}
      draggable={isDraggable ? true : undefined}
      onDragStart={
        isDraggable
          ? event => {
              event.dataTransfer.setData(draggedRowType, item.key)
              event.dataTransfer.effectAllowed = 'move'
            }
          : undefined
      }
    >
      {children}
    </li>
  )
}

/**
 * The pressable part of a list row: a link when the row has `href`, so a
 * person can open, copy, or share it like any link, else a button that
 * presses the row's action.
 */
const ItemPress = ({
  item,
  onPress,
  onLink,
  children,
}: Readonly<{
  item: ListItem
  onPress: (button: ButtonNode) => void
  onLink: ((href: string) => boolean) | undefined
  children: ReactNode
}>): ReactElement => {
  const href = item.href
  const action = item.action
  if (href !== undefined) {
    return (
      <a
        className="fk-item-press"
        href={href}
        onClick={event => {
          if (
            Navigation.isPlainClick(event) &&
            onLink !== undefined &&
            onLink(href)
          ) {
            event.preventDefault()
          }
        }}
      >
        {children}
      </a>
    )
  } else {
    return (
      <button
        type="button"
        className="fk-item-press"
        disabled={action === undefined}
        onClick={
          action === undefined
            ? undefined
            : () => {
                onPress(pressOf(action, item.title))
              }
        }
      >
        {children}
      </button>
    )
  }
}

/**
 * One whole list row. A row object that did not change paints nothing, when
 * the host's handlers stay the same across paints: moving a cursor through
 * 1,500 rows repaints two, and a live change to one Issue repaints one.
 */
const ListRowView = memo(
  ({
    item,
    onPress,
    onLink,
    paintChildren,
  }: Readonly<{
    item: ListItem
    onPress: (button: ButtonNode) => void
    onLink: ((href: string) => boolean) | undefined
    paintChildren: (
      children: ReadonlyArray<UiNode>,
    ) => ReadonlyArray<ReactElement>
  }>): ReactElement => (
    <ListRow item={item}>
      {item.check === undefined ? null : (
        <CheckButton check={item.check} onPress={onPress} />
      )}
      <ItemPress item={item} onPress={onPress} onLink={onLink}>
        {item.image === undefined ? null : (
          <img
            className="fk-item-image"
            src={item.image.src}
            alt={item.image.alt}
            width={item.image.width}
            height={item.image.height}
            loading="lazy"
          />
        )}
        <span className="fk-item-body">
          <span className="fk-item-title">
            {item.titleMark === undefined ? (
              item.title
            ) : (
              <>
                {item.title.slice(0, item.titleMark.start)}
                <mark className="fk-item-mark">
                  {item.title.slice(item.titleMark.start, item.titleMark.end)}
                </mark>
                {item.title.slice(item.titleMark.end)}
              </>
            )}
            {item.badge === undefined ? null : (
              <span className="fk-item-badge" aria-label={item.badge.label}>
                {item.badge.text}
              </span>
            )}
          </span>
          {Array.map(item.lines ?? [], (line, index) => (
            <span key={index} className="fk-item-line">
              {line}
            </span>
          ))}
          {item.progress === undefined ? null : (
            <progress
              className="fk-progress"
              max={item.progress.max}
              value={item.progress.value}
            />
          )}
        </span>
        {Array.map(item.columns ?? [], (column, index) => (
          <span key={index} className="fk-item-column">
            {column}
          </span>
        ))}
      </ItemPress>
      {paintChildren(item.trailing ?? [])}
    </ListRow>
  ),
  (before, after) =>
    before.item === after.item &&
    before.onPress === after.onPress &&
    before.onLink === after.onLink,
)

const rowIn = (root: HTMLElement, key: string): HTMLElement | null =>
  root.querySelector<HTMLElement>(`.fk-item[data-key="${CSS.escape(key)}"]`)

const menuLabelOf = (
  items: ReadonlyArray<ListItem>,
  menu: ItemMenu,
): string | undefined =>
  Option.getOrUndefined(
    Option.map(
      Array.findFirst(items, item => item.key === menu.key),
      item => item.title,
    ),
  )

/**
 * The rows of a List. A secondary click or a long press on a row with a
 * `menuAction` asks the Program for the row's menu, and the menu the
 * Program holds is drawn by its row, named for the row's title.
 */
const RowsList = ({
  list,
  className,
  dropAttributes,
  onPress,
  children,
}: Readonly<{
  list: ListNode
  className: string
  dropAttributes: Readonly<{
    onDragOver?: (event: DragEvent<HTMLUListElement>) => void
    onDrop?: (event: DragEvent<HTMLUListElement>) => void
  }>
  onPress: (button: ButtonNode) => void
  children: ReactNode
}>): ReactElement => {
  const ref = useRef<HTMLUListElement>(null)
  useSlotHost(ref, press => {
    onPress(pressOf(press, list.label))
  })
  const menu = list.menu
  return (
    <>
      <ul
        ref={ref}
        className={className}
        aria-label={list.label}
        {...dropAttributes}
        {...holdPropsOf(list.hold)}
      >
        {children}
      </ul>
      {menu === undefined ? null : (
        <AnchoredMenu
          items={menu.items}
          dismissAction={menu.dismissAction}
          anchorKey={menu.key}
          anchor={() =>
            ref.current === null ? null : rowIn(ref.current, menu.key)
          }
          label={menuLabelOf(list.items, menu)}
          onPress={onPress}
        />
      )}
    </>
  )
}

const firstRowPressSelector = '.fk-item-press:not(:disabled)'

/**
 * A List with a head over its rows: a field that narrows the rows as a
 * person types, when the List has a `filter`, and the names of the rows'
 * columns, when it has `columns`. What is typed lives here, like a text
 * field's draft: the Program hears nothing until a row is pressed. Enter
 * or the down arrow moves the keyboard to the first row left, and Escape
 * empties the field before it closes anything.
 */
const ListFrame = ({
  list,
  children,
}: Readonly<{
  list: ListNode
  children: (items: ReadonlyArray<ListItem>) => ReactElement
}>): ReactElement => {
  const [typed, setTyped] = useState('')
  const frame = useRef<HTMLDivElement>(null)
  const filter = list.filter
  const isOverLines = filter?.isOverLines === true
  const items = useMemo(
    () => filterListItems(list.items, typed, isOverLines),
    [list.items, typed, isOverLines],
  )
  return (
    <div className="fk-list-frame" ref={frame}>
      <div className="fk-list-head">
        {filter === undefined ? null : (
          <input
            type="search"
            className="fk-list-filter"
            value={typed}
            placeholder={filter.placeholder}
            aria-label={filter.label}
            autoComplete="off"
            enterKeyHint="search"
            data-takes-focus
            onChange={event => {
              setTyped(event.currentTarget.value)
            }}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === 'ArrowDown') {
                event.preventDefault()
                event.stopPropagation()
                frame.current
                  ?.querySelector<HTMLElement>(firstRowPressSelector)
                  ?.focus()
              } else if (event.key === 'Escape' && typed !== '') {
                event.preventDefault()
                event.stopPropagation()
                setTyped('')
              }
            }}
          />
        )}
        {list.columns === undefined ? null : (
          <div className="fk-list-head-columns" aria-hidden>
            {Array.map(list.columns, name => (
              <span key={name} className="fk-list-head-column">
                {name}
              </span>
            ))}
          </div>
        )}
      </div>
      {filter !== undefined && Array.isReadonlyArrayEmpty(items) ? (
        <p className="fk-list-empty" role="status">
          {filter.emptyText}
        </p>
      ) : null}
      {children(items)}
    </div>
  )
}

/**
 * How a painted tree reports presses, text input, and link follows.
 * `onLink` sees only plain primary clicks and returns true when it handled
 * the link, such as opening an in-app URI, so the browser does not load
 * the page. A modified click, such as Cmd-click, stays with the browser.
 */
export type PaintHandlers = Readonly<{
  onPress: (button: ButtonNode) => void
  onInput?: (token: string, value: string) => void
  onLink?: (href: string) => boolean
  classNames?: PaintClassNames
}>

/**
 * Paints a Program screen tree as React elements. A Button press reports
 * the whole node, so a Client can send its Catalog `action` or its legacy
 * `token`. A Button carries its hint as attributes: what a press does, its
 * keys, and why it is unavailable, which the document's hint listener shows.
 * A Text with an embed paints the host's view of that kind from
 * {@link EmbedPaintersProvider}, kept across repaints, or else its words.
 */
export const paintTree = (
  node: UiNode,
  handlers: PaintHandlers,
): ReactElement => {
  const classNames = handlers.classNames ?? {}
  const classFor = (kind: UiNode['_tag'], base: string): string => {
    const extra = classNames[kind]
    return extra === undefined ? base : `${base} ${extra}`
  }
  const keyFor = (child: UiNode, index: number): string => {
    if (child._tag === 'Button' && child.action !== undefined) {
      return `button-${child.action}`
    }
    if (child._tag === 'Button' && child.token !== undefined) {
      return `button-${child.token}`
    }
    if (child._tag === 'Text' && child.embed !== undefined) {
      return `embed-${child.embed.kind}`
    }
    return `${child._tag}-${index}`
  }
  const paintChildren = (
    children: ReadonlyArray<UiNode>,
  ): ReadonlyArray<ReactElement> =>
    Array.map(children, (child, index) => (
      <Fragment key={keyFor(child, index)}>{paint(child)}</Fragment>
    ))
  const paintLayer = (box: BoxNode, layer: BoxLayer): ReactElement => {
    const dismissToken = layer.dismissToken
    return (
      <div className="fk-layer" data-layer={layer.kind}>
        <div
          className="fk-layer-backdrop"
          aria-hidden
          onClick={
            dismissToken === undefined
              ? undefined
              : () => {
                  handlers.onPress({
                    _tag: 'Button',
                    label: layer.label,
                    token: dismissToken,
                  })
                }
          }
        />
        <LayerSurface
          className={classFor('Box', layerSurfaceClass)}
          kind={layer.kind}
          label={layer.label}
        >
          {paintChildren(box.children)}
        </LayerSurface>
      </div>
    )
  }
  const paintBox = (box: BoxNode): ReactElement =>
    box.layer !== undefined ? (
      paintLayer(box, box.layer)
    ) : box.isDock === true ? (
      <DockBox className={classFor('Box', 'fk-dock')}>
        {paintChildren(box.children)}
      </DockBox>
    ) : (
      <div className={classFor('Box', 'fk-box')} data-measure={box.measure}>
        {paintChildren(box.children)}
      </div>
    )
  const dropAttributes = (list: ListNode) => {
    const dropAction = list.dropAction
    return dropAction === undefined
      ? {}
      : {
          onDragOver: (event: DragEvent<HTMLUListElement>) => {
            if (event.dataTransfer.types.includes(draggedRowType)) {
              event.preventDefault()
            }
          },
          onDrop: (event: DragEvent<HTMLUListElement>) => {
            const rowKey = event.dataTransfer.getData(draggedRowType)
            if (rowKey !== '') {
              event.preventDefault()
              handlers.onPress(pressOf(`${dropAction}:${rowKey}`, list.label))
            }
          },
        }
  }
  const paintRows = (
    list: ListNode,
    items: ReadonlyArray<ListItem>,
  ): ReactElement => (
    <RowsList
      list={list}
      className={classFor('List', 'fk-list')}
      dropAttributes={dropAttributes(list)}
      onPress={handlers.onPress}
    >
      {Array.flatMap(groupedItemsOf(items), (section, index) => [
        ...(section.group === undefined
          ? []
          : [
              <li
                key={`group-${index.toString()}-${section.group}`}
                className="fk-list-group"
              >
                <span className="fk-list-group-name">{section.group}</span>
                <span className="fk-list-group-count">
                  {section.items.length}
                </span>
              </li>,
            ]),
        ...Array.map(section.items, item => (
          <ListRowView
            key={item.key}
            item={item}
            onPress={handlers.onPress}
            onLink={handlers.onLink}
            paintChildren={paintChildren}
          />
        )),
      ])}
    </RowsList>
  )
  const paintReference = (reference: ReferencePart): ReactElement => {
    const href = reference.href
    const attributes = {
      className: 'fk-ref',
      ...(reference.kind === undefined ? {} : { 'data-kind': reference.kind }),
      ...(reference.state === undefined
        ? {}
        : { 'data-state': reference.state }),
      ...(reference.detail === undefined
        ? {}
        : { title: Array.join(reference.detail, '\n') }),
    }
    const inner = (
      <>
        <span className="fk-ref-label">{reference.label}</span>
        {reference.title === undefined ? null : (
          <span className="fk-ref-title">{reference.title}</span>
        )}
        {reference.state === undefined ? null : (
          <span className="fk-ref-state">{reference.state}</span>
        )}
      </>
    )
    if (href === undefined) {
      return <span {...attributes}>{inner}</span>
    }
    return (
      <a
        {...attributes}
        href={href}
        onClick={event => {
          if (
            Navigation.isPlainClick(event) &&
            handlers.onLink !== undefined &&
            handlers.onLink(href)
          ) {
            event.preventDefault()
          }
        }}
      >
        {inner}
      </a>
    )
  }
  const paintPart = (part: TextPart): ReactNode =>
    M.value(part).pipe(
      M.withReturnType<ReactNode>(),
      M.tagsExhaustive({
        Plain: ({ text }) => text,
        Reference: paintReference,
      }),
    )
  const paintText = (text: TextNode): ReactElement => {
    const href = text.href
    const attributes = {
      className: classFor('Text', 'fk-text'),
      ...(text.label === undefined ? {} : { 'aria-label': text.label }),
      ...(text.dim === true ? { 'data-dim': true } : {}),
      ...(text.mono === true ? { 'data-mono': true } : {}),
      ...(text.emphasis === undefined
        ? {}
        : { 'data-emphasis': text.emphasis }),
    }
    const inner =
      text.image === undefined ? (
        text.content
      ) : (
        <img
          className="fk-image"
          src={text.image.src}
          alt={text.content}
          width={text.image.width}
          height={text.image.height}
          loading="lazy"
        />
      )
    if (text.copyable === true) {
      return (
        <div {...attributes} data-copyable>
          <span className="fk-copyable-text">{text.content}</span>
          <CopyButton text={text.content} />
        </div>
      )
    } else if (text.parts !== undefined && text.image === undefined) {
      return (
        <div {...attributes}>
          {Array.map(text.parts, (part, index) => (
            <Fragment key={index}>{paintPart(part)}</Fragment>
          ))}
        </div>
      )
    } else if (href === undefined) {
      return <div {...attributes}>{inner}</div>
    }
    return (
      <div {...attributes}>
        <a
          className="fk-text-link"
          href={href}
          onClick={event => {
            if (
              Navigation.isPlainClick(event) &&
              handlers.onLink !== undefined &&
              handlers.onLink(href)
            ) {
              event.preventDefault()
            }
          }}
        >
          {inner}
        </a>
      </div>
    )
  }
  const paint = (current: UiNode): ReactElement =>
    M.value(current).pipe(
      M.withReturnType<ReactElement>(),
      M.tagsExhaustive({
        Text: text =>
          text.embed === undefined ? (
            paintText(text)
          ) : (
            <EmbedView embed={text.embed} text={text}>
              {paintText(text)}
            </EmbedView>
          ),
        Button: button => {
          const maybeBinding = Slot.ofButton(button)
          const control = (
            <button
              type="button"
              className={classFor('Button', 'fk-button')}
              disabled={button.disabled === true}
              {...hintPropsOf(button)}
              data-action={button.action}
              data-variant={button.variant}
              data-icon-only={button.isIconOnly === true ? true : undefined}
              data-current={button.isCurrent === true ? true : undefined}
              aria-current={button.isCurrent === true ? 'page' : undefined}
              aria-label={button.isIconOnly === true ? button.label : undefined}
              data-keys={button.keys?.join(' ')}
              aria-keyshortcuts={button.keys?.join(' ')}
              {...Option.match(maybeBinding, {
                onNone: () => ({}),
                onSome: binding => slotPropsOf(binding),
              })}
              onClick={
                button.disabled === true
                  ? undefined
                  : () => {
                      handlers.onPress(button)
                    }
              }
            >
              {button.icon === undefined ? null : <Icon name={button.icon} />}
              {button.isIconOnly === true ? null : button.label}
            </button>
          )
          return Option.match(maybeBinding, {
            onNone: () => control,
            onSome: () => (
              <SlotHost
                hold={button.hold}
                onPress={press => {
                  handlers.onPress(pressOf(press, button.label))
                }}
              >
                {control}
              </SlotHost>
            ),
          })
        },
        TextInput: input => {
          if (input.action !== undefined || input.clearAction !== undefined) {
            return (
              <TextField
                input={input}
                className={classFor('TextInput', 'fk-text-input')}
                onPress={handlers.onPress}
              />
            )
          } else {
            return (
              <TokenField
                input={input}
                className={classFor('TextInput', 'fk-text-input')}
                onPress={handlers.onPress}
                onInput={handlers.onInput}
              />
            )
          }
        },
        Spacer: () => <div className={classFor('Spacer', 'fk-spacer')} />,
        Row: row => (
          <div
            className={classFor(
              'Row',
              row.isBoard === true ? 'fk-row fk-board' : 'fk-row',
            )}
            data-arrange={row.arrange}
          >
            {paintChildren(row.children)}
          </div>
        ),
        Column: column => (
          <div className={classFor('Column', 'fk-column')}>
            {paintChildren(column.children)}
          </div>
        ),
        Box: box => paintBox(box),
        Progress: progress => (
          <progress
            className={classFor('Progress', 'fk-progress')}
            max={progress.max}
            value={progress.value}
            aria-label={progress.label}
          />
        ),
        List: list =>
          list.filter === undefined && list.columns === undefined ? (
            paintRows(list, list.items)
          ) : (
            <ListFrame list={list}>{items => paintRows(list, items)}</ListFrame>
          ),
        Seek: seek => (
          <SeekBar
            seek={seek}
            className={classFor('Seek', 'fk-seek')}
            onPress={handlers.onPress}
          />
        ),
        Transcript: transcript => (
          <TranscriptView
            transcript={transcript}
            className={classFor('Transcript', 'fk-transcript')}
            onPress={handlers.onPress}
            paintNode={paint}
          />
        ),
        DeviceShell: shell => (
          <div
            className={classFor(
              'DeviceShell',
              `fk-device fk-device-${shell.device}`,
            )}
          >
            {paintChildren(shell.children)}
          </div>
        ),
        Lazy: lazy => paint(resolveLazyNode(lazy)),
      }),
    )
  return paint(node)
}

/** Paints a Program screen tree as React elements. A Button token becomes a click. */
export const paintReact = (
  node: UiNode,
  sendToken: (token: string) => void,
  classNames: PaintClassNames = {},
): ReactElement =>
  paintTree(node, {
    classNames,
    onPress: button => {
      if (button.token !== undefined) {
        sendToken(button.token)
      }
    },
    onInput: (token, value) => {
      sendToken(`${token}${value}`)
    },
  })

/**
 * The shared screen stylesheet, `Interaction.screenStylesheet`, added to
 * the document head once however many screens render it.
 *
 * @example
 * ```tsx
 * <>
 *   <ScreenStyles />
 *   {paintTree(node, handlers)}
 * </>
 * ```
 */
export const ScreenStyles = (): ReactElement => (
  <style href="foldkit-screen" precedence="foldkit">
    {Interaction.screenStylesheet}
  </style>
)
