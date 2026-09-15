import { Array, Match as M, Option, Record, String } from 'effect'
import { Document, Html, html } from 'foldkit/html'

import { Button } from '@foldkit/ui'

import {
  AnswerStamp,
  At,
  AtRoot,
  Deck,
  ExploreStamp,
  Proposition,
  Question,
  ShowAll,
  SlideFilter,
  cardOf,
  chosenLetterOf,
  displayText,
  emptyFilterTitle,
  filterLabel,
  filterPlace,
  findProposition,
  firstRoot,
  hasPropositions,
  hasUnansweredFollowUp,
  latestExploreStamp,
  latestStamp,
  locate,
  logForSlide,
  maybePublicFile,
  notesOf,
  previewOf,
  previewOfLog,
  propositionPlace,
  propositionsOf,
  rootOf,
  walkSlideIds,
} from './domain'
import { markdownView } from './markdownView'
import { ClickedChoice, Message, PressedFollowUp } from './message'
import { FileStatus, Model, SaveStatus } from './model'
import { SIM_ANSWER_ID, exploreOf, filterOf as routeFilter } from './route'
import { SUBMIT_ASCII } from './sim'

const TITLE_CLASS =
  'text-[clamp(1.6rem,4.5vw,3.2rem)] font-black tracking-tight leading-none'
const STORY_CLASS =
  'text-[clamp(1.15rem,2.5vw,1.7rem)] font-semibold leading-snug'
const MAP_CLASS =
  'min-w-0 w-full whitespace-pre-wrap break-words text-[clamp(1.05rem,2.2vw,1.55rem)] font-mono font-bold leading-tight'
const OPTION_CLASS =
  'text-[clamp(1.15rem,2.4vw,1.8rem)] font-bold leading-snug text-left'
const CHROME_CLASS = 'text-[clamp(0.95rem,1.8vw,1.25rem)] font-bold'

const chromeKeys = (chrome: Readonly<{
  filter: SlideFilter
  place: string
  canExplore: boolean
  explore: Option.Option<string>
}>): string => {
  if (Option.isSome(chrome.explore)) {
    return `e EXPLORE ${chrome.explore.value}   ← →  j k   e leave`
  }
  if (chrome.canExplore) {
    return `f ${filterLabel(chrome.filter)} ${chrome.place}   ← →  j k   e`
  }
  return `f ${filterLabel(chrome.filter)} ${chrome.place}   ← →  j k`
}

const saveLine = (saveStatus: SaveStatus): string =>
  M.value(saveStatus).pipe(
    M.tagsExhaustive({
      Idle: () => 'Paste A, B, C, or a sentence. After save, paste again to add a note.',
      Saving: () => 'Saving...',
      Saved: ({ preview }) => `Saved: ${preview}. Paste again to add a note.`,
      Failed: ({ error }) => `Not saved: ${error}`,
    }),
  )

const followUpMark = (h: ReturnType<typeof html<Message>>): Html =>
  h.button(
    [
      h.Type('button'),
      h.AriaLabel('Follow-up below. Press down.'),
      h.OnClick(PressedFollowUp()),
      h.Class('follow-glow'),
    ],
    [h.span([h.Class('follow-glow-arrow'), h.AriaHidden(true)], ['↓'])],
  )

const frame = (
  h: ReturnType<typeof html<Message>>,
  title: string,
  body: ReadonlyArray<Html>,
  footer: Html,
  chrome: Readonly<{
    filter: SlideFilter
    place: string
    hasFollowUp: boolean
    canExplore: boolean
    explore: Option.Option<string>
  }>,
): Html =>
  h.main(
    [
      h.Role('main'),
      h.AriaLabel('Slideshow'),
      h.Class(
        'relative h-dvh w-dvw overflow-hidden bg-zinc-950 text-zinc-50 touch-none grid grid-rows-[auto_1fr_auto]',
      ),
    ],
    [
      h.header(
        [h.Class('px-6 pt-5 pb-2 flex items-baseline justify-between gap-4')],
        [
          h.h1([h.Class(TITLE_CLASS)], [title]),
          h.p(
            [h.Class(`${CHROME_CLASS} text-zinc-400`)],
            [chromeKeys(chrome)],
          ),
        ],
      ),
      h.div(
        [h.Class('min-h-0 overflow-hidden px-6 py-3 flex flex-col gap-4')],
        body,
      ),
      h.footer(
        [h.Class('relative z-10 px-6 pb-8 pt-2'), h.AriaLive('polite')],
        [footer],
      ),
      chrome.hasFollowUp ? followUpMark(h) : h.empty,
    ],
  )

