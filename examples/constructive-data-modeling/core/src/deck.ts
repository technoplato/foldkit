import { Match as M } from 'effect'

import {
  ComparisonSlide,
  Deck,
  FlowSlide,
  PrincipleSlide,
  type Slide,
  type SlideId,
  SourcesSlide,
  TitleSlide,
} from './model.js'

const openingSlide: Slide = {
  id: 'opening',
  sourceIds: ['recording', 'event', 'slides'],
  content: TitleSlide({
    eyebrow: 'A source-backed study deck',
    speaker: 'Alexis King · Software Should Work 2026',
    subtitle: 'Make invalid states hard to name and obligations hard to lose.',
    title: 'Constructive data modeling',
  }),
}

const ingredientsSlide: Slide = {
  id: 'ingredients',
  sourceIds: ['recording', 'slides'],
  content: PrincipleSlide({
    eyebrow: 'The ordinary ingredients',
    points: [
      'Products say “and”: a value contains every field in the product.',
      'Sums say “or”: a value is exactly one case from a closed set.',
      'Exhaustive case analysis turns every new case into a visible obligation.',
    ],
    statement: 'Most of the leverage comes from arranging familiar types well.',
    title: 'Products, sums, and total case analysis',
  }),
}

const positiveSpaceSlide: Slide = {
  id: 'positive-space',
  sourceIds: ['recording', 'slides', 'essay'],
  content: PrincipleSlide({
    eyebrow: 'Construct the legal space',
    points: [
      'A predicate starts with a broad set and subtracts forbidden values.',
      'A constructor starts with nothing and adds only values it can justify.',
      'After the boundary succeeds, trusted code should not re-check the same fact.',
    ],
    statement:
      'Prefer data that proves its invariant over data plus a promise.',
    title: 'Build the positive space',
  }),
}

const checkoutSlide: Slide = {
  id: 'checkout-example',
  sourceIds: ['recording', 'slides', 'essay'],
  content: ComparisonSlide({
    eyebrow: 'A fresh example',
    title: 'Correlated optionals are a hidden sum type',
    before: {
      label: 'Subtractive object',
      code: `type Checkout = {
  kind: "ship" | "pickup"
  address?: Address
  storeId?: string
}`,
      consequence: 'Four field combinations exist, but only two have meaning.',
    },
    after: {
      label: 'Constructive union',
      code: `type Fulfillment =
  | { kind: "ship"; address: Address }
  | { kind: "pickup"; storeId: string }`,
      consequence:
        'Every constructible value carries exactly the evidence it needs.',
    },
  }),
}

const representationSlide: Slide = {
  id: 'representation',
  sourceIds: ['recording', 'slides'],
  content: PrincipleSlide({
    eyebrow: 'Separate two decisions',
    points: [
      'Representation asks which values can exist.',
      'Interpretation asks what a valid value means in one context.',
      'One small representation can support many interpreters without weakening its invariants.',
    ],
    statement: 'Do not force every behavior into the shape of the data.',
    title: 'Representation is not interpretation',
  }),
}

const obligationsSlide: Slide = {
  id: 'obligations',
  sourceIds: ['recording', 'slides'],
  content: FlowSlide({
    eyebrow: 'The type system as a routing network',
    title: 'Push obligations to the best-informed site',
    steps: [
      {
        label: 'Use site',
        detail:
          'Notice where code would otherwise panic, branch defensively, or assert.',
      },
      {
        label: 'Type boundary',
        detail: 'Name the missing evidence in a product or sum.',
      },
      {
        label: 'Construction site',
        detail:
          'Require that evidence where the program actually knows enough to provide it.',
      },
      {
        label: 'Trusted core',
        detail:
          'Consume the proof with a total function and no impossible fallback.',
      },
    ],
  }),
}

const totalFunctionsSlide: Slide = {
  id: 'total-functions',
  sourceIds: ['recording', 'slides'],
  content: ComparisonSlide({
    eyebrow: 'A practical test',
    title: 'Count the “should never happen” branches',
    before: {
      label: 'Partial consumer',
      code: `const first = items[0]
if (!first) {
  throw new Error("impossible")
}`,
      consequence:
        'The consumer inherits an obligation the type never recorded.',
    },
    after: {
      label: 'Total consumer',
      code: `type NonEmpty<A> =
  readonly [A, ...A[]]

const first = <A>(items: NonEmpty<A>) => items[0]`,
      consequence:
        'Construction proves non-emptiness once; every use becomes ordinary.',
    },
  }),
}

const modelingLoopSlide: Slide = {
  id: 'modeling-loop',
  sourceIds: ['recording', 'slides', 'essay'],
  content: FlowSlide({
    eyebrow: 'Language-aware practice',
    title: 'A seven-move modeling loop',
    steps: [
      {
        label: 'Observe',
        detail:
          'Find correlated optionals, boolean modes, and partial functions.',
      },
      {
        label: 'Enumerate',
        detail: 'Write the valid states before choosing syntax.',
      },
      {
        label: 'Construct',
        detail: 'Use products for “and” and sums for “or”.',
      },
      {
        label: 'Separate',
        detail:
          'Keep wire, storage, draft, and trusted domain shapes distinct.',
      },
      {
        label: 'Relocate',
        detail:
          'Move obligations to the boundary with the necessary information.',
      },
      {
        label: 'Consume',
        detail: 'Make case analysis exhaustive and core functions total.',
      },
      {
        label: 'Verify',
        detail:
          'Test valid constructors, rejected inputs, migrations, and every case.',
      },
    ],
  }),
}

