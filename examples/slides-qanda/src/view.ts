import { Array, Match as M, Option, String } from 'effect'
import { Document, Html, html } from 'foldkit/html'

import { Button } from '@foldkit/ui'

import {
  AnswerStamp,
  At,
  AtRoot,
  Deck,
  Question,
  ShowAll,
  SlideFilter,
  cardOf,
  chosenLetterOf,
  displayText,
  filterLabel,
  filterPlace,
  firstRoot,
  latestStamp,
  locate,
  logForSlide,
  nextNeededFollowUp,
  previewOf,
} from './domain'
import { ClickedChoice, Message, PressedFollowUp } from './message'
import { Model, SaveStatus } from './model'
import { filterOf as routeFilter } from './route'

const TITLE_CLASS =
  'text-[clamp(1.6rem,4.5vw,3.2rem)] font-black tracking-tight leading-none'
const STORY_CLASS =
  'text-[clamp(1.15rem,2.5vw,1.7rem)] font-semibold leading-snug'
const MAP_CLASS =
  'text-[clamp(1.05rem,2.2vw,1.55rem)] font-mono font-bold leading-tight'
const OPTION_CLASS =
  'text-[clamp(1.15rem,2.4vw,1.8rem)] font-bold leading-snug text-left'
const CHROME_CLASS = 'text-[clamp(0.95rem,1.8vw,1.25rem)] font-bold'

const saveLine = (saveStatus: SaveStatus): string =>
  M.value(saveStatus).pipe(
    M.tagsExhaustive({
      Idle: () => 'Paste A, B, C, or a sentence.',
      Saving: () => 'Saving...',
      Saved: ({ preview }) => `Saved: ${preview}`,
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
            [`f ${filterLabel(chrome.filter)} ${chrome.place}   ← →  j k`],
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

const fullAnswerLines = (stamp: AnswerStamp): ReadonlyArray<string> => {
  const cleaned = String.trim(stamp.cleaned)
  if (String.isEmpty(cleaned)) {
    return [stamp.verbatim]
  }
  return [`Cleaned: ${cleaned}`, `Said: ${stamp.verbatim}`]
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
          h.AriaLabel('Saved answer. Hover or focus to read the full text.'),
          h.Class(`${CHROME_CLASS} saved-answer-trigger text-left`),
        ],
        [`Saved: ${preview}`],
      ),
      savedAnswerPop(h, stamp),
    ],
  )
}

const idleChrome = {
  filter: ShowAll(),
  place: '',
  hasFollowUp: false,
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
      hasFollowUp: Option.isSome(nextNeededFollowUp(at, model.answerLogs)),
    },
  )
}

const readyView = (model: Model, deck: Deck): Html =>
  M.value(model.route).pipe(
    M.tag('Slide', ({ slideId }) => {
      const maybeAt = locate(deck, slideId)
      if (Option.isNone(maybeAt)) {
        return Option.match(firstRoot(deck), {
          onNone: missingDeckView,
          onSome: root => questionView(model, deck, AtRoot({ root })),
        })
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
