import { Array, Match as M, Option } from 'effect'
import { AsyncData } from 'foldkit'
import { type Html, html } from 'foldkit/html'

import type {
  Change,
  Consumer,
  Folder,
  Measure,
  Pipeline,
  Problem,
  Storage,
  Written,
} from '../data'
import type { Message } from '../message'
import type { PipelineData } from '../model'
import {
  diskMeasure,
  homeMeasures,
  homeProblems,
  homeWindow,
  issueUrl,
  lastDay,
  lastDayTrend,
  outOfDateMinutes,
  windowCaveat,
} from '../pipeline'
import { pipelineRouter } from '../route'
import { sparkline, trendChart } from './chart'
import {
  HOUR_STATES,
  type Tone,
  amountParts,
  consumerKindLabel,
  counted,
  formatAmount,
  formatDate,
  formatHour,
  formatNumber,
  formatSpan,
  formatTarget,
  headlineAfterState,
  measureStatusLabel,
  measureStatusTone,
  memoryLabel,
  memoryTone,
  placesSentence,
  presenceSentence,
  sharesSentence,
  shortSha,
  stateLabel,
  stateTone,
  toneIcon,
  waitingWords,
} from './format'
import {
  loadFailure,
  outsideLink,
  sectionHeading,
  statusChip,
  statusMark,
} from './parts'

// CONSTANT

const GIB = 'GiB'
const PERCENT = '%'

// VIEW

const pipelineContent = (
  data: typeof PipelineData.schema.Type,
  render: (written: Written) => Html,
): Html => {
  const h = html<Message>()
  const loading = (): Html =>
    h.p([h.Class('ink-muted')], ["Loading the build pipeline's numbers…"])
  const notWritten = (): Html =>
    h.p(
      [h.Class('ink-secondary')],
      ["The build pipeline's numbers are not written yet."],
    )
  return AsyncData.match(data, {
    onIdle: loading,
    onLoading: loading,
    onRefreshing: file =>
      h.div(
        [h.Class('opacity-70')],
        [file._tag === 'Written' ? render(file) : notWritten()],
      ),
    onFailure: error =>
      loadFailure("The build pipeline's numbers did not load.", error),
    onStale: stale =>
      h.div(
        [],
        [
          h.p(
            [h.Class('mb-3 text-sm text-critical')],
            [
              "The build pipeline's numbers did not reload, so these are the last ones read.",
            ],
          ),
          stale.data._tag === 'Written' ? render(stale.data) : notWritten(),
        ],
      ),
    onSuccess: file => (file._tag === 'Written' ? render(file) : notWritten()),
  })
}

const outOfDateNote = (written: Written): ReadonlyArray<Html> => {
  const h = html<Message>()
  return Option.match(
    outOfDateMinutes(written.pipeline.generatedAt, written.readAtMs),
    {
      onNone: () => [],
      onSome: minutes => [
        h.p(
          [h.Class('notice mb-4 flex gap-2 rounded-lg px-3 py-2 text-sm')],
          [
            statusMark('Warning'),
            h.span(
              [],
              [
                `These numbers may be out of date: they were ${formatSpan(minutes)} old when this page read them.`,
              ],
            ),
          ],
        ),
      ],
    },
  )
}

const healthItem = (tone: Tone, words: string): Html => {
  const h = html<Message>()
  return h.li(
    [h.Class('flex items-baseline gap-1.5')],
    [statusMark(tone), h.span([], [words])],
  )
}

const healthNow = (pipeline: Pipeline): Html => {
  const h = html<Message>()
  const { memoryPressure } = pipeline.now
  const maybeDisk = Option.flatMap(diskMeasure(pipeline), measure =>
    Option.map(measure.maybeValue, value => ({ measure, value })),
  )
  return h.ul(
    [h.Class('mt-3 space-y-1 text-sm'), h.AriaLabel('Memory and disk now')],
    [
      healthItem(memoryTone(memoryPressure), memoryLabel(memoryPressure)),
      Option.match(maybeDisk, {
        onNone: () => healthItem('Open', 'Free disk not measured'),
        onSome: ({ measure, value }) =>
          healthItem(
            measureStatusTone(measure.status),
            `${formatAmount(value, measure.digits, measure.unit)} of disk free, ${formatTarget(measure.maybeTarget, measure.direction)}`,
          ),
      }),
    ],
  )
}

