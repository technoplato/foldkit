import { Option, Schema as S } from 'effect'
import type { Array } from 'effect'

import type { ProgramSchema } from '../program/program.js'

/** One stable Submodel occurrence in a semantic interaction source path. */
export const InteractionPathSegment = S.Struct({
  submodelId: S.NonEmptyString,
  instanceId: S.NonEmptyString,
})
/** One stable Submodel occurrence in a semantic interaction source path. */
export type InteractionPathSegment = typeof InteractionPathSegment.Type

/** The Program and stable Submodel occurrence path that own an interaction. */
export const InteractionSource = S.Struct({
  programId: S.NonEmptyString,
  instancePath: S.Array(InteractionPathSegment),
})
/** The Program and stable Submodel occurrence path that own an interaction. */
export type InteractionSource = typeof InteractionSource.Type

/** A Program-owned semantic interaction identity. */
export const InteractionId = S.Struct({
  source: InteractionSource,
  token: S.NonEmptyString,
})
/** A Program-owned semantic interaction identity. */
export type InteractionId = typeof InteractionId.Type

/** One semantic interaction at an exact durable destination URI. */
export const InteractionReference = S.Struct({
  destinationUri: S.NonEmptyString,
  interactionId: InteractionId,
})
/** One semantic interaction at an exact durable destination URI. */
export type InteractionReference = typeof InteractionReference.Type

/** An interaction is currently available to a Client. */
export const Available = S.TaggedStruct('Available', {})
/** An interaction is currently unavailable for a Program-owned reason. */
export const Unavailable = S.TaggedStruct('Unavailable', {
  code: S.NonEmptyString,
  reason: S.NonEmptyString,
})

/** Whether a projected interaction may currently be invoked. */
export const InteractionAvailability = S.Union([Available, Unavailable])
/** Whether a projected interaction may currently be invoked. */
export type InteractionAvailability = typeof InteractionAvailability.Type

/** An editable value is unchanged from the Program Model. */
export const CleanInteractionText = S.TaggedStruct('CleanInteractionText', {
  value: S.String,
})
/** An editable value has an uncommitted valid Client edit. */
export const DirtyInteractionText = S.TaggedStruct('DirtyInteractionText', {
  value: S.String,
})
/** An editable value has an uncommitted invalid Client edit. */
export const InvalidInteractionText = S.TaggedStruct('InvalidInteractionText', {
  value: S.String,
  errors: S.NonEmptyArray(S.NonEmptyString),
})

/** The Program-visible semantic state of editable text. */
export const EditableTextState = S.Union([
  CleanInteractionText,
  DirtyInteractionText,
  InvalidInteractionText,
])
/** The Program-visible semantic state of editable text. */
export type EditableTextState = typeof EditableTextState.Type

/** One choice in a semantic selection interaction. */
export type InteractionChoice = Readonly<{
  id: string
  label: string
  availability: InteractionAvailability
}>

/** A semantic group of ordered interaction nodes. */
export type InteractionGroup<Descriptor> = Readonly<{
  _tag: 'InteractionGroup'
  interactionId: InteractionId
  label: string
  role: string
  children: ReadonlyArray<InteractionNode<Descriptor>>
  maybePrimaryInteractionReference: Option.Option<InteractionReference>
}>

/** Read-only Program Model content presented to a Client. */
export type InteractionInspection = Readonly<{
  _tag: 'InteractionInspection'
  interactionId: InteractionId
  label: string
  role: string
  value: string
}>

/** A semantic action a Client may activate. */
export type InteractionAction<Descriptor> = Readonly<{
  _tag: 'InteractionAction'
  reference: InteractionReference
  label: string
  role: string
  availability: InteractionAvailability
  maybeDestinationUri: Option.Option<string>
  descriptor: Descriptor
}>

/** A semantic editable-text interaction. */
export type InteractionEditableText<Descriptor> = Readonly<{
  _tag: 'InteractionEditableText'
  reference: InteractionReference
  label: string
  role: string
  availability: InteractionAvailability
  state: EditableTextState
  descriptor: Descriptor
}>

/** A semantic selection interaction with an ordered non-empty choice set. */
export type InteractionSelection<Descriptor> = Readonly<{
  _tag: 'InteractionSelection'
  reference: InteractionReference
  label: string
  role: string
  availability: InteractionAvailability
  choices: Array.NonEmptyReadonlyArray<InteractionChoice>
  maybeSelectedChoiceId: Option.Option<string>
  descriptor: Descriptor
}>

/** Every node in a Program-projected semantic interaction tree. */
export type InteractionNode<Descriptor> =
  | InteractionGroup<Descriptor>
  | InteractionInspection
  | InteractionAction<Descriptor>
  | InteractionEditableText<Descriptor>
  | InteractionSelection<Descriptor>

