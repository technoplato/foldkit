import { Array, Match as M, Option, Order, Schema as S, pipe } from 'effect'

import {
  type Issue,
  type IssueMention,
  type IssueStatus,
} from '@foldkit/instant-tools/issues'

import { type TextReference, readTextReferences } from './textReferences.js'

// ENTITY

/** An Issue by its number: `{ issueId: '1358' }`. */
export const IssueEntity = S.TaggedStruct('IssueEntity', { issueId: S.String })
/** A Recording by its id. */
export const RecordingEntity = S.TaggedStruct('RecordingEntity', {
  recordingId: S.String,
})
/** A Recording known only by its number, `Recording 208`, until an id is known. */
export const RecordingNumberEntity = S.TaggedStruct('RecordingNumberEntity', {
  recordingNumber: S.Int,
})
/** One line of a Recording by its id. */
export const SegmentEntity = S.TaggedStruct('SegmentEntity', {
  segmentId: S.String,
})
/** A commit by its SHA, or the prefix the text gave. */
export const CommitEntity = S.TaggedStruct('CommitEntity', { sha: S.String })
/** An agent by its id: `claude-code/issues-linear-1538@ld`. */
export const AgentEntity = S.TaggedStruct('AgentEntity', { agentId: S.String })
/** A harness's session by its own id: `2914b977-312b-4d93-a41c-4681d1255fe1`. */
export const SessionEntity = S.TaggedStruct('SessionEntity', {
  sessionId: S.String,
})
/** One thing an agent reported running into, by its row's id. */
export const FindingEntity = S.TaggedStruct('FindingEntity', {
  findingId: S.String,
})
/** A line of a product's feature contract by its slug: `scroll-back-always`. */
export const FeatureEntity = S.TaggedStruct('FeatureEntity', { slug: S.String })
/** A build by its number: `218`, `217.1`. */
export const BuildEntity = S.TaggedStruct('BuildEntity', { number: S.String })
/** An application or library by its tracker id: `scribe`, `foldkit`. */
export const ProductEntity = S.TaggedStruct('ProductEntity', {
  productId: S.String,
})
/** What he decided, by its row's id or the first 8 characters agents cite. */
export const DecisionEntity = S.TaggedStruct('DecisionEntity', {
  decisionId: S.String,
})
/** A question he asked, by its row's id or its first 8 characters. */
export const QuestionEntity = S.TaggedStruct('QuestionEntity', {
  questionId: S.String,
})
/** One of his reminders, by its row's id or its first 8 characters. */
export const ReminderEntity = S.TaggedStruct('ReminderEntity', {
  reminderId: S.String,
})
/**
 * An id the text does not name the kind of, such as the `a208e30c` of
 * `Seeded a3fe7871, a208e30c`. It has no page: a row with that id takes it.
 */
export const RawIdEntity = S.TaggedStruct('RawIdEntity', { id: S.String })

/** Everything an Issue can point at, and everything that has a page. */
export const Entity = S.Union([
  IssueEntity,
  RecordingEntity,
  RecordingNumberEntity,
  SegmentEntity,
  CommitEntity,
  AgentEntity,
  SessionEntity,
  FindingEntity,
  FeatureEntity,
  BuildEntity,
  ProductEntity,
  DecisionEntity,
  QuestionEntity,
  ReminderEntity,
  RawIdEntity,
])
/** Everything an Issue can point at, and everything that has a page. */
export type Entity = typeof Entity.Type

/**
 * Every entity with a page of its own: everything an Issue can point at but
 * another Issue, which has its Issue page. `/recordings/208` is the page of
 * Recording 208, `/agents/claude-code%2Fissues-linear-1538%40ld` an agent's.
 */
export const PageEntity = S.Union([
  RecordingEntity,
  RecordingNumberEntity,
  SegmentEntity,
  CommitEntity,
  AgentEntity,
  SessionEntity,
  FindingEntity,
  FeatureEntity,
  BuildEntity,
  ProductEntity,
  DecisionEntity,
  QuestionEntity,
  ReminderEntity,
])
/** Every entity with a page of its own. */
export type PageEntity = typeof PageEntity.Type

