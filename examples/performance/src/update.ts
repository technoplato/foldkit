import { Match as M, Option } from 'effect'
import { AsyncData, Command } from 'foldkit'
import { evo } from 'foldkit/struct'
import { toString as urlToString } from 'foldkit/url'

import {
  FetchBuild,
  FetchIndex,
  LoadExternal,
  NavigateInternal,
} from './command'
import type { Message } from './message'
import { BuildDetailData, IndexData, type Model, type OpenBuild } from './model'
import { type Destination, buildRouter, urlToDestination } from './route'

// UPDATE

type UpdateReturn = readonly [Model, ReadonlyArray<Command.Command<Message>>]
const withUpdateReturn = M.withReturnType<UpdateReturn>()

/**
 * The build a destination opens: a build page loads its own file once, and a
 * page that is not a build keeps the last one, so going back to it is instant.
 */
export const openBuildFor = (
  destination: Destination,
  maybeOpenBuild: Option.Option<OpenBuild>,
): readonly [
  Option.Option<OpenBuild>,
  ReadonlyArray<Command.Command<Message>>,
] => {
  if (destination._tag !== 'BuildPage') {
    return [maybeOpenBuild, []]
  }
  const { appId, build } = destination
  const isOpen = Option.exists(
    maybeOpenBuild,
    open => open.appId === appId && open.build === build,
  )
  if (isOpen) {
    return [maybeOpenBuild, []]
  } else {
    return [
      Option.some({ appId, build, detail: BuildDetailData.Loading() }),
      [FetchBuild({ appId, build })],
    ]
  }
}

const withBuildDetail = (
  model: Model,
  appId: string,
  build: string,
  detail: OpenBuild['detail'],
): Model =>
  evo(model, {
    maybeOpenBuild: Option.map(open =>
      open.appId === appId && open.build === build ? { ...open, detail } : open,
    ),
  })

export const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    withUpdateReturn,
    M.tagsExhaustive({
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
        const nextDestination = urlToDestination(url)
        const [nextMaybeOpenBuild, commands] = openBuildFor(
          nextDestination,
          model.maybeOpenBuild,
        )
        return [
          evo(model, {
            destination: () => nextDestination,
            maybeOpenBuild: () => nextMaybeOpenBuild,
            maybeHover: () => Option.none(),
          }),
          commands,
        ]
      },
      CompletedNavigateInternal: () => [model, []],
      CompletedLoadExternal: () => [model, []],
      SucceededFetchIndex: ({ index }) => [
        evo(model, { index: () => IndexData.Success({ data: index }) }),
        [],
      ],
      FailedFetchIndex: ({ error }) => [
        evo(model, {
          index: current =>
            Option.match(AsyncData.getData(current), {
              onNone: () => IndexData.Failure({ error }),
              onSome: data => IndexData.Stale({ error, data }),
            }),
        }),
        [],
      ],
      SucceededFetchBuild: ({ appId, build, detail }) => [
        withBuildDetail(
          model,
          appId,
          build,
          BuildDetailData.Success({ data: detail }),
        ),
        [],
      ],
      FailedFetchBuild: ({ appId, build, error }) => [
        withBuildDetail(
          model,
          appId,
          build,
          BuildDetailData.Failure({ error }),
        ),
        [],
      ],
      ClickedReload: () => [
        evo(model, {
          index: current =>
            Option.match(AsyncData.getData(current), {
              onNone: () => IndexData.Loading(),
              onSome: data => IndexData.Refreshing({ data }),
            }),
        }),
        [FetchIndex()],
      ],
      HoveredChartColumn: ({ metricId, build }) => [
        evo(model, { maybeHover: () => Option.some({ metricId, build }) }),
        [],
      ],
      LeftChart: ({ metricId }) => [
        evo(model, {
          maybeHover: Option.filter(hover => hover.metricId !== metricId),
        }),
        [],
      ],
      ClickedChartColumn: ({ appId, build }) => [
        model,
        [NavigateInternal({ url: buildRouter({ appId, build }) })],
      ],
    }),
  )
