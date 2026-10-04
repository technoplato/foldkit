import { Array, Match as M, Option } from 'effect'
import { Interaction, Navigation } from 'foldkit'
import { type IconName, iconDrawings } from 'foldkit/renderers'
import type {
  BoxNode,
  ButtonNode,
  ListItem,
  SeekNode,
  TranscriptNode,
  TranscriptPassage,
  UiNode,
} from 'foldkit/renderers'
import {
  Fragment,
  type ReactElement,
  type ReactNode,
  memo,
  useEffect,
  useRef,
  useState,
} from 'react'

/** Extra class per node kind, appended after the fk-* base class. */
export type PaintClassNames = Partial<Record<UiNode['_tag'], string>>

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

/**
 * A box pinned to the bottom of the screen. It leaves a space of its own
 * height at the end of the page, so nothing is hidden under it.
 */
const DockBox = ({
  className,
  children,
}: Readonly<{ className: string; children: ReactNode }>): ReactElement => {
  const ref = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(0)
  useEffect(() => {
    const dock = ref.current
    if (dock === null) {
      return undefined
    }
    const observer = new ResizeObserver(() => {
      setHeight(dock.getBoundingClientRect().height)
    })
    observer.observe(dock)
    return () => {
      observer.disconnect()
    }
  }, [])
  return (
    <>
      <div className="fk-dock-space" style={{ height }} />
      <div ref={ref} className={className}>
        {children}
      </div>
    </>
  )
}

const pressOf = (action: string, label: string): ButtonNode => ({
  _tag: 'Button',
  label,
  action,
})

/**
 * A seek bar. It follows the Program's place until a person grabs it,
 * shows where they drag, and presses `SeekTo:<value>` once, when they let
 * go, so dragging never restarts the audio at every step.
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
  return (
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
      aria-valuetext={seek.valueText}
      onChange={event => {
        setMaybeDragged(Option.some(Number(event.currentTarget.value)))
      }}
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
    before.action === after.action &&
    before.onPress === after.onPress,
)

const userScrollQuietMs = 4000

const middleBandStart = 0.25

const middleBandEnd = 0.75

/**
 * Keeps a word near the middle of the transcript: inside the transcript's
 * own scroll area when it has one, so the controls above stay put, else
 * in the window.
 */
const followWord = (root: HTMLElement, word: HTMLElement): void => {
  const isScrollArea = root.scrollHeight > root.clientHeight
  const view = isScrollArea
    ? root.getBoundingClientRect()
    : { top: 0, height: window.innerHeight }
  const bounds = word.getBoundingClientRect()
  const isNearMiddle =
    bounds.top > view.top + view.height * middleBandStart &&
    bounds.bottom < view.top + view.height * middleBandEnd
  if (isNearMiddle) {
    return
  } else if (isScrollArea) {
    root.scrollTo({
      top: root.scrollTop + (bounds.top - view.top) - root.clientHeight / 2,
      behavior: 'smooth',
    })
  } else {
    word.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }
}

/**
 * Words to read along with. It keeps the word sounding in the middle of
 * the window as it moves, and lets a person scroll away to read ahead: it
 * follows again a few seconds after they stop.
 */
const TranscriptView = ({
  transcript,
  className,
  onPress,
}: Readonly<{
  transcript: TranscriptNode
  className: string
  onPress: (button: ButtonNode) => void
}>): ReactElement => {
  const ref = useRef<HTMLElement>(null)
  const lastUserScrollAtMs = useRef(0)
  const maybeCurrentToken = Array.findFirst(
    Array.flatMap(transcript.passages, passage =>
      Array.fromNullishOr(currentTokenOf(passage)),
    ),
    () => true,
  )
  useEffect(() => {
    const noteUserScroll = (): void => {
      lastUserScrollAtMs.current = Date.now()
    }
    window.addEventListener('wheel', noteUserScroll, { passive: true })
    window.addEventListener('touchmove', noteUserScroll, { passive: true })
    return () => {
      window.removeEventListener('wheel', noteUserScroll)
      window.removeEventListener('touchmove', noteUserScroll)
    }
  }, [])
  const currentToken = Option.getOrUndefined(maybeCurrentToken)
  useEffect(() => {
    const root = ref.current
    if (
      root === null ||
      currentToken === undefined ||
      Date.now() - lastUserScrollAtMs.current < userScrollQuietMs
    ) {
      return
    }
    const word = root.querySelector<HTMLElement>(
      `[data-token="${CSS.escape(currentToken)}"]`,
    )
    if (word === null) {
      return
    }
    followWord(root, word)
  }, [currentToken])
  return (
    <section ref={ref} className={className} aria-label={transcript.label}>
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
    return `${child._tag}-${index}`
  }
  const paintChildren = (
    children: ReadonlyArray<UiNode>,
  ): ReadonlyArray<ReactElement> =>
    Array.map(children, (child, index) => (
      <Fragment key={keyFor(child, index)}>{paint(child)}</Fragment>
    ))
  const paintBox = (box: BoxNode): ReactElement =>
    box.isDock === true ? (
      <DockBox className={classFor('Box', 'fk-dock')}>
        {paintChildren(box.children)}
      </DockBox>
    ) : (
      <div className={classFor('Box', 'fk-box')}>
        {paintChildren(box.children)}
      </div>
    )
  const paint = (current: UiNode): ReactElement =>
    M.value(current).pipe(
      M.withReturnType<ReactElement>(),
      M.tagsExhaustive({
        Text: text => {
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
        },
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
          const token = input.token
          return (
            <input
              type="text"
              className={classFor('TextInput', 'fk-text-input')}
              value={input.value}
              placeholder={input.placeholder}
              autoFocus={input.focused === true}
              onChange={event => {
                if (token !== undefined && handlers.onInput !== undefined) {
                  handlers.onInput(token, event.currentTarget.value)
                }
              }}
            />
          )
        },
        Spacer: () => <div className={classFor('Spacer', 'fk-spacer')} />,
        Row: row => (
          <div className={classFor('Row', 'fk-row')}>
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
        List: list => (
          <ul className={classFor('List', 'fk-list')} aria-label={list.label}>
            {Array.map(list.items, item => {
              return (
                <li
                  key={item.key}
                  className="fk-item"
                  data-current={item.isCurrent === true ? true : undefined}
                >
                  <ItemPress
                    item={item}
                    onPress={handlers.onPress}
                    onLink={handlers.onLink}
                  >
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
                      <span className="fk-item-title">{item.title}</span>
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
                  </ItemPress>
                  {paintChildren(item.trailing ?? [])}
                </li>
              )
            })}
          </ul>
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
