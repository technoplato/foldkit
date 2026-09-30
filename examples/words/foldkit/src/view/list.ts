import { Array, Match as M, Option, Order } from 'effect'
import { type Html, html } from 'foldkit/html'
import {
  Account,
  Capture,
  ClickedCopyRecordingLink,
  ClickedShareRecordingLink,
  ClickedShowMoreRecordings,
  GotAccountMessage,
  type Message,
  type Model,
  RecordingRoute,
  type RecordingSummary,
  SEARCH_FIELD_ID,
  UpdatedSearchQuery,
  formatClock,
  observedRecordingIDOf,
  recordingsMatching,
  scribeRouteToPath,
  searchTermsOf,
  shortcutKeyOf,
} from 'words-core-example'

import { ShowRowMenuOnContextMenu } from '../mount.js'
import { connectCard } from './connect.js'
import { type IconName, icon } from './icon.js'
import { type ViewConfig, largeTitle } from './shell.js'
import { type BadgeTone, badge, button, spinner } from './ui.js'

const timeLabel = (startedAtMs: number): string =>
  new Date(startedAtMs).toLocaleTimeString(undefined, { timeStyle: 'short' })

const dayLabel = (startedAtMs: number): string =>
  new Date(startedAtMs).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

const deviceIconOf = (recording: RecordingSummary): IconName =>
  Option.match(recording.maybeDeviceIcon, {
    onNone: () => 'Waveform',
    onSome: device =>
      M.value(device).pipe(
        M.withReturnType<IconName>(),
        M.when('phone', () => 'Phone'),
        M.when('laptop', () => 'Laptop'),
        M.when('desktop', () => 'Laptop'),
        M.orElse(() => 'Waveform'),
      ),
  })

const deviceNameOf = (recording: RecordingSummary): Option.Option<string> =>
  Option.map(recording.maybeDeviceIcon, device =>
    M.value(device).pipe(
      M.withReturnType<string>(),
      M.when('phone', () => 'iPhone'),
      M.when('tablet', () => 'iPad'),
      M.when('laptop', () => 'Mac or web'),
      M.when('desktop', () => 'Mac'),
      M.when('watch', () => 'Apple Watch'),
      M.orElse(() => device),
    ),
  )

type Capturing = typeof Capture.Model.Capturing.Type

type RowStatus = Readonly<{
  maybeBadge: Option.Option<Readonly<{ tone: BadgeTone; text: string }>>
  durationSeconds: number
  isLive: boolean
}>

/**
 * What a row says about its recording. This browser's own recording takes the
 * recorder's phase and running time, so the row says Paused when the bar
 * does; other rows take the recording's saved activity and length.
 */
const rowStatusOf = (
  recording: RecordingSummary,
  maybeOwnCapture: Option.Option<Capturing>,
): RowStatus =>
  Option.match(maybeOwnCapture, {
    onSome: capturing => ({
      maybeBadge: Option.some(
        capturing.transport === 'Paused'
          ? { tone: 'Paused', text: 'Paused' }
          : { tone: 'Recording', text: 'Recording' },
      ),
      durationSeconds: capturing.recordedSeconds,
      isLive: true,
    }),
    onNone: () => ({
      maybeBadge: M.value(recording.activity).pipe(
        M.withReturnType<
          Option.Option<Readonly<{ tone: BadgeTone; text: string }>>
        >(),
        M.when('Recording', () =>
          Option.some({ tone: 'Recording', text: 'Recording' }),
        ),
        M.when('Playing', () =>
          Option.some({ tone: 'Playing', text: 'Playing' }),
        ),
        M.when('Idle', () => Option.none()),
        M.exhaustive,
      ),
      durationSeconds: recording.durationSeconds,
      isLive: recording.activity === 'Recording',
    }),
  })

