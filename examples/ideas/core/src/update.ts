import { Array, Effect, Match as M, Option } from 'effect'
import { Command } from 'foldkit'
import { evo } from 'foldkit/struct'

import { type Idea, seedIdeas } from './catalog.js'
import { FailedObserveIdeas, type Message, ObservedIdeas } from './message.js'
import {
  type CatalogState,
  FailedCatalog,
  LoadedCatalog,
  type Model,
} from './model.js'
import { IdeasStore } from './store.js'

// COMMAND

/** Loads one catalog snapshot through the injected Ideas store. */
export const LoadCatalog = Command.define(
  'LoadCatalog',
  ObservedIdeas,
  FailedObserveIdeas,
)(
  Effect.gen(function* () {
    const store = yield* IdeasStore
    const snapshot = yield* store.fetch.pipe(Effect.option)
    if (snapshot._tag === 'None') {
      return FailedObserveIdeas.make({ reason: 'catalog failed' })
    }
    return ObservedIdeas.make({
      ideas: snapshot.value.ideas,
      source: snapshot.value.source,
    })
  }),
)

// UPDATE

/** Ideas currently visible for the active query. */
export const visibleIdeas = (model: Model): ReadonlyArray<Idea> => {
  const ideas = ideasFromCatalog(model.catalog)
  if (model.query === '') {
    return ideas
  }
  const needle = model.query.toLowerCase()
  return Array.filter(
    ideas,
    idea =>
      idea.title.toLowerCase().includes(needle) ||
      idea.body.toLowerCase().includes(needle),
  )
}

/** Ideas from a catalog state, seed notes while loading or failed. */
export const ideasFromCatalog = (catalog: CatalogState): ReadonlyArray<Idea> =>
  M.value(catalog).pipe(
    M.withReturnType<ReadonlyArray<Idea>>(),
    M.tagsExhaustive({
      LoadingCatalog: () => seedIdeas,
      LoadedCatalog: ({ ideas }) => ideas,
      FailedCatalog: () => seedIdeas,
    }),
  )

/** Applies one Ideas Message to the current Model. */
export const update = (
  model: Model,
  message: Message,
): readonly [
  Model,
  ReadonlyArray<Command.Command<Message, never, IdeasStore>>,
] =>
  M.value(message).pipe(
    M.withReturnType<
      readonly [
        Model,
        ReadonlyArray<Command.Command<Message, never, IdeasStore>>,
      ]
    >(),
    M.tagsExhaustive({
      ObservedIdeas: ({ ideas, source }) => [
        evo(model, {
          catalog: () => LoadedCatalog.make({ ideas }),
          source: () => source,
        }),
        [],
      ],
      FailedObserveIdeas: ({ reason }) => [
        evo(model, {
          catalog: () => FailedCatalog.make({ reason }),
          source: () => 'StaticFallback',
        }),
        [],
      ],
      ClickedIdea: ({ id }) => [
        evo(model, { selectedId: () => Option.some(id) }),
        [],
      ],
      ClosedIdea: () => [evo(model, { selectedId: () => Option.none() }), []],
      UpdatedQuery: ({ query }) => [evo(model, { query: () => query }), []],
    }),
  )
