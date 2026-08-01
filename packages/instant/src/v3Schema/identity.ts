import {
  Array,
  Effect,
  Encoding,
  Option,
  Order,
  Result,
  Schema as S,
  SchemaIssue,
  SchemaTransformation,
} from 'effect'

/** The maximum number of nested JSON containers, counting a root container as depth one. */
export const instantV3CanonicalJsonMaximumDepth = 64

/** Upper bounds applied before protocol-v3 data reaches an authority boundary. */
export const instantV3ProtocolLimits = Object.freeze({
  admissionClaimJsonLength: 65_536,
  canonicalJsonMaximumDepth: instantV3CanonicalJsonMaximumDepth,
  canonicalJsonLength: 262_144,
  certificateJsonLength: 16_384,
  compositeKeyLength: 2_048,
  idempotencyKeyLength: 512,
  identityLength: 128,
  positionKeyLength: 1_024,
  reasonLength: 512,
  sessionEpochIdLength: 128,
})

const NonNegativeInteger = S.Int.check(S.isGreaterThanOrEqualTo(0))
const PositiveInteger = S.Int.check(S.isGreaterThanOrEqualTo(1))
const CanonicalIdentity = S.String.check(
  S.isLengthBetween(1, instantV3ProtocolLimits.identityLength),
  S.isPattern(/^[A-Za-z0-9_-]+(?::[A-Za-z0-9_-]+)*$/u),
)
const ProgramId = S.String.check(
  S.isLengthBetween(1, instantV3ProtocolLimits.identityLength),
  S.isPattern(/^[A-Za-z0-9_-]+$/u),
)
const AppSubjectDigest = S.String.check(S.isPattern(/^[0-9a-f]{64}$/u))
const SessionEpochId = S.String.check(
  S.isLengthBetween(22, instantV3ProtocolLimits.sessionEpochIdLength),
  S.isPattern(/^[A-Za-z0-9_-]+$/u),
)
const PositionKey = S.String.check(
  S.isLengthBetween(1, instantV3ProtocolLimits.positionKeyLength),
  S.isPattern(/^[A-Za-z0-9_-]+(?::[A-Za-z0-9_-]+)*$/u),
)
const Reason = S.String.check(
  S.isLengthBetween(1, instantV3ProtocolLimits.reasonLength),
)
const CompositeKeyPartsJson = S.fromJsonString(
  S.NonEmptyArray(S.Union([S.String, S.Number])),
)
const jsonObjectEntryOrder = Order.mapInput(
  Order.String,
  ([key]: readonly [string, unknown]) => key,
)

type CanonicalJsonFailure =
  | 'InvalidValue'
  | 'MaximumDepthExceeded'
  | 'ParseFailed'
  | 'TraversalFailed'

const encodeJsonPrimitive = (
  value: boolean | null | number | string,
): Result.Result<string, CanonicalJsonFailure> => {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return Result.fail('InvalidValue')
  }
  try {
    const encoded = JSON.stringify(value)
    if (encoded === undefined) {
      return Result.fail('InvalidValue')
    } else {
      return Result.succeed(encoded)
    }
  } catch {
    return Result.fail('TraversalFailed')
  }
}

const canonicalizeJson = (
  value: unknown,
  containerDepth = 0,
): Result.Result<string, CanonicalJsonFailure> => {
  try {
    if (
      value === null ||
      typeof value === 'boolean' ||
      typeof value === 'number' ||
      typeof value === 'string'
    ) {
      return encodeJsonPrimitive(value)
    } else if (typeof value !== 'object') {
      return Result.fail('InvalidValue')
    }

    const nextContainerDepth = containerDepth + 1
    if (
      nextContainerDepth > instantV3ProtocolLimits.canonicalJsonMaximumDepth
    ) {
      return Result.fail('MaximumDepthExceeded')
    }

    if (Array.isArray(value)) {
      const members: Array<string> = []
      for (const member of value) {
        const canonicalMember = canonicalizeJson(member, nextContainerDepth)
        if (Result.isFailure(canonicalMember)) {
          return Result.fail(canonicalMember.failure)
        }
        members.push(canonicalMember.success)
      }
      return Result.succeed(`[${Array.join(members, ',')}]`)
    } else {
      const entries: ReadonlyArray<readonly [string, unknown]> =
        Object.entries(value)
      const members: Array<string> = []
      for (const [key, member] of Array.sort(entries, jsonObjectEntryOrder)) {
        const canonicalKey = encodeJsonPrimitive(key)
        if (Result.isFailure(canonicalKey)) {
          return Result.fail(canonicalKey.failure)
        }
        const canonicalMember = canonicalizeJson(member, nextContainerDepth)
        if (Result.isFailure(canonicalMember)) {
          return Result.fail(canonicalMember.failure)
        }
        members.push(`${canonicalKey.success}:${canonicalMember.success}`)
      }
      return Result.succeed(`{${Array.join(members, ',')}}`)
    }
  } catch {
    return Result.fail('TraversalFailed')
  }
}