const verdictView = (pipeline: Pipeline): Html => {
  const h = html<Message>()
  const { state, headline, detail } = pipeline.verdict
  return h.div(
    [],
    [
      h.p([h.Class('text-sm ink-muted')], ['Right now']),
      h.p(
        [
          h.DataAttribute('verdict', state),
          h.Class(
            'flex items-baseline gap-3 text-4xl font-semibold sm:text-5xl',
          ),
        ],
        [
          h.span(
            [h.Class('text-3xl sm:text-4xl')],
            [statusMark(stateTone(state))],
          ),
          h.span([], [stateLabel(state)]),
        ],
      ),
      h.p(
        [h.Class('mt-3 max-w-2xl text-lg leading-snug font-medium')],
        [headlineAfterState(state, headline)],
      ),
      h.p([h.Class('mt-1 max-w-2xl ink-secondary')], [detail]),
      healthNow(pipeline),
    ],
  )
}

const problemLink = (problem: Problem): ReadonlyArray<Html | string> =>
  Option.match(problem.maybeIssue, {
    onNone: () =>
      Option.match(problem.maybeUrl, {
        onNone: () => [],
        onSome: url => [' ', outsideLink(url, 'More')],
      }),
    onSome: issue => [
      ' ',
      outsideLink(
        Option.getOrElse(problem.maybeUrl, () => issueUrl(issue)),
        `#${issue}`,
      ),
    ],
  })

const problemsView = (
  shown: ReadonlyArray<Problem>,
  hiddenCount: number,
): ReadonlyArray<Html> => {
  const h = html<Message>()
  return Array.match(shown, {
    onEmpty: () => [],
    onNonEmpty: problems => [
      h.div(
        [h.Class('mt-5')],
        [
          h.h3([h.Class('mb-1 text-sm font-semibold')], ['What is wrong now']),
          h.ul(
            [h.Class('list-disc space-y-1 pl-5 text-sm')],
            Array.map(problems, problem =>
              h.li(
                [h.Key(problem.text)],
                [problem.text, ...problemLink(problem)],
              ),
            ),
          ),
          ...(hiddenCount > 0
            ? [
                h.p(
                  [h.Class('mt-1 pl-5 text-sm')],
                  [
                    h.a(
                      [h.Href(pipelineRouter()), h.Class('link')],
                      [`${hiddenCount} more on the pipeline page`],
                    ),
                  ],
                ),
              ]
            : []),
        ],
      ),
    ],
  })
}

const measureValue = (measure: Measure, className: string): Html => {
  const h = html<Message>()
  return Option.match(measure.maybeValue, {
    onNone: () => h.span([h.Class(`${className} ink-muted`)], ['No number']),
    onSome: value => {
      const [amount, unit] = amountParts(value, measure.digits, measure.unit)
      return h.span(
        [h.Class(`${className} tabular`)],
        [
          h.span([h.Class('font-semibold')], [amount]),
          h.span([h.Class('text-xs ink-secondary')], [unit]),
        ],
      )
    },
  })
}

const scorecardRow = (
  measure: Measure,
  maybeWindow: Option.Option<string>,
): Html => {
  const h = html<Message>()
  return h.li(
    [
      h.Key(measure.id),
      h.DataAttribute('measure', measure.id),
      h.Class('measure-row border-b border-[var(--hairline)] py-2 text-sm'),
    ],
    [
      h.span(
        [h.Class('measure-label')],
        [
          measure.label,
          ...Option.match(windowCaveat(measure, maybeWindow), {
            onNone: () => [],
            onSome: caveat => [
              h.span([h.Class('block text-xs ink-muted')], [caveat]),
            ],
          }),
        ],
      ),
      measureValue(measure, 'measure-value text-base'),
      h.span(
        [h.Class('measure-target ink-secondary tabular')],
        [formatTarget(measure.maybeTarget, measure.direction)],
      ),
      h.span(
        [h.Class('measure-status')],
        [
          statusChip(
            measureStatusTone(measure.status),
            measureStatusLabel(measure.status),
          ),
        ],
      ),
      h.span(
        [h.Class('measure-trend')],
        Option.toArray(sparkline(lastDayTrend(measure))),
      ),
    ],
  )
}

