import { Array, Match as M, Option, Schema as S } from 'effect'

import {
  AuthoredPageLocation,
  AuthoredSlide,
  Deck,
  type DeckLocation,
  type PageChooserScope,
  QuestionAnswerLocation,
  QuestionAnswerSlide,
  RevealPage,
  type RevealPage as RevealPageValue,
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
  revealStartPage: RevealPageValue
  revealEndPage: RevealPageValue
  startSeconds: number
  endSeconds: number
}>

/** One exact authored reveal and its synchronized recording interval. */
export const Reveal = S.Struct({
  deepLink: S.String,
  endSeconds: S.Number,
  page: RevealPage,
  startSeconds: S.Number,
})
/** One exact authored reveal value. */
export type Reveal = typeof Reveal.Type

/** One named destination exposed by Alexis King's authored page chooser. */
export const PageLandmark = S.Struct({
  label: S.String,
  page: RevealPage,
})
/** One named page destination. */
export type PageLandmark = typeof PageLandmark.Type

/** The six authored section destinations shown by the talk's page chooser. */
export const pageLandmarks = S.NonEmptyArray(PageLandmark).make([
  { label: 'Title', page: 1 },
  { label: 'Introduction', page: 2 },
  { label: 'Static typing', page: 9 },
  { label: 'Positive space', page: 52 },
  { label: 'Obligation propagation', page: 101 },
  { label: 'Conclusion', page: 147 },
])

const revealStartSeconds: ReadonlyArray<number> = [
  0, 5, 7, 27, 36, 46, 54, 70, 77, 85, 86, 89, 93, 103, 104, 116, 132, 137, 138,
  140, 145, 154, 165, 177, 182, 187, 193, 198, 215, 236, 242, 244, 257, 279,
  297, 312, 315, 321, 322, 332, 341, 342, 350, 357, 366, 375, 381, 387, 395,
  405, 411, 416, 421, 425, 431, 434, 439, 453, 456, 459, 473, 485, 487, 494,
  501, 505, 510, 537, 542, 549, 561, 563, 568, 574, 579, 585, 588, 594, 609,
  615, 621, 625, 647, 648, 660, 677, 687, 694, 706, 732, 747, 757, 772, 786,
  790, 806, 822, 829, 863, 884, 891, 893, 908, 921, 938, 959, 978, 984, 990,
  998, 1002, 1018, 1024, 1035, 1048, 1055, 1071, 1075, 1081, 1084, 1104, 1117,
  1122, 1128, 1132, 1150, 1155, 1166, 1167, 1182, 1205, 1227, 1253, 1257, 1267,
  1268, 1275, 1280, 1287, 1296, 1310, 1314, 1319, 1323, 1332, 1337, 1373, 1378,
  1382, 1386, 1400, 1437, 1448, 1453, 1460, 1485, 1491, 1507,
]

/** Every authored reveal page aligned to its exact recording interval. */
export const revealTimeline = Array.map(
  RevealPage.literals,
  (page, index): Reveal => {
    const startSeconds = Option.getOrThrow(Array.get(revealStartSeconds, index))
    const endSeconds = Option.getOrElse(
      Array.get(revealStartSeconds, index + 1),
      () => 1692,
    )
    return Reveal.make({
      deepLink: deepLinkAt(startSeconds),
      endSeconds,
      page,
      startSeconds,
    })
  },
)

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
  Option.getOrThrow(Array.get(talkSlides, indexForSlideId(slideId)))

/** Returns the next slide identity, stopping at the final cue. */
export const nextSlideId = (slideId: SlideId): SlideId =>
  Option.getOrThrow(
    Array.get(
      talkSlides,
      Math.min(indexForSlideId(slideId) + 1, talkSlides.length - 1),
    ),
  ).id

/** Returns the previous slide identity, stopping at the opening cue. */
export const previousSlideId = (slideId: SlideId): SlideId =>
  Option.getOrThrow(
    Array.get(talkSlides, Math.max(indexForSlideId(slideId) - 1, 0)),
  ).id

/** Returns a one-based position for one stable slide identity. */
export const positionForSlideId = (slideId: SlideId): number =>
  indexForSlideId(slideId) + 1

/** Returns the cue containing an observed recording time. */
export const slideIdForPlaybackSeconds = (seconds: number): SlideId =>
  Option.getOrElse(
    Array.findLast(talkSlides, slide => seconds >= slide.startSeconds),
    () => Array.headNonEmpty(talkSlides),
  ).id

/** Returns the exact time-indexed reveal for one authored page. */
export const revealForPage = (page: RevealPageValue): Reveal =>
  Option.getOrThrow(
    Array.findFirst(revealTimeline, reveal => reveal.page === page),
  )

/** Returns the exact authored reveal visible at one recording time. */
export const revealPageForPlaybackSeconds = (
  seconds: number,
): RevealPageValue =>
  Option.getOrElse(
    Array.findLast(revealTimeline, reveal => seconds >= reveal.startSeconds),
    () => Option.getOrThrow(Array.head(revealTimeline)),
  ).page

/** Returns the logical authored slide containing an exact reveal page. */
export const slideForRevealPage = (page: RevealPageValue): Slide =>
  Option.getOrThrow(
    Array.findFirst(talkSlides, slide =>
      M.value(slide.content).pipe(
        M.withReturnType<boolean>(),
        M.tagsExhaustive({
          AuthoredSlide: ({ revealEndPage, revealStartPage }) =>
            page >= revealStartPage && page <= revealEndPage,
          QuestionAnswerSlide: () => false,
        }),
      ),
    ),
  )

