import { Array, Match as M, Option, Schema as S } from 'effect'

import {
  interactionReferenceKey,
  interactiveNodes,
} from './interactionGraph.js'
import {
  type InteractionGroup,
  type InteractionProjection,
  type InteractionReference,
  InteractionReference as InteractionReferenceSchema,
} from './interactionNode.js'

/** A local navigator is browsing with optional semantic focus. */
export const BrowsingInteractions = S.TaggedStruct('BrowsingInteractions', {
  maybeFocusedReference: S.OptionFromNullishOr(InteractionReferenceSchema, {
    onNoneEncoding: null,
  }),
})

/** A local navigator is editing one semantic field. */
export const EditingInteraction = S.TaggedStruct('EditingInteraction', {
  focusedReference: InteractionReferenceSchema,
})

/** Client-local focus and editing state that never enters a Program tape. */
export const InteractionNavigatorState = S.Union([
  BrowsingInteractions,
  EditingInteraction,
])
/** Client-local focus and editing state that never enters a Program tape. */
export type InteractionNavigatorState = typeof InteractionNavigatorState.Type

/** Moves local focus to the next available interaction. */
export const MoveNextInteraction = S.TaggedStruct('MoveNextInteraction', {})
/** Moves local focus to the previous available interaction. */
export const MovePreviousInteraction = S.TaggedStruct(
  'MovePreviousInteraction',
  {},
)
/** Moves local focus to the first available interaction. */
export const MoveFirstInteraction = S.TaggedStruct('MoveFirstInteraction', {})
/** Moves local focus to the last available interaction. */
export const MoveLastInteraction = S.TaggedStruct('MoveLastInteraction', {})
/** Moves local focus into the group whose primary interaction is focused. */
export const MoveIntoInteraction = S.TaggedStruct('MoveIntoInteraction', {})
/** Moves local focus to the nearest containing group primary interaction. */
export const MoveOutOfInteraction = S.TaggedStruct('MoveOutOfInteraction', {})
/** Requests activation of the currently focused interaction. */
export const ActivateFocusedInteraction = S.TaggedStruct(
  'ActivateFocusedInteraction',
  {},
)
/** Enters local editing mode for the currently focused editable interaction. */
export const BeginEditingInteraction = S.TaggedStruct(
  'BeginEditingInteraction',
  {},
)
/** Leaves local editing mode while retaining semantic focus. */
export const EndEditingInteraction = S.TaggedStruct('EndEditingInteraction', {})
/** Cancels local editing mode while retaining semantic focus. */
export const CancelEditingInteraction = S.TaggedStruct(
  'CancelEditingInteraction',
  {},
)

/** Every normalized Client-local navigation intent. */
export const InteractionNavigationIntent = S.Union([
  MoveNextInteraction,
  MovePreviousInteraction,
  MoveFirstInteraction,
  MoveLastInteraction,
  MoveIntoInteraction,
  MoveOutOfInteraction,
  ActivateFocusedInteraction,
  BeginEditingInteraction,
  EndEditingInteraction,
  CancelEditingInteraction,
])
/** Every normalized Client-local navigation intent. */
export type InteractionNavigationIntent =
  typeof InteractionNavigationIntent.Type

const focusedReference = (
  state: InteractionNavigatorState,
): Option.Option<InteractionReference> =>
  M.value(state).pipe(
    M.withReturnType<Option.Option<InteractionReference>>(),
    M.tagsExhaustive({
      BrowsingInteractions: ({ maybeFocusedReference }) =>
        maybeFocusedReference,
      EditingInteraction: ({ focusedReference }) =>
        Option.some(focusedReference),
    }),
  )

const availableReferences = <Descriptor>(
  projection: InteractionProjection<Descriptor>,
): ReadonlyArray<InteractionReference> =>
  Array.map(
    Array.filter(
      interactiveNodes(projection.root),
      node => node.availability._tag === 'Available',
    ),
    node => node.reference,
  )

const findCurrentReference = (
  references: ReadonlyArray<InteractionReference>,
  reference: InteractionReference,
): Option.Option<InteractionReference> => {
  const key = interactionReferenceKey(reference)
  return Array.findFirst(
    references,
    candidate => interactionReferenceKey(candidate) === key,
  )
}