/** One page entity as one string: Build 217 is `BuildEntity:217`. */
export const pageEntityKey = (entity: PageEntity): string =>
  M.value(entity).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      RecordingEntity: ({ _tag, recordingId }) => `${_tag}:${recordingId}`,
      RecordingNumberEntity: ({ _tag, recordingNumber }) =>
        `${_tag}:${recordingNumber.toString()}`,
      SegmentEntity: ({ _tag, segmentId }) => `${_tag}:${segmentId}`,
      CommitEntity: ({ _tag, sha }) => `${_tag}:${sha}`,
      AgentEntity: ({ _tag, agentId }) => `${_tag}:${agentId}`,
      SessionEntity: ({ _tag, sessionId }) => `${_tag}:${sessionId}`,
      FindingEntity: ({ _tag, findingId }) => `${_tag}:${findingId}`,
      FeatureEntity: ({ _tag, slug }) => `${_tag}:${slug}`,
      BuildEntity: ({ _tag, number }) => `${_tag}:${number}`,
      ProductEntity: ({ _tag, productId }) => `${_tag}:${productId}`,
      DecisionEntity: ({ _tag, decisionId }) => `${_tag}:${decisionId}`,
      QuestionEntity: ({ _tag, questionId }) => `${_tag}:${questionId}`,
      ReminderEntity: ({ _tag, reminderId }) => `${_tag}:${reminderId}`,
    }),
  )

/** Where in an Issue a link was written. */
export const LinkPlace = S.Literals([
  'Details',
  'WorkLog',
  'Mention',
  'Related',
  'Claim',
  'Work',
  'Product',
])
/** Where in an Issue a link was written. */
export type LinkPlace = typeof LinkPlace.Type

/**
 * One link from an Issue to a thing: what it points at, where in the Issue
 * it was written, when, and the words around it, such as the work-log entry
 * `Landed in build 218 (#1358)`.
 */
export type IssueLink = Readonly<{
  target: Entity
  place: LinkPlace
  maybeAtMs: Option.Option<number>
  excerpt: string
}>

// LINKS OF ONE ISSUE

const linkTo = (
  target: Entity,
  place: LinkPlace,
  maybeAtMs: Option.Option<number>,
  excerpt: string,
): IssueLink => ({ target, place, maybeAtMs, excerpt })

const EXCERPT_RADIUS = 110

const excerptAround = (text: string, start: number, end: number): string => {
  const from = Math.max(0, start - EXCERPT_RADIUS)
  const to = Math.min(text.length, end + EXCERPT_RADIUS)
  return `${from > 0 ? '…' : ''}${text.slice(from, to).trim()}${to < text.length ? '…' : ''}`
}

const SHORT_SHA = 7
const SHORT_ROW_ID = 8

