import { Array, Option } from 'effect'

import {
  AuthoredSlide,
  Deck,
  QuestionAnswerSlide,
  type Slide,
  type SlideId,
} from './model.js'

const videoId = '0BXuYlNrUmE'
const videoDurationSeconds = 2545
const deepLinkAt = (seconds: number): string =>
  `https://youtu.be/${videoId}?t=${seconds.toString()}`

type AuthoredSlideInput = Readonly<{
  id: SlideId
  title: string
  summary: string
  condensedPage: number
  revealStartPage: number
  revealEndPage: number
  startSeconds: number
  endSeconds: number
}>

const authored = (input: AuthoredSlideInput): Slide => ({
  id: input.id,
  startSeconds: input.startSeconds,
  endSeconds: input.endSeconds,
  deepLink: deepLinkAt(input.startSeconds),
  sourceIds: ['recording', 'transcript', 'slides'],
  content: AuthoredSlide({
    title: input.title,
    summary: input.summary,
    condensedPage: input.condensedPage,
    revealStartPage: input.revealStartPage,
    revealEndPage: input.revealEndPage,
  }),
})

/** Exact logical-slide sequence recovered from the recording and authored deck. */
export const talkSlides: readonly [Slide, ...Slide[]] = [
  authored({
    id: 'opening-title',
    title: 'Constructive data modeling',
    summary: 'Opening title and conference attribution.',
    condensedPage: 1,
    revealStartPage: 1,
    revealEndPage: 1,
    startSeconds: 0,
    endSeconds: 5,
  }),
  authored({
    id: 'about-alexis',
    title: 'About Alexis King',
    summary: 'Prior work on GHC and current work at Zed.',
    condensedPage: 2,
    revealStartPage: 2,
    revealEndPage: 5,
    startSeconds: 5,
    endSeconds: 46,
  }),
  authored({
    id: 'software-should-work',
    title: 'Software should work, indeed!',
    summary: 'The talk turns from the conference premise to static typing.',
    condensedPage: 3,
    revealStartPage: 6,
    revealEndPage: 7,
    startSeconds: 46,
    endSeconds: 70,
  }),
  authored({
    id: 'static-typing',
    title: 'Static typing',
    summary: 'A short section card introduces the historical setup.',
    condensedPage: 4,
    revealStartPage: 8,
    revealEndPage: 8,
    startSeconds: 70,
    endSeconds: 77,
  }),
  authored({
    id: 'static-typing-dark-ages',
    title: 'The static typing dark ages',
    summary:
      'Java and C++ made static typing feel conservative or complicated.',
    condensedPage: 5,
    revealStartPage: 9,
    revealEndPage: 16,
    startSeconds: 77,
    endSeconds: 132,
  }),
  authored({
    id: 'type-system-renaissance',
    title: 'The renaissance',
    summary:
      'Rust and TypeScript made sophisticated static typing feel current again.',
    condensedPage: 6,
    revealStartPage: 17,
    revealEndPage: 23,
    startSeconds: 132,
    endSeconds: 177,
  }),
  authored({
    id: 'but-at-what-cost',
    title: 'But at what cost?',
    summary:
      'The renaissance brought a steep increase in type-system complexity.',
    condensedPage: 7,
    revealStartPage: 24,
    revealEndPage: 30,
    startSeconds: 177,
    endSeconds: 242,
  }),
  authored({
    id: 'gradual-typing',
    title: 'Gradual typing',
    summary:
      'Static semantics grow complex when they must accommodate dynamic idioms.',
    condensedPage: 8,
    revealStartPage: 31,
    revealEndPage: 35,
    startSeconds: 242,
    endSeconds: 312,
  }),
  authored({
    id: 'this-makes-me-sad',
    title: 'This makes me sad',
    summary:
      'Both overly limiting and overly complex systems leave programmers frustrated.',
    condensedPage: 9,
    revealStartPage: 36,
    revealEndPage: 40,
    startSeconds: 312,
    endSeconds: 341,
  }),
  authored({
    id: 'what-if-i-told-you',
    title: 'What if I told you…',
    summary:
      'The proposed alternative uses ordinary type machinery to capture invariants.',
    condensedPage: 10,
    revealStartPage: 41,
    revealEndPage: 45,
    startSeconds: 341,
    endSeconds: 375,
  }),
  authored({
    id: 'ingredients',
    title: 'Ingredients',
    summary: 'Products, sums, and exhaustive pattern matching are enough.',
    condensedPage: 11,
    revealStartPage: 46,
    revealEndPage: 50,
    startSeconds: 375,
    endSeconds: 411,
  }),
  authored({
    id: 'shift-in-perspective',
    title: 'A shift in perspective',
    summary:
      'The talk changes the way types are interpreted, not the language feature set.',
    condensedPage: 12,
    revealStartPage: 51,
    revealEndPage: 51,
    startSeconds: 411,
    endSeconds: 416,
  }),
  authored({
    id: 'types-as-restrictions',
    title: 'Types as restrictions',
    summary:
      'One view starts from unknown values and narrows the possible set.',
    condensedPage: 13,
    revealStartPage: 52,
    revealEndPage: 57,
    startSeconds: 416,
    endSeconds: 453,
  }),
  authored({
    id: 'other-languages',
    title: 'Other languages work differently',
    summary:
      'User-defined products extend the set of values programmers can construct.',
    condensedPage: 14,
    revealStartPage: 58,
    revealEndPage: 61,
    startSeconds: 453,
    endSeconds: 485,
  }),
  authored({
    id: 'key-idea-1-negative-space',
    title: 'Key idea 1: negative space',
    summary: 'A refinement-style natural number subtracts invalid integers.',
    condensedPage: 15,
    revealStartPage: 62,
    revealEndPage: 67,
    startSeconds: 485,
    endSeconds: 537,
  }),
  authored({
    id: 'key-idea-1-positive-space',
    title: 'Key idea 1: positive space',
    summary:
      'Construct integers from a sign and a natural number: adding is easier than subtracting.',
    condensedPage: 16,
    revealStartPage: 68,
    revealEndPage: 70,
    startSeconds: 537,
    endSeconds: 561,
  }),
  authored({
    id: 'more-examples',
    title: 'More examples',
    summary:
      'Non-empty and even-length lists can be built from smaller lawful pieces.',
    condensedPage: 17,
    revealStartPage: 71,
    revealEndPage: 82,
    startSeconds: 561,
    endSeconds: 647,
  }),
  authored({
    id: 'key-idea-2',
    title: 'Key idea 2: representation and interpretation',
    summary:
      'Data has no single privileged representation; describe the sequence you mean.',
    condensedPage: 18,
    revealStartPage: 83,
    revealEndPage: 88,
    startSeconds: 647,
    endSeconds: 706,
  }),
  authored({
    id: 'correlated-optionals',
    title: 'Correlated optional contact fields',
    summary:
      'Two optional fields hide an invariant: at least one contact method must exist.',
    condensedPage: 19,
    revealStartPage: 89,
    revealEndPage: 89,
    startSeconds: 706,
    endSeconds: 732,
  }),
  authored({
    id: 'dependent-field-attempt',
    title: 'A dependent-field attempt',
    summary:
      'A field whose type depends on another field expresses the rule but adds machinery.',
    condensedPage: 20,
    revealStartPage: 90,
    revealEndPage: 90,
    startSeconds: 732,
    endSeconds: 747,
  }),
  authored({
    id: 'user-contact-sum',
    title: 'UserContact as a sum',
    summary: 'Email, phone, or both becomes an ordinary closed set of cases.',
    condensedPage: 21,
    revealStartPage: 91,
    revealEndPage: 92,
    startSeconds: 747,
    endSeconds: 772,
  }),
  authored({
    id: 'ior-sum',
    title: 'The reusable Ior sum',
    summary:
      'The same three-way shape can be factored into a generic inclusive-or type.',
    condensedPage: 22,
    revealStartPage: 93,
    revealEndPage: 93,
    startSeconds: 772,
    endSeconds: 786,
  }),
  authored({
    id: 'user-contact-sum-revisited',
    title: 'Return from Ior to UserContact',
    summary:
      'The authored deck intentionally returns to the domain-named sum after showing Ior.',
    condensedPage: 21,
    revealStartPage: 94,
    revealEndPage: 94,
    startSeconds: 786,
    endSeconds: 790,
  }),
  authored({
    id: 'system-user-boolean',
    title: 'System users as a Boolean invariant',
    summary:
      'An optional contact plus a Boolean creates another correlated-state obligation.',
    condensedPage: 23,
    revealStartPage: 95,
    revealEndPage: 95,
    startSeconds: 790,
    endSeconds: 806,
  }),
  authored({
    id: 'system-user-sum',
    title: 'System users as a sum case',
    summary:
      'Adding System to UserContact makes the exceptional state directly constructible.',
    condensedPage: 24,
    revealStartPage: 96,
    revealEndPage: 96,
    startSeconds: 806,
    endSeconds: 822,
  }),
  authored({
    id: 'time-range',
    title: 'Constructive modeling can be tricky',
    summary:
      'A start plus duration constructs an ordered time range more directly than two endpoints.',
    condensedPage: 25,
    revealStartPage: 97,
    revealEndPage: 99,
    startSeconds: 822,
    endSeconds: 884,
  }),
  authored({
    id: 'representation-choice',
    title: 'Which representation should I pick?',
    summary:
      'The next section grounds representation choice in the obligations at use sites.',
    condensedPage: 26,
    revealStartPage: 100,
    revealEndPage: 100,
    startSeconds: 884,
    endSeconds: 891,
  }),
  authored({
    id: 'type-system-purpose',
    title: 'What is the type system for?',
    summary:
      'For correctness, its practical job is keeping track of cases that must be handled.',
    condensedPage: 27,
    revealStartPage: 101,
    revealEndPage: 107,
    startSeconds: 891,
    endSeconds: 984,
  }),
  authored({
    id: 'obligations-far-apart',
    title: 'Obligations can be far apart',
    summary:
      'A case is introduced in one part of a program and consumed exhaustively elsewhere.',
    condensedPage: 28,
    revealStartPage: 108,
    revealEndPage: 111,
    startSeconds: 984,
    endSeconds: 1018,
  }),
  authored({
    id: 'new-case-obligation',
    title: 'A new case propagates an obligation',
    summary:
      'Adding an API user makes distant non-exhaustive matches fail visibly.',
    condensedPage: 29,
    revealStartPage: 112,
    revealEndPage: 113,
    startSeconds: 1018,
    endSeconds: 1035,
  }),
  authored({
    id: 'obligation-propagation-machine',
    title: 'An obligation propagation machine',
    summary:
      'Use sites determine which obligations the type definition must carry.',
    condensedPage: 30,
    revealStartPage: 114,
    revealEndPage: 115,
    startSeconds: 1035,
    endSeconds: 1055,
  }),
  authored({
    id: 'list-versus-nonempty-list',
    title: 'List versus NonEmptyList',
    summary:
      'Use List where emptiness is harmless, and NonEmptyList where a total consumer needs a head.',
    condensedPage: 31,
    revealStartPage: 116,
    revealEndPage: 127,
    startSeconds: 1055,
    endSeconds: 1166,
  }),
  authored({
    id: 'key-idea-3',
    title: 'Key idea 3: write total functions',
    summary:
      'Choose the simplest representation that minimizes impossible panic branches.',
    condensedPage: 32,
    revealStartPage: 128,
    revealEndPage: 130,
    startSeconds: 1166,
    endSeconds: 1205,
  }),
  authored({
    id: 'option-types',
    title: 'Option types',
    summary:
      'The relative restrictiveness of T and Option<T> depends on the consumer obligation.',
    condensedPage: 33,
    revealStartPage: 131,
    revealEndPage: 132,
    startSeconds: 1205,
    endSeconds: 1253,
  }),
  authored({
    id: 'it-depends',
    title: 'It depends',
    summary:
      'An optional user lets a caller avoid providing data, but leaves the notifier unable to act.',
    condensedPage: 34,
    revealStartPage: 133,
    revealEndPage: 139,
    startSeconds: 1253,
    endSeconds: 1296,
  }),
  authored({
    id: 'sowing-and-reaping',
    title: 'Sowing and reaping',
    summary:
      'A reaction image punctuates the cost of postponing an obligation.',
    condensedPage: 35,
    revealStartPage: 140,
    revealEndPage: 140,
    startSeconds: 1296,
    endSeconds: 1310,
  }),
  authored({
    id: 'move-obligations',
    title: 'Move obligations around',
    summary:
      'Requiring User makes the notifier total and moves missing-user handling back to the caller.',
    condensedPage: 36,
    revealStartPage: 141,
    revealEndPage: 146,
    startSeconds: 1310,
    endSeconds: 1373,
  }),
  authored({
    id: 'recap',
    title: 'Recap',
    summary:
      'Positive space, representation choice, total functions, and well-placed obligations.',
    condensedPage: 37,
    revealStartPage: 147,
    revealEndPage: 152,
    startSeconds: 1373,
    endSeconds: 1448,
  }),
  authored({
    id: 'convenience',
    title: 'Convenience',
    summary:
      'Fancy language features are useful conveniences, but they are not the foundation.',
    condensedPage: 38,
    revealStartPage: 153,
    revealEndPage: 157,
    startSeconds: 1448,
    endSeconds: 1507,
  }),
  authored({
    id: 'thanks',
    title: 'Thanks!',
    summary:
      'The authored closing slide repeats the four modeling principles and speaker links.',
    condensedPage: 39,
    revealStartPage: 158,
    revealEndPage: 158,
    startSeconds: 1507,
    endSeconds: 1692,
  }),
  {
    id: 'q-and-a',
    startSeconds: 1692,
    endSeconds: videoDurationSeconds,
    deepLink: deepLinkAt(1692),
    sourceIds: ['recording', 'transcript'],
    content: QuestionAnswerSlide({
      title: 'Question and answer',
      summary:
        'The projected deck ends and the recording continues with audience questions.',
    }),
  },
]

