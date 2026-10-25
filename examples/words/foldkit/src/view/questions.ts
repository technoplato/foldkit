import { Array, Match as M, Option, String, pipe } from 'effect'
import { type Html, html } from 'foldkit/html'
import {
  GotQuestionsMessage,
  type Message,
  type Model,
  Questions,
  QuestionsRoute,
  SectionRoute,
  ThreadRoute,
  scribeRouteToPath,
} from 'words-core-example'

import { icon } from './icon.js'
import { largeTitle } from './shell.js'
import { badge, spinner } from './ui.js'

type Question = Questions.Model.Question
type Answer = Questions.Model.Answer
type Stretch = Questions.Model.Stretch
type QuestionFilter = Questions.Model.QuestionFilter

const ISSUES_ORIGIN = 'https://issues.pisspoursoftware.xyz'

const FILTERS: ReadonlyArray<
  Readonly<{ filter: QuestionFilter; label: string }>
> = [
  { filter: 'All', label: 'All' },
  { filter: 'Learning', label: 'To Learn' },
  { filter: 'Open', label: 'Open' },
]

const toQuestions = (message: Questions.Message.Message): Message =>
  GotQuestionsMessage({ message })

const whenLabel = (atMs: number): string =>
  new Date(atMs).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

const linesLabel = (stretch: Stretch): string =>
  stretch.lastLineIndex > stretch.firstLineIndex
    ? `#${stretch.firstLineIndex}-${stretch.lastLineIndex}`
    : `#${stretch.firstLineIndex}`

const sectionPathOf = (stretch: Stretch): string =>
  scribeRouteToPath(
    SectionRoute({
      recordingID: stretch.recordingID,
      sectionID: stretch.segmentID,
      t: Option.some(stretch.startSeconds.toFixed(2)),
    }),
  )

const searchPathOf = (words: string): string =>
  scribeRouteToPath(QuestionsRoute({ q: Option.some(words) }))

const unquoted = (quote: string): string =>
  pipe(quote, String.replaceAll(/" "/g, ' '), String.replaceAll(/^"|"$/g, ''))

