import { Array, Match as M, Option, String } from 'effect'
import { Command, Runtime, Subscription } from 'foldkit'
import { evo } from 'foldkit/struct'
import { toString as urlToString } from 'foldkit/url'

import {
  FetchAnswers,
  FetchDeck,
  FetchFile,
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
  AnswerLog,
  AtRoot,
  Deck,
  Proposition,
  PropositionId,
  SlideId,
  cardOf,
  classifyPaste,
  cycleFilter,
  firstProposition,
  firstRoot,
  firstUnansweredSlideId,
  findProposition,
  hasAnswer,
  latestExploreStamp,
  latestStamp,
  latestUnansweredFollowUp,
  logForSlide,
  locate,
  maybePublicFile,
  neighborProposition,
  neighborSlideId,
  nextAfterAnswer,
  nextNeededFollowUp,
  previewOfLog,
  propositionsOf,
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
  PressedExplore,
  PressedFilter,
  PressedFollowUp,
  PressedRoot,
  PressedTurn,
} from './message'
import {
  ErrorDeck,
  FileBusy,
  FileFail,
  FileReady,
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
  SIM_ANSWER_ID,
  SlideRoute,
  exploreOf,
  filterOf as routeFilter,
  slideHref,
  urlToAppRoute,
} from './route'
import { view } from './view'

