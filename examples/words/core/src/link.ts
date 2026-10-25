import {
  Effect,
  Match as M,
  Number as Number_,
  Option,
  Record,
  Schema as S,
  pipe,
} from 'effect'
import { Route } from 'foldkit'
import {
  type Biparser,
  ParseError,
  literal,
  param,
  r,
  slash,
} from 'foldkit/route'
import { type Url, fromString } from 'foldkit/url'

/**
 * The origin of every shared Scribe link, on the web and on the iPhone. Links shared
 * before the domain move carry `https://words.knophy.com` and still open.
 */
export const scribeLinkOrigin = 'https://words.pisspoursoftware.xyz'

/**
 * The web hosts whose shared links web Scribe opens: the origin's host, and its
 * twin on the new domain, which serves the same site. A link on either host
 * opens the same place, like `https://words.pisspoursoftware.xyz/account`.
 */
export const ScribeLinkHost = S.Literals([
  'words.pisspoursoftware.xyz',
  'words.knophy.com',
])
/**
 * The web hosts whose shared links web Scribe opens: the origin's host, and its
 * twin on the new domain, which serves the same site.
 */
export type ScribeLinkHost = typeof ScribeLinkHost.Type

/** The custom URL schemes the Scribe iPhone app registers, one per install lane. */
export const ScribeAppScheme = S.Literals([
  'scribe-shared',
  'scribe-shared-dev',
])
/** The custom URL schemes the Scribe iPhone app registers, one per install lane. */
export type ScribeAppScheme = typeof ScribeAppScheme.Type

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const agentIdentifierPattern = /^[A-Za-z0-9-]{1,64}$/

const MILLISECONDS_PER_SECOND = 1_000

const SHARE_LEAD_IN_SECONDS = 1

const matchingSegment = <K extends string>(
  name: K,
  pattern: RegExp,
  normalize: (segment: string) => string,
): Biparser<Record<K, string>> =>
  param(
    name,
    segment =>
      pattern.test(segment)
        ? Effect.succeed(Record.singleton(name, normalize(segment)))
        : Effect.fail(
            new ParseError({
              message: `Invalid ${name}`,
              expected: name,
              actual: segment,
            }),
          ),
    record => record[name],
  )

const uuidSegment = <K extends string>(name: K) =>
  matchingSegment(name, uuidPattern, segment => segment.toLowerCase())

const agentSegment = <K extends string>(name: K) =>
  matchingSegment(name, agentIdentifierPattern, segment => segment)

/** The recording list, the site's home. */
export const RecordingListRoute = r('RecordingList')
/** One recording, opened in playback. */
export const RecordingRoute = r('Recording', { recordingID: S.String })
/** One transcript section; `t` positions playback, the section is focused. */
export const SectionRoute = r('Section', {
  recordingID: S.String,
  sectionID: S.String,
  t: S.Option(S.String),
})
/** Playback of a recording positioned at `t`; `focus=route` shows the route. */
export const PlaybackRoute = r('Playback', {
  recordingID: S.String,
  t: S.Option(S.String),
  focus: S.Option(S.String),
})
/**
 * A range share of a recording (ADR 0014). A link share carries its secret
 * token as `k`, which Instant compares through `ruleParams`.
 */
export const ShareRoute = r('Share', {
  recordingID: S.String,
  shareID: S.String,
  k: S.Option(S.String),
})
/** A Stream Interactor thread in a recording. */
export const ThreadRoute = r('Thread', {
  recordingID: S.String,
  threadID: S.String,
})
/** One response in a Stream Interactor thread. */
export const ThreadResponseRoute = r('ThreadResponse', {
  recordingID: S.String,
  threadID: S.String,
  responseID: S.String,
})
/** The map of recordings and their routes. */
export const RecordingsMapRoute = r('RecordingsMap')
/**
 * Recording search. `q` is the search, kept in the address bar as the
 * listener types: `/recordings/search?q=rain%20barrel`.
 */
export const SearchRecordingsRoute = r('SearchRecordings', {
  q: S.Option(S.String),
})
/** Start a new recording: the web recorder, or a new recording in the Scribe app. */
export const NewRecordingRoute = r('NewRecording')
/** The account: who is signed in, and how the web and the iPhone share one account. */
export const AccountRoute = r('Account')
/**
 * The questions he asked, kept with their answers to learn from (Scribe ADR 0095); `q` searches them, as
 * `/questions?q=proximity`.
 */