const searchField = (model: Model): Html => {
  const h = html<Message>()
  return h.div(
    [h.Role('search'), h.Class('relative mt-4')],
    [
      icon(
        'Search',
        'pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-secondary',
      ),
      h.input([
        h.Type('search'),
        h.AriaLabel('Search Questions'),
        h.Placeholder('Search questions, his words, answers and topics'),
        h.Autocomplete('off'),
        h.Autofocus(true),
        h.Value(model.questions.search),
        h.OnInput(value => toQuestions(Questions.searchQuestions({ value }))),
        h.Class(
          'min-h-11 w-full appearance-none rounded-xl border-0 bg-fill pl-10 pr-12 text-body text-label outline-none placeholder:text-secondary focus-visible:ring-2 focus-visible:ring-tint [&::-webkit-search-cancel-button]:hidden',
        ),
      ]),
      ...(String.isEmpty(model.questions.search)
        ? []
        : [
            h.button(
              [
                h.Type('button'),
                h.AriaLabel('Clear Search'),
                h.Title('Clear Search'),
                h.OnClick(
                  toQuestions(Questions.searchQuestions({ value: '' })),
                ),
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

const filterBar = (model: Model): Html => {
  const h = html<Message>()
  return h.div(
    [
      h.Role('group'),
      h.AriaLabel('Which Questions'),
      h.Class('mt-3 flex gap-2'),
    ],
    Array.map(FILTERS, ({ filter, label }) => {
      const isChosen = model.questions.filter === filter
      return h.button(
        [
          h.Key(filter),
          h.Type('button'),
          h.AriaPressed(isChosen ? 'true' : 'false'),
          h.OnClick(toQuestions(Questions.filterQuestions({ filter }))),
          h.Class(
            `inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-subhead font-semibold transition ${isChosen ? 'bg-label text-canvas' : 'bg-fill text-label hover:bg-fill-strong'}`,
          ),
        ],
        [
          label,
          ' ',
          h.span(
            [h.Class(isChosen ? 'text-canvas/70' : 'text-secondary')],
            [`${Questions.Model.countFor(model.questions, filter)}`],
          ),
        ],
      )
    }),
  )
}

const stretchView = (stretch: Stretch): Html => {
  const h = html<Message>()
  return h.blockquote(
    [
      h.Key(`${stretch.recordingID}-${stretch.segmentID}-${stretch.role}`),
      h.Class('border-l-2 border-separator pl-3'),
    ],
    [
      h.p([h.Class('text-body text-label')], [unquoted(stretch.quote)]),
      h.a(
        [
          h.Href(sectionPathOf(stretch)),
          h.Class(
            'mt-1 inline-flex min-h-11 items-center gap-1 text-footnote font-medium text-tint hover:underline',
          ),
        ],
        [
          `${stretch.role === 'Refined' ? 'Came back to it' : 'Asked'} at ${linesLabel(stretch)} · ${whenLabel(stretch.startedAtMs)}`,
          icon('ChevronRight', 'size-3.5'),
        ],
      ),
    ],
  )
}

const answererLabel = (answer: Answer): string =>
  M.value(answer.answeredBy).pipe(
    M.withReturnType<string>(),
    M.when('Agent', () => answer.answererName),
    M.when('Michael', () => 'Michael'),
    M.when('Person', () => answer.answererName),
    M.when('Source', () => answer.answererName),
    M.exhaustive,
  )

const paragraphsOf = (text: string): ReadonlyArray<string> =>
  pipe(
    text,
    String.split(/\n\s*\n/),
    Array.map(String.trim),
    Array.filter(String.isNonEmpty),
  )

const answerView = (question: Question, answer: Answer): Html => {
  const h = html<Message>()
  const threadLinks = Option.match(
    Option.all({
      threadID: answer.maybeThreadID,
      recordingID: question.maybeRecordingID,
    }),
    {
      onNone: () => [],
      onSome: ({ threadID, recordingID }) => [
        h.a(
          [
            h.Href(scribeRouteToPath(ThreadRoute({ recordingID, threadID }))),
            h.Class(
              'inline-flex min-h-11 items-center gap-1 text-footnote font-medium text-tint hover:underline',
            ),
          ],
          ['Open the thread', icon('ChevronRight', 'size-3.5')],
        ),
      ],
    },
  )
  const sourceLinks = Option.match(answer.maybeUrl, {
    onNone: () => [],
    onSome: url => [
      h.a(
        [
          h.Href(url),
          h.Target('_blank'),
          h.Rel('noopener'),
          h.Class(
            'inline-flex min-h-11 items-center gap-1 text-footnote font-medium text-tint hover:underline',
          ),
        ],
        ['Source', icon('External', 'size-3.5')],
      ),
    ],
  })
  return h.div(
    [h.Key(answer.id), h.Class('rounded-2xl bg-fill px-4 py-3')],
    [
      h.p(
        [h.Class('text-footnote font-semibold text-secondary')],
        [
          `Answer · ${answererLabel(answer)} · ${whenLabel(answer.answeredAtMs)}`,
        ],
      ),
      ...Array.map(paragraphsOf(answer.text), paragraph =>
        h.p([h.Class('mt-1.5 text-body text-label')], [paragraph]),
      ),
      ...Array.map(answer.stretches, stretchView),
      h.div(
        [h.Class('flex flex-wrap gap-x-4')],
        [...threadLinks, ...sourceLinks],
      ),
    ],
  )
}

const marksOf = (question: Question): ReadonlyArray<Html> => [
  ...(question.isLearning ? [badge('Positive', 'To Learn')] : []),
  ...(question.status === 'Open' ? [badge('Caution', 'Open')] : []),
  ...Option.match(question.maybeAskerName, {
    onNone: () => [],
    onSome: name =>
      question.askedBy === 'Agent'
        ? [badge('Neutral', `Asked by ${name}`)]
        : [],
  }),
]

const topicsOf = (question: Question): ReadonlyArray<Html> => {
  const h = html<Message>()
  return Array.map(question.topics, topic =>
    h.a(
      [
        h.Key(topic.path),
        h.Href(searchPathOf(topic.title)),
        h.Class(
          'inline-flex min-h-8 items-center rounded-full bg-fill px-3 text-footnote font-medium text-label hover:bg-fill-strong',
        ),
      ],
      [topic.title],
    ),
  )
}

const issuesOf = (question: Question): ReadonlyArray<Html> => {
  const h = html<Message>()
  return Array.map(question.issueNumbers, number =>
    h.a(
      [
        h.Key(`issue-${number}`),
        h.Href(`${ISSUES_ORIGIN}/issues/${number}`),
        h.Target('_blank'),
        h.Rel('noopener'),
        h.Class(
          'inline-flex min-h-8 items-center rounded-full bg-fill px-3 text-footnote font-medium text-tint hover:bg-fill-strong',
        ),
      ],
      [`#${number}`],
    ),
  )
}

const questionCard = (question: Question): Html => {
  const h = html<Message>()
  const tags = [...topicsOf(question), ...issuesOf(question)]
  return h.article(
    [
      h.Key(question.id),
      h.Class('card flex flex-col gap-3 rounded-[26px] p-5 sm:p-6'),
    ],
    [
      h.div(
        [h.Class('flex flex-wrap items-start gap-2')],
        [
          h.h2(
            [h.Class('min-w-0 flex-1 text-headline font-semibold text-label')],
            [question.text],
          ),
          ...marksOf(question),
        ],
      ),
      ...Array.map(
        Array.filter(
          question.stretches,
          stretch => stretch.role !== 'Answered',
        ),
        stretchView,
      ),
      ...(Array.isReadonlyArrayNonEmpty(tags)
        ? [h.div([h.Class('flex flex-wrap gap-2')], tags)]
        : []),
      ...Array.map(question.answers, answer => answerView(question, answer)),
      ...(Array.isReadonlyArrayEmpty(question.answers)
        ? [
            h.p(
              [h.Class('text-footnote text-secondary')],
              ['No answer kept yet.'],
            ),
          ]
        : []),
    ],
  )
}

const notice = (title: string, body: string): Html => {
  const h = html<Message>()
  return h.div(
    [h.Class('card mt-5 flex flex-col gap-1 rounded-[26px] p-6')],
    [
      h.p([h.Class('text-headline font-semibold text-label')], [title]),
      h.p([h.Class('text-subhead text-secondary')], [body]),
    ],
  )
}

const listOf = (model: Model): ReadonlyArray<Html> => {
  const h = html<Message>()
  return M.value(model.questions.state).pipe(
    M.withReturnType<ReadonlyArray<Html>>(),
    M.tagsExhaustive({
      LoadingQuestions: () => [
        h.div(
          [
            h.Class(
              'flex items-center gap-2 px-1 pt-5 text-subhead text-secondary',
            ),
          ],
          [spinner(), 'Loading your questions'],
        ),
      ],
      FailedQuestions: ({ reason }) => [
        notice('Your questions did not load', reason),
      ],
      LoadedQuestions: ({ unreadableCount }) => {
        const listed = Questions.Model.listedQuestionsOf(model.questions)
        const unreadable =
          unreadableCount > 0
            ? [
                h.p(
                  [
                    h.Role('status'),
                    h.Class('px-1 pt-4 text-footnote text-caution'),
                  ],
                  [
                    `${unreadableCount} ${unreadableCount === 1 ? 'question' : 'questions'} could not be read.`,
                  ],
                ),
              ]
            : []
        return Array.match(listed, {
          onEmpty: () => [
            ...unreadable,
            String.isEmpty(model.questions.search)
              ? notice(
                  'No questions here yet',
                  'Every question you ask in a recording is kept here with its answer.',
                )
              : notice(
                  'No question matches',
                  `Nothing kept matches "${model.questions.search}".`,
                ),
          ],
          onNonEmpty: questions => [
            ...unreadable,
            h.p(
              [
                h.Role('status'),
                h.Class('px-1 pt-4 text-footnote text-secondary'),
              ],
              [
                `${questions.length} ${questions.length === 1 ? 'question' : 'questions'}`,
              ],
            ),
            h.div(
              [h.Class('mt-2 flex flex-col gap-4')],
              Array.map(questions, questionCard),
            ),
          ],
        })
      },
    }),
  )
}

/**
 * The questions he asked, kept with their answers to learn from (Scribe ADR 0095): a search over the questions, his
 * words, the answers and the topics, a choice of all, the ones to learn from, or the open ones, and each question with
 * every stretch of his words linked to its line and each answer linked to its thread.
 */
export const questionsPage = (model: Model): Html => {
  const h = html<Message>()
  return h.main(
    [h.Class('mx-auto flex w-full max-w-2xl flex-col px-4 pb-40 pt-4 sm:px-6')],
    [
      h.div([h.Class('pb-1 pt-2')], [largeTitle('Questions')]),
      searchField(model),
      filterBar(model),
      ...listOf(model),
    ],
  )
}