const targetsOf = (reference: TextReference): ReadonlyArray<Entity> =>
  M.value(reference).pipe(
    M.withReturnType<ReadonlyArray<Entity>>(),
    M.tagsExhaustive({
      IssueNumber: ({ issueId }) => [IssueEntity.make({ issueId })],
      RecordingLines: ({ recordingNumber, maybeRecordingId }) =>
        Option.match(maybeRecordingId, {
          onNone: () => [RecordingNumberEntity.make({ recordingNumber })],
          onSome: recordingId => [RecordingEntity.make({ recordingId })],
        }),
      RecordingId: ({ recordingId }) => [RecordingEntity.make({ recordingId })],
      SegmentId: ({ segmentId, maybeRecordingId, maybeRecordingNumber }) => [
        SegmentEntity.make({ segmentId }),
        ...Option.match(maybeRecordingId, {
          onNone: () =>
            Option.toArray(
              Option.map(maybeRecordingNumber, recordingNumber =>
                RecordingNumberEntity.make({ recordingNumber }),
              ),
            ),
          onSome: recordingId => [RecordingEntity.make({ recordingId })],
        }),
      ],
      WordsLink: ({ recordingId, maybeSectionId }) => [
        RecordingEntity.make({ recordingId }),
        ...Option.toArray(
          Option.map(maybeSectionId, segmentId =>
            SegmentEntity.make({ segmentId }),
          ),
        ),
      ],
      CommitSha: ({ sha }) => [CommitEntity.make({ sha })],
      AgentName: ({ agentId }) => [AgentEntity.make({ agentId })],
      BuildNumber: ({ number }) => [BuildEntity.make({ number })],
      ProductName: ({ productId }) => [ProductEntity.make({ productId })],
      FeatureName: ({ slug }) => [FeatureEntity.make({ slug })],
      FeatureLineNumber: () => [],
      FindingId: ({ findingId }) => [FindingEntity.make({ findingId })],
      DecisionId: ({ decisionId }) => [DecisionEntity.make({ decisionId })],
      QuestionId: ({ questionId }) => [QuestionEntity.make({ questionId })],
      ReminderId: ({ reminderId }) => [ReminderEntity.make({ reminderId })],
      Timestamp: () => [],
      ChatSession: ({ sessionId }) => [SessionEntity.make({ sessionId })],
      RawId: ({ id }) => [RawIdEntity.make({ id })],
      FilePath: () => [],
      WebLink: () => [],
    }),
  )

const textLinks = (
  text: string,
  place: LinkPlace,
  maybeAtMs: Option.Option<number>,
): ReadonlyArray<IssueLink> => {
  const pieces = readTextReferences(text)
  const starts = Array.reduce(
    pieces,
    { offsets: Array.empty<number>(), next: 0 },
    (state, piece) => ({
      offsets: [...state.offsets, state.next],
      next: state.next + piece.text.length,
    }),
  ).offsets
  return Array.flatMap(pieces, (piece, index) => {
    if (piece._tag === 'Words') {
      return []
    }
    const start = Option.getOrElse(Array.get(starts, index), () => 0)
    return Array.map(targetsOf(piece.reference), target =>
      linkTo(
        target,
        place,
        maybeAtMs,
        excerptAround(text, start, start + piece.text.length),
      ),
    )
  })
}

const mentionLinks = (mention: IssueMention): ReadonlyArray<IssueLink> => {
  const recordingSource: ReadonlyArray<IssueLink> =
    mention.source._tag === 'Recording'
      ? [
          linkTo(
            RecordingEntity.make({
              recordingId: mention.source.recording.recordingId.toLowerCase(),
            }),
            'Mention',
            mention.capturedAtMs,
            Option.getOrElse(
              Option.orElse(mention.directQuote, () => mention.note),
              () => '',
            ),
          ),
        ]
      : []
  const relatedLinks = Array.flatMap(mention.related, reference =>
    reference._tag === 'Uri'
      ? textLinks(reference.value, 'Mention', mention.capturedAtMs)
      : [],
  )
  return [
    ...recordingSource,
    ...relatedLinks,
    ...Option.match(mention.directQuote, {
      onNone: () => [],
      onSome: quote => textLinks(quote, 'Mention', mention.capturedAtMs),
    }),
    ...Option.match(mention.note, {
      onNone: () => [],
      onSome: note => textLinks(note, 'Mention', mention.capturedAtMs),
    }),
  ]
}

