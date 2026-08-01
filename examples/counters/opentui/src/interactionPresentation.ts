import { Array, Match as M, Option } from 'effect'
import * as InteractionGraph from 'foldkit/interaction-graph'

import { type CountersInteractionId } from './input.js'

const semanticShortcutDefinitions: ReadonlyArray<
  Readonly<{ interactionId: CountersInteractionId; label: string }>
> = [
  { interactionId: 'AddCounter', label: 'a add' },
  { interactionId: 'IncrementCounter', label: '+ increment' },
  { interactionId: 'DecrementCounter', label: '- decrement' },
  { interactionId: 'ResetCounter', label: 'r reset' },
  { interactionId: 'ShowCounterFact', label: 'f fact' },
  { interactionId: 'DeleteCounter', label: 'd/x delete' },
  { interactionId: 'Back', label: 'Esc back' },
]

const tokensForInteraction = (
  interactionId: CountersInteractionId,
): ReadonlyArray<string> =>
  M.value(interactionId).pipe(
    M.withReturnType<ReadonlyArray<string>>(),
    M.when('AddCounter', () => ['AddCounter']),
    M.when('Back', () => [
      'CancelDeleteCounter',
      'DismissCounterFact',
      'BackToCounters',
    ]),
    M.when('CancelDeleteCounter', () => ['CancelDeleteCounter']),
    M.when('ConfirmDeleteCounter', () => ['ConfirmDeleteCounter']),
    M.when('DecrementCounter', () => ['DecrementCounter']),
    M.when('DeleteCounter', () => ['DeleteCounter']),
    M.when('DismissCounterFact', () => ['DismissCounterFact']),
    M.when('IncrementCounter', () => ['IncrementCounter']),
    M.when('OpenCounter', () => ['OpenCounter']),
    M.when('ResetCounter', () => ['ResetCounter']),
    M.when('ShowCounterFact', () => ['ShowCounterFact']),
    M.exhaustive,
  )

const matchingReference = <Descriptor>(
  nodes: ReadonlyArray<
    | InteractionGraph.InteractionAction<Descriptor>
    | InteractionGraph.InteractionEditableText<Descriptor>
    | InteractionGraph.InteractionSelection<Descriptor>
  >,
  tokens: ReadonlyArray<string>,
): Option.Option<InteractionGraph.InteractionReference> =>
  Option.map(
    Array.findFirst(
      nodes,
      node =>
        node.availability._tag === 'Available' &&
        Array.contains(tokens, node.reference.interactionId.token),
    ),
    node => node.reference,
  )

const deepestGroupContainingReference = <Descriptor>(
  group: InteractionGraph.InteractionGroup<Descriptor>,
  reference: InteractionGraph.InteractionReference,
): Option.Option<InteractionGraph.InteractionGroup<Descriptor>> => {
  const referenceKey = InteractionGraph.interactionReferenceKey(reference)
  const containsReference = Array.some(
    InteractionGraph.interactiveNodes(group),
    node =>
      InteractionGraph.interactionReferenceKey(node.reference) === referenceKey,
  )
  if (!containsReference) {
    return Option.none()
  }
  const childGroups = Array.filter(
    group.children,
    (node): node is InteractionGraph.InteractionGroup<Descriptor> =>
      node._tag === 'InteractionGroup',
  )
  const maybeNestedGroup = Array.head(
    Array.getSomes(
      Array.map(childGroups, child =>
        deepestGroupContainingReference(child, reference),
      ),
    ),
  )
  return Option.isSome(maybeNestedGroup) ? maybeNestedGroup : Option.some(group)
}

/** Finds a semantic shortcut within the focused placement region. */
export const referenceForSemanticInteraction = <Descriptor>(
  projection: InteractionGraph.InteractionProjection<Descriptor>,
  maybeFocusedReference: Option.Option<InteractionGraph.InteractionReference>,
  interactionId: CountersInteractionId,
): Option.Option<InteractionGraph.InteractionReference> => {
  const tokens = tokensForInteraction(interactionId)
  if (Option.isSome(maybeFocusedReference)) {
    const maybeFocusedGroup = deepestGroupContainingReference(
      projection.root,
      maybeFocusedReference.value,
    )
    if (Option.isSome(maybeFocusedGroup)) {
      const localMatch = matchingReference(
        Array.filter(
          maybeFocusedGroup.value.children,
          InteractionGraph.isInteractiveNode,
        ),
        tokens,
      )
      if (Option.isSome(localMatch)) {
        return localMatch
      }
    }
  }
  return interactionId === 'AddCounter'
    ? matchingReference(
        Array.filter(
          projection.root.children,
          InteractionGraph.isInteractiveNode,
        ),
        tokens,
      )
    : Option.none()
}

/** Returns only raw-key help whose semantic interaction is locally available. */
export const availableSemanticShortcutLabels = <Descriptor>(
  projection: InteractionGraph.InteractionProjection<Descriptor>,
  maybeFocusedReference: Option.Option<InteractionGraph.InteractionReference>,
): ReadonlyArray<string> =>
  Array.getSomes(
    Array.map(semanticShortcutDefinitions, definition =>
      Option.isSome(
        referenceForSemanticInteraction(
          projection,
          maybeFocusedReference,
          definition.interactionId,
        ),
      )
        ? Option.some(definition.label)
        : Option.none(),
    ),
  )