const recoveredReference = <Descriptor>(
  previousProjection: Option.Option<InteractionProjection<Descriptor>>,
  nextProjection: InteractionProjection<Descriptor>,
  reference: InteractionReference,
): Option.Option<InteractionReference> => {
  const nextReferences = availableReferences(nextProjection)
  const maybeRetained = findCurrentReference(nextReferences, reference)
  if (Option.isSome(maybeRetained)) {
    return maybeRetained
  }
  if (Option.isNone(previousProjection)) {
    return Array.head(nextReferences)
  }
  const previousReferences = availableReferences(previousProjection.value)
  const referenceKey = interactionReferenceKey(reference)
  const maybeIndex = Array.findFirstIndex(
    previousReferences,
    candidate => interactionReferenceKey(candidate) === referenceKey,
  )
  if (Option.isNone(maybeIndex)) {
    return Array.head(nextReferences)
  }
  const nextKeys = new Set(Array.map(nextReferences, interactionReferenceKey))
  const maybeNext = Array.findFirst(
    Array.drop(previousReferences, maybeIndex.value + 1),
    candidate => nextKeys.has(interactionReferenceKey(candidate)),
  )
  if (Option.isSome(maybeNext)) {
    return findCurrentReference(nextReferences, maybeNext.value)
  }
  const maybePrevious = Array.findFirst(
    Array.reverse(Array.take(previousReferences, maybeIndex.value)),
    candidate => nextKeys.has(interactionReferenceKey(candidate)),
  )
  return Option.isSome(maybePrevious)
    ? findCurrentReference(nextReferences, maybePrevious.value)
    : Array.head(nextReferences)
}

const groupsContainingReference = <Descriptor>(
  group: InteractionGroup<Descriptor>,
  reference: InteractionReference,
): ReadonlyArray<InteractionGroup<Descriptor>> => {
  const key = interactionReferenceKey(reference)
  const containsReference = Array.some(
    interactiveNodes(group),
    node => interactionReferenceKey(node.reference) === key,
  )
  if (!containsReference) {
    return []
  }
  const childGroups = Array.filter(
    group.children,
    (node): node is InteractionGroup<Descriptor> =>
      node._tag === 'InteractionGroup',
  )
  const nested = Array.flatMap(childGroups, child =>
    groupsContainingReference(child, reference),
  )
  return [group, ...nested]
}

const interactionGroups = <Descriptor>(
  group: InteractionGroup<Descriptor>,
): ReadonlyArray<InteractionGroup<Descriptor>> => [
  group,
  ...Array.flatMap(
    Array.filter(
      group.children,
      (node): node is InteractionGroup<Descriptor> =>
        node._tag === 'InteractionGroup',
    ),
    interactionGroups,
  ),
]

/** A reusable stateful navigator owned entirely by one Client instance. */
export type InteractionNavigator<Descriptor> = Readonly<{
  reconcile: (projection: InteractionProjection<Descriptor>) => void
  dispatch: (
    intent: InteractionNavigationIntent,
  ) => Option.Option<InteractionReference>
  focus: (reference: InteractionReference) => boolean
  readFocusedReference: () => Option.Option<InteractionReference>
  readProjection: () => Option.Option<InteractionProjection<Descriptor>>
  readState: () => InteractionNavigatorState
}>

/** Creates a Client-local interaction navigator with no Program Messages or raw keys. */
export const makeNavigator = <
  Descriptor,