const scorecard = (pipeline: Pipeline): Html => {
  const h = html<Message>()
  const maybeWindow = homeWindow(pipeline)
  return h.div(
    [h.Class('min-w-0')],
    [
      h.h3(
        [h.Class('mb-1 text-sm font-semibold')],
        [
          Option.match(maybeWindow, {
            onNone: () => 'Against the targets',
            onSome: window => `Against the targets, over the ${window}`,
          }),
        ],
      ),
      h.ul(
        [h.Class('scorecard')],
        Array.map(homeMeasures(pipeline), measure =>
          scorecardRow(measure, maybeWindow),
        ),
      ),
    ],
  )
}

const hourClass = (tone: Tone): string =>
  M.value(tone).pipe(
    M.when('Good', () => 'hour-good'),
    M.when('Warning', () => 'hour-warning'),
    M.when('Critical', () => 'hour-critical'),
    M.when('Open', () => 'hour-open'),
    M.when('None', () => 'hour-none'),
    M.exhaustive,
  )

const marksLegend = (): Html => {
  const h = html<Message>()
  return h.ul(
    [
      h.Class('mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs ink-secondary'),
      h.AriaLabel('What the marks mean'),
    ],
    Array.map(HOUR_STATES, state => {
      const tone = stateTone(state)
      return h.li(
        [h.Key(state), h.Class('flex items-center gap-1.5')],
        [
          h.span(
            [h.Class(`hour-key ${hourClass(tone)}`), h.AriaHidden(true)],
            [toneIcon(tone)],
          ),
          h.span([], [stateLabel(state)]),
        ],
      )
    }),
  )
}

const dayStrip = (pipeline: Pipeline): Html => {
  const h = html<Message>()
  return h.div(
    [],
    [
      ...Array.match(lastDay(pipeline.hours), {
        onEmpty: () => [
          h.p(
            [h.Class('text-sm ink-muted')],
            ['The last 24 hours are not measured yet.'],
          ),
        ],
        onNonEmpty: day => [
          h.ol(
            [
              h.Class('hour-strip'),
              h.AriaLabel('The last 24 hours, hour by hour'),
            ],
            Array.map(day, hour => {
              const tone = stateTone(hour.state)
              return h.li(
                [
                  h.Key(hour.at),
                  h.DataAttribute('hour-state', hour.state),
                  h.Tabindex(0),
                  h.Class(`hour-cell ${hourClass(tone)}`),
                ],
                [
                  h.span([h.AriaHidden(true)], [toneIcon(tone)]),
                  h.span(
                    [h.Class('hour-readout')],
                    [`${formatHour(hour.at)}: ${stateLabel(hour.state)}`],
                  ),
                ],
              )
            }),
          ),
          h.div(
            [
              h.Class('mt-1 flex justify-between text-xs ink-muted tabular'),
              h.AriaHidden(true),
            ],
            [
              h.span([], [formatHour(Array.headNonEmpty(day).at)]),
              h.span([], [formatHour(Array.lastNonEmpty(day).at)]),
            ],
          ),
          marksLegend(),
        ],
      }),
      h.p([h.Class('mt-2 text-sm')], [sharesSentence(pipeline.shares)]),
    ],
  )
}

const writtenAt = (pipeline: Pipeline): string =>
  `Numbers written ${formatDate(pipeline.generatedAt)}.`

const presenceFacts = (pipeline: Pipeline): ReadonlyArray<Html | string> => {
  const h = html<Message>()
  return [
    h.span([], [presenceSentence(pipeline.presence)]),
    ' ',
    h.span([], [placesSentence(pipeline.presence)]),
  ]
}