const chromeLine = (h: ReturnType<typeof html<Message>>, text: string): Html =>
  h.p([h.Class(CHROME_CLASS)], [text])

const fullAnswerLines = (stamp: {
  readonly verbatim: string
  readonly cleaned: string
  readonly notes?: ReadonlyArray<{
    readonly at: string
    readonly verbatim: string
    readonly cleaned: string
  }>
}): ReadonlyArray<string> => {
  const cleaned = String.trim(stamp.cleaned)
  const lock = String.isEmpty(cleaned)
    ? [stamp.verbatim]
    : [`Cleaned: ${cleaned}`, `Said: ${stamp.verbatim}`]
  return Array.appendAll(
    lock,
    Array.map(notesOf(stamp), note => `Note: ${displayText(note)}`),
  )
}

const savedAnswerPop = (
  h: ReturnType<typeof html<Message>>,
  stamp: AnswerStamp,
): Html =>
  h.div(
    [h.Role('note'), h.Class('saved-answer-pop')],
    Array.map(fullAnswerLines(stamp), line =>
      h.p([h.Class('saved-answer-pop-line')], [line]),
    ),
  )

const savedAnswerFooter = (
  h: ReturnType<typeof html<Message>>,
  stamp: AnswerStamp,
): Html => {
  const preview = previewOf(displayText(stamp))
  return h.div(
    [h.Class('saved-answer')],
    [
      h.button(
        [
          h.Type('button'),
          h.AriaLabel(
            'Saved answer. Paste again to add a note. Hover or focus to read the full text.',
          ),
          h.Class(`${CHROME_CLASS} saved-answer-trigger text-left`),
        ],
        [`Saved: ${preview}`],
      ),
      h.p(
        [h.Class(`${CHROME_CLASS} text-zinc-400`)],
        ['Paste again to add a note.'],
      ),
      savedAnswerPop(h, stamp),
    ],
  )
}

const idleChrome = {
  filter: ShowAll(),
  place: '',
  hasFollowUp: false,
  canExplore: false,
  explore: Option.none<string>(),
}

const loadingView = (): Html => {
  const h = html<Message>()
  return frame(
    h,
    'SLIDES',
    [h.p([h.Class(STORY_CLASS)], ['Loading deck...'])],
    chromeLine(h, ' '),
    idleChrome,
  )
}

const missingDeckView = (): Html => {
  const h = html<Message>()
  return frame(
    h,
    'NO DECK',
    [
      h.p(
        [h.Class(STORY_CLASS)],
        ['Paste a deck JSON anywhere. It writes public/deck.json.'],
      ),
      h.pre(
        [h.Class(`${MAP_CLASS} text-zinc-300`)],
        ['{ "title": "DEATH", "roots": [ ... ] }'],
      ),
    ],
    chromeLine(h, 'Paste the JSON. No click needed.'),
    idleChrome,
  )
}

const errorDeckView = (error: string): Html => {
  const h = html<Message>()
  return frame(
    h,
    'DECK FAILED',
    [
      h.pre(
        [
          h.Class(
            `${MAP_CLASS} whitespace-pre-wrap text-amber-100 leading-snug`,
          ),
        ],
        [error],
      ),
    ],
    chromeLine(h, 'Paste a new deck JSON to replace it.'),
    idleChrome,
  )
}

const optionButton = (
  option: Question['options'][number],
  isChosen: boolean,
): Html => {
  const h = html<Message>()
  const border = isChosen ? 'border-amber-300' : 'border-zinc-100'
  return Button.view<Message>({
    onClick: ClickedChoice({ letter: option.letter }),
    toView: attributes =>
      h.button(
        [
          ...attributes.button,
          h.AriaLabel(`${option.letter}. ${option.text}`),
          h.Class(
            `w-full rounded-xl border-2 ${border} bg-zinc-900 px-4 py-3 flex gap-4 items-start`,
          ),
        ],
        [
          h.span(
            [h.Class('text-[clamp(1.6rem,3vw,2.4rem)] font-black')],
            [option.letter],
          ),
          h.span([h.Class(OPTION_CLASS)], [option.text]),
        ],
      ),
  })
}

