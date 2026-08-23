import { Array, Match as M, Option } from 'effect'
import { Button, Column, Row, Text, type UiNode } from 'foldkit/renderers'

import { categories, categoryLabel, displayLine } from './domain/index.js'
import { type Action, actions, tokenOf } from './message.js'
import {
  type Capture,
  type Classifier,
  type Filter,
  type Library,
  type Looking,
  type Model,
  type Notice,
  type VideoTool,
  type XSession,
  shownBookmarks,
  title,
} from './model.js'

const labelOf = (action: Action): string =>
  Option.getOrElse(Array.head(action.keys ?? []), () => tokenOf(action))

const lookingNodes = (looking: Looking): ReadonlyArray<UiNode> =>
  M.value(looking).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      Idle: () => [Text('Idle')],
      Searching: searching => [Text('Searching'), Text(searching.query)],
    }),
  )

const noticeNodes = (notice: Notice): ReadonlyArray<UiNode> =>
  M.value(notice).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      None: () => [Text('None')],
      Some: some => [
        Text('Some'),
        ...M.value(some.kind).pipe(
          M.withReturnType<ReadonlyArray<UiNode>>(),
          M.tagsExhaustive({
            Succeeded: () => [Text('Succeeded')],
            Failed: () => [Text('Failed')],
          }),
        ),
        Text(some.title),
        ...M.value(some.detail).pipe(
          M.withReturnType<ReadonlyArray<UiNode>>(),
          M.tagsExhaustive({
            None: () => [Text('None')],
            Some: detail => [Text(detail.text)],
          }),
        ),
      ],
    }),
  )

const libraryNodes = (
  library: Library,
  filter: Filter,
): ReadonlyArray<UiNode> =>
  M.value(library).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      Empty: empty => [Text('Empty'), ...lookingNodes(empty.looking)],
      Populated: populated => [
        Text('Populated'),
        ...lookingNodes(populated.looking),
        ...M.value(populated.deleting).pipe(
          M.withReturnType<ReadonlyArray<UiNode>>(),
          M.tagsExhaustive({
            Idle: () => [Text('Idle')],
            Confirming: confirming => [
              Text('Confirming'),
              Text(displayLine(confirming.bookmark)),
            ],
          }),
        ),
        ...Array.map(
          shownBookmarks(populated.items, populated.looking, filter),
          bookmark => Text(displayLine(bookmark)),
        ),
      ],
    }),
  )

const captureNodes = (capture: Capture): ReadonlyArray<UiNode> =>
  M.value(capture).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      Idle: () => [Text('Idle')],
      Drafting: drafting => [Text('Drafting'), Text(drafting.text)],
      Classifying: classifying => [Text('Classifying'), Text(classifying.text)],
    }),
  )

const xSessionNodes = (xSession: XSession): ReadonlyArray<UiNode> =>
  M.value(xSession).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      Unsigned: () => [Text('Unsigned')],
      Pending: () => [Text('Pending')],
      Signed: signed => [Text('Signed'), Text(signed.handle)],
    }),
  )

const videoToolNodes = (videoTool: VideoTool): ReadonlyArray<UiNode> =>
  M.value(videoTool).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      Missing: () => [Text('Missing')],
      Present: () => [Text('Present')],
    }),
  )

const classifierNodes = (classifier: Classifier): ReadonlyArray<UiNode> =>
  M.value(classifier).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      Deterministic: () => [Text('Deterministic')],
      LoadingWasm: () => [Text('LoadingWasm')],
      WasmReady: () => [Text('WasmReady')],
      WasmFailed: () => [Text('WasmFailed')],
    }),
  )

const filterNodes = (filter: Filter): ReadonlyArray<UiNode> =>
  M.value(filter).pipe(
    M.withReturnType<ReadonlyArray<UiNode>>(),
    M.tagsExhaustive({
      All: () => [Text('All')],
      Only: only => [Text('Only'), Text(categoryLabel(only.category))],
    }),
  )

const categoryNodes = (): ReadonlyArray<UiNode> =>
  Array.map(categories, category => Text(categoryLabel(category())))

/** Product tree: title, notice, library, capture, sources, categories, actions. */
export const productView = (model: Model): UiNode => {
  const buttons = Array.map(
    Array.filter(actions, action => action.valid(model, {})),
    action =>
      Button({
        token: tokenOf(action),
        label: labelOf(action),
      }),
  )
  const filters = Array.map(categories, category =>
    Button({
      token: `filter:${categoryLabel(category())}`,
      label: categoryLabel(category()),
    }),
  )
  return Column(
    { gap: 1 },
    Text(title),
    ...noticeNodes(model.notice),
    ...libraryNodes(model.library, model.filter),
    ...captureNodes(model.capture),
    ...xSessionNodes(model.xSession),
    ...videoToolNodes(model.videoTool),
    ...classifierNodes(model.classifier),
    ...filterNodes(model.filter),
    ...categoryNodes(),
    Row({}, ...filters),
    Row({}, ...buttons),
  )
}