const ownCaptureOf = (
  model: Model,
  recordingID: string,
): Option.Option<Capturing> =>
  M.value(model.capture.state).pipe(
    M.withReturnType<Option.Option<Capturing>>(),
    M.tag('Capturing', capturing =>
      capturing.draft.recordingID === recordingID
        ? Option.some(capturing)
        : Option.none(),
    ),
    M.orElse(() => Option.none()),
  )

const rowMenuItem = (
  menuID: string,
  iconName: IconName,
  label: string,
  message: Message,
): Html => {
  const h = html<Message>()
  return h.button(
    [
      h.Type('button'),
      h.Popovertarget(menuID),
      h.Popovertargetaction('hide'),
      h.OnClick(message),
      h.Class(
        'flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-subhead text-label hover:bg-fill',
      ),
    ],
    [icon(iconName, 'size-[18px] text-secondary'), label],
  )
}

/**
 * A row's actions: Copy Link, and Share Link where the browser has the
 * system share sheet, like the swipe actions in the iPhone's list. The More
 * button opens it; so does a right-click on the row.
 */
const rowMenu = (
  recording: RecordingSummary,
  menuID: string,
  anchorName: string,
  config: ViewConfig,
): ReadonlyArray<Html> => {
  const h = html<Message>()
  return [
    h.button(
      [
        h.Type('button'),
        h.Popovertarget(menuID),
        h.AriaLabel(`More Actions for ${recording.title}`),
        h.Title('More Actions'),
        h.Style({ anchorName }),
        h.Class(
          'absolute right-2 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-surface text-secondary opacity-0 shadow-sm transition hover:text-label focus-visible:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100 group-has-[:popover-open]:opacity-100 [@media(hover:none)]:opacity-100 [@media(hover:none)]:shadow-none',
        ),
      ],
      [icon('More', 'size-5')],
    ),
    h.div(
      [
        h.Id(menuID),
        h.Popover('auto'),
        h.AriaLabel(`${recording.title} actions`),
        h.Style({ positionAnchor: anchorName }),
        h.Class('menu-popover glass'),
      ],
      [
        rowMenuItem(
          menuID,
          'Link',
          'Copy Link',
          ClickedCopyRecordingLink({ recordingID: recording.id }),
        ),
        ...(config.canShareLinks
          ? [
              rowMenuItem(
                menuID,
                'Share',
                'Share Link…',
                ClickedShareRecordingLink({
                  recordingID: recording.id,
                  title: recording.title,
                }),
              ),
            ]
          : []),
      ],
    ),
  ]
}

const recordingRow =
  (model: Model, config: ViewConfig) =>
  (recording: RecordingSummary): Html => {
    const h = html<Message>()
    const menuID = `row-menu-${recording.id}`
    const isOpen = Option.exists(
      observedRecordingIDOf(model),
      recordingID => recordingID === recording.id,
    )
    const status = rowStatusOf(recording, ownCaptureOf(model, recording.id))
    const isLive = status.isLive
    const meta = Array.join(
      [
        timeLabel(recording.startedAtMs),
        formatClock(status.durationSeconds),
        ...Option.toArray(deviceNameOf(recording)),
      ],
      ' · ',
    )
    return h.li(
      [
        h.Key(recording.id),
        h.DataAttribute('row-menu', menuID),
        h.Class('group relative flex items-stretch'),
      ],
      [
        h.a(
          [
            h.Href(
              scribeRouteToPath(RecordingRoute({ recordingID: recording.id })),
            ),
            h.AriaCurrent(isOpen ? 'page' : 'false'),
            h.Class(
              `flex min-w-0 flex-1 gap-3.5 py-3.5 pl-4 pr-4 transition hover:bg-fill/60 focus-visible:-outline-offset-2 active:bg-fill [@media(hover:none)]:pr-14 ${isOpen ? 'bg-fill' : ''}`,
            ),
          ],
          [
            h.span(
              [
                h.Class(
                  `mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-[11px] ${isLive ? 'bg-accent-fill text-white' : 'bg-fill text-secondary'}`,
                ),
              ],
              [icon(deviceIconOf(recording), 'size-[18px]')],
            ),
            h.span(
              [h.Class('flex min-w-0 flex-1 flex-col gap-0.5')],
              [
                h.span(
                  [h.Class('flex flex-wrap items-center gap-x-2 gap-y-1')],
                  [
                    h.span(
                      [
                        h.Class(
                          'line-clamp-2 text-body font-semibold tracking-tight text-label',
                        ),
                      ],
                      [recording.title],
                    ),
                    ...Option.match(status.maybeBadge, {
                      onNone: () => [],
                      onSome: ({ tone, text }) => [badge(tone, text)],
                    }),
                  ],
                ),
                h.span(
                  [h.Class('tabular text-footnote text-secondary')],
                  [meta],
                ),
                ...Array.map(Array.take(recording.previewLines, 2), line =>
                  h.span(
                    [h.Class('line-clamp-1 text-subhead text-secondary')],
                    [line],
                  ),
                ),
              ],
            ),
            h.span(
              [
                h.Class(
                  'self-center pl-1 text-tertiary group-focus-within:invisible group-hover:invisible group-has-[:popover-open]:invisible [@media(hover:none)]:hidden',
                ),
              ],
              [icon('ChevronRight', 'size-4')],
            ),
          ],
        ),
        ...rowMenu(recording, menuID, `--row-${recording.id}`, config),
      ],
    )
  }