const structuredLinks = (issue: Issue): ReadonlyArray<IssueLink> => [
  linkTo(
    ProductEntity.make({ productId: issue.product.id }),
    'Product',
    Option.some(issue.createdAtMs),
    issue.title,
  ),
  ...Array.map(issue.relatedIssueIds, issueId =>
    linkTo(
      IssueEntity.make({ issueId }),
      'Related',
      Option.none(),
      issue.title,
    ),
  ),
  ...Option.toArray(
    Option.map(issue.claimantId, agentId =>
      linkTo(
        AgentEntity.make({ agentId }),
        'Claim',
        Option.some(issue.updatedAtMs),
        `Claimed ${issue.title}`,
      ),
    ),
  ),
  ...Array.flatMap(issue.workLog, entry => [
    ...Option.toArray(
      Option.map(entry.agentId, agentId =>
        linkTo(
          AgentEntity.make({ agentId }),
          'WorkLog',
          Option.some(entry.occurredAtMs),
          entry.summary,
        ),
      ),
    ),
    ...Option.toArray(
      Option.map(entry.commitSha, sha =>
        linkTo(
          CommitEntity.make({ sha }),
          'WorkLog',
          Option.some(entry.occurredAtMs),
          entry.summary,
        ),
      ),
    ),
  ]),
  ...Option.match(issue.workInProgress, {
    onNone: () => [],
    onSome: work => [
      ...Option.toArray(
        Option.map(work.targetBuild, number =>
          linkTo(
            BuildEntity.make({ number }),
            'Work',
            Option.some(work.updatedAtMs),
            `${work.landingState} for build ${number}`,
          ),
        ),
      ),
      ...Option.toArray(
        Option.map(work.commitSha, sha =>
          linkTo(
            CommitEntity.make({ sha }),
            'Work',
            Option.some(work.updatedAtMs),
            `${work.landingState} at ${sha}`,
          ),
        ),
      ),
    ],
  }),
]

const linksMemo = new WeakMap<Issue, ReadonlyArray<IssueLink>>()

/**
 * Every link one Issue makes: the references in its details, work log and
 * mentions, and its structured fields (related Issues, claim, work-log
 * agents and commits, target build, product). An unchanged Issue keeps its
 * decoded value between catalog snapshots, so its links are read once.
 */
export const linksOfIssue = (issue: Issue): ReadonlyArray<IssueLink> =>
  Option.getOrElse(Option.fromUndefinedOr(linksMemo.get(issue)), () => {
    const links = [
      ...textLinks(issue.details, 'Details', Option.some(issue.createdAtMs)),
      ...Array.flatMap(issue.workLog, entry =>
        textLinks(entry.summary, 'WorkLog', Option.some(entry.occurredAtMs)),
      ),
      ...Array.flatMap(issue.mentions, mentionLinks),
      ...structuredLinks(issue),
    ]
    linksMemo.set(issue, links)
    return links
  })

// RECORDINGS BY NUMBER