/** Returns the exact synchronized location for one observed recording time. */
export const locationForPlaybackSeconds = (seconds: number): DeckLocation =>
  seconds >= 1692
    ? QuestionAnswerLocation()
    : AuthoredPageLocation({ page: revealPageForPlaybackSeconds(seconds) })

/** Returns the first exact location represented by one logical slide. */
export const locationForSlideId = (slideId: SlideId): DeckLocation => {
  const slide = slideForId(slideId)
  return M.value(slide.content).pipe(
    M.withReturnType<DeckLocation>(),
    M.tagsExhaustive({
      AuthoredSlide: ({ revealStartPage }) =>
        AuthoredPageLocation({ page: revealStartPage }),
      QuestionAnswerSlide: () => QuestionAnswerLocation(),
    }),
  )
}

/** Returns the logical slide containing one exact synchronized location. */
export const slideForLocation = (location: DeckLocation): Slide =>
  M.value(location).pipe(
    M.withReturnType<Slide>(),
    M.tagsExhaustive({
      AuthoredPageLocation: ({ page }) => slideForRevealPage(page),
      QuestionAnswerLocation: () => slideForId('q-and-a'),
    }),
  )

/** Returns the stable location key used by host adapters. */
export const locationKey = (location: DeckLocation): string =>
  M.value(location).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      AuthoredPageLocation: ({ page }) => `page-${page.toString()}`,
      QuestionAnswerLocation: () => 'q-and-a',
    }),
  )

/** Returns the exact recording time for one synchronized location. */
export const startSecondsForLocation = (location: DeckLocation): number =>
  M.value(location).pipe(
    M.withReturnType<number>(),
    M.tagsExhaustive({
      AuthoredPageLocation: ({ page }) => revealForPage(page).startSeconds,
      QuestionAnswerLocation: () => slideForId('q-and-a').startSeconds,
    }),
  )

/** Advances one exact page, entering Q&A after authored page 158. */
export const nextLocation = (location: DeckLocation): DeckLocation =>
  M.value(location).pipe(
    M.withReturnType<DeckLocation>(),
    M.tagsExhaustive({
      AuthoredPageLocation: ({ page }) => {
        const maybeNextPage = Array.get(RevealPage.literals, page)
        return Option.match(maybeNextPage, {
          onNone: () => QuestionAnswerLocation(),
          onSome: nextPage => AuthoredPageLocation({ page: nextPage }),
        })
      },
      QuestionAnswerLocation: () => QuestionAnswerLocation(),
    }),
  )

/** Rewinds one exact page, returning from Q&A to authored page 158. */
export const previousLocation = (location: DeckLocation): DeckLocation =>
  M.value(location).pipe(
    M.withReturnType<DeckLocation>(),
    M.tagsExhaustive({
      AuthoredPageLocation: ({ page }) =>
        AuthoredPageLocation({
          page: Option.getOrElse(
            Array.get(RevealPage.literals, page - 2),
            () => 1,
          ),
        }),
      QuestionAnswerLocation: () => AuthoredPageLocation({ page: 158 }),
    }),
  )

const landmarkRevealPages = Array.map(pageLandmarks, landmark => landmark.page)

/** Returns the authored pages visible in one chooser scope. */
export const pagesForChooserScope = (
  scope: PageChooserScope,
): ReadonlyArray<RevealPageValue> =>
  M.value(scope).pipe(
    M.withReturnType<ReadonlyArray<RevealPageValue>>(),
    M.tagsExhaustive({
      AllAuthoredPages: () => RevealPage.literals,
      LandmarkPages: () => landmarkRevealPages,
    }),
  )

/** Returns the closest selectable page in one chooser scope. */
export const nearestPageForChooserScope = (
  page: RevealPageValue,
  scope: PageChooserScope,
): RevealPageValue => {
  const pages = pagesForChooserScope(scope)
  const firstPage = Option.getOrThrow(Array.head(pages))
  return Array.reduce(pages, firstPage, (nearestPage, candidatePage) =>
    Math.abs(candidatePage - page) < Math.abs(nearestPage - page)
      ? candidatePage
      : nearestPage,
  )
}

const movePageForChooserScope = (
  page: RevealPageValue,
  scope: PageChooserScope,
  offset: number,
): RevealPageValue => {
  const pages = pagesForChooserScope(scope)
  const normalizedPage = nearestPageForChooserScope(page, scope)
  const index = Option.getOrThrow(
    Array.findFirstIndex(
      pages,
      candidatePage => candidatePage === normalizedPage,
    ),
  )
  return Option.getOrThrow(
    Array.get(pages, Math.max(0, Math.min(index + offset, pages.length - 1))),
  )
}

/** Advances the selected chooser target within its current scope. */
export const nextPageForChooserScope = (
  page: RevealPageValue,
  scope: PageChooserScope,
): RevealPageValue => movePageForChooserScope(page, scope, 1)

/** Rewinds the selected chooser target within its current scope. */
export const previousPageForChooserScope = (
  page: RevealPageValue,
  scope: PageChooserScope,
): RevealPageValue => movePageForChooserScope(page, scope, -1)
