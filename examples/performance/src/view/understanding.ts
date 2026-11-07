import { Array, Match as M } from 'effect'
import { AsyncData } from 'foldkit'
import { type Html, html } from 'foldkit/html'

import type {
  Understanding,
  UnderstandingArea,
  UnderstandingPoint,
} from '../data'
import type { Message } from '../message'
import type { Model } from '../model'
import { understandingRouter } from '../route'
import { formatDate } from './format'
import { outsideLink, sectionHeading } from './parts'

// VIEW

const proficientLabel = (area: UnderstandingArea): string =>
  area.isProficient ? 'Proficient' : 'Not proficient'

const countView = (understanding: Understanding): Html => {
  const h = html<Message>()
  return M.value(understanding.count).pipe(
    M.tagsExhaustive({
      Measured: ({ proficient, areas }) =>
        h.section(
          [h.Class('mb-10')],
          [
            h.p([h.Class('text-sm ink-muted')], ['Areas at proficient']),
            h.p(
              [h.Class('mt-1 text-5xl font-semibold tabular')],
              [`${proficient} of ${areas}`],
            ),
            h.p(
              [h.Class('mt-1 max-w-2xl ink-secondary')],
              [
                'areas of the understanding profile are at proficient: a problem in each could be found and fixed without an agent. Each area stands where its newest rating puts it.',
              ],
            ),
          ],
        ),
      NotMeasured: ({ reason }) =>
        h.p([h.Class('mb-10 ink-secondary')], [`Not measured: ${reason}`]),
    }),
  )
}

const evidenceLinks = (area: UnderstandingArea): ReadonlyArray<Html> => {
  const h = html<Message>()
  return Array.map(area.evidence, (href, position) =>
    h.span(
      [h.Key(href), h.Class('mr-2 whitespace-nowrap')],
      [outsideLink(href, `words ${position + 1}`)],
    ),
  )
}

const areaItem = (area: UnderstandingArea): Html => {
  const h = html<Message>()
  return h.li(
    [h.Key(area.name), h.Class('border-b border-[var(--hairline)] py-3')],
    [
      h.p([h.Class('font-semibold')], [area.name]),
      h.p(
        [h.Class('mt-1 flex flex-wrap gap-x-4 gap-y-1')],
        [
          h.span(
            [h.Class('tabular whitespace-nowrap')],
            [`${area.score} of 10`],
          ),
          h.span([h.Class('whitespace-nowrap')], [proficientLabel(area)]),
          h.span([h.Class('ink-secondary')], [area.level]),
        ],
      ),
      h.p(
        [h.Class('mt-1 text-sm ink-muted')],
        [
          `Rated ${formatDate(area.ratedAt)} by ${area.by}`,
          h.span([h.Class('ml-3')], evidenceLinks(area)),
        ],
      ),
    ],
  )
}

const pointItem = (point: UnderstandingPoint): Html => {
  const h = html<Message>()
  return h.li(
    [h.Key(point.at), h.Class('flex gap-4')],
    [
      h.span([h.Class('ink-muted')], [formatDate(point.at)]),
      h.span([h.Class('tabular')], [`${point.proficient} of ${point.areas}`]),
    ],
  )
}

const problemsView = (understanding: Understanding): ReadonlyArray<Html> => {
  const h = html<Message>()
  return Array.match(understanding.problems, {
    onEmpty: () => [],
    onNonEmpty: problems => [
      sectionHeading(
        'What the exporter could not read',
        'Lines of the profile it left out of the count, and why.',
      ),
      h.ul(
        [h.Class('list-disc pl-5 text-sm')],
        Array.map(problems, problem => h.li([h.Key(problem)], [problem])),
      ),
    ],
  })
}

const pageOf = (understanding: Understanding): Html => {
  const h = html<Message>()
  return h.div(
    [h.Class('max-w-5xl')],
    [
      h.h1([h.Class('mb-4 text-3xl font-semibold')], ['Understanding']),
      countView(understanding),
      ...Array.match(understanding.list, {
        onEmpty: () => [],
        onNonEmpty: () => [
          sectionHeading(
            'Every area, by its newest rating',
            'A score out of 10, whether it is at proficient, and where a course would teach it.',
          ),
          h.ul(
            [h.Class('mb-10 border-t border-[var(--hairline)]')],
            Array.map(understanding.list, areaItem),
          ),
        ],
      }),
      ...Array.match(understanding.history, {
        onEmpty: () => [],
        onNonEmpty: points => [
          sectionHeading(
            'The count after each rating',
            'Areas at proficient, of the areas rated by then.',
          ),
          h.ol(
            [h.Class('mb-10 space-y-1 text-sm')],
            Array.map(points, pointItem),
          ),
        ],
      }),
      sectionHeading('How it is counted', ''),
      h.p([h.Class('mb-2')], [understanding.method]),
      h.p(
        [h.Class('mb-8 text-sm ink-muted')],
        [
          `Written ${formatDate(understanding.generatedAt)} from ${understanding.source}.`,
        ],
      ),
      ...problemsView(understanding),
    ],
  )
}

/** The understanding profile's page: the areas at proficient, every area by its newest rating, and the count after each rating. */
export const understandingView = (
  understanding: Model['understanding'],
): Html => {
  const h = html<Message>()
  return AsyncData.match(understanding, {
    onIdle: () => h.p([h.Class('ink-muted')], ['Loading the profile…']),
    onLoading: () => h.p([h.Class('ink-muted')], ['Loading the profile…']),
    onRefreshing: data => h.div([h.Class('opacity-70')], [pageOf(data)]),
    onFailure: error =>
      h.div(
        [h.Class('surface rounded-lg p-4')],
        [
          h.p(
            [h.Class('font-semibold text-critical')],
            ['The understanding profile did not load.'],
          ),
          h.p([h.Class('mt-1 text-sm ink-secondary')], [error]),
        ],
      ),
    onStale: ({ data }) => pageOf(data),
    onSuccess: data => pageOf(data),
  })
}

/** One line for home: the areas at proficient, linked to their page. */
export const understandingSummary = (
  understanding: Model['understanding'],
): Html => {
  const h = html<Message>()
  return AsyncData.matchData(understanding, {
    onEmpty: () => h.span([], []),
    onFailure: () => h.span([], []),
    onData: data =>
      M.value(data.count).pipe(
        M.tagsExhaustive({
          Measured: ({ proficient, areas }) =>
            h.p(
              [h.Class('mb-10 ink-secondary')],
              [
                'Understanding: ',
                h.a(
                  [h.Href(understandingRouter()), h.Class('link')],
                  [`${proficient} of ${areas} areas at proficient`],
                ),
              ],
            ),
          NotMeasured: () => h.span([], []),
        }),
      ),
  })
}