const summaryBody = (written: Written): Html => {
  const h = html<Message>()
  const { pipeline } = written
  const problems = homeProblems(pipeline)
  return h.div(
    [],
    [
      ...outOfDateNote(written),
      h.div(
        [
          h.Class(
            'grid grid-cols-1 gap-x-12 gap-y-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]',
          ),
        ],
        [
          h.div(
            [h.Class('min-w-0')],
            [
              verdictView(pipeline),
              ...problemsView(
                problems,
                pipeline.verdict.problems.length - problems.length,
              ),
            ],
          ),
          scorecard(pipeline),
        ],
      ),
      h.div(
        [h.Class('mt-6')],
        [
          h.h3([h.Class('mb-2 text-sm font-semibold')], ['The last 24 hours']),
          dayStrip(pipeline),
        ],
      ),
      h.p(
        [h.Class('mt-4 text-sm ink-muted')],
        [
          ...presenceFacts(pipeline),
          ' ',
          h.span([], [writtenAt(pipeline)]),
          ' ',
          h.a(
            [h.Href(pipelineRouter()), h.Class('link')],
            [
              `All ${counted(pipeline.measures.length, 'measure')} on the pipeline page`,
            ],
          ),
        ],
      ),
    ],
  )
}

/** The build pipeline's executive summary, the first thing on the home page. */
export const pipelineSummary = (
  data: typeof PipelineData.schema.Type,
): Html => {
  const h = html<Message>()
  return h.section(
    [],
    [
      h.h2(
        [h.Class('mb-3 text-lg font-semibold')],
        ['Build pipeline · the M5 Mac mini'],
      ),
      pipelineContent(data, summaryBody),
    ],
  )
}

const machineWords = (pipeline: Pipeline): string => {
  const { machine } = pipeline
  const facts = Array.getSomes([
    machine.maybeChip,
    Option.map(machine.maybeCores, cores => counted(cores, 'core')),
    Option.map(
      machine.maybeMemoryGiB,
      memory => `${formatAmount(memory, 0, GIB)} of memory`,
    ),
    Option.map(
      machine.maybeDiskGiB,
      disk => `${formatAmount(disk, 0, GIB)} of disk`,
    ),
  ])
  return Array.match(facts, {
    onEmpty: () => `${machine.name}.`,
    onNonEmpty: each => `${machine.name}: ${Array.join(each, ', ')}.`,
  })
}

const presenceDetail = (pipeline: Pipeline): ReadonlyArray<Html> => {
  const h = html<Message>()
  const { presence } = pipeline
  const details = Array.getSomes([
    Option.map(
      Option.all({
        present: presence.maybePlacesWhenPresent,
        away: presence.maybePlacesWhenAway,
      }),
      ({ present, away }) =>
        `${counted(present, 'build')} at once when you are here, ${away} when you are away.`,
    ),
    Option.map(presence.maybeSignal, signal => `Judged by: ${signal}.`),
  ])
  return [
    h.p([h.Class('mt-4 text-sm')], presenceFacts(pipeline)),
    ...Array.map(details, words =>
      h.p([h.Key(words), h.Class('text-sm ink-muted')], [words]),
    ),
  ]
}

const fact = (label: string, value: Html | string): Html => {
  const h = html<Message>()
  return h.div(
    [
      h.Key(label),
      h.Class(
        'flex justify-between gap-4 border-b border-[var(--hairline)] py-2',
      ),
    ],
    [
      h.dt([h.Class('ink-secondary')], [label]),
      h.dd([h.Class('text-right font-medium tabular')], [value]),
    ],
  )
}