const ubiquitousDeckSlide: Slide = {
  id: 'ubiquitous-deck',
  sourceIds: ['recording', 'slides'],
  content: PrincipleSlide({
    eyebrow: 'The artifact models its own lesson',
    points: [
      'One Schema-defined Model and Message union drives browser, CLI, and TUI hosts.',
      'Slide bodies form a closed sum that every renderer handles exhaustively.',
      'A future InstantDB adapter may send the same Messages without owning deck state.',
    ],
    statement:
      'Remote control is a transport concern, not a second presentation model.',
    title: 'One deck, ubiquitous hosts',
  }),
}

const sourcesSlide: Slide = {
  id: 'sources',
  sourceIds: ['recording', 'event', 'slides', 'essay', 'speaker'],
  content: SourcesSlide({
    eyebrow: 'Trace every claim',
    sourceIds: ['recording', 'slides', 'event', 'essay', 'speaker'],
    title: 'Primary sources',
  }),
}

/** The transformative, source-backed study deck shared by every host. */
export const constructiveDataModelingDeck = Deck.make({
  id: 'constructive-data-modeling',
  title: 'Constructive data modeling',
  byline: 'A Foldkit study deck after Alexis King',
  slides: [
    openingSlide,
    ingredientsSlide,
    positiveSpaceSlide,
    checkoutSlide,
    representationSlide,
    obligationsSlide,
    totalFunctionsSlide,
    modelingLoopSlide,
    ubiquitousDeckSlide,
    sourcesSlide,
  ],
  sources: [
    {
      id: 'recording',
      label: 'Conference recording',
      note: 'The Unreasonable Effectiveness of Constructive Data Modeling, Software Should Work 2026.',
      url: 'https://www.youtube.com/watch?v=0BXuYlNrUmE',
    },
    {
      id: 'event',
      label: 'Software Should Work 2026',
      note: 'Official conference schedule and talk abstract.',
      url: 'https://softwareshould.work/',
    },
    {
      id: 'slides',
      label: 'Authored slide source',
      note: 'Exact public repository commit used for source inspection.',
      url: 'https://github.com/lexi-lambda/talks/tree/c43b8f2d7645c78fb60c2e724f47f8b0c4872277/2026-07%20constructive%20data%20modeling',
    },
    {
      id: 'essay',
      label: 'Parse, don’t validate',
      note: 'Related primary essay by Alexis King.',
      url: 'https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/',
    },
    {
      id: 'speaker',
      label: 'Alexis King',
      note: 'Speaker’s official site and writing index.',
      url: 'https://lexi-lambda.github.io/',
    },
  ],
})

/** Returns the source-backed slide for one stable identity. */
export const slideForId = (slideId: SlideId): Slide =>
  M.value(slideId).pipe(
    M.withReturnType<Slide>(),
    M.when('opening', () => openingSlide),
    M.when('ingredients', () => ingredientsSlide),
    M.when('positive-space', () => positiveSpaceSlide),
    M.when('checkout-example', () => checkoutSlide),
    M.when('representation', () => representationSlide),
    M.when('obligations', () => obligationsSlide),
    M.when('total-functions', () => totalFunctionsSlide),
    M.when('modeling-loop', () => modelingLoopSlide),
    M.when('ubiquitous-deck', () => ubiquitousDeckSlide),
    M.when('sources', () => sourcesSlide),
    M.exhaustive,
  )

/** Returns the next slide identity, stopping at the final slide. */
export const nextSlideId = (slideId: SlideId): SlideId =>
  M.value(slideId).pipe(
    M.withReturnType<SlideId>(),
    M.when('opening', () => 'ingredients'),
    M.when('ingredients', () => 'positive-space'),
    M.when('positive-space', () => 'checkout-example'),
    M.when('checkout-example', () => 'representation'),
    M.when('representation', () => 'obligations'),
    M.when('obligations', () => 'total-functions'),
    M.when('total-functions', () => 'modeling-loop'),
    M.when('modeling-loop', () => 'ubiquitous-deck'),
    M.when('ubiquitous-deck', () => 'sources'),
    M.when('sources', () => 'sources'),
    M.exhaustive,
  )

/** Returns the previous slide identity, stopping at the opening slide. */
export const previousSlideId = (slideId: SlideId): SlideId =>
  M.value(slideId).pipe(
    M.withReturnType<SlideId>(),
    M.when('opening', () => 'opening'),
    M.when('ingredients', () => 'opening'),
    M.when('positive-space', () => 'ingredients'),
    M.when('checkout-example', () => 'positive-space'),
    M.when('representation', () => 'checkout-example'),
    M.when('obligations', () => 'representation'),
    M.when('total-functions', () => 'obligations'),
    M.when('modeling-loop', () => 'total-functions'),
    M.when('ubiquitous-deck', () => 'modeling-loop'),
    M.when('sources', () => 'ubiquitous-deck'),
    M.exhaustive,
  )

/** Returns a one-based position for one stable slide identity. */
export const positionForSlideId = (slideId: SlideId): number =>
  M.value(slideId).pipe(
    M.withReturnType<number>(),
    M.when('opening', () => 1),
    M.when('ingredients', () => 2),
    M.when('positive-space', () => 3),
    M.when('checkout-example', () => 4),
    M.when('representation', () => 5),
    M.when('obligations', () => 6),
    M.when('total-functions', () => 7),
    M.when('modeling-loop', () => 8),
    M.when('ubiquitous-deck', () => 9),
    M.when('sources', () => 10),
    M.exhaustive,
  )
