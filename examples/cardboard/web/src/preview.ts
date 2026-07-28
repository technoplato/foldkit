import type { Message, Model } from 'cardboard-core-example'
import { Data, Effect, Match as M, Schema as S } from 'effect'
import { Runtime } from 'foldkit'
import * as Program from 'foldkit/program'
import { ts } from 'foldkit/schema'

type CardboardCore = typeof import('cardboard-core-example')

/** The versioned route prefix for generated Cardboard Open Graph images. */
export const cardboardOgImagePrefix = '/og/v1'

/** Web carriers and Open Graph fields for one resolved Cardboard route. */
export const CardboardWebPreview = ts('CardboardWebPreview', {
  content: S.String,
  deepLink: S.String,
  description: S.String,
  imageAlt: S.String,
  imageUrl: S.String,
  pageUrl: S.String,
  portableRoute: S.String,
  title: S.String,
})
/** Web carriers and Open Graph fields for one resolved Cardboard route. */
export type CardboardWebPreview = typeof CardboardWebPreview.Type

/** A Cardboard route cannot be represented as a public web preview. */
export class CardboardWebPreviewError extends Data.TaggedError(
  'CardboardWebPreviewError',
)<{ readonly message: string }> {}

const modelForRoute = (
  route: Program.ProgramRoute<Model, Message>,
  cardboardCore: CardboardCore,
): Effect.Effect<Model, CardboardWebPreviewError> =>
  M.value(route).pipe(
    M.withReturnType<Effect.Effect<Model, CardboardWebPreviewError>>(),
    M.tagsExhaustive({
      State: ({ model }) => Effect.succeed(model),
      Replay: ({ frame, tape }) =>
        Runtime.replayToFrame(cardboardCore.CardboardProgram, tape, frame).pipe(
          Effect.mapError(
            error => new CardboardWebPreviewError({ message: error.message }),
          ),
        ),
      SavedReplay: ({ tapeId }) =>
        Effect.fail(
          new CardboardWebPreviewError({
            message: `Saved replay ${tapeId} needs a ReplayTapeStore`,
          }),
        ),
    }),
  )

const imagePathForPortableRoute = (portableRoute: string): string => {
  const queryIndex = portableRoute.indexOf('?')
  const pathname =
    queryIndex === -1 ? portableRoute : portableRoute.slice(0, queryIndex)
  const search = queryIndex === -1 ? '' : portableRoute.slice(queryIndex)
  return `${cardboardOgImagePrefix}${pathname}.png${search}`
}

/** Recovers a portable Cardboard route from one generated-image request. */
export const portableRouteForOgImageUrl = (url: URL): string | undefined => {
  if (
    !url.pathname.startsWith(cardboardOgImagePrefix) ||
    !url.pathname.endsWith('.png')
  ) {
    return undefined
  }
  const pathname = url.pathname.slice(
    cardboardOgImagePrefix.length,
    -'.png'.length,
  )
  return `${pathname}${url.search}`
}

/** Resolves one public Cardboard route into web and native preview carriers. */
export const resolveCardboardWebPreview = (
  relativeRoute: string,
  config: Readonly<{ deepLinkOrigin: string; pageOrigin: string }>,
): Effect.Effect<CardboardWebPreview, CardboardWebPreviewError> =>
  Effect.gen(function* () {
    const cardboardCore = yield* Effect.tryPromise({
      try: () => import('cardboard-core-example'),
      catch: error =>
        new CardboardWebPreviewError({
          message: `Cardboard core could not load: ${String(error)}`,
        }),
    })
    const route = yield* cardboardCore.CardboardRouter.parse(
      relativeRoute,
    ).pipe(
      Effect.mapError(
        error => new CardboardWebPreviewError({ message: error.message }),
      ),
    )
    const model = yield* modelForRoute(route, cardboardCore)
    const portableRoute = yield* cardboardCore.CardboardRouter.print(
      route,
    ).pipe(
      Effect.mapError(
        error => new CardboardWebPreviewError({ message: error.message }),
      ),
    )
    const preview = cardboardCore.cardboardPreview(model)
    const pageUrl = new URL(portableRoute, config.pageOrigin).toString()
    const deepLink = `${config.deepLinkOrigin}${portableRoute}`
    const imageUrl = new URL(
      imagePathForPortableRoute(portableRoute),
      config.pageOrigin,
    ).toString()

    return CardboardWebPreview({
      content: preview.content,
      deepLink,
      description: preview.description,
      imageAlt: `${preview.description} Web URL ${pageUrl}. Deep link ${deepLink}.`,
      imageUrl,
      pageUrl,
      portableRoute,
      title: preview.title,
    })
  })