type DayGroup = Readonly<{
  label: string
  recordings: ReadonlyArray<RecordingSummary>
}>

const byNewest = Order.mapInput(
  Order.flip(Order.Number),
  (recording: RecordingSummary) => recording.startedAtMs,
)

const dayGroupsOf = (
  recordings: Array.NonEmptyReadonlyArray<RecordingSummary>,
): ReadonlyArray<DayGroup> =>
  Array.map(
    Array.groupWith(
      Array.sort(recordings, byNewest),
      (first, second) =>
        dayLabel(first.startedAtMs) === dayLabel(second.startedAtMs),
    ),
    dayRecordings => ({
      label: dayLabel(Array.headNonEmpty(dayRecordings).startedAtMs),
      recordings: dayRecordings,
    }),
  )

const dayGroupView =
  (model: Model, config: ViewConfig) =>
  (dayGroup: DayGroup): Html => {
    const h = html<Message>()
    return h.section(
      [h.Key(dayGroup.label), h.Class('flex flex-col')],
      [
        h.h2(
          [
            h.Class(
              'px-4 pb-2 pt-6 text-footnote font-semibold text-secondary',
            ),
          ],
          [dayGroup.label],
        ),
        h.ul(
          [
            h.Class(
              'card overflow-hidden rounded-[22px] [&>li+li]:border-t [&>li+li]:border-separator',
            ),
          ],
          Array.map(dayGroup.recordings, recordingRow(model, config)),
        ),
      ],
    )
  }

const emptyState = (): Html => {
  const h = html<Message>()
  return h.div(
    [
      h.Class(
        'card animate-rise flex flex-col items-center gap-3 rounded-[28px] px-6 py-14 text-center',
      ),
    ],
    [
      h.span(
        [
          h.Class(
            'inline-flex size-16 items-center justify-center rounded-full bg-accent-soft text-accent',
          ),
        ],
        [icon('Waveform', 'size-8')],
      ),
      h.h2(
        [h.Class('text-body font-semibold tracking-tight text-label')],
        ['No Recordings Yet'],
      ),
      h.p(
        [h.Class('max-w-sm text-subhead text-secondary')],
        [
          'Press New Recording to start one here, or record on your iPhone. Recordings from both show up here as they happen.',
        ],
      ),
    ],
  )
}