const RECORDING_NUMBER_AND_ID =
  /\bRecording\s+0*(\d{1,4})\s*(?:\(|=)\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi

/** Which Recording number is which id, as the catalog's mentions say. */
export type RecordingNumbers = Readonly<{
  idOfNumber: ReadonlyMap<number, string>
  numberOfId: ReadonlyMap<string, number>
}>

type RecordingPair = Readonly<{ recordingNumber: number; recordingId: string }>

const recordingPairsMemo = new WeakMap<Issue, ReadonlyArray<RecordingPair>>()

const recordingPairsOf = (issue: Issue): ReadonlyArray<RecordingPair> =>
  Option.getOrElse(
    Option.fromUndefinedOr(recordingPairsMemo.get(issue)),
    () => {
      const texts = Array.flatMap(issue.mentions, mention => [
        ...Option.toArray(mention.directQuote),
        ...Option.toArray(mention.note),
      ])
      const pairs = Array.flatMap(texts, text =>
        Array.map([...text.matchAll(RECORDING_NUMBER_AND_ID)], match => ({
          recordingNumber: Number(match[1]),
          recordingId: (match[2] ?? '').toLowerCase(),
        })),
      )
      recordingPairsMemo.set(issue, pairs)
      return pairs
    },
  )

const numbersMemo = new WeakMap<ReadonlyArray<Issue>, RecordingNumbers>()

/**
 * Which Recording number is which id, read from the mentions' words, such as
 * `Recording 208 (faa684c2-34e4-47e5-8f9b-3b2196da9463) #2735`: a reader
 * labels a words link `Recording 208` and finds Recording 208's page. Each
 * Issue's pairs are read once, so a live change reads only the Issue it
 * changed.
 */
export const recordingNumbersOf = (
  issues: ReadonlyArray<Issue>,
): RecordingNumbers =>
  Option.getOrElse(Option.fromUndefinedOr(numbersMemo.get(issues)), () => {
    const idOfNumber = new Map<number, string>()
    const numberOfId = new Map<string, number>()
    for (const issue of issues) {
      for (const { recordingNumber, recordingId } of recordingPairsOf(issue)) {
        idOfNumber.set(recordingNumber, recordingId)
        numberOfId.set(recordingId, recordingNumber)
      }
    }
    const numbers = { idOfNumber, numberOfId }
    numbersMemo.set(issues, numbers)
    return numbers
  })

/** One Entity with a Recording's number turned into its id when known. */
export const canonicalEntity = (
  entity: Entity,
  numbers: RecordingNumbers,
): Entity =>
  entity._tag === 'RecordingNumberEntity'
    ? Option.match(
        Option.fromUndefinedOr(numbers.idOfNumber.get(entity.recordingNumber)),
        {
          onNone: () => entity,
          onSome: recordingId => RecordingEntity.make({ recordingId }),
        },
      )
    : entity

/**
 * The one string naming an entity, for routes and comparisons:
 * `issue:1358`, `recording:faa684c2-…`, `agent:claude-code/issues-linear-1538@ld`.
 */
export const entityKey = (entity: Entity): string =>
  M.value(entity).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      IssueEntity: ({ issueId }) => `issue:${issueId}`,
      RecordingEntity: ({ recordingId }) => `recording:${recordingId}`,
      RecordingNumberEntity: ({ recordingNumber }) =>
        `recording-number:${recordingNumber.toString()}`,
      SegmentEntity: ({ segmentId }) => `segment:${segmentId}`,
      CommitEntity: ({ sha }) => `commit:${sha.slice(0, SHORT_SHA)}`,
      AgentEntity: ({ agentId }) => `agent:${agentId}`,
      SessionEntity: ({ sessionId }) => `session:${sessionId}`,
      FindingEntity: ({ findingId }) => `finding:${findingId}`,
      FeatureEntity: ({ slug }) => `feature:${slug}`,
      BuildEntity: ({ number }) => `build:${number}`,
      ProductEntity: ({ productId }) => `product:${productId}`,
      DecisionEntity: ({ decisionId }) =>
        `decision:${decisionId.slice(0, SHORT_ROW_ID)}`,
      QuestionEntity: ({ questionId }) =>
        `question:${questionId.slice(0, SHORT_ROW_ID)}`,
      ReminderEntity: ({ reminderId }) =>
        `reminder:${reminderId.slice(0, SHORT_ROW_ID)}`,
      RawIdEntity: ({ id }) => `id:${id.slice(0, SHORT_ROW_ID)}`,
    }),
  )

const isSameEntity = (left: Entity, right: Entity): boolean =>
  entityKey(left) === entityKey(right)

const shortIdOfRow = (entity: Entity): Option.Option<string> => {
  if (entity._tag === 'DecisionEntity') {
    return Option.some(entity.decisionId.slice(0, SHORT_ROW_ID))
  } else if (entity._tag === 'QuestionEntity') {
    return Option.some(entity.questionId.slice(0, SHORT_ROW_ID))
  } else if (entity._tag === 'ReminderEntity') {
    return Option.some(entity.reminderId.slice(0, SHORT_ROW_ID))
  }
  return Option.none()
}

const isNamedAsRow = (linked: Entity, target: Entity): boolean =>
  linked._tag === 'RawIdEntity' &&
  Option.contains(shortIdOfRow(target), linked.id.slice(0, SHORT_ROW_ID))

// BACKLINKS

const haystackMemo = new WeakMap<Issue, string>()

const haystackOf = (issue: Issue): string =>
  Option.getOrElse(Option.fromUndefinedOr(haystackMemo.get(issue)), () => {
    const haystack = Array.join(
      [
        issue.details,
        ...Array.map(issue.workLog, entry => entry.summary),
        ...Array.flatMap(issue.mentions, mention => [
          ...Option.toArray(mention.directQuote),
          ...Option.toArray(mention.note),
          ...Array.flatMap(mention.related, reference =>
            reference._tag === 'Uri' ? [reference.value] : [],
          ),
        ]),
      ],
      '\n',
    )
    haystackMemo.set(issue, haystack)
    return haystack
  })

