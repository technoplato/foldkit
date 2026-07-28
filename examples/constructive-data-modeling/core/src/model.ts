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

/** Every authored reveal page in the uncondensed source deck. */
export const RevealPage = S.Literals([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22,
  23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41,
  42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60,
  61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79,
  80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98,
  99, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114,
  115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129,
  130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144,
  145, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156, 157, 158,
])
/** One authored reveal page. */
export type RevealPage = typeof RevealPage.Type

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
  revealEndPage: RevealPage,
  revealStartPage: RevealPage,
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

/** The deck is displaying one exact authored reveal page. */
export const AuthoredPageLocation = ts('AuthoredPageLocation', {
  page: RevealPage,
})
/** The deck is displaying the recording-only question-and-answer tail. */
export const QuestionAnswerLocation = ts('QuestionAnswerLocation')
/** Every valid synchronized location in the talk. */
export const DeckLocation = S.Union([
  AuthoredPageLocation,
  QuestionAnswerLocation,
])
/** One exact synchronized location in the talk. */
export type DeckLocation = typeof DeckLocation.Type

/** The page chooser is showing the six authored section landmarks. */
export const LandmarkPages = ts('LandmarkPages')
/** The page chooser is showing all 158 authored reveal pages. */
export const AllAuthoredPages = ts('AllAuthoredPages')
/** Every supported page chooser scope. */
export const PageChooserScope = S.Union([LandmarkPages, AllAuthoredPages])
/** One page chooser scope. */
export type PageChooserScope = typeof PageChooserScope.Type

/** No page chooser is visible. */
export const PageChooserClosed = ts('PageChooserClosed')
/** A page chooser is visible with one valid target selected. */
export const PageChooserOpen = ts('PageChooserOpen', {
  origin: ControlOrigin,
  scope: PageChooserScope,
  selectedPage: RevealPage,
})
/** Every valid page chooser state. */
export const PageChooserState = S.Union([PageChooserClosed, PageChooserOpen])
/** One page chooser state. */
export type PageChooserState = typeof PageChooserState.Type

/** The complete renderer-neutral synchronized deck Model. */
export const Model = S.Struct({
  lastControl: ControlOrigin,
  location: DeckLocation,
  pageChooser: PageChooserState,
})
/** A renderer-neutral synchronized deck Model value. */
export type Model = typeof Model.Type

/** The canonical initial slide deck Model shared by every host. */
export const initialModel = Model.make({
  lastControl: InitialControl(),
  location: AuthoredPageLocation({ page: 1 }),
  pageChooser: PageChooserClosed(),
})
