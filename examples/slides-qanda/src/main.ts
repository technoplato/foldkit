import { Array, Match as M, Option, String } from 'effect'
import { Command, Runtime, Subscription } from 'foldkit'
import { evo } from 'foldkit/struct'
import { toString as urlToString } from 'foldkit/url'

import {
  FetchAnswers,
  FetchDeck,
  LoadExternal,
  NavigateInternal,
  ReplaceInternal,
  SaveAnswer,
  SaveDeck,
  maybeFetchAnswer,
  maybeReplaceFirstSlide,
  watchStream,
} from './command'
import {
  AtRoot,
  Deck,
  SlideId,
  classifyPaste,
  cycleFilter,
  firstRoot,
  firstUnansweredSlideId,
  latestUnansweredFollowUp,
  locate,
  neighborSlideId,
  nextAfterAnswer,
  nextNeededFollowUp,
  previewOfLog,
  replaceLog,
  rootOf,
} from './domain'
import {
  BeganPointer,
  ChangedUrl,
  ClickedLink,
  EndedPointer,
  Message,
  PastedText,
  PressedFilter,
  PressedFollowUp,
  PressedRoot,
  PressedTurn,
} from './message'
import {
  ErrorDeck,
  MissingDeck,
  Model,
  ReadyDeck,
  SaveBusy,
  SaveFail,
  SaveIdle,
  SaveOk,
  emptyModel,
} from './model'
import {
  SlideRoute,
  filterOf as routeFilter,
  slideHref,
  urlToAppRoute,
} from './route'
import { view } from './view'

export {
  AppRoute,
  HomeRoute,
  NotFoundRoute,
  SlideRoute,
  urlToAppRoute,
} from './route'
export { ChangedUrl, ClickedLink, Message }
export { Model }

const SWIPE_MIN_PX = 48

// INIT

export const init: Runtime.RoutingApplicationInit<Model, Message> = url => {
  const route = urlToAppRoute(url)
  return [emptyModel(route), [FetchDeck()]]
}

type UpdateReturn = readonly [Model, ReadonlyArray<Command.Command<Message>>]
const withUpdateReturn = M.withReturnType<UpdateReturn>()

const commandsForLoadedDeck = (
  model: Model,
  deck: Deck,
): ReadonlyArray<Command.Command<Message>> =>
  M.value(model.route).pipe(
    M.withReturnType<ReadonlyArray<Command.Command<Message>>>(),
    M.tag('Slide', ({ slideId }) => {
      const filter = routeFilter(model.route)
      if (Option.isNone(locate(deck, slideId))) {
        return maybeReplaceFirstSlide(firstRoot(deck), filter)
      }
      return [FetchAnswers(), ...maybeFetchAnswer(slideId)]
    }),
    M.orElse(() =>
      maybeReplaceFirstSlide(firstRoot(deck), routeFilter(model.route)),
    ),
  )

const afterReadyDeck = (model: Model, deck: Deck): UpdateReturn => {
  const ready = evo(model, {
    deckStatus: () => ReadyDeck({ deck }),
  })
  return [ready, commandsForLoadedDeck(ready, deck)]
}

const goToId = (model: Model, slideId: SlideId): UpdateReturn => [
  model,
  [
    NavigateInternal({
      url: slideHref(slideId, routeFilter(model.route)),
    }),
  ],
]

const turnFrom = (model: Model, turn: 'Prev' | 'Next'): UpdateReturn =>
  M.value(model.deckStatus).pipe(
    withUpdateReturn,
    M.tag('Ready', ({ deck }) => {
      const filter = routeFilter(model.route)
      const current = M.value(model.route).pipe(
        M.tag('Slide', ({ slideId }) => locate(deck, slideId)),
        M.orElse(() => Option.map(firstRoot(deck), root => AtRoot({ root }))),
      )
      if (Option.isNone(current)) {
        return [model, []]
      }
      const maybeNext = neighborSlideId(
        deck,
        model.answerLogs,
        filter,
        current.value,
        turn,
      )
      if (Option.isNone(maybeNext)) {
        return [model, []]
      }
      return goToId(model, maybeNext.value)
    }),
    M.orElse(() => [model, []]),
  )