const parseAndCanonicalizeJson = (
  value: string,
): Result.Result<string, CanonicalJsonFailure> => {
  try {
    const parsed: unknown = JSON.parse(value)
    return canonicalizeJson(parsed)
  } catch {
    return Result.fail('ParseFailed')
  }
}

const canonicalJsonFailureDescription = (
  failure: CanonicalJsonFailure,
): string => {
  if (failure === 'MaximumDepthExceeded') {
    return `Expected at most ${instantV3ProtocolLimits.canonicalJsonMaximumDepth.toString()} nested JSON containers.`
  } else {
    return 'Expected a canonical JSON document.'
  }
}

const canonicalJsonFilter = (maximumLength: number) =>
  S.makeFilter((value: string) => {
    if (value.length < 1 || value.length > maximumLength) {
      return undefined
    }
    const canonical = parseAndCanonicalizeJson(value)
    if (Result.isFailure(canonical)) {
      return {
        path: [],
        issue: canonicalJsonFailureDescription(canonical.failure),
      }
    } else if (canonical.success === value) {
      return undefined
    } else {
      return {
        path: [],
        issue: 'Expected a canonical JSON document.',
      }
    }
  })

const compositeKeyPartsFilter = S.makeFilter((value: string) => {
  try {
    const maybeParts = S.decodeUnknownOption(CompositeKeyPartsJson)(value)
    if (Option.isSome(maybeParts)) {
      const maybeTag = Array.head(maybeParts.value)
      if (Option.isSome(maybeTag) && typeof maybeTag.value === 'string') {
        return undefined
      }
    }
  } catch {
    return {
      path: [],
      issue:
        'Expected a non-empty canonical JSON tuple with a string identity tag.',
    }
  }
  return {
    path: [],
    issue:
      'Expected a non-empty canonical JSON tuple with a string identity tag.',
  }
})

const boundedCanonicalJson = (maximumLength: number) =>
  S.String.check(
    S.isLengthBetween(1, maximumLength),
    canonicalJsonFilter(maximumLength),
  )

const CanonicalJsonFromUnknown = S.Unknown.pipe(
  S.decodeTo(
    S.String,
    SchemaTransformation.transformOrFail({
      decode: value => {
        const canonical = canonicalizeJson(value)
        if (Result.isFailure(canonical)) {
          return Effect.fail(
            new SchemaIssue.InvalidValue(Option.none(), {
              message: canonicalJsonFailureDescription(canonical.failure),
            }),
          )
        } else {
          return Effect.succeed(canonical.success)
        }
      },
      encode: Effect.succeed,
    }),
  ),
)

const isCanonicalBase64Url = (
  value: string,
  expectedByteLength: number,
): boolean => {
  const decoded = Encoding.decodeBase64Url(value)
  if (Result.isFailure(decoded)) {
    return false
  } else {
    return (
      decoded.success.length === expectedByteLength &&
      Encoding.encodeBase64Url(decoded.success) === value
    )
  }
}

const isCanonicalCompressedPublicKeyCandidate = (value: string): boolean => {
  const decoded = Encoding.decodeBase64Url(value)
  if (Result.isFailure(decoded)) {
    return false
  }
  const maybeFormat = Array.head(Array.fromIterable(decoded.success))
  return (
    decoded.success.length === 33 &&
    Option.isSome(maybeFormat) &&
    (maybeFormat.value === 2 || maybeFormat.value === 3) &&
    Encoding.encodeBase64Url(decoded.success) === value
  )
}

