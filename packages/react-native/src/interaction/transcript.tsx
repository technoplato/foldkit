import { Array, Match as M, Option } from 'effect'
import {
  type PlacedBookmark,
  type TranscriptNode,
  type TranscriptPassage,
  type TranscriptWord,
  type TranscriptWordMenu,
  type UiNode,
  bookmarksInPassage,
  currentWordTokenAt,
  transcriptAt,
  transcriptEntriesOf,
} from 'foldkit/renderers'
import {
  type ReactElement,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Platform, Pressable, Text, type TextStyle, View } from 'react-native'

import { Icon } from './icon.js'
import { groundStyleOf } from './look.js'
import { type Paint, pressOf } from './paint.js'
import { ScreenOverlayContext, ScreenScrollContext } from './scroll.js'

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

const middleBandStart = 0.25

const middleBandEnd = 0.75

/**
 * True when a place in a scrolled view is in its middle half, where a
 * word being read is left alone.
 *
 * @example
 * ```typescript
 * isNearMiddle({ place: 500, offset: 200, viewport: 600 }) // true
 * isNearMiddle({ place: 250, offset: 200, viewport: 600 }) // false
 * ```
 */
export const isNearMiddle = (
  view: Readonly<{ place: number; offset: number; viewport: number }>,
): boolean =>
  view.place > view.offset + view.viewport * middleBandStart &&
  view.place < view.offset + view.viewport * middleBandEnd

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
}>): ReactElement => {
  const { colors, sizes } = paint.look
  const dismiss = (): void => {
    paint.onPress(pressOf(menu.dismissAction, 'Close'))
  }
  return (
    <View
      accessibilityViewIsModal
      style={{ flex: 1, justifyContent: 'flex-end' }}
    >
      <Pressable
        accessibilityLabel="Close"
        accessibilityRole="button"
        onPress={dismiss}
        style={{
          backgroundColor: colors.Scrim,
          bottom: 0,
          left: 0,
          position: 'absolute',
          right: 0,
          top: 0,
        }}
      />
      <View
        accessibilityLabel={wordText}
        accessibilityRole="menu"
        style={{
          backgroundColor: colors.RaisedSurface,
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          gap: 2,
          paddingBottom: 34,
          paddingHorizontal: 12,
          paddingTop: 14,
        }}
      >
        <Text
          style={{
            color: colors.QuietText,
            fontFamily: readingFamily,
            fontSize: 17,
            paddingBottom: 8,
            paddingHorizontal: 10,
          }}
        >
          {`“${wordText}”`}
        </Text>
        {Array.map(menu.items, item => (
          <Pressable
            key={item.action}
            accessibilityLabel={item.label}
            accessibilityRole="menuitem"
            onPress={() => {
              paint.onPress(pressOf(item.action, item.label))
            }}
            style={{
              alignItems: 'center',
              borderRadius: 10,
              flexDirection: 'row',
              gap: 12,
              minHeight: sizes.buttonHeight,
              paddingHorizontal: 10,
            }}
          >
            {item.icon === undefined ? null : (
              <Icon color={colors.QuietText} name={item.icon} size={20} />
            )}
            <Text style={{ color: colors.Text, fontSize: sizes.bodySize }}>
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  )
}

// LIVE

const liveWordEveryMs = 50

/**
 * A Transcript as it reads right now. While its clock runs, the word
 * being spoken is read from the clock many times a second and the
 * Transcript is marked again only when the word changes, so the mark
 * moves on the word while the Program hears the place once a second. A
 * Transcript with no clock, or one standing still, is painted as given.
 */
export const useLiveTranscript = (
  transcript: TranscriptNode,
): TranscriptNode => {
  const isRunning = transcript.clock !== undefined && transcript.clock.rate > 0
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    if (!isRunning) {
      return undefined
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

// VIEW

const userScrollQuietMs = 4000

const leavingScrollQuietMs = 1000

const leaveCheckAfterMs = 250

type PassagePlace = Readonly<{
  y: number
  height: number
  textY: number
  lines: LaidOutLines
}>

const noLines: LaidOutLines = []

const noBookmarks: ReadonlyArray<PlacedBookmark> = []

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
  const lastUserScrollAtMs = useRef(0)
  const leaveCheck = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  )
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
  const live = useRef({
    transcript,
    currentToken,
    isFollowing,
    leaveAction,
    onPress: paint.onPress,
  })
  live.current = {
    transcript,
    currentToken,
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

  const bringToMiddle = (token: string, isOnlyWhenAway: boolean): void => {
    if (scroll === undefined) {
      return
    }
    Option.map(placeOfToken(token), place => {
      const view = {
        place,
        offset: scroll.offset(),
        viewport: scroll.viewport(),
      }
      if (!isOnlyWhenAway || !isNearMiddle(view)) {
        scroll.scrollTo(Math.max(0, place - view.viewport / 2))
      }
    })
  }

  const followNow = (): void => {
    const now = live.current
    const quietMs =
      now.leaveAction === undefined ? userScrollQuietMs : leavingScrollQuietMs
    if (
      now.currentToken === undefined ||
      !now.isFollowing ||
      Date.now() - lastUserScrollAtMs.current < quietMs
    ) {
      return
    }
    bringToMiddle(now.currentToken, true)
  }

  useEffect(() => {
    if (scroll === undefined) {
      return undefined
    }
    const leaveIfAway = (): void => {
      const now = live.current
      if (
        now.leaveAction === undefined ||
        !now.isFollowing ||
        now.currentToken === undefined
      ) {
        return
      }
      const isAway = Option.exists(
        placeOfToken(now.currentToken),
        place =>
          !isNearMiddle({
            place,
            offset: scroll.offset(),
            viewport: scroll.viewport(),
          }),
      )
      if (isAway) {
        now.onPress(pressOf(now.leaveAction, 'Read elsewhere'))
      }
    }
    const stop = scroll.onUserScroll(() => {
      lastUserScrollAtMs.current = Date.now()
      clearTimeout(leaveCheck.current)
      leaveCheck.current = setTimeout(leaveIfAway, leaveCheckAfterMs)
    })
    return () => {
      clearTimeout(leaveCheck.current)
      stop()
    }
    // NOTE: the listener reads what is live through `live`; it is set up
    // once for the scrolling body it is in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scroll])

  useEffect(() => {
    followNow()
    // NOTE: the view follows when the word or the following changes, not
    // on every paint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentToken, isFollowing])

  useEffect(() => {
    if (focusToken !== undefined) {
      bringToMiddle(focusToken, false)
    }
    // NOTE: a named word is brought to the middle once, when it is named.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      followNow()
    }
  }

  const entries = transcriptEntriesOf(transcript)
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
      accessibilityLabel={transcript.label}
      style={[
        {
          alignSelf: 'stretch',
          borderRadius: passageRadius,
          gap: 2,
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
      {Array.map(entries, entry =>
        M.value(entry).pipe(
          M.withReturnType<ReactElement>(),
          M.tagsExhaustive({
            PassageEntry: ({ passage }) => (
              <View
                key={passage.key}
                ref={part => {
                  if (part === null) {
                    parts.current.delete(passage.key)
                  } else {
                    parts.current.set(passage.key, part)
                  }
                }}
                onLayout={() => {
                  const part = parts.current.get(passage.key)
                  if (scroll !== undefined && part !== undefined) {
                    scroll.measure(part, (y, height) => {
                      notePlace(passage.key, { y, height })
                    })
                  }
                }}
              >
                {paintPassage(
                  passage,
                  transcript,
                  transcript.bookmarks === undefined
                    ? noBookmarks
                    : bookmarksInPassage(passage, transcript.bookmarks),
                  paint,
                  (lines, textY) => {
                    notePlace(passage.key, { lines, textY })
                  },
                )}
              </View>
            ),
            ItemEntry: ({ item }) => (
              <View
                key={item.key}
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
                    color: colors.QuietText,
                    fontFamily: monoFamily,
                    fontSize: labelSize,
                    paddingTop: 3,
                  }}
                >
                  {item.label}
                </Text>
                <View style={{ flex: 1 }}>{paintNode(item.node)}</View>
              </View>
            ),
          }),
        ),
      )}
      {showOverlay === undefined ? menuSheet : null}
    </View>
  )
}