const skeletonRows = (): Html => {
  const h = html<Message>()
  return h.div(
    [h.Class('flex flex-col gap-2 pt-6')],
    [
      h.div(
        [
          h.Class(
            'flex items-center gap-2 px-4 pb-1 text-footnote text-secondary',
          ),
        ],
        [spinner('size-3.5 text-secondary'), 'Signing in to Scribe'],
      ),
      h.div(
        [
          h.Class(
            'card overflow-hidden rounded-[22px] [&>*+*]:border-t [&>*+*]:border-separator',
          ),
        ],
        Array.map(Array.range(1, 3), index =>
          h.div(
            [h.Key(`skeleton-${index}`), h.Class('flex gap-3.5 px-4 py-4')],
            [
              h.span([h.Class('size-9 rounded-[11px] bg-fill')], []),
              h.span(
                [h.Class('flex flex-1 flex-col gap-2')],
                [
                  h.span(
                    [h.Class('h-3.5 w-1/3 rounded-full bg-fill-strong')],
                    [],
                  ),
                  h.span([h.Class('h-3 w-1/2 rounded-full bg-fill')], []),
                  h.span([h.Class('h-3 w-5/6 rounded-full bg-fill')], []),
                ],
              ),
            ],
          ),
        ),
      ),
    ],
  )
}

const noticeCard = (
  iconName: IconName,
  title: string,
  body: string,
  actions: ReadonlyArray<Html>,
): Html => {
  const h = html<Message>()
  return h.div(
    [h.Class('card animate-rise flex flex-col gap-4 rounded-[26px] p-6')],
    [
      h.div(
        [h.Class('flex items-start gap-3')],
        [
          h.span(
            [
              h.Class(
                'inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-fill text-secondary',
              ),
            ],
            [icon(iconName, 'size-5')],
          ),
          h.div(
            [h.Class('flex flex-col gap-1')],
            [
              h.h2([h.Class('text-body font-semibold text-label')], [title]),
              h.p([h.Class('text-subhead text-secondary')], [body]),
            ],
          ),
        ],
      ),
      ...Array.match(actions, {
        onEmpty: () => [],
        onNonEmpty: nonEmpty => [
          h.div([h.Class('flex flex-wrap gap-2 pl-13')], nonEmpty),
        ],
      }),
    ],
  )
}

const searchField = (model: Model): Html => {
  const h = html<Message>()
  const isSearchPage = model.route._tag === 'SearchRecordings'
  const key = shortcutKeyOf('FocusSearch')
  return h.div(
    [h.Role('search'), h.Class('relative mt-4')],
    [
      icon(
        'Search',
        'pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-secondary',
      ),
      h.input([
        h.Id(SEARCH_FIELD_ID),
        h.Type('search'),
        h.AriaLabel('Search Recordings'),
        h.Title(`Search Recordings (${key})`),
        h.AriaKeyshortcuts(key),
        h.Placeholder('Search titles and previews'),
        h.Autocomplete('off'),
        h.Value(model.searchQuery),
        h.OnInput(query => UpdatedSearchQuery({ query })),
        ...(isSearchPage ? [h.Autofocus(true)] : []),
        h.Class(
          'min-h-11 w-full appearance-none rounded-xl border-0 bg-fill pl-10 pr-12 text-body text-label outline-none placeholder:text-secondary focus-visible:ring-2 focus-visible:ring-tint [&::-webkit-search-cancel-button]:hidden',
        ),
      ]),
      ...(model.searchQuery === ''
        ? []
        : [
            h.button(
              [
                h.Type('button'),
                h.AriaLabel('Clear Search'),
                h.Title('Clear Search'),
                h.OnClick(UpdatedSearchQuery({ query: '' })),
                h.Class(
                  'absolute right-0 top-0 inline-flex size-11 items-center justify-center rounded-xl text-secondary hover:text-label',
                ),
              ],
              [icon('Close', 'size-4')],
            ),
          ]),
    ],
  )
}