const thisMinute = (pipeline: Pipeline): Html => {
  const h = html<Message>()
  const { now } = pipeline
  const say = (
    maybeValue: Option.Option<number>,
    format: (value: number) => string,
  ): string =>
    Option.match(maybeValue, { onNone: () => 'not measured', onSome: format })
  const whole = (value: number): string => formatNumber(value, 0)
  const gib = (value: number): string => formatAmount(value, 1, GIB)
  return h.dl(
    [h.Class('grid grid-cols-1 gap-x-10 text-sm sm:grid-cols-2')],
    [
      fact('Builds running', say(now.maybeRunning, whole)),
      fact(
        'Builds waiting',
        say(now.maybeWaiting, waiting =>
          waitingWords(waiting, now.waitingByClass),
        ),
      ),
      fact('Longest wait', say(now.maybeOldestWaitMinutes, formatSpan)),
      fact(
        'CPU busy',
        say(now.maybeCpuBusyPct, value => formatAmount(value, 0, PERCENT)),
      ),
      fact(
        'Compilers running outside the queue',
        say(now.maybeOutsideBuilds, whole),
      ),
      fact(
        'Memory',
        statusChip(
          memoryTone(now.memoryPressure),
          memoryLabel(now.memoryPressure),
        ),
      ),
      fact('Memory compressed to make room', say(now.maybeCompressorGiB, gib)),
      fact('Swap used', say(now.maybeSwapGiB, gib)),
    ],
  )
}

const measureDetail = (measure: Measure): Html => {
  const h = html<Message>()
  const facts: ReadonlyArray<readonly [string, string]> = [
    ['Measured as', measure.how],
    ['Time covered', measure.window],
    ...Option.toArray(
      Option.map(measure.maybeReason, (reason): readonly [string, string] => [
        Option.isNone(measure.maybeValue) ? 'Why no number' : 'Note',
        reason,
      ]),
    ),
  ]
  return h.li(
    [
      h.Key(measure.id),
      h.DataAttribute('measure', measure.id),
      h.Class(
        'grid grid-cols-1 gap-x-10 gap-y-3 border-b border-[var(--hairline)] py-5 md:grid-cols-2',
      ),
    ],
    [
      h.div(
        [h.Class('min-w-0')],
        [
          h.h3([h.Class('font-semibold')], [measure.label]),
          h.p(
            [h.Class('mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1')],
            [
              measureValue(measure, 'text-2xl'),
              h.span(
                [h.Class('text-sm ink-secondary tabular')],
                [formatTarget(measure.maybeTarget, measure.direction)],
              ),
              statusChip(
                measureStatusTone(measure.status),
                measureStatusLabel(measure.status),
              ),
            ],
          ),
          h.dl(
            [
              h.Class(
                'mt-2 grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm',
              ),
            ],
            Array.flatMap(facts, ([label, words]) => [
              h.dt([h.Class('ink-muted')], [label]),
              h.dd([h.Class('ink-secondary')], [words]),
            ]),
          ),
        ],
      ),
      ...Option.toArray(trendChart(measure)),
    ],
  )
}

const consumerRow = (consumer: Consumer): Html => {
  const h = html<Message>()
  const amount = Array.getSomes([
    Option.map(consumer.maybeCoreHours, hours =>
      formatAmount(hours, 1, 'core-hours'),
    ),
    Option.map(consumer.maybePct, pct => formatAmount(pct, 0, PERCENT)),
  ])
  return h.li(
    [
      h.Key(`${consumer.kind}-${consumer.name}`),
      h.DataAttribute('consumer', consumer.name),
      h.Class('py-2 text-sm'),
    ],
    [
      h.div(
        [h.Class('flex flex-wrap items-baseline justify-between gap-x-4')],
        [
          h.span(
            [],
            [
              h.span([h.Class('font-medium')], [consumer.name]),
              h.span(
                [h.Class('ml-2 text-xs ink-muted')],
                [consumerKindLabel(consumer.kind)],
              ),
            ],
          ),
          h.span(
            [h.Class('tabular ink-secondary')],
            [
              Array.match(amount, {
                onEmpty: () => 'not measured',
                onNonEmpty: each => Array.join(each, ', '),
              }),
            ],
          ),
        ],
      ),
      ...Option.toArray(
        Option.map(consumer.maybePct, pct =>
          h.div(
            [h.Class('bar-track mt-1'), h.AriaHidden(true)],
            [h.div([h.Class('bar-fill'), h.Style({ width: `${pct}%` })], [])],
          ),
        ),
      ),
    ],
  )
}