const optionRow = (
  option: Question['options'][number],
  maybeStamp: Option.Option<AnswerStamp>,
): Html => {
  const h = html<Message>()
  const maybeChosen = Option.flatMap(maybeStamp, chosenLetterOf)
  const isChosen =
    Option.isSome(maybeChosen) && maybeChosen.value === option.letter
  const button = optionButton(option, isChosen)
  if (!isChosen || Option.isNone(maybeStamp)) {
    return button
  }
  return h.div(
    [h.Class('saved-answer w-full')],
    [button, savedAnswerPop(h, maybeStamp.value)],
  )
}

const emptyFilterView = (model: Model): Html => {
  const h = html<Message>()
  const filter = routeFilter(model.route)
  const label = filterLabel(filter)
  return frame(
    h,
    emptyFilterTitle(filter),
    [
      h.p(
        [h.Class(STORY_CLASS)],
        [`No cards in ${label}. Press f for the next filter.`],
      ),
    ],
    chromeLine(h, 'Press f.'),
    {
      filter,
      place: '· / 0',
      hasFollowUp: false,
      canExplore: false,
      explore: Option.none(),
    },
  )
}

const questionView = (model: Model, deck: Deck, at: At): Html => {
  const h = html<Message>()
  const card = cardOf(at)
  const filter = routeFilter(model.route)
  const place = filterPlace(deck, model.answerLogs, filter, at)
  const placeLine = Option.match(place.index, {
    onNone: () => `· / ${place.count}`,
    onSome: index => `${index} / ${place.count}`,
  })
  const maybeStamp = Option.flatMap(
    logForSlide(model.answerLogs, card.id),
    latestStamp,
  )
  const footer = M.value(model.saveStatus).pipe(
    M.tagsExhaustive({
      Saving: () => chromeLine(h, saveLine(model.saveStatus)),
      Failed: () => chromeLine(h, saveLine(model.saveStatus)),
      Idle: () => {
        if (Option.isSome(maybeStamp)) {
          return savedAnswerFooter(h, maybeStamp.value)
        }
        return chromeLine(h, card.prompt)
      },
      Saved: () => {
        if (Option.isSome(maybeStamp)) {
          return savedAnswerFooter(h, maybeStamp.value)
        }
        return chromeLine(h, saveLine(model.saveStatus))
      },
    }),
  )

  return frame(
    h,
    card.title,
    [
      h.pre(
        [
          h.Class(
            `${MAP_CLASS} rounded-xl border-2 border-amber-300 px-4 py-3 text-amber-100`,
          ),
        ],
        [card.mapLines.join('\n')],
      ),
      h.p([h.Class(STORY_CLASS)], [card.story]),
      h.p([h.Class(TITLE_CLASS)], [card.question]),
      h.div(
        [h.Class('flex flex-col gap-2 min-h-0 overflow-hidden')],
        Array.map(card.options, option => optionRow(option, maybeStamp)),
      ),
    ],
    footer,
    {
      filter,
      place: placeLine,
      hasFollowUp: hasUnansweredFollowUp(rootOf(at), model.answerLogs),
      canExplore: hasPropositions(card),
      explore: Option.none(),
    },
  )
}

const fileBody = (
  h: ReturnType<typeof html<Message>>,
  maybeStatus: Option.Option<FileStatus>,
): Html => {
  if (Option.isNone(maybeStatus)) {
    return h.p([h.Class(STORY_CLASS)], ['Opening the file...'])
  }
  return M.value(maybeStatus.value).pipe(
    M.tagsExhaustive({
      Idle: () => h.p([h.Class(STORY_CLASS)], ['Opening the file...']),
      Loading: () => h.p([h.Class(STORY_CLASS)], ['Loading the file...']),
      Failed: ({ error }) =>
        h.p([h.Class(`${STORY_CLASS} text-amber-100`)], [error]),
      Ready: ({ text }) => markdownView(h, text),
    }),
  )
}

const exploreBody = (
  h: ReturnType<typeof html<Message>>,
  model: Model,
  proposition: Proposition,
): Html => {
  if (proposition._tag === 'Written') {
    if (
      proposition.markdown.includes('```') ||
      proposition.markdown.includes('\n\n')
    ) {
      return markdownView(h, proposition.markdown)
    }
    return h.p([h.Class(STORY_CLASS)], [proposition.markdown])
  }
  const maybeFile = maybePublicFile(proposition.file)
  if (Option.isNone(maybeFile)) {
    return h.p(
      [h.Class(`${STORY_CLASS} text-amber-100`)],
      [`Bad file path: ${proposition.file}`],
    )
  }
  return fileBody(h, Record.get(model.fileCache, maybeFile.value))
}