export const QuestionsRoute = r('Questions', { q: S.Option(S.String) })
/** A path that is not a Scribe link. */
export const NotFoundRoute = r('NotFound', { path: S.String })

/** Every place a Scribe link can open. */
export const ScribeRoute = S.Union([
  RecordingListRoute,
  RecordingRoute,
  SectionRoute,
  ShareRoute,
  PlaybackRoute,
  ThreadRoute,
  ThreadResponseRoute,
  RecordingsMapRoute,
  SearchRecordingsRoute,
  NewRecordingRoute,
  AccountRoute,
  QuestionsRoute,
  NotFoundRoute,
])
/** Every place a Scribe link can open. */
export type ScribeRoute = typeof ScribeRoute.Type

const recordingListRouter = pipe(Route.root, Route.mapTo(RecordingListRoute))

const newRecordingRouter = pipe(
  literal('recording'),
  slash(literal('new')),
  Route.mapTo(NewRecordingRoute),
)

const accountRouter = pipe(literal('account'), Route.mapTo(AccountRoute))

const questionsRouter = pipe(
  literal('questions'),
  Route.query(S.Struct({ q: S.OptionFromOptional(S.String) })),
  Route.mapTo(QuestionsRoute),
)

const recordingRouter = pipe(
  literal('recording'),
  slash(uuidSegment('recordingID')),
  Route.mapTo(RecordingRoute),
)

const sectionRouter = pipe(
  literal('recording'),
  slash(uuidSegment('recordingID')),
  slash(literal('section')),
  slash(uuidSegment('sectionID')),
  Route.query(S.Struct({ t: S.OptionFromOptional(S.String) })),
  Route.mapTo(SectionRoute),
)

const shareRouter = pipe(
  literal('recording'),
  slash(uuidSegment('recordingID')),
  slash(literal('share')),
  slash(uuidSegment('shareID')),
  Route.query(S.Struct({ k: S.OptionFromOptional(S.String) })),
  Route.mapTo(ShareRoute),
)

const threadRouter = pipe(
  literal('recording'),
  slash(uuidSegment('recordingID')),
  slash(literal('thread')),
  slash(agentSegment('threadID')),
  Route.mapTo(ThreadRoute),
)

const threadResponseRouter = pipe(
  literal('recording'),
  slash(uuidSegment('recordingID')),
  slash(literal('thread')),
  slash(agentSegment('threadID')),
  slash(literal('response')),
  slash(agentSegment('responseID')),
  Route.mapTo(ThreadResponseRoute),
)

const playbackRouter = pipe(
  literal('playback'),
  slash(uuidSegment('recordingID')),
  Route.query(
    S.Struct({
      t: S.OptionFromOptional(S.String),
      focus: S.OptionFromOptional(S.String),
    }),
  ),
  Route.mapTo(PlaybackRoute),
)

const recordingsMapRouter = pipe(
  literal('recordings'),
  slash(literal('map')),
  Route.mapTo(RecordingsMapRoute),
)

const searchRecordingsRouter = pipe(
  literal('recordings'),
  slash(literal('search')),
  Route.query(S.Struct({ q: S.OptionFromOptional(S.String) })),
  Route.mapTo(SearchRecordingsRoute),
)

const scribeRouteParser = Route.oneOf(
  threadResponseRouter,
  threadRouter,
  sectionRouter,
  shareRouter,
  newRecordingRouter,
  recordingRouter,
  playbackRouter,
  recordingsMapRouter,
  searchRecordingsRouter,
  accountRouter,
  questionsRouter,
  recordingListRouter,
)

/** Parses a browser URL on either web host into the place it opens. */
export const urlToScribeRoute: (url: Url) => ScribeRoute =
  Route.parseUrlWithFallback(scribeRouteParser, NotFoundRoute)