/** One ordered interaction tree at an exact durable destination URI. */
export type InteractionProjection<Descriptor> = Readonly<{
  destinationUri: string
  root: InteractionGroup<Descriptor>
}>

/** A bounded canonical identity for one claimed interaction occurrence. */
export const InteractionOccurrenceId = S.String.check(
  S.isLengthBetween(1, 64),
  S.isPattern(/^[A-Za-z0-9_-]+(?::[A-Za-z0-9_-]+)*$/u),
)
/** A bounded canonical identity for one claimed interaction occurrence. */
export type InteractionOccurrenceId = typeof InteractionOccurrenceId.Type

/** Upper bounds applied before an untrusted interaction claim reaches Program resolution. */
export const interactionAdmissionLimits = Object.freeze({
  destinationUriLength: 2_048,
  editableTextLength: 65_536,
  interactionPathDepth: 32,
  interactionSourceComponentLength: 128,
  interactionTokenLength: 128,
  invocationFactIdentityLength: 512,
  selectionChoiceIdLength: 128,
})

const AdmissionInteractionSourceComponent = S.String.check(
  S.isLengthBetween(
    1,
    interactionAdmissionLimits.interactionSourceComponentLength,
  ),
)
const AdmissionInteractionPathSegment = S.Struct({
  submodelId: AdmissionInteractionSourceComponent,
  instanceId: AdmissionInteractionSourceComponent,
})
const AdmissionInteractionSource = S.Struct({
  programId: AdmissionInteractionSourceComponent,
  instancePath: S.Array(AdmissionInteractionPathSegment).check(
    S.isLengthBetween(0, interactionAdmissionLimits.interactionPathDepth),
  ),
})
const AdmissionInteractionId = S.Struct({
  source: AdmissionInteractionSource,
  token: S.String.check(
    S.isLengthBetween(1, interactionAdmissionLimits.interactionTokenLength),
  ),
})
const AdmissionInteractionReference = S.Struct({
  destinationUri: S.String.check(
    S.isLengthBetween(1, interactionAdmissionLimits.destinationUriLength),
  ),
  interactionId: AdmissionInteractionId,
})
const AdmissionActivatedInteraction = S.TaggedStruct('ActivatedInteraction', {
  reference: AdmissionInteractionReference,
  occurrenceId: InteractionOccurrenceId,
})
const AdmissionChangedInteractionText = S.TaggedStruct(
  'ChangedInteractionText',
  {
    reference: AdmissionInteractionReference,
    occurrenceId: InteractionOccurrenceId,
    value: S.String.check(
      S.isLengthBetween(0, interactionAdmissionLimits.editableTextLength),
    ),
  },
)
const AdmissionSelectedInteractionChoice = S.TaggedStruct(
  'SelectedInteractionChoice',
  {
    reference: AdmissionInteractionReference,
    occurrenceId: InteractionOccurrenceId,
    choiceId: S.String.check(
      S.isLengthBetween(1, interactionAdmissionLimits.selectionChoiceIdLength),
    ),
  },
)

/** A bounded interaction occurrence safe to decode at an authority boundary. */
export const InteractionAdmissionOccurrence = S.Union([
  AdmissionActivatedInteraction,
  AdmissionChangedInteractionText,
  AdmissionSelectedInteractionChoice,
])
/** A bounded interaction occurrence safe to decode at an authority boundary. */
export type InteractionAdmissionOccurrence =
  typeof InteractionAdmissionOccurrence.Type

/** A Client claims that one currently projected action was activated. */
export const ActivatedInteraction = S.TaggedStruct('ActivatedInteraction', {
  reference: InteractionReference,
  occurrenceId: InteractionOccurrenceId,
})
/** A Client claims that one currently projected action was activated. */
export type ActivatedInteraction = typeof ActivatedInteraction.Type

/** A Client claims that one currently projected editable value changed. */
export const ChangedInteractionText = S.TaggedStruct('ChangedInteractionText', {
  reference: InteractionReference,
  occurrenceId: InteractionOccurrenceId,
  value: S.String,
})
/** A Client claims that one currently projected editable value changed. */
export type ChangedInteractionText = typeof ChangedInteractionText.Type

/** A Client claims that one currently projected selection choice was selected. */
export const SelectedInteractionChoice = S.TaggedStruct(
  'SelectedInteractionChoice',
  {
    reference: InteractionReference,
    occurrenceId: InteractionOccurrenceId,
    choiceId: S.NonEmptyString,
  },
)
/** A Client claims that one currently projected selection choice was selected. */
export type SelectedInteractionChoice = typeof SelectedInteractionChoice.Type