/** Screen and content bounds used to keep semantic focus inside a viewport. */
export type FocusedScrollBounds = Readonly<{
  scrollTop: number
  targetHeight: number
  targetScreenY: number
  viewportHeight: number
  viewportScreenY: number
}>

/** Returns the smallest scroll offset that makes one focused target visible. */
export const scrollTopForFocusedBounds = ({
  scrollTop,
  targetHeight,
  targetScreenY,
  viewportHeight,
  viewportScreenY,
}: FocusedScrollBounds): number => {
  const targetTop = targetScreenY - viewportScreenY + scrollTop
  const targetBottom = targetTop + targetHeight
  const viewportBottom = scrollTop + viewportHeight
  if (targetTop < scrollTop) {
    return Math.max(0, targetTop)
  } else if (targetBottom > viewportBottom) {
    return Math.max(0, targetBottom - viewportHeight)
  } else {
    return scrollTop
  }
}

/** Returns one primary focus reference per locally anchored interaction source. */
export const sourcePrimaryReferences = <Descriptor>(
  projection: InteractionGraph.InteractionProjection<Descriptor>,
): ReadonlyArray<InteractionGraph.InteractionReference> => {
  const groups = Array.filter(
    InteractionGraph.interactionNodes(projection.root),
    (node): node is InteractionGraph.InteractionGroup<Descriptor> =>
      node._tag === 'InteractionGroup',
  )
  const groupsWithPrimary = Array.filter(groups, group =>
    Option.isSome(group.maybePrimaryInteractionReference),
  )
  const references = Array.map(groupsWithPrimary, group =>
    Option.getOrThrow(group.maybePrimaryInteractionReference),
  )
  return Array.dedupeWith(
    references,
    (left, right) =>
      InteractionGraph.interactionSourceKey(left.interactionId.source) ===
      InteractionGraph.interactionSourceKey(right.interactionId.source),
  )
}

/** Computes the adjacent source primary while leaving focus ownership to the generic navigator. */
export const movedSourceReference = <Descriptor>(
  projection: InteractionGraph.InteractionProjection<Descriptor>,
  maybeFocusedReference: Option.Option<InteractionGraph.InteractionReference>,
  delta: -1 | 1,
): Option.Option<InteractionGraph.InteractionReference> => {
  const references = sourcePrimaryReferences(projection)
  if (Option.isNone(maybeFocusedReference)) {
    return delta < 0 ? Array.last(references) : Array.head(references)
  }
  const focusedSourceKey = InteractionGraph.interactionSourceKey(
    maybeFocusedReference.value.interactionId.source,
  )
  const maybeSourceIndex = Array.findFirstIndex(
    references,
    reference =>
      InteractionGraph.interactionSourceKey(reference.interactionId.source) ===
      focusedSourceKey,
  )
  if (Option.isNone(maybeSourceIndex)) {
    return Array.head(references)
  }
  const nextSourceIndex = Math.min(
    Math.max(0, maybeSourceIndex.value + delta),
    Array.length(references) - 1,
  )
  return Array.get(references, nextSourceIndex)
}

const availabilitySuffix = (
  availability: InteractionGraph.InteractionAvailability,
): string =>
  availability._tag === 'Available'
    ? ''
    : ` (unavailable: ${availability.reason})`

const linesForNode = <Descriptor>(
  node: InteractionGraph.InteractionNode<Descriptor>,
  depth: number,
  maybeFocusedReference: Option.Option<InteractionGraph.InteractionReference>,
): ReadonlyArray<string> => {
  const indent = '  '.repeat(depth)
  return M.value(node).pipe(
    M.withReturnType<ReadonlyArray<string>>(),
    M.tagsExhaustive({
      InteractionAction: action => {
        const isFocused =
          Option.isSome(maybeFocusedReference) &&
          InteractionGraph.interactionReferenceKey(
            maybeFocusedReference.value,
          ) === InteractionGraph.interactionReferenceKey(action.reference)
        return [
          `${indent}${isFocused ? '>' : ' '} ${action.label}${availabilitySuffix(action.availability)}`,
        ]
      },
      InteractionEditableText: editable => [
        `${indent}  ${editable.label}${availabilitySuffix(editable.availability)}`,
      ],
      InteractionGroup: group => [
        `${indent}${group.label}`,
        ...Array.flatMap(group.children, child =>
          linesForNode(child, depth + 1, maybeFocusedReference),
        ),
      ],
      InteractionInspection: inspection => [
        `${indent}${inspection.label}: ${inspection.value}`,
      ],
      InteractionSelection: selection => [
        `${indent}  ${selection.label}${availabilitySuffix(selection.availability)}`,
      ],
    }),
  )
}

/** Formats any Program interaction projection when a richer host renderer is unavailable. */
export const formatInteractionProjection = <Descriptor>(
  projection: InteractionGraph.InteractionProjection<Descriptor>,
  maybeFocusedReference = Option.none<InteractionGraph.InteractionReference>(),
): string =>
  Array.join(linesForNode(projection.root, 0, maybeFocusedReference), '\n')