// UPDATE

export const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    withUpdateReturn,
    M.tagsExhaustive({
      CompletedNavigateInternal: () => [model, []],
      CompletedLoadExternal: () => [model, []],

      ClickedLink: ({ request }) =>
        M.value(request).pipe(
          withUpdateReturn,
          M.tagsExhaustive({
            Internal: ({ url }) => [
              model,
              [NavigateInternal({ url: urlToString(url) })],
            ],
            External: ({ href }) => [model, [LoadExternal({ href })]],
          }),
        ),

      ChangedUrl: ({ url }) => {
        const nextRoute = urlToAppRoute(url)
        const nextModel = evo(model, {
          route: () => nextRoute,
          saveStatus: () => SaveIdle(),
          maybePointerStartX: () => Option.none(),
        })
        return M.value(model.deckStatus).pipe(
          withUpdateReturn,
          M.tag('Ready', ({ deck }) => [
            nextModel,
            commandsForLoadedDeck(nextModel, deck),
          ]),
          M.orElse(() => [nextModel, []]),
        )
      },

      PressedTurn: ({ turn }) => turnFrom(model, turn),

      PressedFilter: () =>
        M.value(model.route).pipe(
          withUpdateReturn,
          M.tag('Slide', ({ slideId }) => {
            const nextFilter = cycleFilter(routeFilter(model.route))
            const targetId = M.value(model.deckStatus).pipe(
              M.tag('Ready', ({ deck }) => {
                if (nextFilter._tag === 'FollowUp') {
                  const maybeLatest = latestUnansweredFollowUp(
                    deck,
                    model.answerLogs,
                  )
                  if (Option.isNone(maybeLatest)) {
                    return slideId
                  }
                  return maybeLatest.value.id
                }
                if (nextFilter._tag === 'Unanswered') {
                  const maybeFirst = firstUnansweredSlideId(
                    deck,
                    model.answerLogs,
                  )
                  if (Option.isNone(maybeFirst)) {
                    return slideId
                  }
                  return maybeFirst.value
                }
                return slideId
              }),
              M.orElse(() => slideId),
            )
            return [
              model,
              [
                NavigateInternal({
                  url: slideHref(targetId, nextFilter),
                }),
              ],
            ]
          }),
          M.orElse(() => [model, []]),
        ),

      PressedFollowUp: () =>
        M.value(model.deckStatus).pipe(
          withUpdateReturn,
          M.tag('Ready', ({ deck }) =>
            M.value(model.route).pipe(
              withUpdateReturn,
              M.tag('Slide', ({ slideId }) => {
                const maybeAt = locate(deck, slideId)
                if (Option.isNone(maybeAt)) {
                  return [model, []]
                }
                const maybeFollowUp = nextNeededFollowUp(
                  maybeAt.value,
                  model.answerLogs,
                )
                if (Option.isNone(maybeFollowUp)) {
                  return [model, []]
                }
                return goToId(model, maybeFollowUp.value.id)
              }),
              M.orElse(() => [model, []]),
            ),
          ),
          M.orElse(() => [model, []]),
        ),

      PressedRoot: () =>
        M.value(model.deckStatus).pipe(
          withUpdateReturn,
          M.tag('Ready', ({ deck }) =>
            M.value(model.route).pipe(
              withUpdateReturn,
              M.tag('Slide', ({ slideId }) => {
                const maybeAt = locate(deck, slideId)
                if (Option.isNone(maybeAt)) {
                  return [model, []]
                }
                return goToId(model, rootOf(maybeAt.value).id)
              }),
              M.orElse(() => [model, []]),
            ),
          ),
          M.orElse(() => [model, []]),
        ),

      BeganPointer: ({ x }) => [
        evo(model, {
          maybePointerStartX: () => Option.some(x),
        }),
        [],
      ],

      EndedPointer: ({ x }) => {
        if (Option.isNone(model.maybePointerStartX)) {
          return [model, []]
        }
        const delta = x - model.maybePointerStartX.value
        const cleared = evo(model, {
          maybePointerStartX: () => Option.none(),
        })
        if (Math.abs(delta) < SWIPE_MIN_PX) {
          return [cleared, []]
        }
        const turn = delta < 0 ? 'Next' : 'Prev'
        return turnFrom(cleared, turn)
      },

      PastedText: ({ text }) => {
        const trimmed = String.trim(text)
        if (String.isEmpty(trimmed)) {
          return [model, []]
        }
        return M.value(classifyPaste(trimmed)).pipe(
          withUpdateReturn,
          M.tagsExhaustive({
            PastedDeck: ({ deck }) => [model, [SaveDeck({ deck })]],
            PastedBrokenDeck: ({ error }) => [
              evo(model, {
                deckStatus: () => ErrorDeck({ error }),
              }),
              [],
            ],
            PastedAnswer: ({ text: answer }) =>
              M.value(model.route).pipe(
                withUpdateReturn,
                M.tag('Slide', ({ slideId }) => [
                  evo(model, { saveStatus: () => SaveBusy() }),
                  [SaveAnswer({ slideId, text: answer })],
                ]),
                M.orElse(() => [model, []]),
              ),
          }),
        )
      },

      ClickedChoice: ({ letter }) =>
        M.value(model.route).pipe(
          withUpdateReturn,
          M.tag('Slide', ({ slideId }) => [
            evo(model, { saveStatus: () => SaveBusy() }),
            [SaveAnswer({ slideId, text: letter })],
          ]),
          M.orElse(() => [model, []]),
        ),

      HeardWatch: ({ kind }) => {
        if (kind === 'deck') {
          return [model, [FetchDeck()]]
        }
        return [model, [FetchAnswers()]]
      },

      SucceededFetchDeck: ({ deck }) =>
        Array.match(deck.roots, {
          onEmpty: () => [evo(model, { deckStatus: () => MissingDeck() }), []],
          onNonEmpty: () => afterReadyDeck(model, deck),
        }),

      FailedFetchDeck: ({ error }) => [
        evo(model, {
          deckStatus: () =>
            error === 'missing' ? MissingDeck() : ErrorDeck({ error }),
        }),
        [],
      ],

      SucceededSaveDeck: ({ deck }) =>
        Array.match(deck.roots, {
          onEmpty: () => [evo(model, { deckStatus: () => MissingDeck() }), []],
          onNonEmpty: roots => {
            const first = Array.headNonEmpty(roots)
            return [
              evo(model, {
                deckStatus: () => ReadyDeck({ deck }),
                route: () => SlideRoute({ slideId: first.id }),
                saveStatus: () => SaveIdle(),
              }),
              [
                ReplaceInternal({
                  url: slideHref(first.id, routeFilter(model.route)),
                }),
              ],
            ]
          },
        }),

      FailedSaveDeck: ({ error }) => [
        evo(model, {
          deckStatus: () => ErrorDeck({ error }),
        }),
        [],
      ],

      SucceededSaveAnswer: ({ log }) => {
        const nextLogs = replaceLog(model.answerLogs, log)
        const nextModel = evo(model, {
          saveStatus: () => SaveOk({ preview: previewOfLog(log) }),
          answerLogs: () => nextLogs,
        })
        return M.value(model.deckStatus).pipe(
          withUpdateReturn,
          M.tag('Ready', ({ deck }) =>
            M.value(model.route).pipe(
              withUpdateReturn,
              M.tag('Slide', ({ slideId }) => {
                const maybeAt = locate(deck, slideId)
                if (Option.isNone(maybeAt)) {
                  return [nextModel, []]
                }
                const maybeNext = nextAfterAnswer(
                  deck,
                  nextLogs,
                  routeFilter(model.route),
                  maybeAt.value,
                )
                if (Option.isNone(maybeNext)) {
                  return [nextModel, []]
                }
                if (maybeNext.value === slideId) {
                  return [nextModel, []]
                }
                return [
                  nextModel,
                  [
                    NavigateInternal({
                      url: slideHref(maybeNext.value, routeFilter(model.route)),
                    }),
                  ],
                ]
              }),
              M.orElse(() => [nextModel, []]),
            ),
          ),
          M.orElse(() => [nextModel, []]),
        )
      },

      FailedSaveAnswer: ({ error }) => [
        evo(model, {
          saveStatus: () => SaveFail({ error }),
        }),
        [],
      ],

      SucceededFetchAnswer: ({ log }) => {
        if (
          model.route._tag !== 'Slide' ||
          model.route.slideId !== log.slideId
        ) {
          return [model, []]
        }
        return [
          evo(model, {
            saveStatus: () => SaveOk({ preview: previewOfLog(log) }),
            answerLogs: current => replaceLog(current, log),
          }),
          [],
        ]
      },

      MissedFetchAnswer: ({ slideId }) => {
        if (model.route._tag !== 'Slide' || model.route.slideId !== slideId) {
          return [model, []]
        }
        return [evo(model, { saveStatus: () => SaveIdle() }), []]
      },

      FailedFetchAnswer: ({ error }) => [
        evo(model, {
          saveStatus: () => SaveFail({ error }),
        }),
        [],
      ],

      SucceededFetchAnswers: ({ logs }) => [
        evo(model, {
          answerLogs: () => logs,
        }),
        [],
      ],

      FailedFetchAnswers: () => [model, []],
    }),
  )

