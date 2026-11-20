import { Array, Match as M, Option, Order } from 'effect'
import { TranscriptFollow } from 'foldkit/behavior'
import {
  type PlacedBookmark,
  type SpokenUnit,
  type TranscriptEntry,
  type TranscriptNode,
  type TranscriptPassage,
  type TranscriptWord,
  type TranscriptWordMenu,
  type UiNode,
  bookmarksInPassage,
  spokenUnitAt,
  transcriptAt,
  transcriptEntriesOf,
} from 'foldkit/renderers'
import {
  type ReactElement,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  FlatList,
  type ListRenderItem,
  Platform,
  Pressable,
  Text,
  type TextStyle,
  View,
} from 'react-native'

import { useLaidOut } from '../telemetry/paintReporter.js'
import { groundStyleOf } from './look.js'
import { MenuSheet } from './menuSheet.js'
import { type Paint, pressOf } from './paint.js'
import { ScreenOverlayContext, ScreenScrollContext } from './scroll.js'
import {
  type WindowAnchor,
  type WindowEntry,
  estimatedTopOf,
  readerWindow,
} from './transcriptWindow.js'

const readingFamily = Platform.select({
  ios: 'Iowan Old Style',
  default: 'serif',
})

const monoFamily = Platform.select({ ios: 'Menlo', default: 'monospace' })

const readingSize = 20

const readingLineHeight = 31

const labelSize = 12

const headingSize = 13

const passageRadius = 14

const ruleWidth = 3

const ribbonGlyph = '❙'

const labelGap = '  '

// PLACE

/**
 * How far into a passage's words, in characters, one word starts: after
 * the passage's time and the words before it, each with its space.
 *
 * @example
 * ```typescript
 * wordOffsetIn(passage, 'p0w2', '0:00  '.length) // 6 + 'The '.length + 'keeper '.length
 * ```
 */
export const wordOffsetIn = (
  words: ReadonlyArray<Pick<TranscriptWord, 'token' | 'text'>>,
  token: string,
  prefixLength: number,
): Option.Option<number> =>
  Option.map(
    Array.findFirstIndex(words, word => word.token === token),
    index =>
      Array.reduce(
        Array.take(words, index),
        prefixLength,
        (offset, word) => offset + word.text.length + 1,
      ),
  )

/**
 * The line of laid-out text a character falls on, counting from 0. Past
 * the last line, it is the last line.
 *
 * @example
 * ```typescript
 * lineOfOffset([{ text: 'The keeper ' }, { text: 'climbed' }], 12) // 1
 * ```
 */
export const lineOfOffset = (
  lines: ReadonlyArray<Readonly<{ text: string }>>,
  offset: number,
): number => {
  const found = Array.reduce(
    lines,
    { line: -1, seen: 0 },
    (state, line, index) =>
      state.line === -1 && offset < state.seen + line.text.length
        ? { line: index, seen: state.seen + line.text.length }
        : { line: state.line, seen: state.seen + line.text.length },
  )
  return found.line === -1 ? Math.max(0, lines.length - 1) : found.line
}

const sightOf = (
  view: Readonly<{ place: number; offset: number; viewport: number }>,
): TranscriptFollow.Sight => ({
  top: view.place,
  bottom: view.place,
  viewStart: view.offset,
  viewSize: view.viewport,
})

/**
 * True when a place in a scrolled view is in its middle half, where a
 * word being read is left alone, as `TranscriptFollow.isInMiddle` says
 * for every painter.
 *
 * @example
 * ```typescript
 * isNearMiddle({ place: 500, offset: 200, viewport: 600 }) // true
 * isNearMiddle({ place: 250, offset: 200, viewport: 600 }) // false
 * ```
 */
export const isNearMiddle = (
  view: Readonly<{ place: number; offset: number; viewport: number }>,
): boolean => TranscriptFollow.isInMiddle(sightOf(view))

// WORDS

const currentTokenOf = (passage: TranscriptPassage): Option.Option<string> =>
  Option.map(
    Array.findFirst(passage.words, word => word.isCurrent === true),
    word => word.token,
  )