export {
  AppRoute,
  HomeRoute,
  NotFoundRoute,
  SIM_ANSWER_ID,
  SimRoute,
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

const loadExploreFile = (model: Model, deck: Deck): UpdateReturn => {
  const maybeExploreId = exploreOf(model.route)
  if (Option.isNone(maybeExploreId)) {
    return [model, []]
  }
  const maybeCard = maybeCurrentCard(model, deck)
  if (Option.isNone(maybeCard)) {
    return [model, []]
  }
  const maybeProposition = findProposition(
    propositionsOf(maybeCard.value),
    maybeExploreId.value,
  )
  if (Option.isNone(maybeProposition)) {
    return [model, []]
  }
  return withExploreFileLoad(model, maybeProposition.value)
}

const commandsForLoadedDeck = (
  model: Model,
  deck: Deck,
): UpdateReturn =>
  M.value(model.route).pipe(
    withUpdateReturn,
    M.tag('Slide', ({ slideId }) => {
      const filter = routeFilter(model.route)
      if (Option.isNone(locate(deck, slideId))) {
        return [model, maybeReplaceFirstSlide(firstRoot(deck), filter)]
      }
      const [withFile, fileCommands] = loadExploreFile(model, deck)
      return [
        withFile,
        [FetchAnswers(), ...maybeFetchAnswer(slideId), ...fileCommands],
      ]
    }),
    M.tag('Sim', () => [
      model,
      [FetchAnswers(), ...maybeFetchAnswer(SIM_ANSWER_ID)],
    ]),
    M.orElse(() => [
      model,
      maybeReplaceFirstSlide(firstRoot(deck), routeFilter(model.route)),
    ]),
  )

const afterReadyDeck = (model: Model, deck: Deck): UpdateReturn => {
  const ready = evo(model, {
    deckStatus: () => ReadyDeck({ deck }),
  })
  return commandsForLoadedDeck(ready, deck)
}

const goToId = (model: Model, slideId: SlideId): UpdateReturn => [
  model,
  [
    NavigateInternal({
      url: slideHref(slideId, routeFilter(model.route)),
    }),
  ],
]

const goExplore = (
  model: Model,
  maybeExplore: Option.Option<PropositionId>,
): UpdateReturn =>
  M.value(model.route).pipe(
    withUpdateReturn,
    M.tag('Slide', ({ slideId }) => [
      model,
      [
        NavigateInternal({
          url: slideHref(slideId, routeFilter(model.route), maybeExplore),
        }),
      ],
    ]),
    M.orElse(() => [model, []]),
  )

const maybeCurrentCard = (model: Model, deck: Deck) =>
  M.value(model.route).pipe(
    M.tag('Slide', ({ slideId }) =>
      Option.map(locate(deck, slideId), cardOf),
    ),
    M.orElse(() => Option.none()),
  )

const saveAsNote = (
  logs: ReadonlyArray<AnswerLog>,
  slideId: SlideId,
  isExplore: boolean,
): boolean => {
  const maybeLog = logForSlide(logs, slideId)
  if (Option.isNone(maybeLog)) {
    return false
  }
  if (isExplore) {
    return Option.isSome(latestExploreStamp(maybeLog.value))
  }
  return Option.isSome(latestStamp(maybeLog.value))
}

const isAnswerLogForRoute = (model: Model, slideId: SlideId): boolean =>
  M.value(model.route).pipe(
    M.tag('Slide', route => route.slideId === slideId),
    M.tag('Sim', () => slideId === SIM_ANSWER_ID),
    M.orElse(() => false),
  )

const commandsForProposition = (
  model: Model,
  proposition: Proposition,
): ReadonlyArray<Command.Command<Message>> => {
  if (proposition._tag !== 'File') {
    return []
  }
  const maybeFile = maybePublicFile(proposition.file)
  if (Option.isNone(maybeFile)) {
    return []
  }
  const file = maybeFile.value
  if (Object.hasOwn(model.fileCache, file)) {
    return []
  }
  return [FetchFile({ file })]
}

const withExploreFileLoad = (
  model: Model,
  proposition: Proposition,
): UpdateReturn => {
  const commands = commandsForProposition(model, proposition)
  if (proposition._tag !== 'File') {
    return [model, commands]
  }
  if (Option.isNone(Array.head(commands))) {
    return [model, commands]
  }
  const maybeFile = maybePublicFile(proposition.file)
  if (Option.isNone(maybeFile)) {
    return [model, []]
  }
  const file = maybeFile.value
  return [
    evo(model, {
      fileCache: current => ({
        ...current,
        [file]: FileBusy(),
      }),
    }),
    commands,
  ]
}

const turnExplore = (model: Model, turn: 'Prev' | 'Next'): UpdateReturn => {
  const maybeHere = exploreOf(model.route)
  if (Option.isNone(maybeHere)) {
    return [model, []]
  }
  return M.value(model.deckStatus).pipe(
    withUpdateReturn,
    M.tag('Ready', ({ deck }) => {
      const maybeCard = maybeCurrentCard(model, deck)
      if (Option.isNone(maybeCard)) {
        return [model, []]
      }
      const maybeNext = neighborProposition(
        propositionsOf(maybeCard.value),
        maybeHere.value,
        turn,
      )
      if (Option.isNone(maybeNext)) {
        return [model, []]
      }
      return goExplore(model, Option.some(maybeNext.value.id))
    }),
    M.orElse(() => [model, []]),
  )
}

const turnFrom = (model: Model, turn: 'Prev' | 'Next'): UpdateReturn => {
  if (Option.isSome(exploreOf(model.route))) {
    return turnExplore(model, turn)
  }
  return M.value(model.deckStatus).pipe(
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
}

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
          M.tag('Ready', ({ deck }) => commandsForLoadedDeck(nextModel, deck)),
          M.orElse(() => [nextModel, []]),
        )
      },

      PressedTurn: ({ turn }) => turnFrom(model, turn),

      PressedExplore: () =>
        M.value(model.deckStatus).pipe(
          withUpdateReturn,
          M.tag('Ready', ({ deck }) => {
            const maybeCard = maybeCurrentCard(model, deck)
            if (Option.isNone(maybeCard)) {
              return [model, []]
            }
            if (Option.isSome(exploreOf(model.route))) {
              return goExplore(model, Option.none())
            }
            const maybeFirst = firstProposition(
              propositionsOf(maybeCard.value),
            )
            if (Option.isNone(maybeFirst)) {
              return [model, []]
            }
            return goExplore(model, Option.some(maybeFirst.value.id))
          }),
          M.orElse(() => [model, []]),
        ),

      TurnedExplore: ({ turn }) => turnExplore(model, turn),

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
                  [
                    SaveAnswer({
                      slideId,
                      text: answer,
                      maybeExploreScope: Option.map(
                        exploreOf(model.route),
                        () => 'explore',
                      ),
                      asNote: saveAsNote(
                        model.answerLogs,
                        slideId,
                        Option.isSome(exploreOf(model.route)),
                      ),
                    }),
                  ],
                ]),
                M.tag('Sim', () => [
                  evo(model, { saveStatus: () => SaveBusy() }),
                  [
                    SaveAnswer({
                      slideId: SIM_ANSWER_ID,
                      text: answer,
                      maybeExploreScope: Option.none(),
                      asNote: saveAsNote(
                        model.answerLogs,
                        SIM_ANSWER_ID,
                        false,
                      ),
                    }),
                  ],
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
            [
              SaveAnswer({
                slideId,
                text: letter,
                maybeExploreScope: Option.map(
                  exploreOf(model.route),
                  () => 'explore',
                ),
                asNote: saveAsNote(
                  model.answerLogs,
                  slideId,
                  Option.isSome(exploreOf(model.route)),
                ),
              }),
            ],
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
        if (Option.isSome(exploreOf(model.route))) {
          return [nextModel, []]
        }
        return M.value(model.deckStatus).pipe(
          withUpdateReturn,
          M.tag('Ready', ({ deck }) =>
            M.value(model.route).pipe(
              withUpdateReturn,
              M.tag('Slide', ({ slideId }) => {
                if (hasAnswer(model.answerLogs, slideId)) {
                  return [nextModel, []]
                }
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
        if (!isAnswerLogForRoute(model, log.slideId)) {
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
        if (!isAnswerLogForRoute(model, slideId)) {
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

      SucceededFetchFile: ({ file, text }) => [
        evo(model, {
          fileCache: current => ({
            ...current,
            [file]: FileReady({ text }),
          }),
        }),
        [],
      ],

      FailedFetchFile: ({ file, error }) => [
        evo(model, {
          fileCache: current => ({
            ...current,
            [file]: FileFail({ error }),
          }),
        }),
        [],
      ],
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
        if (event.key === 'e' || event.key === 'E') {
          event.preventDefault()
          return Option.some(PressedExplore())
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