/** Every Schema-encoded interaction occurrence a Client may claim. */
export const InteractionOccurrence = S.Union([
  ActivatedInteraction,
  ChangedInteractionText,
  SelectedInteractionChoice,
])
/** Every Schema-encoded interaction occurrence a Client may claim. */
export type InteractionOccurrence = typeof InteractionOccurrence.Type

/** A currently projected action paired with a compatible activation claim. */
export type ResolvedActivatedInteraction<Descriptor> = Readonly<{
  node: InteractionAction<Descriptor>
  occurrence: ActivatedInteraction
}>

/** A currently projected editable field paired with a compatible change claim. */
export type ResolvedChangedInteractionText<Descriptor> = Readonly<{
  node: InteractionEditableText<Descriptor>
  occurrence: ChangedInteractionText
}>

/** A currently projected selection paired with a compatible choice claim. */
export type ResolvedSelectedInteractionChoice<Descriptor> = Readonly<{
  node: InteractionSelection<Descriptor>
  occurrence: SelectedInteractionChoice
}>

/** A currently projected interaction paired with a kind-compatible Client claim. */
export type ResolvedInteractionOccurrence<Descriptor> =
  | ResolvedActivatedInteraction<Descriptor>
  | ResolvedChangedInteractionText<Descriptor>
  | ResolvedSelectedInteractionChoice<Descriptor>

/** Schema constructors for interaction nodes carrying one descriptor type. */
export type InteractionNodeSchemas<Descriptor> = Readonly<{
  InteractionChoice: ProgramSchema<InteractionChoice>
  InteractionGroup: ProgramSchema<InteractionGroup<Descriptor>>
  InteractionInspection: ProgramSchema<InteractionInspection>
  InteractionAction: ProgramSchema<InteractionAction<Descriptor>>
  InteractionEditableText: ProgramSchema<InteractionEditableText<Descriptor>>
  InteractionSelection: ProgramSchema<InteractionSelection<Descriptor>>
  InteractionNode: ProgramSchema<InteractionNode<Descriptor>>
  InteractionProjection: ProgramSchema<InteractionProjection<Descriptor>>
}>

/** Builds recursive interaction-node Schemas around a Program-owned descriptor. */
export const makeSchemas = <Descriptor>(
  Descriptor: ProgramSchema<Descriptor>,
) => {
  const InteractionNode: ProgramSchema<InteractionNode<Descriptor>> = S.suspend(
    () =>
      S.Union([
        InteractionGroup,
        InteractionInspection,
        InteractionAction,
        InteractionEditableText,
        InteractionSelection,
      ]),
  )
  const InteractionChoice = S.Struct({
    id: S.NonEmptyString,
    label: S.NonEmptyString,
    availability: InteractionAvailability,
  })
  const InteractionGroup = S.TaggedStruct('InteractionGroup', {
    interactionId: InteractionId,
    label: S.NonEmptyString,
    role: S.NonEmptyString,
    children: S.Array(InteractionNode),
    maybePrimaryInteractionReference: S.OptionFromNullishOr(
      InteractionReference,
      { onNoneEncoding: null },
    ),
  })
  const InteractionInspection = S.TaggedStruct('InteractionInspection', {
    interactionId: InteractionId,
    label: S.NonEmptyString,
    role: S.NonEmptyString,
    value: S.String,
  })
  const InteractiveMetadata = {
    reference: InteractionReference,
    label: S.NonEmptyString,
    role: S.NonEmptyString,
    availability: InteractionAvailability,
    descriptor: Descriptor,
  }
  const InteractionAction = S.TaggedStruct('InteractionAction', {
    ...InteractiveMetadata,
    maybeDestinationUri: S.OptionFromNullishOr(S.NonEmptyString, {
      onNoneEncoding: null,
    }),
  })
  const InteractionEditableText = S.TaggedStruct('InteractionEditableText', {
    ...InteractiveMetadata,
    state: EditableTextState,
  })
  const InteractionSelection = S.TaggedStruct('InteractionSelection', {
    ...InteractiveMetadata,
    choices: S.NonEmptyArray(InteractionChoice),
    maybeSelectedChoiceId: S.OptionFromNullishOr(S.NonEmptyString, {
      onNoneEncoding: null,
    }),
  })
  const InteractionProjection = S.Struct({
    destinationUri: S.NonEmptyString,
    root: InteractionGroup,
  })
  return {
    InteractionChoice,
    InteractionGroup,
    InteractionInspection,
    InteractionAction,
    InteractionEditableText,
    InteractionSelection,
    InteractionNode,
    InteractionProjection,
  }
}
