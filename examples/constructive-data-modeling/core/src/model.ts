import { Schema as S } from 'effect'
import { ts } from 'foldkit/schema'

/** Stable identities for every slide in the constructive modeling study deck. */
export const SlideId = S.Literals([
  'opening',
  'ingredients',
  'positive-space',
  'checkout-example',
  'representation',
  'obligations',
  'total-functions',
  'modeling-loop',
  'ubiquitous-deck',
  'sources',
])
/** One stable slide identity. */
export type SlideId = typeof SlideId.Type

/** Stable identities for the primary sources behind the study deck. */
export const SourceId = S.Literals([
  'recording',
  'event',
  'slides',
  'essay',
  'speaker',
])
/** One primary-source identity. */
export type SourceId = typeof SourceId.Type

/** A durable primary-source reference. */
export const SourceReference = S.Struct({
  id: SourceId,
  label: S.String,
  note: S.String,
  url: S.String,
})
/** A durable primary-source reference value. */
export type SourceReference = typeof SourceReference.Type

/** The deck is presenting its title and provenance. */
export const TitleSlide = ts('TitleSlide', {
  eyebrow: S.String,
  speaker: S.String,
  subtitle: S.String,
  title: S.String,
})
/** The deck is presenting one principle and supporting points. */
export const PrincipleSlide = ts('PrincipleSlide', {
  eyebrow: S.String,
  points: S.NonEmptyArray(S.String),
  statement: S.String,
  title: S.String,
})

/** One side of a constructive modeling comparison. */
export const ComparisonColumn = S.Struct({
  code: S.String,
  consequence: S.String,
  label: S.String,
})
/** One constructive modeling comparison column value. */
export type ComparisonColumn = typeof ComparisonColumn.Type
/** The deck is contrasting two representations. */
export const ComparisonSlide = ts('ComparisonSlide', {
  after: ComparisonColumn,
  before: ComparisonColumn,
  eyebrow: S.String,
  title: S.String,
})

/** One ordered move in a modeling flow. */
export const FlowStep = S.Struct({
  detail: S.String,
  label: S.String,
})
/** The deck is presenting an ordered flow. */
export const FlowSlide = ts('FlowSlide', {
  eyebrow: S.String,
  steps: S.NonEmptyArray(FlowStep),
  title: S.String,
})

/** The deck is presenting its source chain. */
export const SourcesSlide = ts('SourcesSlide', {
  eyebrow: S.String,
  sourceIds: S.NonEmptyArray(SourceId),
  title: S.String,
})

/** Every slide body supported by all deck hosts. */
export const SlideContent = S.Union([
  TitleSlide,
  PrincipleSlide,
  ComparisonSlide,
  FlowSlide,
  SourcesSlide,
])
/** One supported slide body. */
export type SlideContent = typeof SlideContent.Type

/** A source-backed slide with a stable identity. */
export const Slide = S.Struct({
  content: SlideContent,
  id: SlideId,
  sourceIds: S.NonEmptyArray(SourceId),
})
/** A source-backed slide value. */
export type Slide = typeof Slide.Type

/** A non-empty, source-backed, portable slide deck. */
export const Deck = S.Struct({
  byline: S.String,
  id: S.Literal('constructive-data-modeling'),
  slides: S.NonEmptyArray(Slide),
  sources: S.NonEmptyArray(SourceReference),
  title: S.String,
})
/** A portable slide deck value. */
export type Deck = typeof Deck.Type

/** No host has controlled the freshly initialized deck. */
export const InitialControl = ts('InitialControl')
/** A keyboard controlled the deck. */
export const KeyboardControl = ts('KeyboardControl')
/** A pointer controlled the deck. */
export const PointerControl = ts('PointerControl')
/** A one-shot command line controlled the deck. */
export const CommandLineControl = ts('CommandLineControl')
/** An interactive terminal controlled the deck. */
export const TerminalControl = ts('TerminalControl')
/** A future remote adapter controlled the deck through the shared Message API. */
export const RemoteControl = ts('RemoteControl', {
  controllerId: S.String,
})

/** Every origin allowed to send the deck's shared Messages. */
export const ControlOrigin = S.Union([
  InitialControl,
  KeyboardControl,
  PointerControl,
  CommandLineControl,
  TerminalControl,
  RemoteControl,
])
/** One shared Message origin. */
export type ControlOrigin = typeof ControlOrigin.Type

/** The complete renderer-neutral slide deck Model. */
export const Model = S.Struct({
  currentSlideId: SlideId,
  lastControl: ControlOrigin,
})
/** A renderer-neutral slide deck Model value. */
export type Model = typeof Model.Type

/** The canonical initial slide deck Model shared by every host. */
export const initialModel = Model.make({
  currentSlideId: 'opening',
  lastControl: InitialControl(),
})
