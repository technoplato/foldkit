import {
  type Interaction,
  type Message,
  type Model,
  MultipleCountersInteractionGraph,
  activatedInteraction,
  interactionIdentitySourceForOccurrence,
  navigationToPath,
} from 'counters-core-example'
import { Array, Option, Result } from 'effect'
import * as InteractionGraph from 'foldkit/interaction-graph'

// PURE RENDERING + TOKEN RESOLUTION
//
// Everything here is testable without a server or DOM. The SSE transport
// in server.ts feeds these functions; the browser applies the patches
// through Datastar's own attribute-driven runtime.

export interface SurfaceIdentity {
  readonly surface: string
  readonly sourceUrl: string
}

type CountersAction = InteractionGraph.InteractionAction<Interaction>

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')

/** Derives attribution at run time — callers pass their own git-derived URL. */
export const renderBanner = ({
  sourceUrl,
  surface,
}: SurfaceIdentity): string =>
  sourceUrl === ''
    ? escapeHtml(`FOLDKIT COUNTERS — ${surface}`)
    : escapeHtml(`FOLDKIT COUNTERS — ${surface} · Source: ${sourceUrl}`)

export const renderCarrier = (model: Model): string =>
  `Carrier: ${navigationToPath(model.navigation)}`

export const renderRows = (model: Model): string =>
  model.rows
    .map(
      row =>
        `<li>${escapeHtml(row.id)}: ${row.child.count.toString()}</li>`,
    )
    .join('')

export const actionsForModel = (
  model: Model,
): Result.Result<ReadonlyArray<CountersAction>, unknown> =>
  Result.map(
    MultipleCountersInteractionGraph.project(model),
    projection =>
      Array.filter(
        InteractionGraph.interactiveNodes(projection.root),
        (node): node is CountersAction => node._tag === 'InteractionAction',
      ),
  )

/**
 * Resolves one clicked token against the current graph into the Message
 * it represents — identical logic to the CLI host, so every surface
 * interprets intents through the same vocabulary.
 */
export const resolveToken = (
  model: Model,
  token: string,
  occurrenceId: InteractionGraph.InteractionOccurrenceId,
): Message | undefined => {
  const projected = actionsForModel(model)
  if (Result.isFailure(projected)) {
    return undefined
  }
  const maybeAction = Array.findFirst(
    projected.success,
    action => action.descriptor.token === token,
  )
  if (Option.isNone(maybeAction)) {
    return undefined
  }
  const resolved = MultipleCountersInteractionGraph.resolveWithContext(
    model,
    activatedInteraction(maybeAction.value.reference, occurrenceId),
    interactionIdentitySourceForOccurrence(occurrenceId),
  )
  return Result.isSuccess(resolved) ? resolved.success : undefined
}

/** Renders the inner HTML of #screen for the current model. */
export const screenFragment = (
  model: Model,
  identity: SurfaceIdentity,
): string => `
<p class="banner">${renderBanner(identity)}</p>
<p class="carrier">${escapeHtml(renderCarrier(model))}</p>
<ul id="rows">${renderRows(model)}</ul>
<div id="actions">
${actionsForModelHtml(model)}
</div>
`

const actionsForModelHtml = (model: Model): string => {
  const projected = actionsForModel(model)
  if (Result.isFailure(projected)) {
    return ''
  }
  return Array
    .map(projected.success, action => {
      const hrefToken = encodeURIComponent(action.descriptor.token)
      return `<button type="button" data-on-click="@post('/action/${hrefToken}', {selector:'#screen'})">${escapeHtml(action.descriptor.token)}</button>`
    })
    .join('')
}

/** Wraps a fragment as a Datastar element-patch SSE event body. */
export const patchEvent = (fragment: string): string => {
  const lines = [
    'event: datastar-patch-elements',
    'data: selector: #screen',
    'data: mode: inner',
  ]
  for (const line of fragment.split('\n')) {
    lines.push(`data: elements: ${line}`)
  }
  return `${lines.join('\n')}\n\n`
}