const ZERO_PADDED_WIDTH = 3

const needlesOf = (
  entity: Entity,
  numbers: RecordingNumbers,
): ReadonlyArray<string> =>
  M.value(entity).pipe(
    M.withReturnType<ReadonlyArray<string>>(),
    M.tagsExhaustive({
      IssueEntity: ({ issueId }) => [`#${issueId}`, `/issues/${issueId}`],
      RecordingEntity: ({ recordingId }) => [
        recordingId,
        ...Option.match(
          Option.fromUndefinedOr(numbers.numberOfId.get(recordingId)),
          {
            onNone: () => [],
            onSome: recordingNumber => [
              `Recording ${recordingNumber.toString()}`,
              `Recording ${recordingNumber.toString().padStart(ZERO_PADDED_WIDTH, '0')}`,
            ],
          },
        ),
      ],
      RecordingNumberEntity: ({ recordingNumber }) => [
        `Recording ${recordingNumber.toString()}`,
        `Recording ${recordingNumber.toString().padStart(ZERO_PADDED_WIDTH, '0')}`,
      ],
      SegmentEntity: ({ segmentId }) => [segmentId],
      CommitEntity: ({ sha }) => [sha.slice(0, SHORT_SHA)],
      AgentEntity: ({ agentId }) => [agentId],
      SessionEntity: ({ sessionId }) => [sessionId],
      FindingEntity: ({ findingId }) => [findingId],
      FeatureEntity: ({ slug }) => [`/features/${slug}`],
      BuildEntity: ({ number }) => [
        `build ${number}`,
        `builds ${number}`,
        `Build ${number}`,
        `(${number})`,
      ],
      ProductEntity: () => [],
      DecisionEntity: ({ decisionId }) => [decisionId.slice(0, SHORT_ROW_ID)],
      QuestionEntity: ({ questionId }) => [questionId.slice(0, SHORT_ROW_ID)],
      ReminderEntity: ({ reminderId }) => [reminderId.slice(0, SHORT_ROW_ID)],
      RawIdEntity: ({ id }) => [id],
    }),
  )

const hasStructuredLink = (issue: Issue, entity: Entity): boolean =>
  M.value(entity).pipe(
    M.withReturnType<boolean>(),
    M.tagsExhaustive({
      IssueEntity: ({ issueId }) => issue.relatedIssueIds.includes(issueId),
      RecordingEntity: ({ recordingId }) =>
        Array.some(
          issue.mentions,
          mention =>
            mention.source._tag === 'Recording' &&
            mention.source.recording.recordingId.toLowerCase() === recordingId,
        ),
      RecordingNumberEntity: () => false,
      SegmentEntity: () => false,
      CommitEntity: ({ sha }) =>
        Array.some(issue.workLog, entry =>
          Option.exists(entry.commitSha, entrySha =>
            isSameEntity(CommitEntity.make({ sha: entrySha }), entity),
          ),
        ) ||
        Option.exists(issue.workInProgress, work =>
          Option.exists(work.commitSha, workSha =>
            isSameEntity(
              CommitEntity.make({ sha: workSha }),
              CommitEntity.make({ sha }),
            ),
          ),
        ),
      AgentEntity: ({ agentId }) =>
        Option.contains(issue.claimantId, agentId) ||
        Array.some(issue.workLog, entry =>
          Option.contains(entry.agentId, agentId),
        ),
      SessionEntity: () => false,
      FindingEntity: () => false,
      FeatureEntity: () => false,
      BuildEntity: ({ number }) =>
        Option.exists(issue.workInProgress, work =>
          Option.contains(work.targetBuild, number),
        ),
      ProductEntity: ({ productId }) => issue.product.id === productId,
      DecisionEntity: () => false,
      QuestionEntity: () => false,
      ReminderEntity: () => false,
      RawIdEntity: () => false,
    }),
  )

