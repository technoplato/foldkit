import { Schema as S } from 'effect'
import { ts } from 'foldkit/schema'

/** Stable identities for the talk's authored logical slides and Q&A tail. */
export const SlideId = S.Literals([
  'opening-title',
  'about-alexis',
  'software-should-work',
  'static-typing',
  'static-typing-dark-ages',
  'type-system-renaissance',
  'but-at-what-cost',
  'gradual-typing',
  'this-makes-me-sad',
  'what-if-i-told-you',
  'ingredients',
  'shift-in-perspective',
  'types-as-restrictions',
  'other-languages',
  'key-idea-1-negative-space',
  'key-idea-1-positive-space',
  'more-examples',
  'key-idea-2',
  'correlated-optionals',
  'dependent-field-attempt',
  'user-contact-sum',
  'ior-sum',
  'user-contact-sum-revisited',
  'system-user-boolean',
  'system-user-sum',
  'time-range',
  'representation-choice',
  'type-system-purpose',
  'obligations-far-apart',
  'new-case-obligation',
  'obligation-propagation-machine',
  'list-versus-nonempty-list',
  'key-idea-3',
  'option-types',
  'it-depends',
  'sowing-and-reaping',
  'move-obligations',
  'recap',
  'convenience',
  'thanks',
  'q-and-a',
])
/** One stable slide identity. */
export type SlideId = typeof SlideId.Type

/** Stable identities for the primary evidence behind the synchronized deck. */
export const SourceId = S.Literals([
  'recording',
  'transcript',
  'slides',
  'event',
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

/** One logical slide backed by an authored condensed page and reveal range. */
export const AuthoredSlide = ts('AuthoredSlide', {
  condensedPage: S.Int,
  revealEndPage: S.Int,
  revealStartPage: S.Int,
  summary: S.String,
  title: S.String,
})

/** The camera-only question-and-answer tail after the authored deck. */
export const QuestionAnswerSlide = ts('QuestionAnswerSlide', {
  summary: S.String,
  title: S.String,
})

/** Every synchronized talk state supported by all deck hosts. */
export const SlideContent = S.Union([AuthoredSlide, QuestionAnswerSlide])
/** One synchronized talk state. */
export type SlideContent = typeof SlideContent.Type

/** A time-indexed source-backed slide with a stable identity. */
export const Slide = S.Struct({
  content: SlideContent,
  deepLink: S.String,
  endSeconds: S.Number,
  id: SlideId,
  sourceIds: S.NonEmptyArray(SourceId),
  startSeconds: S.Number,
})
/** A time-indexed source-backed slide value. */
export type Slide = typeof Slide.Type

/** A non-empty, source-backed, portable synchronized talk deck. */
export const Deck = S.Struct({
  byline: S.String,
  id: S.Literal('constructive-data-modeling'),
  slides: S.NonEmptyArray(Slide),
  sources: S.NonEmptyArray(SourceReference),
  title: S.String,
  videoDurationSeconds: S.Number,
  videoId: S.String,
})
/** A portable synchronized talk deck value. */
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
/** Video playback selected the cue containing its observed time. */
export const VideoPlaybackControl = ts('VideoPlaybackControl')
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
  VideoPlaybackControl,
  RemoteControl,
])
/** One shared Message origin. */
export type ControlOrigin = typeof ControlOrigin.Type

/** The complete renderer-neutral synchronized deck Model. */
export const Model = S.Struct({
  currentSlideId: SlideId,
  lastControl: ControlOrigin,
})
/** A renderer-neutral synchronized deck Model value. */
export type Model = typeof Model.Type

/** The canonical initial slide deck Model shared by every host. */
export const initialModel = Model.make({
  currentSlideId: 'opening-title',
  lastControl: InitialControl(),
})