/** The protocol version used by every independent protocol-v3 record. */
export const InstantV3ProgramProtocolVersion = S.Literal(3)
/** The protocol version used by every independent protocol-v3 record. */
export type InstantV3ProgramProtocolVersion =
  typeof InstantV3ProgramProtocolVersion.Type
/** The current protocol-v3 Program wire version. */
export const instantV3ProgramProtocolVersion =
  InstantV3ProgramProtocolVersion.make(3)

/** The origin-policy protocol version pinned into every v3 session identity. */
export const InstantV3OriginPolicyProtocolVersion = S.Literal(3)
/** The origin-policy protocol version pinned into every v3 session identity. */
export type InstantV3OriginPolicyProtocolVersion =
  typeof InstantV3OriginPolicyProtocolVersion.Type
/** The current origin-policy protocol version. */
export const instantV3OriginPolicyProtocolVersion =
  InstantV3OriginPolicyProtocolVersion.make(3)

/** A bounded canonical identifier used by one protocol-v3 record. */
export const InstantV3Identity = CanonicalIdentity.annotate({
  identifier: 'InstantV3Identity',
})
/** A bounded canonical identifier used by one protocol-v3 record. */
export type InstantV3Identity = typeof InstantV3Identity.Type

/** An InstantDB protocol-v3 entity row identifier, always a UUID version 4. */
export const InstantV3EntityId = S.String.check(S.isUUID(4)).annotate({
  identifier: 'InstantV3EntityId',
})
/** An InstantDB protocol-v3 entity row identifier, always a UUID version 4. */
export type InstantV3EntityId = typeof InstantV3EntityId.Type

/** A colon-free bounded Program identifier suitable for a v3 session ID. */
export const InstantV3ProgramId = ProgramId.annotate({
  identifier: 'InstantV3ProgramId',
})
/** A colon-free bounded Program identifier suitable for a v3 session ID. */
export type InstantV3ProgramId = typeof InstantV3ProgramId.Type

/** A non-negative integer used by protocol-v3 sequence and generation fields. */
export const InstantV3NonNegativeInteger = NonNegativeInteger.annotate({
  identifier: 'InstantV3NonNegativeInteger',
})
/** A non-negative integer used by protocol-v3 sequence and generation fields. */
export type InstantV3NonNegativeInteger =
  typeof InstantV3NonNegativeInteger.Type

/** A non-negative Unix timestamp in integer milliseconds. */
export const InstantV3TimestampMs = InstantV3NonNegativeInteger.annotate({
  identifier: 'InstantV3TimestampMs',
})
/** A non-negative Unix timestamp in integer milliseconds. */
export type InstantV3TimestampMs = typeof InstantV3TimestampMs.Type

/** A positive integer used by protocol-v3 append-only generations. */
export const InstantV3PositiveInteger = PositiveInteger.annotate({
  identifier: 'InstantV3PositiveInteger',
})
/** A positive integer used by protocol-v3 append-only generations. */
export type InstantV3PositiveInteger = typeof InstantV3PositiveInteger.Type

/** A bounded canonical position key derived from immutable v3 identity fields. */
export const InstantV3PositionKey = PositionKey.annotate({
  identifier: 'InstantV3PositionKey',
})
/** A bounded canonical position key derived from immutable v3 identity fields. */
export type InstantV3PositionKey = typeof InstantV3PositionKey.Type

/** A bounded canonical JSON tuple that cannot conflate composite identity parts. */
export const InstantV3CompositeKey = boundedCanonicalJson(
  instantV3ProtocolLimits.compositeKeyLength,
)
  .check(compositeKeyPartsFilter)
  .annotate({ identifier: 'InstantV3CompositeKey' })
/** A bounded canonical JSON tuple that cannot conflate composite identity parts. */
export type InstantV3CompositeKey = typeof InstantV3CompositeKey.Type

/** A bounded non-empty safe reason persisted by a protocol-v3 authority. */
export const InstantV3Reason = Reason.annotate({
  identifier: 'InstantV3Reason',
})
/** A bounded non-empty safe reason persisted by a protocol-v3 authority. */
export type InstantV3Reason = typeof InstantV3Reason.Type