/**
 * How one word of a passage reads: the word being spoken in its own
 * color on its ground, the words already spoken in the current passage
 * strong, the rest quiet, and a word a search or a menu set apart marked.
 */
export const wordStyleOf = (
  word: TranscriptWord,
  place: 'Spoken' | 'Current' | 'ToCome' | 'Resting',
  paint: Paint,
): TextStyle => {
  const { colors } = paint.look
  const base = M.value(place).pipe(
    M.withReturnType<TextStyle>(),
    M.when('Current', () => ({
      color: colors.ReadingCurrentWord,
      ...groundStyleOf(colors.ReadingCurrentWordGround),
    })),
    M.when('Spoken', () => ({ color: colors.ReadingSpoken })),
    M.when('ToCome', () => ({ color: colors.ReadingToCome })),
    M.when('Resting', () => ({ color: colors.ReadingToCome })),
    M.exhaustive,
  )
  const marked = M.value(word.mark).pipe(
    M.withReturnType<TextStyle>(),
    M.when('Found', () => ({ backgroundColor: colors.MarkSoft })),
    M.when('Selected', () => ({
      backgroundColor: colors.Mark,
      color: colors.PageGround,
    })),
    M.when('Picked', () => ({
      backgroundColor: colors.Selected,
      color: colors.SelectedMark,
    })),
    M.orElse(() => ({})),
  )
  return { ...base, ...marked }
}

type LaidOutLines = ReadonlyArray<
  Readonly<{ text: string; y: number; height: number }>
>

/**
 * One passage: its heading and speaker, its time, and its words, each
 * pressable, with a ribbon on a bookmarked word and the bookmarks' notes
 * beneath.
 */
