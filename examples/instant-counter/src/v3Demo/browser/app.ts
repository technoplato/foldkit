import {
  type Model,
  MultipleCountersInteractionGraph,
  MultipleCountersProgram,
  navigationToPath,
} from 'counters-core-example'
import {
  Array,
  Effect,
  Exit,
  Match as M,
  Option,
  Result,
  Schema as S,
  Scope,
  Stream,
} from 'effect'
import * as InteractionGraph from 'foldkit/interaction-graph'
import {
  type AttachedFoldkitRendererDefect,
  makeAttachedFoldkitApplication,
} from 'foldkit/runtime'
import * as Synchronization from 'foldkit/synchronization'

import {
  SubjectScopedProgramSignOutInProgress,
  type V3PendingProgramClaim,
  type V3TerminalProgramClaim,
  ensureHostedInstantSession,
} from '@foldkit/instant'

import type { InstantCounterDatabase } from '../../../instant.schema.js'
import {
  type Authentication,
  LoadingAuthentication,
  observeAuthentication,
  sendMagicCode,
  signInWithGoogle,
  signInWithMagicCode,
} from '../../client/auth.js'
import {
  type MultipleCountersV3ClientController,
  type MultipleCountersV3ClientSnapshot,
  type MultipleCountersV3ClientSubmission,
  type MultipleCountersV3ClientSubmissionError,
  isMultipleCountersV3ClientSubmissionApplied,
  isMultipleCountersV3RetainedOptimisticError,
  makeMultipleCountersV3ClientController,
} from '../client/index.js'
import {
  type MultipleCountersV3FollowDraft,
  emptyMultipleCountersV3FollowDraft,
  isMultipleCountersV3ObserveFollower,
  multipleCountersV3FollowAlignmentExplanation,
  multipleCountersV3FollowMode,
  multipleCountersV3ModeLabel,
  multipleCountersV3ModeRequestLabel,
  multipleCountersV3ObserveLeaderProcessorId,
} from '../client/sessionChrome.js'
import {
  describeUnknownCause,
  logMultipleCountersV3Debug,
} from '../shared/debugLog.js'
import {
  MultipleCountersV3DebugEmail,
  MultipleCountersV3DebugLoginIssued,
  multipleCountersV3DebugLoginMarkup,
  multipleCountersV3DebugLoginPath,
} from '../shared/debugLogin.js'
import {
  makeMultipleCountersV3SessionIdentity,
  multipleCountersV3SessionEpochSeed,
} from '../shared/identity.js'
import { MultipleCountersV3BrowserClientInput } from './clientInput.js'
import {
  type MultipleCountersV3BrowserNavigationDecision,
  type MultipleCountersV3PendingNavigationIntent,
  beganMultipleCountersV3BrowserNavigation,
  makeMultipleCountersV3BrowserNavigationState,
  preservedMultipleCountersV3RejectedCarrier,
  projectedMultipleCountersV3BrowserNavigation,
  settledMultipleCountersV3BrowserNavigation,
} from './navigationProjection.js'
import {
  appendBrowserMultipleCountersV3PolicyRequest,
  makeBrowserMultipleCountersV3ProcessorConfig,
  resolveBrowserMultipleCountersV3PolicyRequest,
} from './processorConfig.js'
import { multipleCountersV3BrowserView } from './view.js'

export {
  type MultipleCountersV3FollowDraft,
  isMultipleCountersV3ObserveFollower,
  multipleCountersV3FollowAlignmentExplanation,
  multipleCountersV3FollowMode,
}

const canonicalListDestinationUri = '/counters'
const [initialRendererModel] = MultipleCountersProgram.init()
const isBrowserDebugLoginEnabled = import.meta.env.DEV