const consumersList = (pipeline: Pipeline): Html => {
  const h = html<Message>()
  return Array.match(pipeline.consumers, {
    onEmpty: () =>
      h.p(
        [h.Class('text-sm ink-muted')],
        ['Who used the CPU is not measured.'],
      ),
    onNonEmpty: consumers =>
      h.ul([h.Class('max-w-3xl')], Array.map(consumers, consumerRow)),
  })
}

const folderRow = (folder: Folder): Html => {
  const h = html<Message>()
  const size = (maybeGiB: Option.Option<number>, absent: string): string =>
    Option.match(maybeGiB, {
      onNone: () => absent,
      onSome: value => formatNumber(value, 1),
    })
  return h.tr(
    [
      h.Key(folder.name),
      h.DataAttribute('folder', folder.name),
      h.Class('border-b border-[var(--hairline)] align-baseline'),
    ],
    [
      h.th([h.Class('py-2 pr-3 font-medium'), h.Scope('row')], [folder.name]),
      h.td(
        [h.Class('py-2 pr-3 text-right tabular')],
        [size(folder.maybeGiB, 'not measured')],
      ),
      h.td(
        [h.Class('py-2 pr-3 text-right tabular ink-secondary')],
        [size(folder.maybeCapGiB, 'no cap')],
      ),
      h.td(
        [h.Class('py-2')],
        [
          Option.match(folder.maybeIsOver, {
            onNone: () => statusChip('Open', 'Not measured'),
            onSome: isOver =>
              isOver
                ? statusChip('Critical', 'Over its cap')
                : statusChip('Good', 'Within its cap'),
          }),
        ],
      ),
    ],
  )
}

const foldersTable = (storage: Storage): ReadonlyArray<Html> => {
  const h = html<Message>()
  return Array.match(storage.folders, {
    onEmpty: () => [],
    onNonEmpty: folders => [
      h.table(
        [h.Class('mt-3 w-full max-w-3xl text-left text-sm')],
        [
          h.caption([h.Class('sr-only')], ['Each folder against its cap']),
          h.thead(
            [],
            [
              h.tr(
                [h.Class('border-b border-[var(--hairline)] ink-muted')],
                [
                  h.th(
                    [h.Class('py-2 pr-3 font-medium'), h.Scope('col')],
                    ['Folder'],
                  ),
                  h.th(
                    [
                      h.Class('py-2 pr-3 text-right font-medium'),
                      h.Scope('col'),
                    ],
                    ['Holds, GiB'],
                  ),
                  h.th(
                    [
                      h.Class('py-2 pr-3 text-right font-medium'),
                      h.Scope('col'),
                    ],
                    ['Cap, GiB'],
                  ),
                  h.th(
                    [h.Class('py-2 font-medium'), h.Scope('col')],
                    ['Against its cap'],
                  ),
                ],
              ),
            ],
          ),
          h.tbody([], Array.map(folders, folderRow)),
        ],
      ),
    ],
  })
}

const diskView = (pipeline: Pipeline): Html => {
  const h = html<Message>()
  const { storage } = pipeline
  const tone = Option.match(diskMeasure(pipeline), {
    onNone: (): Tone => 'Open',
    onSome: measure => measureStatusTone(measure.status),
  })
  const also = Array.getSomes([
    Option.map(
      storage.maybeUsedGiB,
      used => `${formatAmount(used, 0, GIB)} used.`,
    ),
    Option.map(
      storage.maybeBudgetedGiB,
      budgeted =>
        `The folders below with a cap hold ${formatAmount(budgeted, 0, GIB)}.`,
    ),
  ])
  return h.div(
    [],
    [
      h.p(
        [h.Class('flex items-baseline gap-2')],
        [
          statusMark(tone),
          h.span(
            [h.Class('font-medium')],
            [
              Option.match(storage.maybeFreeGiB, {
                onNone: () => 'Free disk not measured',
                onSome: free =>
                  `${formatAmount(free, 0, GIB)} free, ${formatTarget(storage.maybeTargetFreeGiB, 'AtLeast')}`,
              }),
            ],
          ),
        ],
      ),
      h.p([h.Class('text-sm ink-secondary')], [Array.join(also, ' ')]),
      ...foldersTable(storage),
    ],
  )
}