const noResults = (query: string): Html => {
  const h = html<Message>()
  return h.div(
    [
      h.Role('status'),
      h.Class(
        'card mt-6 flex flex-col items-center gap-2 rounded-[28px] px-6 py-12 text-center',
      ),
    ],
    [
      icon('Search', 'size-8 text-secondary'),
      h.h2(
        [h.Class('text-body font-semibold tracking-tight text-label')],
        [`No Results for “${query.trim()}”`],
      ),
      h.p(
        [h.Class('max-w-sm text-subhead text-secondary')],
        [
          'Search looks at each recording’s title and the two lines the list shows for it. Check the spelling, or try fewer words.',
        ],
      ),
    ],
  )
}

const recordingsContent = (
  model: Model,
  config: ViewConfig,
): ReadonlyArray<Html> => {
  const h = html<Message>()
  return M.value(model.recordings).pipe(
    M.withReturnType<ReadonlyArray<Html>>(),
    M.tagsExhaustive({
      LoadingRecordings: () => [skeletonRows()],
      FailedRecordings: ({ reason }) => [
        noticeCard('Alert', 'The recordings could not load', reason, []),
      ],
      LoadedRecordings: ({ recordings, skippedCount, maybeSkippedReason }) => [
        ...(skippedCount > 0
          ? [
              h.p(
                [
                  h.Class(
                    'mt-4 rounded-2xl bg-caution-soft px-4 py-3 text-subhead text-caution',
                  ),
                ],
                [
                  `${skippedCount} recording rows could not be read and are not shown. ${Option.getOrElse(maybeSkippedReason, () => '')}`,
                ],
              ),
            ]
          : []),
        ...(Array.isReadonlyArrayNonEmpty(recordings)
          ? [searchField(model)]
          : []),
        ...Array.match(recordingsMatching(recordings, model.searchQuery), {
          onEmpty: () =>
            Array.isReadonlyArrayNonEmpty(searchTermsOf(model.searchQuery))
              ? [noResults(model.searchQuery)]
              : [h.div([h.Class('pt-6')], [emptyState()])],
          onNonEmpty: nonEmpty =>
            Array.map(dayGroupsOf(nonEmpty), dayGroupView(model, config)),
        }),
        ...(Array.length(recordings) >= model.recordingListLimit
          ? [
              h.div(
                [h.Class('flex justify-center pt-6')],
                [button('Show More', ClickedShowMoreRecordings(), 'Gray')],
              ),
            ]
          : []),
      ],
    }),
  )
}

const bodyOf = (model: Model, config: ViewConfig): ReadonlyArray<Html> =>
  M.value(model.account.connection).pipe(
    M.withReturnType<ReadonlyArray<Html>>(),
    M.tagsExhaustive({
      CheckingAccount: () => [skeletonRows()],
      ConnectingAccount: () => [skeletonRows()],
      ConnectedAccount: () => recordingsContent(model, config),
      AwaitingIPhone: ({ access }) => {
        const h = html<Message>()
        return [h.div([h.Class('pt-6')], [connectCard(access)])]
      },
      FailedConnect: ({ reason }) => [
        noticeCard(
          'Alert',
          'Could not sign in to Scribe',
          `${reason} Trying again every few seconds.`,
          [
            button(
              'Try Now',
              GotAccountMessage({
                message: Account.checkAccountNow(),
              }),
              'Tinted',
              Option.some('Refresh'),
            ),
          ],
        ),
      ],
      FailedAccountCheck: ({ reason }) => [
        noticeCard(
          'Alert',
          'Cannot reach Scribe',
          `${reason} Trying again every few seconds.`,
          [
            button(
              'Try Now',
              GotAccountMessage({
                message: Account.checkAccountNow(),
              }),
              'Tinted',
              Option.some('Refresh'),
            ),
          ],
        ),
      ],
      SignedOutAccount: () => [
        noticeCard(
          'Person',
          'You signed out',
          'Scribe is signed out in this browser. Sign in again to see your recordings.',
          [
            button(
              'Sign In Again',
              GotAccountMessage({
                message: Account.signInAgain(),
              }),
              'Prominent',
              Option.some('Person'),
            ),
          ],
        ),
      ],
      NoAccessIdentity: () => [
        noticeCard(
          'Shield',
          'Open Scribe through Cloudflare Access',
          'This page did not receive a Cloudflare Access login. Open https://words.knophy.com and sign in with Google.',
          [],
        ),
      ],
    }),
  )

