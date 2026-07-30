import { Option, Schema as S, pipe } from 'effect'
import { Route } from 'foldkit'
import { r, slash, string } from 'foldkit/route'
import { type Url, fromString } from 'foldkit/url'

/** The public route for one recording segment range. */
export const RecordingSegmentRoute = r('RecordingSegmentRoute', {
  recordingID: S.String.check(S.isNonEmpty()),
  segmentRangeID: S.String.check(S.isNonEmpty()),
})
/** The public route for one recording segment range. */
export type RecordingSegmentRoute = typeof RecordingSegmentRoute.Type

/** A browser path that does not identify one recording segment range. */
export const InvalidWordsRoute = r('InvalidWordsRoute', { path: S.String })
/** A browser path that does not identify one recording segment range. */
export type InvalidWordsRoute = typeof InvalidWordsRoute.Type

/** Every route accepted by the Words Program. */
export const WordsRoute = S.Union([RecordingSegmentRoute, InvalidWordsRoute])
/** Every route accepted by the Words Program. */
export type WordsRoute = typeof WordsRoute.Type

const recordingSegmentRouter = pipe(
  string('recordingID'),
  slash(string('segmentRangeID')),
  Route.mapTo(RecordingSegmentRoute),
)
const wordsRouteParser = Route.oneOf(recordingSegmentRouter)
const urlToRoute = Route.parseUrlWithFallback(
  wordsRouteParser,
  InvalidWordsRoute,
)

/** Parses one browser URL into the exact public Words route. */
export const urlToWordsRoute = (url: Url): WordsRoute => urlToRoute(url)

/** Parses a relative path or absolute URL into the exact public Words route. */
export const pathToWordsRoute = (pathOrCarrier: string): WordsRoute => {
  const relativePath = pathOrCarrier.startsWith('/')
    ? pathOrCarrier
    : `/${pathOrCarrier}`
  const carrier = pathOrCarrier.includes('://')
    ? pathOrCarrier
    : `https://words.invalid${relativePath}`
  const maybeUrl = fromString(carrier)
  return Option.match(maybeUrl, {
    onNone: () => InvalidWordsRoute.make({ path: pathOrCarrier }),
    onSome: urlToWordsRoute,
  })
}

/** Builds the same-origin JSON endpoint for one valid route. */
export const dataPathForRoute = (route: RecordingSegmentRoute): string =>
  `${recordingSegmentRouter({
    recordingID: route.recordingID,
    segmentRangeID: route.segmentRangeID,
  })}/data.json`