const explorePasteBanner = (
  h: ReturnType<typeof html<Message>>,
  status: Html,
): Html =>
  h.div(
    [
      h.Role('region'),
      h.AriaLabel('Paste feedback for this explore'),
      h.Class(
        'rounded-xl border-2 border-amber-300 bg-zinc-900 px-4 py-3 flex flex-col gap-1',
      ),
    ],
    [
      h.p(
        [h.Class(`${CHROME_CLASS} text-amber-100`)],
        ['Paste feedback for this explore'],
      ),
      h.p(
        [h.Class(`${CHROME_CLASS} text-zinc-400`)],
        [
          'Notes apply to every screen on this card, not this step only. Paste again to add a note.',
        ],
      ),
      status,
    ],
  )

const exploreFooter = (
  h: ReturnType<typeof html<Message>>,
  model: Model,
  card: Question,
): Html => {
  const maybeStamp = Option.flatMap(
    logForSlide(model.answerLogs, card.id),
    latestExploreStamp,
  )
  const status = M.value(model.saveStatus).pipe(
    M.tagsExhaustive({
      Saving: () => chromeLine(h, saveLine(model.saveStatus)),
      Failed: () => chromeLine(h, saveLine(model.saveStatus)),
      Idle: () => {
        if (Option.isSome(maybeStamp)) {
          return savedExploreFooter(h, maybeStamp.value)
        }
        return chromeLine(
          h,
          'Paste anywhere on this explore. After save, paste again to add a note.',
        )
      },
      Saved: () => {
        if (Option.isSome(maybeStamp)) {
          return savedExploreFooter(h, maybeStamp.value)
        }
        return chromeLine(h, saveLine(model.saveStatus))
      },
    }),
  )
  return explorePasteBanner(h, status)
}

const savedExploreFooter = (
  h: ReturnType<typeof html<Message>>,
  stamp: ExploreStamp,
): Html => {
  const preview = previewOf(displayText(stamp))
  return h.div(
    [h.Class('saved-answer')],
    [
      h.button(
        [
          h.Type('button'),
          h.AriaLabel(
            'Saved explore note. Paste again to add a note. Hover or focus to read the full text.',
          ),
          h.Class(`${CHROME_CLASS} saved-answer-trigger text-left`),
        ],
        [`Note: ${preview}`],
      ),
      h.p(
        [h.Class(`${CHROME_CLASS} text-zinc-400`)],
        ['Paste again to add a note.'],
      ),
      savedAnswerPop(h, stamp),
    ],
  )
}

const exploreView = (
  model: Model,
  at: At,
  proposition: Proposition,
): Html => {
  const h = html<Message>()
  const card = cardOf(at)
  const filter = routeFilter(model.route)
  const place = propositionPlace(propositionsOf(card), proposition.id)
  const placeLine = Option.match(place.index, {
    onNone: () => `· / ${place.count}`,
    onSome: index => `${index} / ${place.count}`,
  })
  return frame(
    h,
    proposition.title,
    [exploreBody(h, model, proposition)],
    exploreFooter(h, model, card),
    {
      filter,
      place: placeLine,
      hasFollowUp: hasUnansweredFollowUp(rootOf(at), model.answerLogs),
      canExplore: true,
      explore: Option.some(placeLine),
    },
  )
}

const simNoteCue = (preview: string, noteCount: number): string => {
  if (noteCount === 0) {
    return `Saved: ${preview}. Paste again to add a note.`
  }
  if (noteCount === 1) {
    return `Saved: ${preview}. 1 note. Paste again to add a note.`
  }
  return `Saved: ${preview}. ${noteCount} notes. Paste again to add a note.`
}