export const paintPassage = (
  passage: TranscriptPassage,
  transcript: Pick<TranscriptNode, 'action' | 'wordMenuAction'>,
  bookmarks: ReadonlyArray<PlacedBookmark>,
  paint: Paint,
  onLines?: (lines: LaidOutLines, textY: number) => void,
): ReactElement => {
  const { colors } = paint.look
  const isCurrent = passage.isCurrent === true
  const maybeCurrentIndex = Array.findFirstIndex(
    passage.words,
    word => word.isCurrent === true,
  )
  const placeOf = (
    index: number,
  ): 'Spoken' | 'Current' | 'ToCome' | 'Resting' => {
    if (!isCurrent) {
      return 'Resting'
    } else if (Option.contains(maybeCurrentIndex, index)) {
      return 'Current'
    } else if (Option.exists(maybeCurrentIndex, current => index < current)) {
      return 'Spoken'
    } else {
      return 'ToCome'
    }
  }
  const labelAction = passage.labelAction
  const wordMenuAction = transcript.wordMenuAction
  const pressBookmark = (placed: PlacedBookmark): void => {
    const bookmarkAction = placed.bookmark.action
    if (bookmarkAction !== undefined) {
      paint.onPress(pressOf(bookmarkAction, placed.bookmark.label))
    }
  }
  const textY = { current: 0 }
  return (
    <View
      style={{
        borderLeftColor: isCurrent ? colors.ReadingRule : 'transparent',
        borderLeftWidth: ruleWidth,
        borderRadius: passageRadius,
        gap: 4,
        paddingHorizontal: 13,
        paddingVertical: 10,
        ...(isCurrent ? groundStyleOf(colors.ReadingCurrentGround) : {}),
      }}
    >
      {passage.heading === undefined ? null : (
        <Text
          accessibilityRole="header"
          style={{
            color: colors.ReadingRule,
            fontSize: headingSize,
            fontWeight: '700',
            letterSpacing: 0.8,
            textTransform: 'uppercase',
          }}
        >
          {passage.heading}
        </Text>
      )}
      {passage.speaker === undefined ? null : (
        <Text
          style={{
            color: colors.QuietText,
            fontSize: headingSize,
            fontWeight: '700',
          }}
        >
          {passage.speaker}
        </Text>
      )}
      <Text
        onLayout={event => {
          textY.current = event.nativeEvent.layout.y
        }}
        onTextLayout={
          onLines === undefined
            ? undefined
            : event => {
                onLines(event.nativeEvent.lines, textY.current)
              }
        }
        style={{
          fontFamily: readingFamily,
          fontSize: readingSize,
          lineHeight: readingLineHeight,
        }}
      >
        <Text
          accessibilityRole={labelAction === undefined ? 'text' : 'button'}
          onPress={
            labelAction === undefined
              ? undefined
              : () => {
                  paint.onPress(pressOf(labelAction, passage.label))
                }
          }
          style={{
            color: colors.QuietText,
            fontFamily: monoFamily,
            fontSize: labelSize,
          }}
        >
          {`${passage.label}${labelGap}`}
        </Text>
        {Array.map(passage.words, (word, index) => {
          const maybeBookmark = Array.findFirst(
            bookmarks,
            placed => placed.token === word.token,
          )
          return (
            <Text
              key={word.token}
              onLongPress={
                wordMenuAction === undefined
                  ? undefined
                  : () => {
                      paint.onPress(
                        pressOf(`${wordMenuAction}:${word.token}`, word.text),
                      )
                    }
              }
              onPress={() => {
                paint.onPress(
                  pressOf(`${transcript.action}:${word.token}`, word.text),
                )
              }}
              suppressHighlighting
              style={wordStyleOf(word, placeOf(index), paint)}
            >
              {Option.match(maybeBookmark, {
                onNone: () => null,
                onSome: placed => (
                  <Text
                    accessibilityLabel={placed.bookmark.label}
                    style={{ color: colors.Accent }}
                  >
                    {ribbonGlyph}
                  </Text>
                ),
              })}
              {`${word.text} `}
            </Text>
          )
        })}
      </Text>
      {Array.map(
        Array.filter(bookmarks, placed => placed.bookmark.note !== undefined),
        placed => (
          <Pressable
            key={placed.token}
            accessibilityLabel={placed.bookmark.label}
            accessibilityRole="button"
            onPress={() => {
              pressBookmark(placed)
            }}
            style={{
              borderLeftColor: colors.Accent,
              borderLeftWidth: 2,
              paddingLeft: 8,
              paddingVertical: 2,
            }}
          >
            <Text style={{ color: colors.QuietText, fontSize: 14 }}>
              {placed.bookmark.note}
            </Text>
          </Pressable>
        ),
      )}
    </View>
  )
}

// MENU

const wordTextOf = (transcript: TranscriptNode, token: string): string =>
  Option.getOrElse(
    Array.findFirst(
      Array.flatMap(transcript.passages, passage => passage.words),
      word => word.token === token,
    ).pipe(Option.map(word => word.text)),
    () => '',
  )

/**
 * The menu the Program holds open on one word, drawn as a sheet at the
 * bottom edge of its screen: the word, then what the menu offers. A press
 * outside it presses the menu's `dismissAction`. Whether it is open, and
 * on which word, is the Program's.
 */
export const WordMenuSheet = ({
  menu,
  wordText,
  paint,
}: Readonly<{
  menu: TranscriptWordMenu
  wordText: string
  paint: Paint
}>): ReactElement =>
  MenuSheet({
    heading: `“${wordText}”`,
    ...(readingFamily === undefined
      ? {}
      : { headingStyle: { fontFamily: readingFamily } }),
    items: menu.items,
    dismissAction: menu.dismissAction,
    paint,
  })