const countLabelOf = (count: number, isMore: boolean): string =>
  `${count}${isMore ? '+' : ''} ${count === 1 && !isMore ? 'recording' : 'recordings'}`

const subtitleOf = (model: Model): string =>
  M.value(model.recordings).pipe(
    M.withReturnType<string>(),
    M.tag('LoadedRecordings', ({ recordings }) =>
      model.account.connection._tag === 'ConnectedAccount'
        ? `${countLabelOf(Array.length(recordings), Array.length(recordings) >= model.recordingListLimit)}, live from every device`
        : 'Your recordings, live from every device',
    ),
    M.orElse(() => 'Your recordings, live from every device'),
  )

const listContent = (model: Model, config: ViewConfig): ReadonlyArray<Html> => {
  const h = html<Message>()
  return [
    h.div(
      [h.Class('flex flex-col gap-1 px-1')],
      [
        largeTitle('Recordings'),
        h.p([h.Class('text-subhead text-secondary')], [subtitleOf(model)]),
      ],
    ),
    ...bodyOf(model, config),
  ]
}

const sidebarColumnClass =
  'lg:sticky lg:top-14 lg:mx-0 lg:h-[calc(100dvh-3.5rem)] lg:max-w-none lg:overflow-y-auto lg:overscroll-contain lg:border-r lg:border-separator lg:px-4 lg:pb-10 lg:[&_h1]:text-large-title'

/**
 * The recording list, newest first by day, live; or the step that signs this
 * browser in. With `isSidebarOnWideScreens`, from 1024 px it becomes the
 * sidebar column beside the page, as on the iPad and the Mac.
 */
export const recordingList = (
  model: Model,
  config: ViewConfig,
  isSidebarOnWideScreens: boolean,
): Html => {
  const h = html<Message>()
  return h.main(
    [
      h.OnMount(ShowRowMenuOnContextMenu()),
      h.Class(
        `mx-auto flex w-full max-w-3xl flex-col px-4 pb-44 pt-6 sm:px-6 ${isSidebarOnWideScreens ? sidebarColumnClass : ''}`,
      ),
    ],
    listContent(model, config),
  )
}

/** The recording list as the sidebar beside another page, from 1024 px; hidden below. */
export const recordingSidebar = (model: Model, config: ViewConfig): Html => {
  const h = html<Message>()
  return h.aside(
    [
      h.AriaLabel('Recordings'),
      h.OnMount(ShowRowMenuOnContextMenu()),
      h.Class(`hidden flex-col pt-6 lg:flex ${sidebarColumnClass}`),
    ],
    listContent(model, config),
  )
}

/** What the page beside the sidebar shows on the recording list, from 1024 px. */
export const noRecordingChosen = (): Html => {
  const h = html<Message>()
  return h.div(
    [
      h.Class(
        'hidden min-h-[calc(100dvh-3.5rem)] flex-col items-center justify-center gap-3 px-6 pb-40 text-center lg:flex',
      ),
    ],
    [
      icon('Waveform', 'size-10 text-tertiary'),
      h.h2(
        [h.Class('text-body font-semibold tracking-tight text-label')],
        ['Choose a Recording'],
      ),
      h.p(
        [h.Class('max-w-sm text-subhead text-secondary')],
        [
          `Pick one from the list to read and play it here, or press ${shortcutKeyOf('NewRecording')} for a new recording.`,
        ],
      ),
    ],
  )
}