/** A lowercase SHA-256 digest used for non-secret v3 scope and proof linkage. */
export const InstantV3Sha256Digest = S.String.check(
  S.isPattern(/^[0-9a-f]{64}$/u),
).annotate({ identifier: 'InstantV3Sha256Digest' })
/** A lowercase SHA-256 digest used for non-secret v3 scope and proof linkage. */
export type InstantV3Sha256Digest = typeof InstantV3Sha256Digest.Type

/** The lowercase SHA-256 digest of one Instant app and authenticated subject. */
export const InstantV3AppSubjectDigest = AppSubjectDigest.annotate({
  identifier: 'InstantV3AppSubjectDigest',
})
/** The lowercase SHA-256 digest of one Instant app and authenticated subject. */
export type InstantV3AppSubjectDigest = typeof InstantV3AppSubjectDigest.Type

/** One bounded high-entropy epoch identifier within a protocol-v3 session scope. */
export const InstantV3SessionEpochId = SessionEpochId.annotate({
  identifier: 'InstantV3SessionEpochId',
})
/** One bounded high-entropy epoch identifier within a protocol-v3 session scope. */
export type InstantV3SessionEpochId = typeof InstantV3SessionEpochId.Type

/** A structurally canonical compressed-key candidate that still requires on-curve proof verification. */
export const InstantV3OriginPublicKey = S.String.check(
  S.makeFilter(value =>
    isCanonicalCompressedPublicKeyCandidate(value)
      ? undefined
      : {
          path: [],
          issue:
            'Expected a canonical unpadded base64url compressed P-256 public key.',
        },
  ),
).annotate({ identifier: 'InstantV3OriginPublicKey' })
/** A structurally canonical compressed-key candidate that still requires on-curve proof verification. */
export type InstantV3OriginPublicKey = typeof InstantV3OriginPublicKey.Type

/** A structurally canonical compact-signature candidate that still requires low-S proof verification. */
export const InstantV3OriginSignature = S.String.check(
  S.makeFilter(value =>
    isCanonicalBase64Url(value, 64)
      ? undefined
      : {
          path: [],
          issue:
            'Expected a canonical unpadded base64url compact P-256 signature.',
        },
  ),
).annotate({ identifier: 'InstantV3OriginSignature' })
/** A structurally canonical compact-signature candidate that still requires low-S proof verification. */
export type InstantV3OriginSignature = typeof InstantV3OriginSignature.Type

/** A bounded canonical JSON document persisted by the v3 protocol. */
export const InstantV3CanonicalJson = boundedCanonicalJson(
  instantV3ProtocolLimits.canonicalJsonLength,
).annotate({ identifier: 'InstantV3CanonicalJson' })
/** A bounded canonical JSON document persisted by the v3 protocol. */
export type InstantV3CanonicalJson = typeof InstantV3CanonicalJson.Type

/** Encodes a JSON value with recursively sorted object keys and no insignificant whitespace. */
export const stringifyInstantV3CanonicalJson = (
  value: S.Json,
): InstantV3CanonicalJson =>
  InstantV3CanonicalJson.make(
    S.decodeUnknownSync(CanonicalJsonFromUnknown)(value),
  )

/** A bounded canonical admission claim safe to decode at an authority boundary. */
export const InstantV3AdmissionClaimJson = boundedCanonicalJson(
  instantV3ProtocolLimits.admissionClaimJsonLength,
).annotate({ identifier: 'InstantV3AdmissionClaimJson' })
/** A bounded canonical admission claim safe to decode at an authority boundary. */
export type InstantV3AdmissionClaimJson =
  typeof InstantV3AdmissionClaimJson.Type

/** A bounded canonical origin certificate safe to verify at an authority boundary. */
export const InstantV3OriginCertificateJson = boundedCanonicalJson(
  instantV3ProtocolLimits.certificateJsonLength,
).annotate({ identifier: 'InstantV3OriginCertificateJson' })
/** A bounded canonical origin certificate safe to verify at an authority boundary. */
export type InstantV3OriginCertificateJson =
  typeof InstantV3OriginCertificateJson.Type