const changeRow = (change: Change): Html => {
  const h = html<Message>()
  return h.li(
    [
      h.Key(`${change.at} ${change.text}`),
      h.Class(
        'grid grid-cols-1 gap-x-4 border-b border-[var(--hairline)] py-2 sm:grid-cols-[9rem_minmax(0,1fr)]',
      ),
    ],
    [
      h.span([h.Class('ink-muted tabular')], [formatDate(change.at)]),
      h.p(
        [],
        [
          h.span([], [change.text]),
          ...Option.match(change.maybeIssue, {
            onNone: () => [],
            onSome: issue => [' ', outsideLink(issueUrl(issue), `#${issue}`)],
          }),
        ],
      ),
    ],
  )
}

const changesList = (pipeline: Pipeline): Html => {
  const h = html<Message>()
  return Array.match(pipeline.changes, {
    onEmpty: () =>
      h.p([h.Class('text-sm ink-muted')], ['No change is logged yet.']),
    onNonEmpty: changes =>
      h.ul([h.Class('text-sm')], Array.map(changes, changeRow)),
  })
}

const targetsLine = (pipeline: Pipeline): Html => {
  const h = html<Message>()
  const { path, maybeCommit, maybeUrl } = pipeline.targets
  return h.p(
    [h.Class('text-sm break-words')],
    [
      h.code(
        [],
        [
          Option.match(maybeUrl, {
            onNone: () => path,
            onSome: url => outsideLink(url, path),
          }),
        ],
      ),
      ...Option.match(maybeCommit, {
        onNone: () => [],
        onSome: commit => [` at ${shortSha(commit)}`],
      }),
    ],
  )
}

const pageBody = (written: Written): Html => {
  const h = html<Message>()
  const { pipeline } = written
  const section = (title: string, explanation: string, content: Html): Html =>
    h.section(
      [h.Key(title), h.Class('mt-10')],
      [sectionHeading(title, explanation), content],
    )
  return h.div(
    [],
    [
      h.p(
        [h.Class('mb-6 text-sm ink-secondary')],
        [
          h.span([], [machineWords(pipeline)]),
          ' ',
          h.span([], [writtenAt(pipeline)]),
        ],
      ),
      ...outOfDateNote(written),
      verdictView(pipeline),
      ...problemsView(pipeline.verdict.problems, 0),
      ...presenceDetail(pipeline),
      section('This minute', '', thisMinute(pipeline)),
      section('The last 24 hours', '', dayStrip(pipeline)),
      section(
        'Every measure',
        'Each number, its target, how it is measured, and how it moved hour by hour.',
        h.ul([], Array.map(pipeline.measures, measureDetail)),
      ),
      section(
        'Who used the CPU',
        'Over the last 24 hours, the biggest first. A core-hour is one core busy for one hour.',
        consumersList(pipeline),
      ),
      section('Disk', '', diskView(pipeline)),
      section('What changed', 'Newest first.', changesList(pipeline)),
      section(
        'Where the targets are declared',
        'Every target on this page is read from one file.',
        targetsLine(pipeline),
      ),
      ...Array.match(pipeline.problems, {
        onEmpty: () => [],
        onNonEmpty: problems => [
          section(
            'What could not be read',
            'What the numbers above leave out, or count only in part.',
            h.ul(
              [h.Class('list-disc pl-5 text-sm')],
              Array.map(problems, problem => h.li([h.Key(problem)], [problem])),
            ),
          ),
        ],
      }),
    ],
  )
}

/** Everything the build pipeline measures, against what, and how. */
export const pipelineView = (data: typeof PipelineData.schema.Type): Html => {
  const h = html<Message>()
  return h.div(
    [h.Class('max-w-5xl')],
    [
      h.h1([h.Class('mb-1 text-3xl font-semibold')], ['Build pipeline']),
      pipelineContent(data, pageBody),
    ],
  )
}