/** The site path that opens a route, the part after the origin. */
export const scribeRouteToPath = (route: ScribeRoute): string =>
  M.value(route).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      RecordingList: () => recordingListRouter(),
      Recording: ({ recordingID }) => recordingRouter({ recordingID }),
      Section: ({ recordingID, sectionID, t }) =>
        sectionRouter({ recordingID, sectionID, t }),
      Share: ({ recordingID, shareID, k }) =>
        shareRouter({ recordingID, shareID, k }),
      Playback: ({ recordingID, t, focus }) =>
        playbackRouter({ recordingID, t, focus }),
      Thread: ({ recordingID, threadID }) =>
        threadRouter({ recordingID, threadID }),
      ThreadResponse: ({ recordingID, threadID, responseID }) =>
        threadResponseRouter({ recordingID, threadID, responseID }),
      RecordingsMap: () => recordingsMapRouter(),
      SearchRecordings: ({ q }) => searchRecordingsRouter({ q }),
      NewRecording: () => newRecordingRouter(),
      Account: () => accountRouter(),
      Questions: ({ q }) => questionsRouter({ q }),
      NotFound: ({ path }) => path,
    }),
  )

/** The canonical https link to a route, the form both the web and the iPhone share. */
export const scribeRouteToShareUrl = (route: ScribeRoute): string =>
  `${scribeLinkOrigin}${scribeRouteToPath(route)}`

/** The custom-scheme link that opens a route directly in the Scribe app. */
export const scribeRouteToAppUrl = (
  route: ScribeRoute,
  scheme: ScribeAppScheme,
): string => `${scheme}://${scribeRouteToPath(route).slice(1)}`

const isScribeAppProtocol = (protocol: string): boolean =>
  S.is(ScribeAppScheme)(protocol.replace(/:$/, ''))

const webPathOf = (url: Url): Option.Option<string> => {
  const search = Option.getOrElse(url.search, () => '')
  const query = search === '' ? '' : `?${search.replace(/^\?/, '')}`
  if (url.protocol === 'https:' && S.is(ScribeLinkHost)(url.host)) {
    return Option.some(`${url.pathname}${query}`)
  } else if (isScribeAppProtocol(url.protocol)) {
    return Option.some(
      `/${url.host}${url.pathname.replace(/^\/$/, '')}${query}`,
    )
  } else {
    return Option.none()
  }
}

/**
 * Parses a shared link, `https://words.knophy.com/...`,
 * `https://words.pisspoursoftware.xyz/...` or `scribe-shared://...`, into the
 * place it opens. Other hosts and schemes are not Scribe links.
 *
 * @example
 * ```ts
 * scribeRouteFromLink('scribe-shared://playback/7e0f...?t=41')
 * // Option.some({ _tag: 'Playback', recordingID: '7e0f...', t: Option.some('41'), ... })
 * ```
 */
export const scribeRouteFromLink = (link: string): Option.Option<ScribeRoute> =>
  pipe(
    fromString(link),
    Option.flatMap(webPathOf),
    Option.flatMap(path => fromString(`${scribeLinkOrigin}${path}`)),
    Option.map(urlToScribeRoute),
    Option.filter(route => route._tag !== 'NotFound'),
  )

/**
 * The playback position a link asks for. A missing, unreadable, or negative
 * `t` opens playback at its default position instead of rejecting the link.
 */
export const startSecondsOf = (
  t: Option.Option<string>,
): Option.Option<number> =>
  pipe(
    t,
    Option.flatMap(Number_.parse),
    Option.filter(seconds => Number.isFinite(seconds) && seconds >= 0),
  )

/**
 * Formats a `t` value the way the iPhone does: whole seconds print without a
 * fraction (`41`), others keep millisecond precision (`12.25`).
 */
export const formatStartSeconds = (seconds: number): string =>
  String(
    Math.round(seconds * MILLISECONDS_PER_SECOND) / MILLISECONDS_PER_SECOND,
  )

/**
 * The start time a shared link uses: the whole second before `seconds`, so the
 * listener hears a moment of lead-in instead of landing mid-word.
 */
export const shareableStartSeconds = (seconds: number): number =>
  Math.max(0, Math.floor(seconds) - SHARE_LEAD_IN_SECONDS)

/**
 * Whether a route shows the recording list: the list itself (`/`) or a search
 * of it (`/recordings/search?q=rain`).
 */
export const isListRoute = (route: ScribeRoute): boolean =>
  route._tag === 'RecordingList' || route._tag === 'SearchRecordings'

/** Whether a playback link asks to show the recording's route. */
export const isRouteFocus = (focus: Option.Option<string>): boolean =>
  Option.exists(focus, value => value === 'route')