/** A bounded durable identity for one semantically idempotent ordinary Message. */
export const InstantV3MessageIdempotencyKey = S.String.check(
  S.isLengthBetween(1, instantV3ProtocolLimits.idempotencyKeyLength),
).annotate({ identifier: 'InstantV3MessageIdempotencyKey' })
/** A bounded durable identity for one semantically idempotent ordinary Message. */
export type InstantV3MessageIdempotencyKey =
  typeof InstantV3MessageIdempotencyKey.Type

/** The exact parsed components of one protocol-v3 Program session identity. */
export const InstantV3ProgramSessionIdentity = S.Struct({
  appSubjectDigest: InstantV3AppSubjectDigest,
  originPolicyProtocolVersion: InstantV3OriginPolicyProtocolVersion,
  programId: InstantV3ProgramId,
  programVersion: InstantV3NonNegativeInteger,
  sessionEpochId: InstantV3SessionEpochId,
})
/** The exact parsed components of one protocol-v3 Program session identity. */
export type InstantV3ProgramSessionIdentity =
  typeof InstantV3ProgramSessionIdentity.Type

const sessionIdPattern =
  /^([A-Za-z0-9_-]{1,128}):pv(0|[1-9][0-9]*):ip3:([0-9a-f]{64}):([A-Za-z0-9_-]{22,128})$/u

const formatInstantV3ProgramSessionId = (
  identity: InstantV3ProgramSessionIdentity,
): string =>
  `${identity.programId}:pv${identity.programVersion.toString()}:ip${identity.originPolicyProtocolVersion}:${identity.appSubjectDigest}:${identity.sessionEpochId}`

const parseCanonicalSessionIdentity = (
  sessionId: string,
): Option.Option<InstantV3ProgramSessionIdentity> => {
  const match = sessionIdPattern.exec(sessionId)
  if (match === null) {
    return Option.none()
  }
  const maybeProgramId = Array.get(match, 1)
  const maybeProgramVersionText = Array.get(match, 2)
  const maybeAppSubjectDigest = Array.get(match, 3)
  const maybeSessionEpochId = Array.get(match, 4)
  if (
    Option.isNone(maybeProgramId) ||
    Option.isNone(maybeProgramVersionText) ||
    Option.isNone(maybeAppSubjectDigest) ||
    Option.isNone(maybeSessionEpochId)
  ) {
    return Option.none()
  }
  const programVersion = Number(maybeProgramVersionText.value)
  if (!Number.isSafeInteger(programVersion)) {
    return Option.none()
  }
  const maybeIdentity = S.decodeUnknownOption(InstantV3ProgramSessionIdentity)({
    appSubjectDigest: maybeAppSubjectDigest.value,
    originPolicyProtocolVersion: instantV3OriginPolicyProtocolVersion,
    programId: maybeProgramId.value,
    programVersion,
    sessionEpochId: maybeSessionEpochId.value,
  })
  if (
    Option.isSome(maybeIdentity) &&
    formatInstantV3ProgramSessionId(maybeIdentity.value) === sessionId
  ) {
    return maybeIdentity
  } else {
    return Option.none()
  }
}

/** A canonical protocol-v3 Program session ID. */
export const InstantV3ProgramSessionId = S.String.check(
  S.isLengthBetween(1, instantV3ProtocolLimits.positionKeyLength),
  S.makeFilter(sessionId =>
    Option.isSome(parseCanonicalSessionIdentity(sessionId))
      ? undefined
      : {
          path: [],
          issue: 'Expected an exact canonical protocol-v3 Program session ID.',
        },
  ),
).annotate({ identifier: 'InstantV3ProgramSessionId' })
/** A canonical protocol-v3 Program session ID. */
export type InstantV3ProgramSessionId = typeof InstantV3ProgramSessionId.Type

/** Prints one canonical `<programId>:pv<programVersion>:ip3:<digest>:<epoch>` session ID. */
export const printInstantV3ProgramSessionId = (
  identity: InstantV3ProgramSessionIdentity,
): InstantV3ProgramSessionId =>
  InstantV3ProgramSessionId.make(formatInstantV3ProgramSessionId(identity))

/** Parses one canonical protocol-v3 Program session ID into its exact components. */
export const parseInstantV3ProgramSessionId = (
  sessionId: string,
): Option.Option<InstantV3ProgramSessionIdentity> =>
  parseCanonicalSessionIdentity(sessionId)