>(): InteractionNavigator<Descriptor> => {
  let maybeProjection = Option.none<InteractionProjection<Descriptor>>()
  let state: InteractionNavigatorState = BrowsingInteractions.make({
    maybeFocusedReference: Option.none(),
  })

  const browse = (
    maybeReference: Option.Option<InteractionReference>,
  ): void => {
    state = BrowsingInteractions.make({
      maybeFocusedReference: maybeReference,
    })
  }

  const focus = (reference: InteractionReference): boolean => {
    if (Option.isNone(maybeProjection)) {
      return false
    }
    const maybeCurrent = findCurrentReference(
      availableReferences(maybeProjection.value),
      reference,
    )
    if (Option.isNone(maybeCurrent)) {
      return false
    }
    browse(maybeCurrent)
    return true
  }

  const moveBy = (offset: number): void => {
    if (state._tag === 'EditingInteraction' || Option.isNone(maybeProjection)) {
      return
    }
    const references = availableReferences(maybeProjection.value)
    const maybeFocused = focusedReference(state)
    if (Option.isNone(maybeFocused)) {
      browse(offset < 0 ? Array.last(references) : Array.head(references))
      return
    }
    const key = interactionReferenceKey(maybeFocused.value)
    const maybeIndex = Array.findFirstIndex(
      references,
      reference => interactionReferenceKey(reference) === key,
    )
    if (Option.isNone(maybeIndex)) {
      browse(Array.head(references))
      return
    }
    const maybeNext = Array.get(references, maybeIndex.value + offset)
    if (Option.isSome(maybeNext)) {
      browse(maybeNext)
    }
  }

  const moveInto = (): void => {
    if (state._tag === 'EditingInteraction' || Option.isNone(maybeProjection)) {
      return
    }
    const maybeFocused = focusedReference(state)
    if (Option.isNone(maybeFocused)) {
      return
    }
    const focusedKey = interactionReferenceKey(maybeFocused.value)
    const maybeGroup = Array.findFirst(
      interactionGroups(maybeProjection.value.root),
      group =>
        Option.isSome(group.maybePrimaryInteractionReference) &&
        interactionReferenceKey(
          group.maybePrimaryInteractionReference.value,
        ) === focusedKey,
    )
    if (Option.isNone(maybeGroup)) {
      return
    }
    const maybeChild = Array.findFirst(
      availableReferences({
        destinationUri: maybeProjection.value.destinationUri,
        root: maybeGroup.value,
      }),
      reference => interactionReferenceKey(reference) !== focusedKey,
    )
    if (Option.isSome(maybeChild)) {
      browse(maybeChild)
    }
  }

  const moveOut = (): void => {
    if (state._tag === 'EditingInteraction' || Option.isNone(maybeProjection)) {
      return
    }
    const maybeFocused = focusedReference(state)
    if (Option.isNone(maybeFocused)) {
      return
    }
    const focusedKey = interactionReferenceKey(maybeFocused.value)
    const groups = Array.reverse(
      groupsContainingReference(maybeProjection.value.root, maybeFocused.value),
    )
    const references = availableReferences(maybeProjection.value)
    const maybePrimary = Array.findFirst(
      Array.getSomes(
        Array.map(groups, group =>
          Option.flatMap(group.maybePrimaryInteractionReference, reference =>
            findCurrentReference(references, reference),
          ),
        ),
      ),
      reference => interactionReferenceKey(reference) !== focusedKey,
    )
    if (Option.isSome(maybePrimary)) {
      browse(maybePrimary)
    }
  }

  const dispatch = (
    intent: InteractionNavigationIntent,
  ): Option.Option<InteractionReference> =>
    M.value(intent).pipe(
      M.withReturnType<Option.Option<InteractionReference>>(),
      M.tagsExhaustive({
        MoveNextInteraction: () => {
          moveBy(1)
          return Option.none()
        },
        MovePreviousInteraction: () => {
          moveBy(-1)
          return Option.none()
        },
        MoveFirstInteraction: () => {
          if (
            state._tag === 'BrowsingInteractions' &&
            Option.isSome(maybeProjection)
          ) {
            browse(Array.head(availableReferences(maybeProjection.value)))
          }
          return Option.none()
        },
        MoveLastInteraction: () => {
          if (
            state._tag === 'BrowsingInteractions' &&
            Option.isSome(maybeProjection)
          ) {
            browse(Array.last(availableReferences(maybeProjection.value)))
          }
          return Option.none()
        },
        MoveIntoInteraction: () => {
          moveInto()
          return Option.none()
        },
        MoveOutOfInteraction: () => {
          moveOut()
          return Option.none()
        },
        ActivateFocusedInteraction: () =>
          state._tag === 'BrowsingInteractions'
            ? state.maybeFocusedReference
            : Option.none(),
        BeginEditingInteraction: () => {
          if (
            state._tag === 'BrowsingInteractions' &&
            Option.isSome(state.maybeFocusedReference) &&
            Option.isSome(maybeProjection)
          ) {
            const key = interactionReferenceKey(
              state.maybeFocusedReference.value,
            )
            const maybeEditable = Array.findFirst(
              interactiveNodes(maybeProjection.value.root),
              node =>
                node._tag === 'InteractionEditableText' &&
                interactionReferenceKey(node.reference) === key,
            )
            if (Option.isSome(maybeEditable)) {
              state = EditingInteraction.make({
                focusedReference: state.maybeFocusedReference.value,
              })
            }
          }
          return Option.none()
        },
        EndEditingInteraction: () => {
          if (state._tag === 'EditingInteraction') {
            browse(Option.some(state.focusedReference))
          }
          return Option.none()
        },
        CancelEditingInteraction: () => {
          if (state._tag === 'EditingInteraction') {
            browse(Option.some(state.focusedReference))
          }
          return Option.none()
        },
      }),
    )

  return {
    reconcile: projection => {
      const previousProjection = maybeProjection
      const maybeFocused = focusedReference(state)
      maybeProjection = Option.some(projection)
      if (Option.isSome(maybeFocused)) {
        const maybeRecovered = recoveredReference(
          previousProjection,
          projection,
          maybeFocused.value,
        )
        const wasEditing = state._tag === 'EditingInteraction'
        const isRetainedReference =
          Option.isSome(maybeRecovered) &&
          interactionReferenceKey(maybeRecovered.value) ===
            interactionReferenceKey(maybeFocused.value)
        const maybeEditable = Option.flatMap(maybeRecovered, reference => {
          const key = interactionReferenceKey(reference)
          return Array.findFirst(
            interactiveNodes(projection.root),
            node =>
              node._tag === 'InteractionEditableText' &&
              node.availability._tag === 'Available' &&
              interactionReferenceKey(node.reference) === key,
          )
        })
        if (wasEditing && isRetainedReference && Option.isSome(maybeEditable)) {
          state = EditingInteraction.make({
            focusedReference: maybeEditable.value.reference,
          })
        } else {
          browse(maybeRecovered)
        }
      } else {
        browse(Array.head(availableReferences(projection)))
      }
    },
    dispatch,
    focus,
    readFocusedReference: () => focusedReference(state),
    readProjection: () => maybeProjection,
    readState: () => state,
  }
}