const requestMultipleCountersV3DebugLogin = (
  email: typeof MultipleCountersV3DebugEmail.Type,
): Promise<typeof MultipleCountersV3DebugLoginIssued.Type> =>
  fetch(multipleCountersV3DebugLoginPath, {
    body: JSON.stringify({ email }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  }).then(async response => {
    const body: unknown = await response.json()
    if (!response.ok) {
      throw new Error('DebugLoginUnavailable')
    }
    return S.decodeUnknownSync(MultipleCountersV3DebugLoginIssued)(body)
  })

/** Presentation state produced by one attached-renderer defect. */
export type MultipleCountersV3RendererDefectState = Readonly<{
  isTerminal: boolean
  notice: string
}>

/** Classifies an attached-renderer defect without exposing its untyped cause. */
export const multipleCountersV3RendererDefectState = (
  defect: AttachedFoldkitRendererDefect,
): MultipleCountersV3RendererDefectState => {
  if (defect.operation === 'Patch' || defect.operation === 'View') {
    return {
      isTerminal: true,
      notice: `Rendering stopped after a ${defect.operation} failure. Reload this Client to mount a fresh renderer.`,
    }
  }
  if (defect.operation === 'DecodeClientInput') {
    return {
      isTerminal: false,
      notice:
        'One Client input failed Schema validation and was not submitted.',
    }
  }
  if (defect.operation === 'SendClientInput') {
    return {
      isTerminal: false,
      notice: 'One Client input could not be forwarded and was not submitted.',
    }
  }
  return {
    isTerminal: false,
    notice: `The renderer rejected one ${defect.operation} snapshot. It will render the next valid Program Model.`,
  }
}

type MultipleCountersV3SubmissionAttempt =
  | Readonly<{
      _tag: 'FailedSubmission'
      error: MultipleCountersV3ClientSubmissionError
    }>
  | Readonly<{
      _tag: 'SucceededSubmission'
      submission: MultipleCountersV3ClientSubmission
    }>

/** Subject, lifecycle generation, and Processor identity for one active occurrence. */
export type MultipleCountersV3ProcessorBinding = Readonly<{
  generation: number
  processorId: string
  subjectId: string
}>

/** Client-only controls whose validity ends with their active Processor occurrence. */
export type MultipleCountersV3ProcessorBoundState = Readonly<{
  followDraft: MultipleCountersV3FollowDraft
  isModeRequestPending: boolean
  maybeLastActiveBinding: Option.Option<MultipleCountersV3ProcessorBinding>
  maybeObservedBinding: Option.Option<MultipleCountersV3ProcessorBinding>
  modeOperationToken: number
}>

/** One Processor observation and whether it crossed an ownership boundary. */
export type MultipleCountersV3ProcessorBoundTransition = Readonly<{
  didCrossBoundary: boolean
  state: MultipleCountersV3ProcessorBoundState
}>

/** Creates Client controls before any active Processor has claimed them. */
export const makeMultipleCountersV3ProcessorBoundState =
  (): MultipleCountersV3ProcessorBoundState => ({
    followDraft: emptyMultipleCountersV3FollowDraft(),
    isModeRequestPending: false,
    maybeLastActiveBinding: Option.none(),
    maybeObservedBinding: Option.none(),
    modeOperationToken: 0,
  })

const isSameProcessorBinding = (
  first: MultipleCountersV3ProcessorBinding,
  second: MultipleCountersV3ProcessorBinding,
): boolean =>
  first.generation === second.generation &&
  first.processorId === second.processorId &&
  first.subjectId === second.subjectId

const activeProgramForSubject = (
  snapshot: MultipleCountersV3ClientSnapshot,
  subjectId: string,
) => {
  if (
    snapshot.lifecycle._tag !== 'ActiveSubjectScopedProgram' ||
    snapshot.lifecycle.subjectId !== subjectId ||
    Option.isNone(snapshot.maybeActiveProgram)
  ) {
    return Option.none()
  }
  const active = snapshot.maybeActiveProgram.value
  if (
    active.subjectId !== subjectId ||
    active.generation !== snapshot.lifecycle.generation
  ) {
    return Option.none()
  }
  return Option.some(active)
}

/** Returns the identity that safely binds Client-local work to an active subject. */
export const multipleCountersV3ProcessorBinding = (
  snapshot: MultipleCountersV3ClientSnapshot,
  subjectId: string,
): Option.Option<MultipleCountersV3ProcessorBinding> =>
  Option.map(activeProgramForSubject(snapshot, subjectId), active => ({
    generation: active.generation,
    processorId: active.processorId,
    subjectId: active.subjectId,
  }))

/** Invalidates mode controls when an active Processor leaves or is replaced. */
export const transitionMultipleCountersV3ProcessorBoundState = (
  state: MultipleCountersV3ProcessorBoundState,
  snapshot: MultipleCountersV3ClientSnapshot,
  maybeSubjectId: Option.Option<string>,
): MultipleCountersV3ProcessorBoundTransition => {
  const maybeNextBinding = Option.flatMap(maybeSubjectId, subjectId =>
    multipleCountersV3ProcessorBinding(snapshot, subjectId),
  )
  const didLeaveObservedBinding =
    Option.isSome(state.maybeObservedBinding) &&
    (Option.isNone(maybeNextBinding) ||
      !isSameProcessorBinding(
        state.maybeObservedBinding.value,
        maybeNextBinding.value,
      ))
  const didReplaceLastActiveBinding =
    Option.isNone(state.maybeObservedBinding) &&
    Option.isSome(state.maybeLastActiveBinding) &&
    Option.isSome(maybeNextBinding) &&
    !isSameProcessorBinding(
      state.maybeLastActiveBinding.value,
      maybeNextBinding.value,
    )
  const didCrossBoundary =
    didLeaveObservedBinding || didReplaceLastActiveBinding
  return {
    didCrossBoundary,
    state: {
      followDraft: didCrossBoundary
        ? emptyMultipleCountersV3FollowDraft()
        : state.followDraft,
      isModeRequestPending: didCrossBoundary
        ? false
        : state.isModeRequestPending,
      maybeLastActiveBinding: Option.isSome(maybeNextBinding)
        ? maybeNextBinding
        : state.maybeLastActiveBinding,
      maybeObservedBinding: maybeNextBinding,
      modeOperationToken: didCrossBoundary
        ? state.modeOperationToken + 1
        : state.modeOperationToken,
    },
  }
}

const failedSubmission = (
  error: MultipleCountersV3ClientSubmissionError,
): MultipleCountersV3SubmissionAttempt => ({
  _tag: 'FailedSubmission',
  error,
})

const succeededSubmission = (
  submission: MultipleCountersV3ClientSubmission,
): MultipleCountersV3SubmissionAttempt => ({
  _tag: 'SucceededSubmission',
  submission,
})

const submissionNotice = (
  clientSubmission: MultipleCountersV3ClientSubmission,
): Option.Option<string> => {
  const isApplied =
    isMultipleCountersV3ClientSubmissionApplied(clientSubmission)
  if (clientSubmission.outcome._tag === 'Enqueued') {
    return Option.some(
      isApplied
        ? 'Applied optimistically and retained in the Instant Client outbox. Synchronization will resume automatically.'
        : 'Retained in the Instant Client outbox, but the current Program projection did not apply it.',
    )
  }
  return isApplied
    ? Option.none()
    : Option.some(
        'Instant persisted the proposal, but the current Program projection did not apply it.',
      )
}

const submissionAttempt = (
  submission: Effect.Effect<
    MultipleCountersV3ClientSubmission,
    MultipleCountersV3ClientSubmissionError
  >,
): Effect.Effect<MultipleCountersV3SubmissionAttempt> =>
  submission.pipe(
    Effect.match({
      onFailure: failedSubmission,
      onSuccess: succeededSubmission,
    }),
  )

/** Stable authentication, Program, and session chrome host nodes. */
export type MultipleCountersV3BrowserHost = Readonly<{
  authRoot: HTMLElement
  chromeRoot: HTMLElement
  programMount: HTMLElement
  programShell: HTMLElement
}>

/** Creates stable host nodes around the renderer-owned replaceable mount. */
export const makeMultipleCountersV3BrowserHost = (
  root: HTMLElement,
): MultipleCountersV3BrowserHost => {
  root.innerHTML =
    '<div id="v3-auth-root"></div><div id="v3-program-shell"><div id="v3-program-mount"></div></div><div id="v3-chrome-root"></div>'
  const authRoot = root.querySelector<HTMLElement>('#v3-auth-root')
  const chromeRoot = root.querySelector<HTMLElement>('#v3-chrome-root')
  const programMount = root.querySelector<HTMLElement>('#v3-program-mount')
  const programShell = root.querySelector<HTMLElement>('#v3-program-shell')
  if (
    authRoot === null ||
    chromeRoot === null ||
    programMount === null ||
    programShell === null
  ) {
    throw new Error('The browser Client host could not be mounted.')
  }
  return { authRoot, chromeRoot, programMount, programShell }
}

/** Shows either authentication/preparation UI or one subject-matched Program. */
export const setMultipleCountersV3BrowserHostVisibility = (
  host: Pick<
    MultipleCountersV3BrowserHost,
    'authRoot' | 'chromeRoot' | 'programShell'
  >,
  isProgramReady: boolean,
): void => {
  host.authRoot.hidden = isProgramReady
  host.programShell.hidden = !isProgramReady
  host.chromeRoot.hidden = !isProgramReady
}

/** Finds one terminal authority claim for the current subject and Processor. */
export const multipleCountersV3TerminalClaimForProposal = (
  snapshot: MultipleCountersV3ClientSnapshot,
  subjectId: string,
  proposalId: string,
): Option.Option<V3TerminalProgramClaim> =>
  Option.flatMap(activeProgramForSubject(snapshot, subjectId), active =>
    Array.findFirst(
      active.processorSnapshot.recentTerminalClaims,
      claim => claim.proposalId === proposalId,
    ),
  )

/** Finds a newly observed authority rejection for one current subject Processor. */
export const multipleCountersV3NewTerminalRejection = (
  subjectId: string,
  previousSnapshot: MultipleCountersV3ClientSnapshot | null,
  nextSnapshot: MultipleCountersV3ClientSnapshot,
) => {
  const maybePreviousActive =
    previousSnapshot === null
      ? Option.none()
      : activeProgramForSubject(previousSnapshot, subjectId)
  return Option.flatMap(maybePreviousActive, previousActive => {
    const previousTerminalProposalIds = new Set(
      Array.map(
        previousActive.processorSnapshot.recentTerminalClaims,
        claim => claim.proposalId,
      ),
    )
    return Option.flatMap(
      activeProgramForSubject(nextSnapshot, subjectId),
      active =>
        active.processorId === previousActive.processorId &&
        active.generation === previousActive.generation
          ? Array.findFirst(
              active.processorSnapshot.recentTerminalClaims,
              claim =>
                claim.resolutionState === 'Rejected' &&
                !previousTerminalProposalIds.has(claim.proposalId),
            )
          : Option.none(),
    )
  })
}

/** Whether one pending proposal exists only in this running Client's memory. */
export const multipleCountersV3HasMemoryOnlyPendingClaims = (
  pendingClaims: ReadonlyArray<Pick<V3PendingProgramClaim, 'persistence'>>,
): boolean =>
  Array.some(pendingClaims, pending => pending.persistence === 'Local')

/** Authority-aware interpretation of a stable local submission receipt. */
export const MultipleCountersV3SubmissionDisposition = S.Literals([
  'Accepted',
  'Applied',
  'NotApplied',
  'Rejected',
])
/** Authority-aware interpretation of a stable local submission receipt. */
export type MultipleCountersV3SubmissionDisposition =
  typeof MultipleCountersV3SubmissionDisposition.Type

/** Gives an already-observed terminal authority outcome precedence over optimism. */
export const multipleCountersV3SubmissionDisposition = (
  submission: Pick<
    MultipleCountersV3ClientSubmission,
    'projection' | 'proposal'
  >,
  maybeTerminalClaim: Option.Option<V3TerminalProgramClaim>,
): MultipleCountersV3SubmissionDisposition => {
  if (Option.isSome(maybeTerminalClaim)) {
    return maybeTerminalClaim.value.resolutionState
  }
  return isMultipleCountersV3ClientSubmissionApplied(submission)
    ? 'Applied'
    : 'NotApplied'
}

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')

/** Maps only the browser-root convenience route into the Program carrier. */
export const multipleCountersV3DestinationUriFromPathname = (
  pathname: string,
): string => (pathname === '/' ? canonicalListDestinationUri : pathname)

const destinationUriFromLocation = (): string =>
  multipleCountersV3DestinationUriFromPathname(window.location.pathname)

const referenceDestination = (
  model: Model,
  reference: InteractionGraph.InteractionReference,
): Option.Option<string> => {
  const projection = MultipleCountersInteractionGraph.project(model)
  if (Result.isFailure(projection)) {
    return Option.none()
  }
  const referenceKey = InteractionGraph.interactionReferenceKey(reference)
  const maybeNode = Array.findFirst(
    InteractionGraph.interactiveNodes(projection.success.root),
    node =>
      InteractionGraph.interactionReferenceKey(node.reference) === referenceKey,
  )
  return Option.flatMap(maybeNode, node =>
    node._tag === 'InteractionAction'
      ? node.maybeDestinationUri
      : Option.none(),
  )
}

const authenticationMarkup = (
  authentication: Authentication,
  maybeSentEmail: Option.Option<string>,
  maybeNotice: Option.Option<string>,
  isDebugLoginEnabled: boolean,
  maybeDebugIssued: Option.Option<
    typeof MultipleCountersV3DebugLoginIssued.Type
  >,
): string => {
  const notice = Option.isSome(maybeNotice)
    ? `<p class="notice" role="status">${escapeHtml(maybeNotice.value)}</p>`
    : ''
  if (authentication._tag === 'LoadingAuthentication') {
    return `<main class="auth-shell"><section class="auth-card"><p class="eyebrow">Foldkit Program | InstantDB</p><h1>Restoring your session</h1><p class="muted">Authentication and cached Program state are loading on this Client.</p></section></main>`
  }
  if (authentication._tag === 'FailedAuthentication') {
    return `<main class="auth-shell"><section class="auth-card"><p class="eyebrow">Foldkit Program | InstantDB</p><h1>Authentication unavailable</h1><p class="error">${escapeHtml(authentication.reason)}</p></section></main>`
  }
  if (authentication._tag === 'SignedIn') {
    return ''
  }
  const form = Option.isNone(maybeSentEmail)
    ? `<form id="v3-email-form" class="auth-form"><label for="v3-email">Email</label><input id="v3-email" name="email" type="email" autocomplete="email" required placeholder="you@example.com" /><button type="submit" class="primary">Send magic code</button></form>`
    : `<form id="v3-code-form" class="auth-form"><p class="muted">Code sent to <strong>${escapeHtml(maybeSentEmail.value)}</strong></p><label for="v3-code">Magic code</label><input id="v3-code" name="code" inputmode="numeric" autocomplete="one-time-code" required placeholder="123456" /><button type="submit" class="primary">Verify code</button><button id="v3-change-email" type="button" class="quiet">Use another email</button></form>`
  const debugLogin = isDebugLoginEnabled
    ? multipleCountersV3DebugLoginMarkup(maybeDebugIssued)
    : ''
  return `<main class="auth-shell"><section class="auth-card"><p class="eyebrow">Foldkit Program | InstantDB</p><h1>Your counters, on every Processor</h1><p class="lede">Sign in on your Mac, iPhone, iPad, browser tabs, simulators, or terminal. Actions appear immediately here, then converge through one authenticated accepted Message stream.</p>${notice}${form}${debugLogin}<div class="or"><span>or</span></div><button id="v3-google" class="google">Continue with Google</button><p class="privacy">Origin secrets stay in this Client vault. Instant receives signed claims and public certificates, never the signing keys.</p></section></main>`
}

const preparingProgramMarkup = (
  authentication: Authentication,
  maybeNotice: Option.Option<string>,
  isSigningOut: boolean,
  hasMemoryOnlyPendingClaims: boolean,
): string => {
  const account =
    authentication._tag === 'SignedIn'
      ? Option.getOrElse(
          authentication.maybeEmail,
          () => authentication.subjectId,
        )
      : 'your account'
  const notice = Option.isSome(maybeNotice)
    ? `<p class="notice" role="status">${escapeHtml(maybeNotice.value)}</p>`
    : ''
  const memoryOnlyWarning = hasMemoryOnlyPendingClaims
    ? '<p class="notice" role="status">Sign out and page closing are blocked while a proposal exists only in this running Client. Retry it until Instant confirms durable storage.</p>'
    : ''
  const isSignOutDisabled = isSigningOut || hasMemoryOnlyPendingClaims
  return `<main class="auth-shell"><section class="auth-card"><p class="eyebrow">Foldkit Program | InstantDB</p><h1>${isSigningOut ? 'Signing out' : 'Preparing your authenticated Processor'}</h1><p class="muted">${isSigningOut ? 'The framework fenced this subject and is invalidating its Instant session.' : `Restoring ${escapeHtml(account)}, confirming the session policy, and opening ${escapeHtml(destinationUriFromLocation())} through the Program.`}</p>${notice}${memoryOnlyWarning}<button id="v3-retry-processor" type="button" class="quiet"${isSigningOut ? ' disabled' : ''}>Retry Processor startup</button><button id="v3-preparing-sign-out" type="button" class="quiet"${isSignOutDisabled ? ' disabled' : ''}>${isSigningOut ? 'Signing out…' : 'Sign out'}</button></section></main>`
}

const connectionLabel = (
  snapshot: MultipleCountersV3ClientSnapshot,
): string => {
  const maybeActive = snapshot.maybeActiveProgram
  if (Option.isNone(maybeActive)) {
    return 'Starting'
  }
  const connection = maybeActive.value.processorSnapshot.connection
  return connection._tag === 'Attached' ? connection.transportStatus : 'Offline'
}

const pendingCount = (snapshot: MultipleCountersV3ClientSnapshot): number => {
  const maybeActive = snapshot.maybeActiveProgram
  if (Option.isNone(maybeActive)) {
    return 0
  }
  return maybeActive.value.processorSnapshot.pendingClaims.length
}

const pendingMarkup = (snapshot: MultipleCountersV3ClientSnapshot): string => {
  const maybeActive = snapshot.maybeActiveProgram
  if (Option.isNone(maybeActive)) {
    return ''
  }
  const pending = maybeActive.value.processorSnapshot.pendingClaims
  return Array.match(pending, {
    onEmpty: () => '',
    onNonEmpty: claims =>
      `<details class="v3-pending"><summary>${claims.length.toString()} pending proposal${claims.length === 1 ? '' : 's'}</summary><ul>${Array.map(
        claims,
        claim => {
          const retry =
            claim.persistence === 'Local'
              ? `<button type="button" data-v3-retry="${escapeHtml(claim.proposal.proposalId)}">Retry now</button>`
              : '<span>Automatic synchronization active</span>'
          return `<li><code>${escapeHtml(claim.proposal.proposalId)}</code><span>${escapeHtml(claim.persistence)} · ${escapeHtml(claim.projection._tag)}</span>${retry}</li>`
        },
      ).join('')}</ul></details>`,
  })
}

const terminalClaimsMarkup = (
  snapshot: MultipleCountersV3ClientSnapshot,
): string => {
  if (Option.isNone(snapshot.maybeActiveProgram)) {
    return ''
  }
  const recent = Array.take(
    snapshot.maybeActiveProgram.value.processorSnapshot.recentTerminalClaims,
    5,
  )
  return Array.match(recent, {
    onEmpty: () => '',
    onNonEmpty: claims =>
      `<details class="v3-terminal-claims"><summary>Recent authority outcomes</summary><ul>${Array.map(
        claims,
        claim => {
          const reason = Option.match(claim.maybeRejectionReason, {
            onNone: () => '',
            onSome: value => ` · ${escapeHtml(value)}`,
          })
          return `<li><code>${escapeHtml(claim.proposalId)}</code><span>${claim.resolutionState}${reason}</span></li>`
        },
      ).join('')}</ul></details>`,
  })
}

const processorHealthMarkup = (
  snapshot: MultipleCountersV3ClientSnapshot,
): string => {
  if (Option.isNone(snapshot.maybeActiveProgram)) {
    return ''
  }
  const processorSnapshot = snapshot.maybeActiveProgram.value.processorSnapshot
  const waiting = Option.match(processorSnapshot.waitingForAcceptedSequence, {
    onNone: () => '',
    onSome: sequence =>
      `<span>Next accepted sequence ${sequence.toString()}</span>`,
  })
  const error = Option.match(processorSnapshot.lastError, {
    onNone: () => '',
    onSome: processorError =>
      `<span class="v3-client-error">Processor error: ${escapeHtml(processorError._tag)}</span>`,
  })
  return `${waiting}${error}`
}

const chromeMarkup = (
  authentication: Authentication,
  snapshot: MultipleCountersV3ClientSnapshot,
  maybeNotice: Option.Option<string>,
  isRendererTerminal: boolean,
  isSigningOut: boolean,
  followDraft: MultipleCountersV3FollowDraft,
  isModeRequestPending: boolean,
  hasMemoryOnlyPendingClaims: boolean,
): string => {
  const account =
    authentication._tag === 'SignedIn'
      ? Option.getOrElse(
          authentication.maybeEmail,
          () => authentication.subjectId,
        )
      : 'Signed out'
  const notice = Option.isSome(maybeNotice)
    ? `<span class="v3-client-notice">${escapeHtml(maybeNotice.value)}</span>`
    : ''
  const processorId = Option.match(snapshot.maybeActiveProgram, {
    onNone: () => 'Starting',
    onSome: active => active.processorId,
  })
  const reload = isRendererTerminal
    ? '<button id="v3-reload-renderer" type="button">Reload renderer</button>'
    : ''
  const followerProcessorId =
    followDraft.followerProcessorId.length === 0
      ? processorId
      : followDraft.followerProcessorId
  const modeDisabled = isModeRequestPending ? ' disabled' : ''
  const signOutWarning = hasMemoryOnlyPendingClaims
    ? '<span class="v3-client-error" role="status">Sign out, reload, and page closing are blocked while a proposal is Local only. Retry it until Instant confirms durable storage.</span>'
    : ''
  const isSignOutDisabled = isSigningOut || hasMemoryOnlyPendingClaims
  return `<aside class="v3-client-chrome" aria-label="Instant session"><div class="v3-session-summary"><span>${escapeHtml(connectionLabel(snapshot))}</span><span>${escapeHtml(multipleCountersV3ModeLabel(snapshot))}</span><span>${pendingCount(snapshot).toString()} pending</span><span>${escapeHtml(account)}</span><code title="Processor identity">${escapeHtml(processorId)}</code>${processorHealthMarkup(snapshot)}${notice}${reload}${signOutWarning}<button id="v3-sign-out" type="button"${isSignOutDisabled ? ' disabled' : ''}>${isSigningOut ? 'Signing out…' : 'Sign out'}</button></div><div class="v3-mode-controls"><span>Navigation synchronization</span><button type="button" data-v3-mode="SharedDomain"${modeDisabled}>Independent</button><button type="button" data-v3-mode="Mirror"${modeDisabled}>Mirror</button><form id="v3-follow-form"><p class="muted">${escapeHtml(multipleCountersV3FollowAlignmentExplanation)}</p><label>Leader <input name="leaderProcessorId" required placeholder="Processor id" value="${escapeHtml(followDraft.leaderProcessorId)}"${modeDisabled} /></label><label>Follower <input name="followerProcessorId" required value="${escapeHtml(followerProcessorId)}"${modeDisabled} /></label><label>Control <select name="control"${modeDisabled}><option value="Observe"${followDraft.control === 'Observe' ? ' selected' : ''}>Observe</option><option value="RemoteControl"${followDraft.control === 'RemoteControl' ? ' selected' : ''}>Remote control</option></select></label><button type="submit"${modeDisabled}>${isModeRequestPending ? 'Waiting for authority…' : 'Follow'}</button></form></div>${pendingMarkup(snapshot)}${terminalClaimsMarkup(snapshot)}</aside>`
}

/** One authenticated browser Client whose Foldkit renderer attaches to v3 optimism. */
export class MultipleCountersV3BrowserApp {
  #authRoot: HTMLElement | null = null
  #authenticationOperationToken = 0
  #chromeRoot: HTMLElement | null = null
  #controllerOperationToken = 0
  readonly #database: InstantCounterDatabase
  readonly #instantAppId: string
  readonly #root: HTMLElement
  #authentication: Authentication = LoadingAuthentication.make({})
  #controller: MultipleCountersV3ClientController | null = null
  #followDraft: MultipleCountersV3FollowDraft =
    emptyMultipleCountersV3FollowDraft()
  #isBeforeUnloadProtected = false
  #isModeRequestPending = false
  #isRendererTerminal = false
  #isSigningOut = false
  #lifecycleGeneration = 0
  #maybeDebugIssued =
    Option.none<typeof MultipleCountersV3DebugLoginIssued.Type>()
  #maybeNotice = Option.none<string>()
  #maybeSentEmail = Option.none<string>()
  #modeOperationToken = 0
  #navigationIntentToken = 0
  #navigationState = makeMultipleCountersV3BrowserNavigationState(
    canonicalListDestinationUri,
  )
  #openedGeneration = -1
  #openingGeneration = -1
  #programShell: HTMLElement | null = null
  #processorBoundState = makeMultipleCountersV3ProcessorBoundState()
  #reconcileOperationToken = 0
  #refreshOperationToken = 0
  #rendererListeners = new Set<(model: Model) => void>()
  #rendererModel = initialRendererModel
  #requestedDestinationUri = canonicalListDestinationUri
  #scope: Scope.Closeable | null = null
  #signOutOperationToken = 0
  #snapshot: MultipleCountersV3ClientSnapshot | null = null
  #unsubscribeAuthentication: (() => void) | null = null

  constructor(
    root: HTMLElement,
    database: InstantCounterDatabase,
    instantAppId: string,
  ) {
    this.#root = root
    this.#database = database
    this.#instantAppId = instantAppId
  }

  /** Starts authentication, subject lifecycle, attached rendering, and URL projection. */
  async start(): Promise<void> {
    if (this.#scope !== null) {
      throw new Error('The browser Client is already starting or running.')
    }
    await ensureHostedInstantSession(this.#database)
    this.#resetRunState()
    const lifecycleGeneration = this.#lifecycleGeneration + 1
    this.#lifecycleGeneration = lifecycleGeneration
    const host = makeMultipleCountersV3BrowserHost(this.#root)
    this.#authRoot = host.authRoot
    this.#chromeRoot = host.chromeRoot
    this.#programShell = host.programShell
    const scope = Effect.runSync(Scope.make())
    this.#scope = scope
    const controller = await Effect.runPromise(
      makeMultipleCountersV3ClientController({
        policyRequests: {
          append: request =>
            appendBrowserMultipleCountersV3PolicyRequest(
              this.#database,
              request,
            ),
          nextPolicyRequestId: () => crypto.randomUUID(),
          now: Date.now,
          resolve: request =>
            resolveBrowserMultipleCountersV3PolicyRequest(
              this.#database,
              request,
            ),
        },
        processorConfig: subjectId =>
          makeBrowserMultipleCountersV3ProcessorConfig({
            database: this.#database,
            instantAppId: this.#instantAppId,
            sessionEpochSeed: multipleCountersV3SessionEpochSeed,
            subjectId,
          }),
        signOut: () =>
          Effect.promise(() => this.#database.auth.signOut()).pipe(
            Effect.asVoid,
          ),
      }).pipe(Effect.provideService(Scope.Scope, scope)),
    )
    if (
      this.#lifecycleGeneration !== lifecycleGeneration ||
      this.#scope !== scope
    ) {
      await Effect.runPromise(Scope.close(scope, Exit.void))
      return
    }
    this.#controller = controller
    const application = await Effect.runPromise(
      makeAttachedFoldkitApplication({
        ClientInput: MultipleCountersV3BrowserClientInput,
        container: host.programMount,
        program: MultipleCountersProgram,
        sendClientInput: input => this.#sendClientInput(input),
        source: {
          readModel: () => this.#rendererModel,
          subscribe: listener => {
            this.#rendererListeners.add(listener)
            return () => {
              this.#rendererListeners.delete(listener)
            }
          },
        },
        view: model =>
          multipleCountersV3BrowserView(model, {
            isNavigationEnabled: !this.#isObserveFollower(),
          }),
      }).pipe(Effect.provideService(Scope.Scope, scope)),
    )
    if (
      this.#lifecycleGeneration !== lifecycleGeneration ||
      this.#scope !== scope
    ) {
      await Effect.runPromise(Scope.close(scope, Exit.void))
      return
    }
    Effect.runSync(
      Effect.forkIn(
        Stream.runForEach(application.defects, defect =>
          Effect.sync(() => this.#receiveRendererDefect(defect)),
        ),
        scope,
      ),
    )
    Effect.runSync(
      Effect.forkIn(
        Stream.runForEach(controller.snapshots, snapshot =>
          Effect.sync(() => this.#receiveSnapshot(snapshot)),
        ),
        scope,
      ),
    )
    this.#unsubscribeAuthentication = observeAuthentication(
      this.#database,
      authentication => this.#receiveAuthentication(authentication),
    )
    window.addEventListener('popstate', this.#openedHistoryEntry)
    this.#render()
  }

  /** Stops all observers and closes the active authenticated Processor Scope. */
  async stop(): Promise<void> {
    this.#lifecycleGeneration += 1
    this.#authenticationOperationToken += 1
    this.#controllerOperationToken += 1
    this.#reconcileOperationToken += 1
    this.#refreshOperationToken += 1
    this.#signOutOperationToken += 1
    this.#isSigningOut = false
    this.#processorBoundState = makeMultipleCountersV3ProcessorBoundState()
    window.removeEventListener('popstate', this.#openedHistoryEntry)
    this.#removeBeforeUnloadProtection()
    this.#unsubscribeAuthentication?.()
    this.#unsubscribeAuthentication = null
    const scope = this.#scope
    this.#scope = null
    this.#controller = null
    this.#authRoot = null
    this.#chromeRoot = null
    this.#programShell = null
    this.#rendererListeners.clear()
    this.#resetRunState()
    if (scope !== null) {
      await Effect.runPromise(Scope.close(scope, Exit.void))
    }
  }

  #removeBeforeUnloadProtection(): void {
    if (this.#isBeforeUnloadProtected) {
      window.removeEventListener('beforeunload', this.#onBeforeUnload)
      this.#isBeforeUnloadProtected = false
    }
  }

  #onBeforeUnload = (event: BeforeUnloadEvent): void => {
    const pendingClaims =
      this.#snapshot !== null
        ? Option.match(this.#snapshot.maybeActiveProgram, {
            onNone: () => [],
            onSome: active => active.processorSnapshot.pendingClaims,
          })
        : []
    if (multipleCountersV3HasMemoryOnlyPendingClaims(pendingClaims)) {
      event.preventDefault()
    }
  }

  #resetRunState(): void {
    this.#authentication = LoadingAuthentication.make({})
    this.#isRendererTerminal = false
    this.#isSigningOut = false
    this.#maybeNotice = Option.none()
    this.#maybeSentEmail = Option.none()
    this.#maybeDebugIssued = Option.none()
    this.#navigationState = makeMultipleCountersV3BrowserNavigationState(
      canonicalListDestinationUri,
    )
    this.#openedGeneration = -1
    this.#openingGeneration = -1
    this.#rendererModel = initialRendererModel
    this.#requestedDestinationUri = destinationUriFromLocation()
    this.#processorBoundState = makeMultipleCountersV3ProcessorBoundState()
    void this.#processorBoundState
    this.#snapshot = null
  }

  readonly #openedHistoryEntry = (): void => {
    if (this.#isObserveFollower()) {
      const destinationUri = navigationToPath(this.#rendererModel.navigation)
      const nextUrl = `${destinationUri}${window.location.search}${window.location.hash}`
      window.history.replaceState({}, '', nextUrl)
      this.#requestedDestinationUri = destinationUri
      this.#navigationState =
        makeMultipleCountersV3BrowserNavigationState(destinationUri)
      this.#maybeNotice = Option.some(
        'This Processor follows its leader in Observe mode. Browser history cannot drive shared navigation.',
      )
      this.#render()
      return
    }
    this.#requestedDestinationUri = destinationUriFromLocation()
    const navigationIntentToken = this.#beginNavigationIntent(
      'Carrier',
      this.#requestedDestinationUri,
    )
    this.#runController(input => input.open(this.#requestedDestinationUri), {
      onApplied: () => {
        this.#settleNavigationIntent(navigationIntentToken, true)
      },
      onNotApplied: () => {
        this.#settleNavigationIntent(navigationIntentToken, false)
      },
    })
  }

  #receiveAuthentication(authentication: Authentication): void {
    this.#authenticationOperationToken += 1
    this.#refreshOperationToken += 1
    const previousSubjectId =
      this.#authentication._tag === 'SignedIn'
        ? Option.some(this.#authentication.subjectId)
        : Option.none<string>()
    const nextSubjectId =
      authentication._tag === 'SignedIn'
        ? Option.some(authentication.subjectId)
        : Option.none<string>()
    const isSubjectBoundary = Option.match(previousSubjectId, {
      onNone: () => Option.isSome(nextSubjectId),
      onSome: previousSubject =>
        Option.isNone(nextSubjectId) || previousSubject !== nextSubjectId.value,
    })
    if (isSubjectBoundary) {
      this.#signOutOperationToken += 1
      this.#modeOperationToken += 1
      this.#isSigningOut = false
      this.#isModeRequestPending = false
      this.#followDraft = {
        control: 'Observe',
        followerProcessorId: '',
        leaderProcessorId: '',
      }
      this.#requestedDestinationUri = destinationUriFromLocation()
      this.#openedGeneration = -1
      this.#openingGeneration = -1
      this.#navigationState = makeMultipleCountersV3BrowserNavigationState(
        canonicalListDestinationUri,
      )
      this.#maybeNotice = Option.none()
      this.#maybeSentEmail = Option.none()
      if (authentication._tag === 'SignedIn') {
        const session = makeMultipleCountersV3SessionIdentity({
          instantAppId: this.#instantAppId,
          sessionEpochSeed: multipleCountersV3SessionEpochSeed,
          subjectId: authentication.subjectId,
        })
        logMultipleCountersV3Debug('signed-in', {
          email: Option.getOrElse(authentication.maybeEmail, () => ''),
          sessionId: session.sessionId,
          sessionIdLength: session.sessionId.length,
          subjectId: authentication.subjectId,
          subjectIdLength: authentication.subjectId.length,
        })
      } else {
        logMultipleCountersV3Debug('signed-out', {})
      }
    }
    if (authentication._tag !== 'SignedIn') {
      this.#isSigningOut = false
    }
    this.#authentication = authentication
    const controller = this.#controller
    if (controller !== null) {
      const maybeSubjectId =
        authentication._tag === 'SignedIn'
          ? Option.some(authentication.subjectId)
          : Option.none()
      const lifecycleGeneration = this.#lifecycleGeneration
      const reconcileOperationToken = this.#reconcileOperationToken + 1
      this.#reconcileOperationToken = reconcileOperationToken
      void Effect.runPromise(
        controller.reconcileAuthenticatedSubject(maybeSubjectId),
      ).catch(() => {
        if (
          this.#lifecycleGeneration !== lifecycleGeneration ||
          this.#controller !== controller ||
          this.#reconcileOperationToken !== reconcileOperationToken
        ) {
          return
        }
        this.#maybeNotice = Option.some(
          'The authenticated Processor could not start. Check the authority and Instant schema.',
        )
        this.#render()
      })
    }
    this.#render()
  }

  #receiveSnapshot(snapshot: MultipleCountersV3ClientSnapshot): void {
    const previousProcessorId = Option.map(
      this.#snapshot?.maybeActiveProgram ?? Option.none(),
      active => active.processorId,
    )
    const nextProcessorId = Option.map(
      snapshot.maybeActiveProgram,
      active => active.processorId,
    )
    if (
      Option.isSome(previousProcessorId) &&
      Option.isSome(nextProcessorId) &&
      previousProcessorId.value !== nextProcessorId.value
    ) {
      this.#followDraft = {
        control: 'Observe',
        followerProcessorId: '',
        leaderProcessorId: '',
      }
    }
    const wasObserveFollower =
      this.#snapshot !== null &&
      isMultipleCountersV3ObserveFollower(this.#snapshot)
    const isObserveFollower = isMultipleCountersV3ObserveFollower(snapshot)
    if (isObserveFollower && !wasObserveFollower) {
      this.#controllerOperationToken += 1
      this.#navigationState = makeMultipleCountersV3BrowserNavigationState(
        navigationToPath(snapshot.model.navigation),
      )
    }
    const subjectId =
      this.#authentication._tag === 'SignedIn'
        ? this.#authentication.subjectId
        : ''
    const maybeNewRejection = multipleCountersV3NewTerminalRejection(
      subjectId,
      this.#snapshot,
      snapshot,
    )
    this.#snapshot = snapshot
    if (Option.isSome(maybeNewRejection) && this.#scope !== null) {
      this.#maybeNotice = Option.some(
        `The authority rejected proposal ${maybeNewRejection.value.proposalId}. Its optimistic changes were rolled back.${Option.match(
          maybeNewRejection.value.maybeRejectionReason,
          {
            onNone: () => '',
            onSome: reason => ` Reason: ${reason}.`,
          },
        )}`,
      )
    }
    if (snapshot.lifecycle._tag === 'SigningOutSubjectScopedProgram') {
      this.#isSigningOut = true
    }
    this.#rendererModel = snapshot.model
    this.#openRequestedDestinationWhenReady()
    this.#projectNavigation(snapshot.model)
    this.#publishRendererModel()
    this.#render()
  }

  #receiveRendererDefect(defect: AttachedFoldkitRendererDefect): void {
    if (this.#scope === null) {
      return
    }
    const state = multipleCountersV3RendererDefectState(defect)
    if (this.#isRendererTerminal && !state.isTerminal) {
      return
    }
    this.#isRendererTerminal = this.#isRendererTerminal || state.isTerminal
    this.#maybeNotice = Option.some(state.notice)
    this.#render()
  }

  #publishRendererModel(): void {
    this.#rendererListeners.forEach(listener => listener(this.#rendererModel))
  }

  #isObserveFollower(): boolean {
    return (
      Option.isSome(this.#matchingActiveGeneration()) &&
      this.#snapshot !== null &&
      isMultipleCountersV3ObserveFollower(this.#snapshot)
    )
  }

  #matchingActiveGeneration(): Option.Option<number> {
    const snapshot = this.#snapshot
    if (
      this.#authentication._tag !== 'SignedIn' ||
      snapshot === null ||
      snapshot.lifecycle._tag !== 'ActiveSubjectScopedProgram' ||
      Option.isNone(snapshot.maybeActiveProgram) ||
      snapshot.maybeActiveProgram.value.subjectId !==
        this.#authentication.subjectId ||
      snapshot.maybeActiveProgram.value.generation !==
        snapshot.lifecycle.generation
    ) {
      return Option.none()
    }
    return Option.some(snapshot.lifecycle.generation)
  }

  #openRequestedDestinationWhenReady(): void {
    const controller = this.#controller
    const snapshot = this.#snapshot
    const maybeGeneration = this.#matchingActiveGeneration()
    if (
      controller === null ||
      snapshot === null ||
      Option.isNone(maybeGeneration) ||
      Option.isNone(snapshot.maybeActiveProgram) ||
      Option.isNone(
        snapshot.maybeActiveProgram.value.processorSnapshot.activeSessionPolicy,
      ) ||
      maybeGeneration.value === this.#openedGeneration ||
      maybeGeneration.value === this.#openingGeneration
    ) {
      return
    }
    const generation = maybeGeneration.value
    const lifecycleGeneration = this.#lifecycleGeneration
    const destinationUri = this.#requestedDestinationUri
    this.#openingGeneration = generation
    const maybeObserveLeader =
      multipleCountersV3ObserveLeaderProcessorId(snapshot)
    if (Option.isSome(maybeObserveLeader)) {
      this.#completedRequestedDestinationOpen(
        generation,
        Option.some(
          `Following ${maybeObserveLeader.value} in Observe mode. Navigation controls are read-only on this Processor.`,
        ),
      )
      return
    }
    const navigationIntentToken = this.#beginNavigationIntent(
      'Carrier',
      destinationUri,
    )
    void Effect.runPromise(
      submissionAttempt(controller.open(destinationUri)),
    ).then(
      attempt => {
        if (
          !this.#isCurrentOpeningGeneration(
            generation,
            lifecycleGeneration,
            controller,
          )
        ) {
          return
        }
        if (attempt._tag === 'SucceededSubmission') {
          logMultipleCountersV3Debug('open-applied', {
            destinationUri,
            outcome: attempt.submission.outcome._tag,
            projection: attempt.submission.projection._tag,
            proposalId: attempt.submission.proposal.proposalId,
          })
          if (isMultipleCountersV3ClientSubmissionApplied(attempt.submission)) {
            this.#settleNavigationIntent(navigationIntentToken, true)
            this.#completedRequestedDestinationOpen(
              generation,
              submissionNotice(attempt.submission),
            )
          } else {
            this.#settleNavigationIntent(navigationIntentToken, false)
            this.#maybeNotice = submissionNotice(attempt.submission)
            this.#showProgramAfterRejectedCarrier(generation)
            this.#render()
          }
        } else if (isMultipleCountersV3RetainedOptimisticError(attempt.error)) {
          logMultipleCountersV3Debug('open-retained', {
            cause: describeUnknownCause(attempt.error),
            destinationUri,
            proposalId: attempt.error.proposal.proposalId,
          })
          if (isMultipleCountersV3ClientSubmissionApplied(attempt.error)) {
            this.#settleNavigationIntent(navigationIntentToken, true)
            this.#completedRequestedDestinationOpen(
              generation,
              Option.some(
                'Applied optimistically and retained only in this running Client after Instant persistence failed. Retry before signing out, reloading, or closing this page.',
              ),
            )
          } else {
            this.#settleNavigationIntent(navigationIntentToken, false)
            this.#maybeNotice = Option.some(
              'Retained only in this running Client after Instant persistence failed, but the Program rejected this navigation against its current Model.',
            )
            this.#showProgramAfterRejectedCarrier(generation)
            this.#render()
          }
        } else {
          logMultipleCountersV3Debug('open-rejected', {
            cause: describeUnknownCause(attempt.error),
            destinationUri,
            tag: attempt.error._tag,
          })
          this.#settleNavigationIntent(navigationIntentToken, false)
          if (this.#openingGeneration === generation) {
            this.#openingGeneration = -1
          }
          this.#maybeNotice = Option.some(
            attempt.error._tag === 'V3SharedProgramSessionPolicyUnavailable'
              ? 'Waiting for the authority to confirm this Program session.'
              : `Could not open ${destinationUri}: ${attempt.error._tag}. ${describeUnknownCause(attempt.error)}`,
          )
          if (
            attempt.error._tag !== 'V3SharedProgramSessionPolicyUnavailable'
          ) {
            this.#showProgramAfterRejectedCarrier(generation)
          }
          this.#render()
        }
      },
      () => {
        if (
          !this.#isCurrentOpeningGeneration(
            generation,
            lifecycleGeneration,
            controller,
          )
        ) {
          return
        }
        this.#settleNavigationIntent(navigationIntentToken, false)
        this.#maybeNotice = Option.some(
          'The Client encountered a defect while opening this URI. Inspect pending proposals before retrying.',
        )
        this.#showProgramAfterRejectedCarrier(generation)
        this.#render()
      },
    )
  }

  #isCurrentOpeningGeneration(
    generation: number,
    lifecycleGeneration: number,
    controller: MultipleCountersV3ClientController,
  ): boolean {
    const maybeCurrentGeneration = this.#matchingActiveGeneration()
    return (
      Option.isSome(maybeCurrentGeneration) &&
      this.#lifecycleGeneration === lifecycleGeneration &&
      this.#controller === controller &&
      maybeCurrentGeneration.value === generation &&
      this.#openingGeneration === generation
    )
  }

  #completedRequestedDestinationOpen(
    generation: number,
    maybeNotice: Option.Option<string>,
  ): void {
    const maybeCurrentGeneration = this.#matchingActiveGeneration()
    if (
      Option.isNone(maybeCurrentGeneration) ||
      maybeCurrentGeneration.value !== generation
    ) {
      return
    }
    this.#openingGeneration = -1
    this.#openedGeneration = generation
    this.#maybeNotice = maybeNotice
    this.#projectNavigation(this.#rendererModel)
    this.#render()
  }

  #showProgramAfterRejectedCarrier(generation: number): void {
    const maybeCurrentGeneration = this.#matchingActiveGeneration()
    if (
      Option.isNone(maybeCurrentGeneration) ||
      maybeCurrentGeneration.value !== generation
    ) {
      return
    }
    this.#openingGeneration = -1
    this.#openedGeneration = generation
    this.#navigationState = preservedMultipleCountersV3RejectedCarrier(
      this.#navigationState,
      navigationToPath(this.#rendererModel.navigation),
    )
  }

  #projectNavigation(model: Model): void {
    const generation = this.#matchingActiveGeneration()
    if (
      Option.isNone(generation) ||
      generation.value !== this.#openedGeneration
    ) {
      return
    }
    const destinationUri = navigationToPath(model.navigation)
    this.#applyNavigationDecision(
      projectedMultipleCountersV3BrowserNavigation(
        this.#navigationState,
        destinationUri,
        window.location.pathname,
      ),
    )
  }

  #beginNavigationIntent(
    kind: MultipleCountersV3PendingNavigationIntent['kind'],
    expectedDestinationUri: string,
  ): number {
    const nextNavigationIntentToken = this.#navigationIntentToken + 1
    this.#navigationIntentToken = nextNavigationIntentToken
    this.#navigationState = beganMultipleCountersV3BrowserNavigation(
      this.#navigationState,
      {
        expectedDestinationUri,
        kind,
        token: nextNavigationIntentToken,
      },
    )
    return nextNavigationIntentToken
  }

  #settleNavigationIntent(token: number, isApplied: boolean): void {
    this.#applyNavigationDecision(
      settledMultipleCountersV3BrowserNavigation(
        this.#navigationState,
        token,
        isApplied,
        navigationToPath(this.#rendererModel.navigation),
        window.location.pathname,
      ),
    )
  }

  #applyNavigationDecision(
    navigationDecision: MultipleCountersV3BrowserNavigationDecision,
  ): void {
    this.#navigationState = navigationDecision.state
    M.value(navigationDecision.historyMutation).pipe(
      M.tagsExhaustive({
        NoBrowserHistoryMutation: () => {},
        PushedBrowserHistory: ({ destinationUri }) => {
          const nextUrl = `${destinationUri}${window.location.search}${window.location.hash}`
          window.history.pushState({}, '', nextUrl)
          this.#requestedDestinationUri = destinationUri
        },
        ReplacedBrowserHistory: ({ destinationUri }) => {
          const nextUrl = `${destinationUri}${window.location.search}${window.location.hash}`
          window.history.replaceState({}, '', nextUrl)
          this.#requestedDestinationUri = destinationUri
        },
      }),
    )
  }

  #sendClientInput(input: MultipleCountersV3BrowserClientInput): void {
    M.value(input).pipe(
      M.tagsExhaustive({
        OpenedMultipleCountersNavigationCarrier: ({ destinationUri }) => {
          this.#requestedDestinationUri = destinationUri
          const navigationIntentToken = this.#beginNavigationIntent(
            'Carrier',
            destinationUri,
          )
          this.#runController(controller => controller.open(destinationUri), {
            onApplied: () => {
              this.#settleNavigationIntent(navigationIntentToken, true)
            },
            onNotApplied: () => {
              this.#settleNavigationIntent(navigationIntentToken, false)
            },
          })
        },
        PerformedMultipleCountersInteraction: ({ reference }) => {
          const maybeExpectedDestinationUri = referenceDestination(
            this.#rendererModel,
            reference,
          )
          const maybeNavigationIntentToken = Option.map(
            maybeExpectedDestinationUri,
            destinationUri =>
              this.#beginNavigationIntent('Interaction', destinationUri),
          )
          this.#runController(controller => controller.perform(reference), {
            onApplied: () => {
              if (Option.isSome(maybeNavigationIntentToken)) {
                this.#settleNavigationIntent(
                  maybeNavigationIntentToken.value,
                  true,
                )
              }
            },
            onNotApplied: () => {
              if (Option.isSome(maybeNavigationIntentToken)) {
                this.#settleNavigationIntent(
                  maybeNavigationIntentToken.value,
                  false,
                )
              }
            },
          })
        },
      }),
    )
  }

  #runController(
    operation: (
      controller: MultipleCountersV3ClientController,
    ) => Effect.Effect<
      MultipleCountersV3ClientSubmission,
      MultipleCountersV3ClientSubmissionError
    >,
    callbacks: Readonly<{
      onApplied?: () => void
      onNotApplied?: () => void
    }> = {},
  ): void {
    const controller = this.#controller
    const maybeActiveGeneration = this.#matchingActiveGeneration()
    if (controller === null || Option.isNone(maybeActiveGeneration)) {
      return
    }
    const activeGeneration = maybeActiveGeneration.value
    const lifecycleGeneration = this.#lifecycleGeneration
    const controllerOperationToken = this.#controllerOperationToken + 1
    this.#controllerOperationToken = controllerOperationToken
    const isCurrentContext = (): boolean => {
      const maybeCurrentGeneration = this.#matchingActiveGeneration()
      return (
        this.#lifecycleGeneration === lifecycleGeneration &&
        this.#controller === controller &&
        Option.isSome(maybeCurrentGeneration) &&
        maybeCurrentGeneration.value === activeGeneration
      )
    }
    const isLatestOperation = (): boolean =>
      isCurrentContext() &&
      this.#controllerOperationToken === controllerOperationToken
    void Effect.runPromise(submissionAttempt(operation(controller))).then(
      attempt => {
        if (!isCurrentContext()) {
          return
        }
        if (attempt._tag === 'SucceededSubmission') {
          logMultipleCountersV3Debug('submission-applied', {
            outcome: attempt.submission.outcome._tag,
            projection: attempt.submission.projection._tag,
            proposalId: attempt.submission.proposal.proposalId,
          })
          if (isMultipleCountersV3ClientSubmissionApplied(attempt.submission)) {
            callbacks.onApplied?.()
          } else {
            callbacks.onNotApplied?.()
          }
          if (!isLatestOperation()) {
            return
          }
          this.#maybeNotice = submissionNotice(attempt.submission)
        } else if (isMultipleCountersV3RetainedOptimisticError(attempt.error)) {
          logMultipleCountersV3Debug('submission-retained', {
            cause: describeUnknownCause(attempt.error),
            proposalId: attempt.error.proposal.proposalId,
          })
          if (isMultipleCountersV3ClientSubmissionApplied(attempt.error)) {
            callbacks.onApplied?.()
          } else {
            callbacks.onNotApplied?.()
          }
          if (!isLatestOperation()) {
            return
          }
          this.#maybeNotice = Option.some(
            isMultipleCountersV3ClientSubmissionApplied(attempt.error)
              ? 'Applied optimistically and retained only in this running Client after Instant persistence failed. Retry before signing out, reloading, or closing this page.'
              : 'Retained only in this running Client after Instant persistence failed, but the current Program projection did not apply it.',
          )
        } else {
          logMultipleCountersV3Debug('submission-rejected', {
            cause: describeUnknownCause(attempt.error),
            tag: attempt.error._tag,
          })
          callbacks.onNotApplied?.()
          if (!isLatestOperation()) {
            return
          }
          this.#maybeNotice = Option.some(
            `Not applied: ${attempt.error._tag}. ${describeUnknownCause(attempt.error)} The current Program Model was left unchanged.`,
          )
        }
        this.#render()
      },
      error => {
        logMultipleCountersV3Debug('submission-defect', {
          cause: describeUnknownCause(error),
        })
        if (!isCurrentContext()) {
          return
        }
        callbacks.onNotApplied?.()
        if (!isLatestOperation()) {
          return
        }
        this.#maybeNotice = Option.some(
          'The Client encountered a defect. Inspect pending proposals before retrying.',
        )
        this.#render()
      },
    )
  }

  #render(): void {
    const authRoot = this.#authRoot
    const programShell = this.#programShell
    const chromeRoot = this.#chromeRoot
    if (authRoot === null || programShell === null || chromeRoot === null) {
      return
    }
    const isSignedIn = this.#authentication._tag === 'SignedIn'
    const maybeActiveGeneration = this.#matchingActiveGeneration()
    const isProgramReady =
      Option.isSome(maybeActiveGeneration) &&
      maybeActiveGeneration.value === this.#openedGeneration
    setMultipleCountersV3BrowserHostVisibility(
      { authRoot, chromeRoot, programShell },
      isProgramReady,
    )
    programShell.inert = this.#isRendererTerminal
    if (this.#isRendererTerminal) {
      programShell.setAttribute('aria-disabled', 'true')
    } else {
      programShell.removeAttribute('aria-disabled')
    }
    const hasMemoryOnlyPendingClaims =
      this.#snapshot !== null &&
      multipleCountersV3HasMemoryOnlyPendingClaims(
        Option.match(this.#snapshot.maybeActiveProgram, {
          onNone: () => [],
          onSome: active => active.processorSnapshot.pendingClaims,
        }),
      )
    authRoot.innerHTML = isSignedIn
      ? preparingProgramMarkup(
          this.#authentication,
          this.#maybeNotice,
          this.#isSigningOut,
          hasMemoryOnlyPendingClaims,
        )
      : authenticationMarkup(
          this.#authentication,
          this.#maybeSentEmail,
          this.#maybeNotice,
          isBrowserDebugLoginEnabled,
          this.#maybeDebugIssued,
        )
    if (isProgramReady && this.#snapshot !== null) {
      chromeRoot.innerHTML = chromeMarkup(
        this.#authentication,
        this.#snapshot,
        this.#maybeNotice,
        this.#isRendererTerminal,
        this.#isSigningOut,
        this.#followDraft,
        this.#isModeRequestPending,
        hasMemoryOnlyPendingClaims,
      )
    } else {
      chromeRoot.replaceChildren()
    }
    this.#bindAuthenticationEvents()
    chromeRoot.querySelector('#v3-sign-out')?.addEventListener(
      'click',
      () => {
        const controller = this.#controller
        if (controller !== null) {
          this.#signOut(controller)
        }
      },
      { once: true },
    )
    chromeRoot
      .querySelector('#v3-reload-renderer')
      ?.addEventListener('click', () => window.location.reload(), {
        once: true,
      })
    authRoot
      .querySelector('#v3-retry-processor')
      ?.addEventListener('click', () => {
        const controller = this.#controller
        if (controller !== null) {
          this.#refreshProcessor(controller)
        }
      })
    authRoot
      .querySelector('#v3-preparing-sign-out')
      ?.addEventListener('click', () => {
        const controller = this.#controller
        if (controller !== null) {
          this.#signOut(controller)
        }
      })
    chromeRoot
      .querySelectorAll<HTMLElement>('[data-v3-retry]')
      .forEach(button => {
        button.addEventListener(
          'click',
          () => {
            const proposalId = button.dataset['v3Retry']
            if (proposalId !== undefined) {
              this.#runController(controller => controller.retry(proposalId))
            }
          },
          { once: true },
        )
      })
    chromeRoot
      .querySelectorAll<HTMLButtonElement>('[data-v3-mode]')
      .forEach(button => {
        button.addEventListener(
          'click',
          () => {
            const controller = this.#controller
            const mode = button.dataset['v3Mode']
            if (controller === null) {
              return
            }
            if (mode === 'Mirror') {
              this.#requestMode(controller, Synchronization.Mirror.make({}))
            } else if (mode === 'SharedDomain') {
              this.#requestMode(
                controller,
                Synchronization.SharedDomain.make({}),
              )
            }
          },
          { once: true },
        )
      })
    chromeRoot
      .querySelector('#v3-follow-form')
      ?.addEventListener('submit', event => {
        event.preventDefault()
        const controller = this.#controller
        const form = event.currentTarget
        if (controller === null || !(form instanceof HTMLFormElement)) {
          return
        }
        const formData = new FormData(form)
        const leaderProcessorId = formData.get('leaderProcessorId')
        const followerProcessorId = formData.get('followerProcessorId')
        const control = formData.get('control')
        if (
          typeof leaderProcessorId !== 'string' ||
          typeof followerProcessorId !== 'string' ||
          typeof control !== 'string'
        ) {
          return
        }
        const maybeMode = multipleCountersV3FollowMode(
          leaderProcessorId,
          followerProcessorId,
          control,
        )
        if (Option.isNone(maybeMode)) {
          this.#maybeNotice = Option.some(
            'Follow needs different non-empty leader and follower Processor ids.',
          )
          this.#render()
          return
        }
        this.#requestMode(controller, maybeMode.value)
      })
    chromeRoot
      .querySelector('#v3-follow-form')
      ?.addEventListener('input', event => {
        const form = event.currentTarget
        if (!(form instanceof HTMLFormElement)) {
          return
        }
        const formData = new FormData(form)
        const leaderProcessorId = formData.get('leaderProcessorId')
        const followerProcessorId = formData.get('followerProcessorId')
        const control = formData.get('control')
        if (
          typeof leaderProcessorId === 'string' &&
          typeof followerProcessorId === 'string' &&
          (control === 'Observe' || control === 'RemoteControl')
        ) {
          this.#followDraft = {
            control,
            followerProcessorId,
            leaderProcessorId,
          }
        }
      })
  }

  #requestMode(
    controller: MultipleCountersV3ClientController,
    mode: Synchronization.Mode,
  ): void {
    if (this.#isModeRequestPending) {
      return
    }
    const maybeActiveGeneration = this.#matchingActiveGeneration()
    if (Option.isNone(maybeActiveGeneration)) {
      return
    }
    const activeGeneration = maybeActiveGeneration.value
    const lifecycleGeneration = this.#lifecycleGeneration
    const modeOperationToken = this.#modeOperationToken + 1
    this.#modeOperationToken = modeOperationToken
    this.#isModeRequestPending = true
    this.#maybeNotice = Option.some(
      `Requesting ${multipleCountersV3ModeRequestLabel(mode)} from the session authority.`,
    )
    this.#render()
    const isCurrentModeOperation = (): boolean => {
      const maybeCurrentGeneration = this.#matchingActiveGeneration()
      return (
        this.#lifecycleGeneration === lifecycleGeneration &&
        this.#controller === controller &&
        this.#modeOperationToken === modeOperationToken &&
        Option.isSome(maybeCurrentGeneration) &&
        maybeCurrentGeneration.value === activeGeneration
      )
    }
    void Effect.runPromise(controller.requestMode(mode)).then(
      resolution => {
        if (!isCurrentModeOperation()) {
          return
        }
        this.#isModeRequestPending = false
        this.#maybeNotice =
          resolution.resolutionState === 'Accepted'
            ? Option.some(
                `The authority accepted ${multipleCountersV3ModeRequestLabel(mode)} as policy generation ${resolution.resolvedPolicyGeneration.toString()}.`,
              )
            : Option.some(
                `The authority rejected ${multipleCountersV3ModeRequestLabel(mode)}: ${resolution.rejectionReason}.`,
              )
        this.#render()
      },
      error => {
        if (!isCurrentModeOperation()) {
          return
        }
        this.#isModeRequestPending = false
        const errorTag =
          typeof error === 'object' &&
          error !== null &&
          '_tag' in error &&
          typeof error._tag === 'string'
            ? error._tag
            : 'UnknownModeRequestFailure'
        this.#maybeNotice = Option.some(
          `Mode request was not applied: ${errorTag}.`,
        )
        this.#render()
      },
    )
  }

  #refreshProcessor(controller: MultipleCountersV3ClientController): void {
    this.#reconcileOperationToken += 1
    const lifecycleGeneration = this.#lifecycleGeneration
    const refreshOperationToken = this.#refreshOperationToken + 1
    this.#refreshOperationToken = refreshOperationToken
    const subjectId =
      this.#authentication._tag === 'SignedIn'
        ? this.#authentication.subjectId
        : undefined
    this.#requestedDestinationUri = destinationUriFromLocation()
    void Effect.runPromise(controller.refreshAuthenticatedSubject).catch(() => {
      if (
        this.#lifecycleGeneration !== lifecycleGeneration ||
        this.#controller !== controller ||
        this.#refreshOperationToken !== refreshOperationToken ||
        this.#authentication._tag !== 'SignedIn' ||
        this.#authentication.subjectId !== subjectId
      ) {
        return
      }
      this.#maybeNotice = Option.some(
        'Processor startup failed again. Check Instant and the headless authority.',
      )
      this.#render()
    })
  }

  #bindAuthenticationEvents(): void {
    const authRoot = this.#authRoot
    if (authRoot === null) {
      return
    }
    authRoot
      .querySelector('#v3-email-form')
      ?.addEventListener('submit', event => {
        event.preventDefault()
        const form = event.currentTarget
        if (!(form instanceof HTMLFormElement)) {
          return
        }
        const email = new FormData(form).get('email')
        if (typeof email !== 'string' || email.length === 0) {
          return
        }
        const lifecycleGeneration = this.#lifecycleGeneration
        const authenticationOperationToken =
          this.#authenticationOperationToken + 1
        this.#authenticationOperationToken = authenticationOperationToken
        const isCurrentAuthenticationOperation = (): boolean =>
          this.#lifecycleGeneration === lifecycleGeneration &&
          this.#authenticationOperationToken === authenticationOperationToken &&
          this.#authentication._tag === 'SignedOut'
        void sendMagicCode(this.#database, email).then(
          () => {
            if (!isCurrentAuthenticationOperation()) {
              return
            }
            this.#maybeSentEmail = Option.some(email)
            this.#maybeNotice = Option.none()
            this.#render()
          },
          () => {
            if (!isCurrentAuthenticationOperation()) {
              return
            }
            this.#maybeNotice = Option.some('Instant could not send the code.')
            this.#render()
          },
        )
      })
    authRoot
      .querySelector('#v3-code-form')
      ?.addEventListener('submit', event => {
        event.preventDefault()
        const form = event.currentTarget
        if (
          !(form instanceof HTMLFormElement) ||
          Option.isNone(this.#maybeSentEmail)
        ) {
          return
        }
        const code = new FormData(form).get('code')
        if (typeof code !== 'string' || code.length === 0) {
          return
        }
        const email = this.#maybeSentEmail.value
        const lifecycleGeneration = this.#lifecycleGeneration
        const authenticationOperationToken =
          this.#authenticationOperationToken + 1
        this.#authenticationOperationToken = authenticationOperationToken
        void signInWithMagicCode(this.#database, email, code).catch(() => {
          if (
            this.#lifecycleGeneration !== lifecycleGeneration ||
            this.#authenticationOperationToken !==
              authenticationOperationToken ||
            this.#authentication._tag !== 'SignedOut' ||
            Option.isNone(this.#maybeSentEmail) ||
            this.#maybeSentEmail.value !== email
          ) {
            return
          }
          this.#maybeNotice = Option.some('That code could not be verified.')
          this.#render()
        })
      })
    authRoot
      .querySelector('#v3-change-email')
      ?.addEventListener('click', () => {
        this.#authenticationOperationToken += 1
        this.#maybeSentEmail = Option.none()
        this.#render()
      })
    authRoot.querySelector('#v3-google')?.addEventListener('click', () => {
      this.#authenticationOperationToken += 1
      signInWithGoogle(this.#database)
    })
    this.#bindDebugLoginEvents()
  }

  #bindDebugLoginEvents(): void {
    const authRoot = this.#authRoot
    if (authRoot === null || !isBrowserDebugLoginEnabled) {
      return
    }
    for (const button of authRoot.querySelectorAll('[data-debug-email]')) {
      button.addEventListener('click', () => {
        if (!(button instanceof HTMLButtonElement)) {
          return
        }
        const decodedEmail = S.decodeUnknownResult(
          MultipleCountersV3DebugEmail,
        )(button.getAttribute('data-debug-email'))
        if (Result.isFailure(decodedEmail)) {
          return
        }
        this.#signInWithDebugSubject(decodedEmail.success)
      })
    }
  }

  #signInWithDebugSubject(
    email: typeof MultipleCountersV3DebugEmail.Type,
  ): void {
    const lifecycleGeneration = this.#lifecycleGeneration
    const authenticationOperationToken = this.#authenticationOperationToken + 1
    this.#authenticationOperationToken = authenticationOperationToken
    const isCurrentAuthenticationOperation = (): boolean =>
      this.#lifecycleGeneration === lifecycleGeneration &&
      this.#authenticationOperationToken === authenticationOperationToken &&
      this.#authentication._tag === 'SignedOut'
    logMultipleCountersV3Debug('debug-login-requested', { email })
    void requestMultipleCountersV3DebugLogin(email).then(
      issued => {
        if (!isCurrentAuthenticationOperation()) {
          return
        }
        logMultipleCountersV3Debug('debug-login-issued', {
          code: issued.code,
          email: issued.email,
          label: issued.label,
        })
        this.#maybeDebugIssued = Option.some(issued)
        this.#maybeSentEmail = Option.some(issued.email)
        this.#maybeNotice = Option.none()
        this.#render()
        return signInWithMagicCode(
          this.#database,
          issued.email,
          issued.code,
        ).catch(() => {
          if (!isCurrentAuthenticationOperation()) {
            return
          }
          logMultipleCountersV3Debug('debug-login-verify-failed', { email })
          this.#maybeNotice = Option.some(
            'The debug magic code could not be verified.',
          )
          this.#render()
        })
      },
      () => {
        if (!isCurrentAuthenticationOperation()) {
          return
        }
        logMultipleCountersV3Debug('debug-login-unavailable', { email })
        this.#maybeNotice = Option.some(
          'Start the headless authority to mint Alice and Bob codes.',
        )
        this.#render()
      },
    )
  }

  #signOut(controller: MultipleCountersV3ClientController): void {
    if (this.#isSigningOut || this.#authentication._tag !== 'SignedIn') {
      return
    }
    const lifecycleGeneration = this.#lifecycleGeneration
    const subjectId = this.#authentication.subjectId
    const signOutOperationToken = this.#signOutOperationToken + 1
    this.#signOutOperationToken = signOutOperationToken
    this.#reconcileOperationToken += 1
    this.#refreshOperationToken += 1
    this.#isSigningOut = true
    this.#render()
    const isCurrentSignOut = (): boolean =>
      this.#lifecycleGeneration === lifecycleGeneration &&
      this.#controller === controller &&
      this.#signOutOperationToken === signOutOperationToken &&
      this.#authentication._tag === 'SignedIn' &&
      this.#authentication.subjectId === subjectId
    void Effect.runPromise(controller.signOut).then(
      () => {
        if (isCurrentSignOut()) {
          this.#render()
        }
      },
      error => {
        if (!isCurrentSignOut()) {
          return
        }
        if (error instanceof SubjectScopedProgramSignOutInProgress) {
          this.#render()
          return
        }
        this.#maybeNotice = Option.some(
          'Instant sign out failed. Restoring this still-authenticated Processor so you can retry.',
        )
        const reconcileOperationToken = this.#reconcileOperationToken + 1
        this.#reconcileOperationToken = reconcileOperationToken
        this.#requestedDestinationUri = destinationUriFromLocation()
        void Effect.runPromise(
          controller.reconcileAuthenticatedSubject(Option.some(subjectId)),
        ).then(
          () => {
            if (
              !isCurrentSignOut() ||
              this.#reconcileOperationToken !== reconcileOperationToken
            ) {
              return
            }
            this.#isSigningOut = false
            this.#render()
          },
          () => {
            if (
              !isCurrentSignOut() ||
              this.#reconcileOperationToken !== reconcileOperationToken
            ) {
              return
            }
            this.#isSigningOut = false
            this.#maybeNotice = Option.some(
              'Instant sign out failed, and the authenticated Processor could not be restored. Retry Processor startup.',
            )
            this.#render()
          },
        )
      },
    )
  }
}