// LIVE

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
export const useLiveTranscript = (
  transcript: TranscriptNode,
): TranscriptNode => {
  const isRunning = transcript.clock !== undefined && transcript.clock.rate > 0
  const given = useRef(transcript)
  given.current = transcript
  const unitNow = (): string | undefined =>
    Option.getOrUndefined(
      Option.map(spokenUnitAt(given.current, Date.now()), spokenKeyOf),
    )
  // NOTE: the clock is read many times a second, and the view is told only
  // when what it reads is another word, or another passage with no words:
  // a tick that lands on the same one paints nothing.
  const [tickedUnit, setTickedUnit] = useState<string | undefined>(unitNow)
  useEffect(() => {
    if (!isRunning) {
      return undefined
    }
    setTickedUnit(unitNow())
    const timer = setInterval(() => {
      setTickedUnit(unitNow())
    }, liveWordEveryMs)
    return () => {
      clearInterval(timer)
    }
    // NOTE: the timer reads the Transcript through `given`, so it is set
    // up once for as long as the clock runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning])
  const liveUnit = isRunning ? tickedUnit : undefined
  return useMemo(
    () =>
      liveUnit === undefined
        ? transcript
        : transcriptAt(transcript, Date.now()),
    [transcript, liveUnit],
  )
}

// VIEW

const maximumJumps = 5

const retryAfterMs = 120

type PassagePlace = Readonly<{
  y: number
  height: number
  textY: number
  lines: LaidOutLines
}>

const noLines: LaidOutLines = []

const noBookmarks: ReadonlyArray<PlacedBookmark> = []

const entryKeyOf = (entry: TranscriptEntry): string =>
  entry._tag === 'PassageEntry' ? entry.passage.key : entry.item.key

const passageGap = 2

const PassageGap = (): ReactElement => <View style={{ height: passageGap }} />

const passageKeyOfToken = (
  transcript: TranscriptNode,
  token: string,
): string | undefined =>
  Array.findFirst(transcript.passages, passage =>
    Array.some(passage.words, word => word.token === token),
  ).pipe(
    Option.map(passage => passage.key),
    Option.getOrUndefined,
  )

type PassageBlockProps = Readonly<{
  passage: TranscriptPassage
  action: TranscriptNode['action']
  wordMenuAction: TranscriptNode['wordMenuAction']
  bookmarks: TranscriptNode['bookmarks']
  paint: Paint
  onPart: (key: string, part: View | null) => void
  onLaidOut: (key: string) => void
  onLines: (key: string, lines: LaidOutLines, textY: number) => void
}>

// NOTE: one passage of the Transcript, painted again only when the passage
// itself is another object: the core hands back every passage the spoken
// word neither left nor entered as the object it was, so a word moving on
// repaints its own passage and no other.
const PassageBlock = memo(
  ({
    passage,
    action,
    wordMenuAction,
    bookmarks,
    paint,
    onPart,
    onLaidOut,
    onLines,
  }: PassageBlockProps): ReactElement => {
    const inPassage = useMemo(
      () =>
        bookmarks === undefined
          ? noBookmarks
          : bookmarksInPassage(passage, bookmarks),
      [passage, bookmarks],
    )
    const actions = useMemo(
      () =>
        wordMenuAction === undefined ? { action } : { action, wordMenuAction },
      [action, wordMenuAction],
    )
    return (
      <View
        ref={part => {
          onPart(passage.key, part)
        }}
        onLayout={() => {
          onLaidOut(passage.key)
        }}
      >
        {paintPassage(passage, actions, inPassage, paint, (lines, textY) => {
          onLines(passage.key, lines, textY)
        })}
      </View>
    )
  },
)

/**
 * Words to read along with. While the Transcript says the view follows
 * the word sounding, it keeps that word's line in the middle of the
 * screen as it moves. When a person scrolls it out of the middle it
 * tells the Program, with the Transcript's `leaveAction`, and from then
 * the view stays where they put it until the Program says it follows
 * again. A `focusToken` is brought to the middle once, when it is named.
 * A long press on a word asks the Program for the word's menu, and the
 * menu the Program holds is drawn as a sheet.
 */
export const TranscriptView = ({
  transcript: given,
  paint,
  paintNode,
}: Readonly<{
  transcript: TranscriptNode
  paint: Paint
  paintNode: (node: UiNode) => ReactElement
}>): ReactElement => {
  const transcript = useLiveTranscript(given)
  const scroll = useContext(ScreenScrollContext)
  const { colors, sizes } = paint.look
  const places = useRef(new Map<string, PassagePlace>())
  const parts = useRef(new Map<string, View>())
  const follow = useRef<TranscriptFollow.Running | undefined>(undefined)
  const maybeCurrentToken = Array.findFirst(
    Array.flatMap(transcript.passages, passage =>
      Array.fromOption(currentTokenOf(passage)),
    ),
    () => true,
  )
  const currentToken = Option.getOrUndefined(maybeCurrentToken)
  const isFollowing = transcript.isFollowing !== false
  const leaveAction = transcript.leaveAction
  const focusToken = transcript.focusToken
  const entries = useMemo(() => transcriptEntriesOf(transcript), [transcript])
  const windowEntries = useMemo<ReadonlyArray<WindowEntry>>(
    () =>
      Array.map(entries, entry =>
        entry._tag === 'PassageEntry'
          ? { key: entry.passage.key, wordCount: entry.passage.words.length }
          : { key: entry.item.key, wordCount: 0 },
      ),
    [entries],
  )
  useLaidOut({ passages: windowEntries.length })
  const pending = useRef<
    Readonly<{ token: string | undefined; jumps: number }>
  >({ token: undefined, jumps: 0 })
  const heights = useRef(new Map<string, number>())
  const retry = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const topOfWords = useRef(0)
  const words = useRef<View>(null)
  const live = useRef({
    transcript,
    windowEntries,
    currentToken,
    focusToken,
    isFollowing,
    leaveAction,
    onPress: paint.onPress,
  })
  live.current = {
    transcript,
    windowEntries,
    currentToken,
    focusToken,
    isFollowing,
    leaveAction,
    onPress: paint.onPress,
  }

  const placeOfToken = (token: string): Option.Option<number> =>
    Option.flatMap(
      Array.findFirst(live.current.transcript.passages, passage =>
        Array.some(passage.words, word => word.token === token),
      ),
      passage =>
        Option.map(
          Option.fromNullishOr(places.current.get(passage.key)),
          place => {
            const offset = Option.getOrElse(
              wordOffsetIn(
                passage.words,
                token,
                passage.label.length + labelGap.length,
              ),
              () => 0,
            )
            const maybeLine = Array.get(
              place.lines,
              lineOfOffset(place.lines, offset),
            )
            return Option.match(maybeLine, {
              onNone: () => place.y + place.height / 2,
              onSome: line => place.y + place.textY + line.y + line.height / 2,
            })
          },
        ),
    )

  // NOTE: where a word is, asked now. In a windowed list a passage's place
  // moves as others are laid out above it, so a laid-out passage is
  // measured afresh each time; one that is not laid out has no place.
  const whereIs = (
    token: string,
    then: (maybePlace: Option.Option<number>) => void,
  ): void => {
    const key = passageKeyOfToken(live.current.transcript, token)
    const part = key === undefined ? undefined : parts.current.get(key)
    if (scroll === undefined || key === undefined || part === undefined) {
      then(Option.none())
    } else {
      scroll.measure(part, (y, height) => {
        heights.current.set(key, height)
        const before = places.current.get(key) ?? {
          y: 0,
          height: 0,
          textY: 0,
          lines: noLines,
        }
        places.current.set(key, { ...before, y, height })
        then(placeOfToken(token))
      })
    }
  }

  // NOTE: goes to about where a passage that is not laid out is, worked
  // out from the nearest passage that is, measured now.
  const goNear = (token: string): void => {
    const now = live.current
    const key = passageKeyOfToken(now.transcript, token)
    const index = now.windowEntries.findIndex(entry => entry.key === key)
    if (scroll === undefined || index < 0) {
      return
    }
    const jump = (maybeAnchor: WindowAnchor | undefined): void => {
      scroll.jumpTo(
        Math.max(
          0,
          estimatedTopOf(
            now.windowEntries,
            heights.current,
            maybeAnchor,
            index,
            topOfWords.current,
          ) -
            scroll.viewport() / 2,
        ),
      )
    }
    const laidOut = Array.filter(
      Array.map(now.windowEntries, (entry, at) => ({ key: entry.key, at })),
      entry => parts.current.has(entry.key),
    )
    const maybeNearest = Array.head(
      Array.sort(
        Array.map(laidOut, entry => entry.at),
        Order.mapInput(Order.Number, (at: number) => Math.abs(at - index)),
      ),
    )
    Option.match(maybeNearest, {
      onNone: () => {
        jump(undefined)
      },
      onSome: nearest => {
        const part = parts.current.get(now.windowEntries[nearest]?.key ?? '')
        if (part === undefined) {
          jump(undefined)
        } else {
          scroll.measure(part, y => {
            jump({ index: nearest, y })
          })
        }
      },
    })
  }

  const bringToMiddle = (token: string): void => {
    if (scroll === undefined) {
      return
    }
    whereIs(
      token,
      Option.match({
        onSome: place => {
          pending.current = { token: undefined, jumps: 0 }
          scroll.scrollTo(Math.max(0, place - scroll.viewport() / 2))
        },
        // NOTE: the word's passage is not laid out: only the passages near
        // the screen are. The view goes to about where it is; when
        // passages are laid out there it is asked again, a few times at
        // most, until the word's own passage is one of them.
        onNone: () => {
          const jumps =
            pending.current.token === token ? pending.current.jumps : 0
          if (jumps < maximumJumps) {
            pending.current = { token, jumps: jumps + 1 }
            goNear(token)
          } else {
            pending.current = { token: undefined, jumps: 0 }
          }
        },
      }),
    )
  }

  // NOTE: when to follow, when to leave the view alone and when the reader
  // has left are `TranscriptFollow`'s to say, as for every painter. This
  // is the phone's part: it measures a word's line, scrolls the screen's
  // body, hears a person's own scrolls, and presses.
  useEffect(() => {
    if (scroll === undefined) {
      return undefined
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
        const token = live.current.currentToken
        if (token !== undefined) {
          // NOTE: a word whose passage is not laid out has no place, which
          // the rule takes for far away.
          whereIs(token, maybePlace => {
            answer(
              Option.map(maybePlace, place =>
                sightOf({
                  place,
                  offset: scroll.offset(),
                  viewport: scroll.viewport(),
                }),
              ),
            )
          })
        }
      },
      bringToMiddle: which => {
        const token =
          which === 'Spoken'
            ? live.current.currentToken
            : live.current.focusToken
        if (token !== undefined) {
          bringToMiddle(token)
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
    const stop = scroll.onUserScroll(() => {
      running.tell(TranscriptFollow.ScrolledByReader())
    })
    return () => {
      running.stop()
      follow.current = undefined
      stop()
    }
    // NOTE: the rule reads what is live through `live`; it is started
    // once for the scrolling body it is in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scroll])

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
    if (focusToken !== undefined) {
      follow.current?.tell(TranscriptFollow.NamedWord())
    }
  }, [focusToken])

  const notePlace = (key: string, change: Partial<PassagePlace>): void => {
    const before = places.current.get(key) ?? {
      y: 0,
      height: 0,
      textY: 0,
      lines: noLines,
    }
    places.current.set(key, { ...before, ...change })
    const isCurrentPassage = Array.some(
      live.current.transcript.passages,
      passage =>
        passage.key === key &&
        Array.some(
          passage.words,
          word => word.token === live.current.currentToken,
        ),
    )
    if (isCurrentPassage) {
      follow.current?.tell(TranscriptFollow.ChangedSpokenWord())
    }
  }

  // NOTE: what a passage tells the view is read through `noted`, so the
  // three callbacks a passage block is given never change and never make
  // it paint again.
  const noteLaidOut = (key: string, height: number): void => {
    heights.current.set(key, height)
    const waitingFor = pending.current.token
    if (waitingFor !== undefined) {
      // NOTE: a word is waited for, and passages were just laid out: ask
      // again, once they have all had their say.
      clearTimeout(retry.current)
      retry.current = setTimeout(() => {
        const token = pending.current.token
        if (token !== undefined) {
          bringToMiddle(token)
        }
      }, retryAfterMs)
    }
  }
  const noted = useRef({ notePlace, noteLaidOut, scroll })
  noted.current = { notePlace, noteLaidOut, scroll }
  const onPart = useCallback((key: string, part: View | null): void => {
    if (part === null) {
      parts.current.delete(key)
    } else {
      parts.current.set(key, part)
    }
  }, [])
  const onLaidOut = useCallback((key: string): void => {
    const part = parts.current.get(key)
    const within = noted.current.scroll
    if (within !== undefined && part !== undefined) {
      within.measure(part, (y, height) => {
        noted.current.notePlace(key, { y, height })
        noted.current.noteLaidOut(key, height)
      })
    }
  }, [])
  const onLines = useCallback(
    (key: string, lines: LaidOutLines, textY: number): void => {
      noted.current.notePlace(key, { lines, textY })
    },
    [],
  )

  const action = transcript.action
  const wordMenuAction = transcript.wordMenuAction
  const bookmarks = transcript.bookmarks
  const quietColor = colors.QuietText
  const renderEntry = useCallback<ListRenderItem<TranscriptEntry>>(
    ({ item: entry }) =>
      entry._tag === 'PassageEntry' ? (
        <PassageBlock
          action={action}
          bookmarks={bookmarks}
          onLaidOut={onLaidOut}
          onLines={onLines}
          onPart={onPart}
          paint={paint}
          passage={entry.passage}
          wordMenuAction={wordMenuAction}
        />
      ) : (
        <View
          style={{
            alignItems: 'flex-start',
            flexDirection: 'row',
            gap: 8,
            paddingHorizontal: 16,
            paddingVertical: 6,
          }}
        >
          <Text
            style={{
              color: quietColor,
              fontFamily: monoFamily,
              fontSize: labelSize,
              paddingTop: 3,
            }}
          >
            {entry.item.label}
          </Text>
          <View style={{ flex: 1 }}>{paintNode(entry.item.node)}</View>
        </View>
      ),
    [
      action,
      bookmarks,
      onLaidOut,
      onLines,
      onPart,
      paint,
      paintNode,
      quietColor,
      wordMenuAction,
    ],
  )
  const wordMenu = transcript.wordMenu
  const showOverlay = useContext(ScreenOverlayContext)
  const menuWord =
    wordMenu === undefined ? '' : wordTextOf(transcript, wordMenu.token)
  const menuSheet = useMemo(
    () =>
      wordMenu === undefined ? undefined : (
        <WordMenuSheet menu={wordMenu} paint={paint} wordText={menuWord} />
      ),
    [wordMenu, paint, menuWord],
  )
  useEffect(() => {
    if (showOverlay === undefined) {
      return undefined
    }
    showOverlay(menuSheet)
    return () => {
      showOverlay(undefined)
    }
  }, [showOverlay, menuSheet])
  return (
    <View
      ref={words}
      accessibilityLabel={transcript.label}
      onLayout={() => {
        const container = words.current
        if (scroll !== undefined && container !== null) {
          scroll.measure(container, y => {
            topOfWords.current = y
          })
        }
      }}
      style={[
        {
          alignSelf: 'stretch',
          borderRadius: passageRadius,
          paddingVertical: 4,
          ...groundStyleOf(colors.ReadingGround),
        },
        paint.styles.Transcript,
      ]}
    >
      {Array.isReadonlyArrayEmpty(transcript.passages) ? (
        <Text
          style={{
            color: colors.ReadingToCome,
            fontSize: sizes.bodySize,
            paddingVertical: 24,
            textAlign: 'center',
          }}
        >
          {transcript.emptyText}
        </Text>
      ) : null}
      <FlatList
        data={entries}
        ItemSeparatorComponent={PassageGap}
        initialNumToRender={readerWindow.initialNumToRender}
        keyExtractor={entryKeyOf}
        maxToRenderPerBatch={readerWindow.maxToRenderPerBatch}
        renderItem={renderEntry}
        scrollEnabled={false}
        windowSize={readerWindow.windowSize}
      />
      {showOverlay === undefined ? menuSheet : null}
    </View>
  )
}