/** The exact, time-indexed talk deck shared by every host. */
export const constructiveDataModelingDeck = Deck.make({
  id: 'constructive-data-modeling',
  title: 'The Unreasonable Effectiveness of Constructive Data Modeling',
  byline: 'Alexis King · Software Should Work 2026',
  videoId,
  videoDurationSeconds,
  slides: talkSlides,
  sources: [
    {
      id: 'recording',
      label: 'Conference recording',
      note: 'The exact 42:25 Software Should Work 2026 recording.',
      url: `https://www.youtube.com/watch?v=${videoId}`,
    },
    {
      id: 'transcript',
      label: 'Timed transcript',
      note: 'English timed captions recovered from the YouTube recording.',
      url: `https://www.youtube.com/watch?v=${videoId}`,
    },
    {
      id: 'slides',
      label: 'Authored slide source',
      note: 'Exact public repository commit containing the 39-page and 158-reveal PDFs.',
      url: 'https://github.com/lexi-lambda/talks/tree/c43b8f2d7645c78fb60c2e724f47f8b0c4872277/2026-07%20constructive%20data%20modeling',
    },
    {
      id: 'event',
      label: 'Software Should Work 2026',
      note: 'Official conference schedule and talk abstract.',
      url: 'https://softwareshould.work/',
    },
    {
      id: 'speaker',
      label: 'Alexis King',
      note: 'Speaker’s official site and writing index.',
      url: 'https://lexi-lambda.github.io/',
    },
  ],
})

const indexForSlideId = (slideId: SlideId): number =>
  Option.getOrThrow(
    Array.findFirstIndex(talkSlides, slide => slide.id === slideId),
  )

/** Returns the source-backed slide for one stable identity. */
export const slideForId = (slideId: SlideId): Slide =>
  talkSlides[indexForSlideId(slideId)] as Slide

/** Returns the next slide identity, stopping at the final cue. */
export const nextSlideId = (slideId: SlideId): SlideId =>
  (
    talkSlides[
      Math.min(indexForSlideId(slideId) + 1, talkSlides.length - 1)
    ] as Slide
  ).id

/** Returns the previous slide identity, stopping at the opening cue. */
export const previousSlideId = (slideId: SlideId): SlideId =>
  (talkSlides[Math.max(indexForSlideId(slideId) - 1, 0)] as Slide).id

/** Returns a one-based position for one stable slide identity. */
export const positionForSlideId = (slideId: SlideId): number =>
  indexForSlideId(slideId) + 1

/** Returns the cue containing an observed recording time. */
export const slideIdForPlaybackSeconds = (seconds: number): SlideId =>
  Option.getOrElse(
    Array.findLast(talkSlides, slide => seconds >= slide.startSeconds),
    () => talkSlides[0],
  ).id