const simSaveLine = (model: Model): string => {
  const maybeLog = logForSlide(model.answerLogs, SIM_ANSWER_ID)
  const noteCount = Option.match(Option.flatMap(maybeLog, latestStamp), {
    onNone: () => 0,
    onSome: stamp => notesOf(stamp).length,
  })
  const savedPreview = Option.match(maybeLog, {
    onNone: () => '',
    onSome: previewOfLog,
  })
  return M.value(model.saveStatus).pipe(
    M.tagsExhaustive({
      Saving: () => saveLine(model.saveStatus),
      Failed: () => saveLine(model.saveStatus),
      Idle: () => {
        if (!String.isEmpty(savedPreview)) {
          return simNoteCue(savedPreview, noteCount)
        }
        return 'After save, paste again to add a note.'
      },
      Saved: () => {
        if (!String.isEmpty(savedPreview)) {
          return simNoteCue(savedPreview, noteCount)
        }
        return saveLine(model.saveStatus)
      },
    }),
  )
}

const simView = (model: Model): Html => {
  const h = html<Message>()
  return h.main(
    [
      h.Role('main'),
      h.AriaLabel('DEATH submit, beat 1'),
      h.Class(
        'h-dvh w-dvw overflow-auto bg-zinc-950 text-zinc-50 p-4 md:p-6 flex flex-col gap-3',
      ),
    ],
    [
      h.pre(
        [
          h.Class(
            'min-w-0 whitespace-pre font-mono text-[clamp(0.58rem,1.05vw,0.88rem)] leading-tight text-zinc-100',
          ),
        ],
        [SUBMIT_ASCII],
      ),
      h.p(
        [h.Class(`${CHROME_CLASS} text-amber-100`)],
        ['Paste feedback for this beat'],
      ),
      h.p([h.Class(`${CHROME_CLASS} text-zinc-400`)], [simSaveLine(model)]),
    ],
  )
}

const readyView = (model: Model, deck: Deck): Html =>
  M.value(model.route).pipe(
    M.tag('Sim', () => simView(model)),
    M.tag('Slide', ({ slideId }) => {
      const filter = routeFilter(model.route)
      const walk = walkSlideIds(deck, model.answerLogs, filter)
      if (Option.isNone(Array.head(walk))) {
        return emptyFilterView(model)
      }
      const maybeAt = locate(deck, slideId)
      if (Option.isNone(maybeAt)) {
        return Option.match(firstRoot(deck), {
          onNone: missingDeckView,
          onSome: root => questionView(model, deck, AtRoot({ root })),
        })
      }
      const maybeExplore = exploreOf(model.route)
      if (Option.isSome(maybeExplore)) {
        const maybeProposition = findProposition(
          propositionsOf(cardOf(maybeAt.value)),
          maybeExplore.value,
        )
        if (Option.isSome(maybeProposition)) {
          return exploreView(model, maybeAt.value, maybeProposition.value)
        }
      }
      return questionView(model, deck, maybeAt.value)
    }),
    M.tag('Home', () => {
      const h = html<Message>()
      return frame(
        h,
        deck.title,
        [h.p([h.Class(STORY_CLASS)], ['Opening the first slide...'])],
        chromeLine(h, ' '),
        idleChrome,
      )
    }),
    M.orElse(() => {
      const h = html<Message>()
      return frame(
        h,
        deck.title,
        [h.p([h.Class(STORY_CLASS)], ['No page for this URL.'])],
        chromeLine(h, '← →  j k'),
        idleChrome,
      )
    }),
  )

export const view = (model: Model): Document => {
  if (model.route._tag === 'Sim') {
    return { title: 'Submit | DEATH', body: simView(model) }
  }

  const body = M.value(model.deckStatus).pipe(
    M.tagsExhaustive({
      Loading: loadingView,
      Missing: missingDeckView,
      Error: ({ error }) => errorDeckView(error),
      Ready: ({ deck }) => readyView(model, deck),
    }),
  )

  const title = M.value(model.deckStatus).pipe(
    M.tag('Ready', ({ deck }) =>
      M.value(model.route).pipe(
        M.tag('Slide', ({ slideId }) => {
          const filter = routeFilter(model.route)
          const walk = walkSlideIds(deck, model.answerLogs, filter)
          if (Option.isNone(Array.head(walk))) {
            return `${emptyFilterTitle(filter)} | ${deck.title}`
          }
          const maybeAt = locate(deck, slideId)
          if (Option.isNone(maybeAt)) {
            return `${deck.title} | missing`
          }
          return `${cardOf(maybeAt.value).title} | ${deck.title}`
        }),
        M.orElse(() => deck.title),
      ),
    ),
    M.orElse(() => 'Slides Q&A'),
  )

  return { title, body }
}