// SUBSCRIPTION

export const subscriptions = Subscription.make<Model, Message>()(() => ({
  keyboard: Subscription.persistent(
    Subscription.fromEventFilterMap<KeyboardEvent, Message>({
      target: document,
      type: 'keydown',
      toMessage: event => {
        if (event.metaKey || event.ctrlKey || event.altKey) {
          return Option.none()
        }
        if (
          event.key === 'ArrowRight' ||
          event.key === 'j' ||
          event.key === 'J'
        ) {
          event.preventDefault()
          return Option.some(PressedTurn({ turn: 'Next' }))
        }
        if (
          event.key === 'ArrowLeft' ||
          event.key === 'k' ||
          event.key === 'K'
        ) {
          event.preventDefault()
          return Option.some(PressedTurn({ turn: 'Prev' }))
        }
        if (event.key === 'ArrowDown') {
          event.preventDefault()
          return Option.some(PressedFollowUp())
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault()
          return Option.some(PressedRoot())
        }
        if (event.key === 'f' || event.key === 'F') {
          event.preventDefault()
          return Option.some(PressedFilter())
        }
        return Option.none()
      },
    }),
  ),
  paste: Subscription.persistent(
    Subscription.fromEventFilterMap<ClipboardEvent, Message>({
      target: document,
      type: 'paste',
      toMessage: event => {
        const text = event.clipboardData?.getData('text/plain') ?? ''
        if (String.isEmpty(String.trim(text))) {
          return Option.none()
        }
        event.preventDefault()
        return Option.some(PastedText({ text }))
      },
    }),
  ),
  pointerDown: Subscription.persistent(
    Subscription.fromEventFilterMap<PointerEvent, Message>({
      target: document,
      type: 'pointerdown',
      toMessage: event => {
        if (!event.isPrimary) {
          return Option.none()
        }
        return Option.some(BeganPointer({ x: event.clientX }))
      },
    }),
  ),
  pointerUp: Subscription.persistent(
    Subscription.fromEventFilterMap<PointerEvent, Message>({
      target: document,
      type: 'pointerup',
      toMessage: event => {
        if (!event.isPrimary) {
          return Option.none()
        }
        return Option.some(EndedPointer({ x: event.clientX }))
      },
    }),
  ),
  watch: Subscription.persistent(watchStream),
}))

export { view }