const keysNaming = (
  target: Entity,
  numbers: RecordingNumbers,
): ReadonlyArray<string> =>
  target._tag === 'RecordingEntity'
    ? [
        entityKey(target),
        ...Array.flatMap([...numbers.idOfNumber], ([recordingNumber, id]) =>
          id === target.recordingId
            ? [entityKey(RecordingNumberEntity.make({ recordingNumber }))]
            : [],
        ),
      ]
    : [entityKey(target)]

/** One Issue that points at an entity, with each place it does, newest first. */
export type Backlink = Readonly<{
  issue: Issue
  links: ReadonlyArray<IssueLink>
}>

const newestFirst: Order.Order<IssueLink> = Order.flip(
  Order.mapInput(Order.Number, (link: IssueLink) =>
    Option.getOrElse(link.maybeAtMs, () => 0),
  ),
)

const newestBacklinkFirst: Order.Order<Backlink> = Order.flip(
  Order.mapInput(Order.Number, (backlink: Backlink) =>
    pipe(
      Array.head(backlink.links),
      Option.flatMap(link => link.maybeAtMs),
      Option.getOrElse(() => backlink.issue.updatedAtMs),
    ),
  ),
)

const backlinksMemo = new WeakMap<
  ReadonlyArray<Issue>,
  Map<string, ReadonlyArray<Backlink>>
>()

/** What each Issue said about one entity, while the entity's names stay the same. */
type BacklinkRead = Readonly<{
  names: string
  backlinkOfIssue: WeakMap<Issue, Option.Option<Backlink>>
}>

const REMEMBERED_ENTITY_COUNT = 24

const backlinkReads = new Map<string, BacklinkRead>()

const readFor = (key: string, names: string): BacklinkRead => {
  const read = Option.getOrElse(
    Option.filter(
      Option.fromUndefinedOr(backlinkReads.get(key)),
      remembered => remembered.names === names,
    ),
    () => ({
      names,
      backlinkOfIssue: new WeakMap<Issue, Option.Option<Backlink>>(),
    }),
  )
  backlinkReads.delete(key)
  backlinkReads.set(key, read)
  for (const oldest of backlinkReads.keys()) {
    if (backlinkReads.size <= REMEMBERED_ENTITY_COUNT) {
      break
    }
    backlinkReads.delete(oldest)
  }
  return read
}

/**
 * Every Issue that points at an entity, with each link and the words around
 * it, the Issue with the newest link first. Recording 208's page lists every
 * Issue whose details, work log or mentions name Recording 208, its id, or
 * one of its words links. Only Issues whose text holds one of the entity's
 * names, or whose fields name it, are read. Each Issue's answer is kept
 * while the Issue and the entity's names are unchanged, so a live change
 * reads only the Issues it changed.
 */
export const backlinksOf = (
  issues: ReadonlyArray<Issue>,
  entity: Entity,
): ReadonlyArray<Backlink> => {
  const key = entityKey(entity)
  const byEntity = Option.getOrElse(
    Option.fromUndefinedOr(backlinksMemo.get(issues)),
    () => {
      const fresh = new Map<string, ReadonlyArray<Backlink>>()
      backlinksMemo.set(issues, fresh)
      return fresh
    },
  )
  return Option.getOrElse(Option.fromUndefinedOr(byEntity.get(key)), () => {
    const found = backlinksUncached(issues, entity, key)
    byEntity.set(key, found)
    return found
  })
}

const backlinkOfIssue = (
  issue: Issue,
  target: Entity,
  needles: ReadonlyArray<string>,
  numbers: RecordingNumbers,
): Option.Option<Backlink> => {
  const isSelf = target._tag === 'IssueEntity' && issue.id === target.issueId
  const isNamed =
    hasStructuredLink(issue, target) ||
    Array.some(needles, needle => haystackOf(issue).includes(needle))
  if (isSelf || !isNamed) {
    return Option.none()
  }
  const links = pipe(
    linksOfIssue(issue),
    Array.filter(
      link =>
        isSameEntity(canonicalEntity(link.target, numbers), target) ||
        isNamedAsRow(link.target, target),
    ),
    Array.sort(newestFirst),
  )
  return Array.isReadonlyArrayEmpty(links)
    ? Option.none()
    : Option.some({ issue, links })
}

