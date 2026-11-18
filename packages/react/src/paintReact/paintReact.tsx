import { Array, Match as M, Option } from 'effect'
import { Interaction, Navigation } from 'foldkit'
import {
  type BoxLayer,
  type BoxNode,
  type ButtonNode,
  type IconName,
  type ItemCheck,
  type ListItem,
  type ListNode,
  type ReferencePart,
  type SeekNode,
  type TextEmbed,
  type TextInputNode,
  type TextNode,
  type TextPart,
  type TranscriptNode,
  type TranscriptPassage,
  type TranscriptWordMenu,
  type UiNode,
  currentWordTokenAt,
  filterListItems,
  iconDrawings,
  isClearedOnSubmit,
  isSubmittedOnLeave,
  seekLandingAt,
  submittedTagOf,
  transcriptAt,
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
    onPress,
  }: Readonly<{
    passage: TranscriptPassage
    action: string
    onPress: (button: ButtonNode) => void
  }>): ReactElement => {
    const labelAction = passage.labelAction
    return (
      <article
        className="fk-passage"
        data-current={passage.isCurrent === true ? true : undefined}
      >
        {passage.heading === undefined ? null : (
          <h3 className="fk-passage-heading">{passage.heading}</h3>
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
          {Array.map(passage.words, word => (
            <span
              key={word.token}
              className="fk-word"
              data-token={word.token}
              data-current={word.isCurrent === true ? true : undefined}
              data-mark={word.mark}
              onClick={() => {
                onPress(pressOf(`${action}:${word.token}`, word.text))
              }}
            >
              {`${word.text} `}
            </span>
          ))}
        </p>
      </article>
    )
  },
  (before, after) =>
    before.passage.key === after.passage.key &&
    before.passage.heading === after.passage.heading &&
    before.passage.isCurrent === after.passage.isCurrent &&
    before.passage.words.length === after.passage.words.length &&
    currentTokenOf(before.passage) === currentTokenOf(after.passage) &&
    marksOf(before.passage) === marksOf(after.passage) &&
    before.action === after.action &&
    before.onPress === after.onPress,
)

const userScrollQuietMs = 4000

const leavingScrollQuietMs = 1000

const leaveCheckAfterMs = 250

const autoScrollMs = 900

const middleBandStart = 0.25

const middleBandEnd = 0.75

const isNearMiddleOf = (root: HTMLElement, word: HTMLElement): boolean => {
  const isScrollArea = root.scrollHeight > root.clientHeight
  const view = isScrollArea
    ? root.getBoundingClientRect()
    : { top: 0, height: window.innerHeight }
  const bounds = word.getBoundingClientRect()
  return (
    bounds.top > view.top + view.height * middleBandStart &&
    bounds.bottom < view.top + view.height * middleBandEnd
  )
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

/** Keeps a word near the middle of the transcript, moving only when it has left it. */
const followWord = (root: HTMLElement, word: HTMLElement): void => {
  if (!isNearMiddleOf(root, word)) {
    centerWord(root, word)
  }
}

const wordIn = (root: HTMLElement, token: string): HTMLElement | null =>
  root.querySelector<HTMLElement>(`[data-token="${CSS.escape(token)}"]`)

const tokenOfTarget = (target: EventTarget | null): string | undefined =>
  target instanceof Element
    ? (target.closest('[data-token]')?.getAttribute('data-token') ?? undefined)
    : undefined

/**
 * Words to read along with. It keeps the word sounding in the middle of
 * the window as it moves, and lets a person scroll away to read ahead: it
 * follows again a few seconds after they stop.
 */
const liveWordEveryMs = 50

/**
 * A Transcript as it reads right now. While its clock runs, the word
 * being spoken is read from the clock many times a second and the
 * Transcript is marked again only when the word changes, so the mark
 * moves on the word while the Program hears the place once a second. A
 * Transcript with no clock, or one standing still, is painted as given.
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
  const liveToken = isRunning
    ? Option.getOrUndefined(currentWordTokenAt(transcript, nowMs))
    : undefined
  return useMemo(
    () =>
      liveToken === undefined ? transcript : transcriptAt(transcript, nowMs),
    // NOTE: `nowMs` is left out on purpose: the Transcript is marked again
    // when the word changes, not on every tick of the clock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transcript, liveToken],
  )
}

const longPressMs = 500

const longPressSlackPx = 10

const menuGapPx = 8

const menuEdgePx = 8

type MenuPlace = Readonly<{ left: number; top: number }>

/**
 * The menu the Program holds open on one word, drawn by that word: its
 * items as a menu, a press outside or Escape closing it. It draws only
 * what the Transcript carries and presses what a person picks; whether
 * it is open is the Program's.
 */
const WordMenu = ({
  menu,
  root,
  onPress,
}: Readonly<{
  menu: TranscriptWordMenu
  root: () => HTMLElement | null
  onPress: (button: ButtonNode) => void
}>): ReactElement => {
  const ref = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState<MenuPlace>({ left: 0, top: 0 })
  const [wordText, setWordText] = useState('')
  const dismiss = (): void => {
    onPress(pressOf(menu.dismissAction, 'Close'))
  }
  useLayoutEffect(() => {
    const container = root()
    const word = container === null ? null : wordIn(container, menu.token)
    const panel = ref.current
    if (word === null || panel === null) {
      return
    }
    const bounds = word.getBoundingClientRect()
    const size = panel.getBoundingClientRect()
    const below = bounds.bottom + menuGapPx
    const fitsBelow = below + size.height <= window.innerHeight - menuEdgePx
    setWordText(word.textContent?.trim() ?? '')
    setPlace({
      left: Math.max(
        menuEdgePx,
        Math.min(bounds.left, window.innerWidth - size.width - menuEdgePx),
      ),
      top: fitsBelow
        ? below
        : Math.max(menuEdgePx, bounds.top - menuGapPx - size.height),
    })
    // NOTE: `root` is a stable reader of the transcript's element; the
    // menu is placed again only when it opens on another word.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu.token])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onPress(pressOf(menu.dismissAction, 'Close'))
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [menu.dismissAction, onPress])
  return (
    <>
      <div className="fk-word-menu-backdrop" aria-hidden onClick={dismiss} />
      <div
        ref={ref}
        role="menu"
        aria-label={wordText}
        className="fk-word-menu"
        style={{ left: place.left, top: place.top }}
      >
        {Array.map(menu.items, item => (
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
}: Readonly<{
  transcript: TranscriptNode
  className: string
  onPress: (button: ButtonNode) => void
}>): ReactElement => {
  const transcript = useLiveTranscript(given)
  const ref = useRef<HTMLElement>(null)
  const lastUserScrollAtMs = useRef(0)
  const autoScrollUntilMs = useRef(0)
  const leaveCheck = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  )
  const longPress = useRef<
    | Readonly<{
        timer: ReturnType<typeof setTimeout>
        x: number
        y: number
      }>
    | undefined
  >(undefined)
  const isClickSwallowed = useRef(false)
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
  const wordMenuAction = transcript.wordMenuAction
  const isFocusWordHere =
    focusToken !== undefined &&
    Array.some(transcript.passages, passage =>
      Array.some(passage.words, word => word.token === focusToken),
    )
  const live = useRef({ currentToken, isFollowing, leaveAction, onPress })
  live.current = { currentToken, isFollowing, leaveAction, onPress }
  useEffect(() => {
    const leaveIfAway = (): void => {
      const now = live.current
      const root = ref.current
      if (
        root === null ||
        now.leaveAction === undefined ||
        !now.isFollowing ||
        now.currentToken === undefined
      ) {
        return
      }
      const word = wordIn(root, now.currentToken)
      if (word !== null && !isNearMiddleOf(root, word)) {
        now.onPress(pressOf(now.leaveAction, 'Read elsewhere'))
      }
    }
    const noteUserScroll = (): void => {
      lastUserScrollAtMs.current = Date.now()
      clearTimeout(leaveCheck.current)
      leaveCheck.current = setTimeout(leaveIfAway, leaveCheckAfterMs)
    }
    const noteScroll = (): void => {
      if (Date.now() > autoScrollUntilMs.current) {
        noteUserScroll()
      }
    }
    const root = ref.current
    window.addEventListener('wheel', noteUserScroll, { passive: true })
    window.addEventListener('touchmove', noteUserScroll, { passive: true })
    window.addEventListener('scroll', noteScroll, { passive: true })
    root?.addEventListener('scroll', noteScroll, { passive: true })
    return () => {
      clearTimeout(leaveCheck.current)
      window.removeEventListener('wheel', noteUserScroll)
      window.removeEventListener('touchmove', noteUserScroll)
      window.removeEventListener('scroll', noteScroll)
      root?.removeEventListener('scroll', noteScroll)
    }
  }, [])
  useEffect(() => {
    const root = ref.current
    const quietMs =
      leaveAction === undefined ? userScrollQuietMs : leavingScrollQuietMs
    if (
      root === null ||
      currentToken === undefined ||
      !isFollowing ||
      Date.now() - lastUserScrollAtMs.current < quietMs
    ) {
      return
    }
    const word = wordIn(root, currentToken)
    if (word === null) {
      return
    }
    autoScrollUntilMs.current = Date.now() + autoScrollMs
    followWord(root, word)
    // NOTE: `leaveAction` only picks how long a person's own scroll is
    // left alone; a change of it alone moves nothing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentToken, isFollowing])
  useEffect(() => {
    const root = ref.current
    if (root === null || focusToken === undefined || !isFocusWordHere) {
      return
    }
    const word = wordIn(root, focusToken)
    if (word === null) {
      return
    }
    autoScrollUntilMs.current = Date.now() + autoScrollMs
    centerWord(root, word)
  }, [focusToken, isFocusWordHere])
  const askForMenu = (token: string): void => {
    if (wordMenuAction !== undefined) {
      onPress(pressOf(`${wordMenuAction}:${token}`, 'Word menu'))
    }
  }
  const endLongPress = (): void => {
    if (longPress.current !== undefined) {
      clearTimeout(longPress.current.timer)
      longPress.current = undefined
    }
  }
  return (
    <>
      <section
        ref={ref}
        className={className}
        aria-label={transcript.label}
        data-following={isFollowing ? undefined : 'false'}
        onContextMenu={
          wordMenuAction === undefined
            ? undefined
            : event => {
                const token = tokenOfTarget(event.target)
                if (token !== undefined) {
                  event.preventDefault()
                  endLongPress()
                  askForMenu(token)
                }
              }
        }
        onPointerDown={
          wordMenuAction === undefined
            ? undefined
            : event => {
                const token = tokenOfTarget(event.target)
                if (token === undefined || event.pointerType === 'mouse') {
                  return
                }
                endLongPress()
                longPress.current = {
                  x: event.clientX,
                  y: event.clientY,
                  timer: setTimeout(() => {
                    longPress.current = undefined
                    isClickSwallowed.current = true
                    askForMenu(token)
                  }, longPressMs),
                }
              }
        }
        onPointerMove={event => {
          const pressed = longPress.current
          if (
            pressed !== undefined &&
            Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) >
              longPressSlackPx
          ) {
            endLongPress()
          }
        }}
        onPointerUp={endLongPress}
        onPointerCancel={endLongPress}
        onClickCapture={event => {
          if (isClickSwallowed.current) {
            isClickSwallowed.current = false
            event.stopPropagation()
            event.preventDefault()
          }
        }}
      >
        {Array.match(transcript.passages, {
          onEmpty: () => (
            <p className="fk-transcript-empty">{transcript.emptyText}</p>
          ),
          onNonEmpty: passages =>
            Array.map(passages, passage => (
              <PassageView
                key={passage.key}
                passage={passage}
                action={transcript.action}
                onPress={onPress}
              />
            )),
        })}
      </section>
      {transcript.wordMenu === undefined ? null : (
        <WordMenu
          menu={transcript.wordMenu}
          root={() => ref.current}
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
  const items = useMemo(
    () => filterListItems(list.items, typed),
    [list.items, typed],
  )
  const filter = list.filter
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
 * `token`. A disabled Button carries its `because` sentence as the title.
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
      <div className={classFor('Box', 'fk-box')}>
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
    <ul
      className={classFor('List', 'fk-list')}
      aria-label={list.label}
      {...dropAttributes(list)}
    >
      {Array.map(items, item => (
        <ListRowView
          key={item.key}
          item={item}
          onPress={handlers.onPress}
          onLink={handlers.onLink}
          paintChildren={paintChildren}
        />
      ))}
    </ul>
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
        Button: button => (
          <button
            type="button"
            className={classFor('Button', 'fk-button')}
            disabled={button.disabled === true}
            title={button.because}
            data-action={button.action}
            data-variant={button.variant}
            data-icon-only={button.isIconOnly === true ? true : undefined}
            data-current={button.isCurrent === true ? true : undefined}
            aria-current={button.isCurrent === true ? 'page' : undefined}
            aria-label={button.isIconOnly === true ? button.label : undefined}
            data-keys={button.keys?.join(' ')}
            aria-keyshortcuts={button.keys?.join(' ')}
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
        ),
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