const backlinksUncached = (
  issues: ReadonlyArray<Issue>,
  entity: Entity,
  key: string,
): ReadonlyArray<Backlink> => {
  const numbers = recordingNumbersOf(issues)
  const target = canonicalEntity(entity, numbers)
  const needles = needlesOf(target, numbers)
  const read = readFor(
    key,
    Array.join([...keysNaming(target, numbers), ...needles], '\n'),
  )
  return pipe(
    issues,
    Array.flatMap(issue =>
      Option.toArray(
        Option.getOrElse(
          Option.fromUndefinedOr(read.backlinkOfIssue.get(issue)),
          () => {
            const answer = backlinkOfIssue(issue, target, needles, numbers)
            read.backlinkOfIssue.set(issue, answer)
            return answer
          },
        ),
      ),
    ),
    Array.sort(newestBacklinkFirst),
  )
}

// PRODUCT PAGES

const STATUS_ORDER: ReadonlyArray<IssueStatus> = [
  'InProgress',
  'Addressing',
  'PartiallyDone',
  'Blocked',
  'Regressed',
  'Open',
  'Planned',
  'Backlog',
  'FeedbackRequested',
  'VerificationNeeded',
  'Fixed',
  'Resolved',
  'Verified',
  'Closed',
]

const newestIssueFirst: Order.Order<Issue> = Order.flip(
  Order.mapInput(Order.Number, (issue: Issue) => issue.updatedAtMs),
)

/**
 * One status on a product's page and its Issues, the most recently changed
 * first, such as `Open` with Scribe's 578 Open Issues.
 */
export type ProductStatusGroup = Readonly<{
  status: IssueStatus
  issues: ReadonlyArray<Issue>
}>

const productGroupsMemo = new WeakMap<
  ReadonlyArray<Issue>,
  Map<string, ReadonlyArray<ProductStatusGroup>>
>()

/**
 * A product's Issues by status, the statuses being worked on first, each
 * with every one of its Issues, the most recently changed first: Scribe's
 * page lists all 1,330. Read once per catalog snapshot and product.
 */
export const productStatusGroups = (
  issues: ReadonlyArray<Issue>,
  productId: string,
): ReadonlyArray<ProductStatusGroup> => {
  const byProduct = Option.getOrElse(
    Option.fromUndefinedOr(productGroupsMemo.get(issues)),
    () => {
      const fresh = new Map<string, ReadonlyArray<ProductStatusGroup>>()
      productGroupsMemo.set(issues, fresh)
      return fresh
    },
  )
  return Option.getOrElse(
    Option.fromUndefinedOr(byProduct.get(productId)),
    () => {
      const ofProduct = Array.filter(
        issues,
        issue => issue.product.id === productId,
      )
      const groups = Array.flatMap(STATUS_ORDER, status => {
        const inStatus = Array.filter(
          ofProduct,
          issue => issue.status === status,
        )
        return Array.isReadonlyArrayEmpty(inStatus)
          ? []
          : [{ status, issues: Array.sort(inStatus, newestIssueFirst) }]
      })
      byProduct.set(productId, groups)
      return groups
    },
  )
}

/**
 * The Issues an entity's page lists: a product's Issues by status, read from
 * their product, or for anything else the Issues that point at it.
 */
export const issuesOfPage = (
  issues: ReadonlyArray<Issue>,
  entity: PageEntity,
): ReadonlyArray<Issue> =>
  entity._tag === 'ProductEntity'
    ? Array.flatMap(
        productStatusGroups(issues, entity.productId),
        group => group.issues,
      )
    : Array.map(backlinksOf(issues, entity), backlink => backlink.issue)
