import { Array, Option, Schema as S } from 'effect'
import {
  type ChildProcess,
  type ChildProcessWithoutNullStreams,
  spawn,
} from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  type Browser,
  type BrowserContext,
  type Page,
  chromium,
} from 'playwright'

import {
  InstantMessageProposalRecord,
  type InstantMessageProposalRecord as InstantMessageProposalRecordType,
} from '@foldkit/instant'
import { type InstantAdminDatabase, init as initAdmin } from '@instantdb/admin'

import { schema } from '../../instant.schema.js'
import {
  CheckClaimIsolationRequest,
  CheckForeignIsolationRequest,
  type PublicClientRequest,
  PublicClientRequest as PublicClientRequestSchema,
  PublicClientResponse,
  type PublicClientResponse as PublicClientResponseType,
  SubmitProposalRequest,
} from './protocol.js'

const acceptanceOrigin = 'http://localhost:5173'
const sequencerReadyMessage =
  'Foldkit Instant headless admission sequencer is observing authenticated sessions.'
const rejectionMessage =
  'Foldkit Instant rejected one invalid Message proposal.'
const pollIntervalMs = 100
const processExitTimeoutMs = 5_000
const readinessTimeoutMs = 60_000
const synchronizationTimeoutMs = 30_000

class LiveAcceptanceError extends Error {}

class AcceptanceProgress {
  #stage = 'initialization'

  advance(stage: string): void {
    this.#stage = stage
  }

  get stage(): string {
    return this.#stage
  }
}

class CapturedProcess {
  readonly child: ChildProcessWithoutNullStreams
  #stderr = ''
  #stdout = ''

  constructor(child: ChildProcessWithoutNullStreams) {
    this.child = child
    child.stderr.setEncoding('utf8')
    child.stdout.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      this.#stderr += chunk
    })
    child.stdout.on('data', (chunk: string) => {
      this.#stdout += chunk
    })
  }

  clearStderr(): void {
    this.#stderr = ''
  }

  hasStderr(message: string): boolean {
    return this.#stderr.includes(message)
  }

  hasStdout(message: string): boolean {
    return this.#stdout.includes(message)
  }
}

type PageState = Readonly<{
  acceptedSequence: number
  count: number
  displayedFrame: number
  pendingProposals: number
  replayMode: 'Live' | 'Replay'
}>

type ExpectedPageState = Readonly<Partial<PageState>>

type LiveAcceptanceEvidence = Readonly<{
  acceptedEventIds: ReadonlyArray<string>
  acceptedSequences: ReadonlyArray<number>
  sequencerRestartAcceptedExactlyOnce: boolean
  sameSubjectBrowserClients: number
  clientsConverged: boolean
  claimRefreshPreservedOwnership: boolean
  claimSubjectCouldBeReassigned: boolean
  differentSubjectCouldMutate: boolean
  differentSubjectCouldRead: boolean
  malformedProposalAccepted: boolean
  malformedProposalReachedInbox: boolean
  malformedProposalResolvedDurably: boolean
  physicalDevices: number
  replayRemainedInert: boolean
  sanitizedRejectionReported: boolean
  transportRecoveryConverged: boolean
}>

const fail = (message: string): never => {
  throw new LiveAcceptanceError(message)
}

const assert = (condition: boolean, message: string): void => {
  if (!condition) {
    fail(message)
  }
}

const delay = (durationMs: number): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, durationMs)
  })

const waitFor = async (
  acceptanceProgress: AcceptanceProgress,
  description: string,
  predicate: () => boolean | Promise<boolean>,
  timeoutMs: number = synchronizationTimeoutMs,
): Promise<void> => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await predicate()) {
      return
    }
    await delay(pollIntervalMs)
  }
  fail(
    `Timed out while waiting for ${description} during ${acceptanceProgress.stage}.`,
  )
}

const requireEnvironment = (
  environment: NodeJS.ProcessEnv,
  variable: 'INSTANT_APP_ADMIN_TOKEN' | 'INSTANT_APP_ID',
): string => {
  const value = environment[variable]
  if (value === undefined || value.length === 0) {
    return fail(
      `${variable} is required. Run acceptance through the foldkit-instant-demo credential wrapper.`,
    )
  }
  return value
}

const makeChildBaseEnvironment = (): NodeJS.ProcessEnv => {
  const environment: NodeJS.ProcessEnv = {}
  const home = process.env['HOME']
  const path = process.env['PATH']
  const temporaryDirectory = process.env['TMPDIR']
  if (home !== undefined) {
    environment['HOME'] = home
  }
  if (path !== undefined) {
    environment['PATH'] = path
  }
  if (temporaryDirectory !== undefined) {
    environment['TMPDIR'] = temporaryDirectory
  }
  return environment
}

const startCapturedProcess = (
  command: string,
  args: ReadonlyArray<string>,
  options: Readonly<{
    cwd: string
    environment: NodeJS.ProcessEnv
  }>,
): CapturedProcess =>
  new CapturedProcess(
    spawn(command, args, {
      cwd: options.cwd,
      detached: true,
      env: options.environment,
      stdio: ['pipe', 'pipe', 'pipe'],
    }),
  )

const waitForProcessExit = (child: ChildProcess): Promise<void> => {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve()
  }
  return new Promise(resolve => {
    child.once('exit', () => resolve())
  })
}

const signalProcessGroup = (
  child: ChildProcess,
  signal: NodeJS.Signals,
): void => {
  const processId = child.pid
  if (processId === undefined || child.exitCode !== null) {
    return
  }
  try {
    process.kill(-processId, signal)
  } catch {
    return
  }
}

const stopProcess = async (
  processToStop: CapturedProcess | undefined,
): Promise<void> => {
  if (processToStop === undefined) {
    return
  }
  const child = processToStop.child
  if (child.exitCode !== null || child.signalCode !== null) {
    return
  }
  signalProcessGroup(child, 'SIGTERM')
  const didExit = await Promise.race([
    waitForProcessExit(child).then(() => true),
    delay(processExitTimeoutMs).then(() => false),
  ])
  if (!didExit) {
    signalProcessGroup(child, 'SIGKILL')
    await waitForProcessExit(child)
  }
}

const readPageState = async (page: Page): Promise<PageState> => {
  const root = page.locator('main.program-shell')
  const count = page.locator('[data-counter-count]')
  const [
    acceptedSequence,
    displayedFrame,
    pendingProposals,
    replayMode,
    value,
  ] = await Promise.all([
    root.getAttribute('data-accepted-sequence'),
    root.getAttribute('data-displayed-frame'),
    root.getAttribute('data-pending-proposals'),
    root.getAttribute('data-replay-mode'),
    count.getAttribute('data-counter-count'),
  ])
  if (
    acceptedSequence === null ||
    displayedFrame === null ||
    pendingProposals === null ||
    replayMode === null ||
    value === null
  ) {
    return fail('A browser Client did not expose its accepted Model state.')
  }
  if (replayMode !== 'Live' && replayMode !== 'Replay') {
    return fail('A browser Client exposed an invalid replay mode.')
  }
  return {
    acceptedSequence: Number(acceptedSequence),
    count: Number(value),
    displayedFrame: Number(displayedFrame),
    pendingProposals: Number(pendingProposals),
    replayMode,
  }
}

const matchesPageState = (
  state: PageState,
  expected: ExpectedPageState,
): boolean =>
  (expected.acceptedSequence === undefined ||
    state.acceptedSequence === expected.acceptedSequence) &&
  (expected.count === undefined || state.count === expected.count) &&
  (expected.displayedFrame === undefined ||
    state.displayedFrame === expected.displayedFrame) &&
  (expected.pendingProposals === undefined ||
    state.pendingProposals === expected.pendingProposals) &&
  (expected.replayMode === undefined ||
    state.replayMode === expected.replayMode)

const waitForPageState = (
  acceptanceProgress: AcceptanceProgress,
  page: Page,
  expected: ExpectedPageState,
): Promise<void> =>
  waitFor(acceptanceProgress, 'a browser Client Model state', async () => {
    try {
      return matchesPageState(await readPageState(page), expected)
    } catch {
      return false
    }
  })

const authenticatePage = async (
  acceptanceProgress: AcceptanceProgress,
  database: InstantAdminDatabase<typeof schema>,
  context: BrowserContext,
  email: string,
): Promise<Page> => {
  const page = await context.newPage()
  acceptanceProgress.advance('browser authentication page load')
  await page.goto(acceptanceOrigin)
  await page.locator('#email-form').waitFor()
  acceptanceProgress.advance('ephemeral magic-code generation')
  const { code } = await database.auth.generateMagicCode(email)
  acceptanceProgress.advance('browser magic-code verification')
  await page.evaluate(
    async authentication => {
      const databaseModulePath = '/src/client/database.ts'
      const authenticationModulePath = '/src/client/auth.ts'
      const databaseModule = await import(databaseModulePath)
      const authenticationModule = await import(authenticationModulePath)
      await authenticationModule.signInWithMagicCode(
        databaseModule.makeBrowserDatabase(),
        authentication.email,
        authentication.code,
      )
    },
    { code, email },
  )
  acceptanceProgress.advance('authenticated browser Program startup')
  try {
    await waitFor(
      acceptanceProgress,
      'the authenticated browser Program to start',
      async () =>
        (await page.locator('h1').textContent()) === 'Instant counter',
      synchronizationTimeoutMs,
    )
  } catch {
    const heading =
      (await page.locator('h1').textContent()) ?? 'Missing heading'
    const notice =
      (await page.locator('[role="status"]').textContent()) ??
      'No status notice'
    const user = await database.auth.getUser({ email })
    const claimTransaction =
      user === null
        ? 'No authenticated subject'
        : await page.evaluate(
            async input => {
              const databaseModulePath = '/src/client/database.ts'
              const sessionClaimModulePath = '/src/shared/sessionClaim.ts'
              const databaseModule = await import(databaseModulePath)
              const sessionClaimModule = await import(sessionClaimModulePath)
              const browserDatabase = databaseModule.makeBrowserDatabase()
              try {
                const result = await browserDatabase.transact(
                  sessionClaimModule.makeSessionClaimTransaction(
                    browserDatabase.tx,
                    input.subjectId,
                    Date.now(),
                  ),
                )
                return `Succeeded:${result.status}`
              } catch (error) {
                if (
                  typeof error === 'object' &&
                  error !== null &&
                  'body' in error &&
                  typeof error.body === 'object' &&
                  error.body !== null &&
                  'type' in error.body &&
                  typeof error.body.type === 'string'
                ) {
                  return `Failed:${error.body.type}`
                }
                if (error instanceof Error) {
                  const sanitizedMessage = error.message
                    .replaceAll(
                      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
                      '[identifier]',
                    )
                    .replaceAll(
                      /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi,
                      '[email]',
                    )
                    .replaceAll(/[a-z0-9_-]{32,}/gi, '[opaque]')
                    .slice(0, 240)
                  return `Failed:${error.name}:${sanitizedMessage}`
                }
                if (
                  typeof error === 'object' &&
                  error !== null &&
                  'name' in error &&
                  typeof error.name === 'string' &&
                  'hint' in error &&
                  typeof error.hint === 'string'
                ) {
                  const sanitizedHint = error.hint
                    .replaceAll(
                      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
                      '[identifier]',
                    )
                    .replaceAll(
                      /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi,
                      '[email]',
                    )
                    .slice(0, 240)
                  return `Failed:${error.name}:${sanitizedHint}`
                }
                const errorName =
                  error instanceof Error ? error.name : typeof error
                const keys =
                  typeof error === 'object' && error !== null
                    ? Object.keys(error).sort().join(',')
                    : 'No keys'
                return `Failed:${errorName}:${keys}`
              }
            },
            { subjectId: user.id },
          )
    const materialization =
      user === null
        ? { claims: 0, sessions: 0 }
        : await database
            .query({
              foldkitProgramSessions: {
                $: { where: { subjectId: user.id } },
              },
              instantCounterSessionClaims: {
                $: { where: { subjectId: user.id } },
              },
            })
            .then(result => ({
              claims: result.instantCounterSessionClaims.length,
              sessions: result.foldkitProgramSessions.length,
            }))
    return fail(
      `The authenticated browser Program remained at "${heading}" with "${notice}". Claim transaction: ${claimTransaction}; materialized claims: ${materialization.claims.toString()}; sessions: ${materialization.sessions.toString()}.`,
    )
  }
  acceptanceProgress.advance('initial authenticated browser Model')
  await waitForPageState(acceptanceProgress, page, {
    acceptedSequence: 0,
    count: 0,
    displayedFrame: 0,
    pendingProposals: 0,
    replayMode: 'Live',
  })
  return page
}

const decodeProposal = (record: {
  causationOccurrenceId?: string
  correlationId?: string
  effectAssignmentGeneration?: number
  effectCancellationGeneration?: number
  effectIdempotencyKey?: string
  effectRequestId?: string
  executorProcessorId?: string
}): InstantMessageProposalRecordType =>
  S.decodeUnknownSync(InstantMessageProposalRecord)({
    ...record,
    causationOccurrenceId: record.causationOccurrenceId ?? null,
    correlationId: record.correlationId ?? null,
    effectAssignmentGeneration: record.effectAssignmentGeneration ?? null,
    effectCancellationGeneration: record.effectCancellationGeneration ?? null,
    effectIdempotencyKey: record.effectIdempotencyKey ?? null,
    effectRequestId: record.effectRequestId ?? null,
    executorProcessorId: record.executorProcessorId ?? null,
  })

const runBrowserProbe = async (
  page: Page,
  request: PublicClientRequest,
): Promise<PublicClientResponseType> => {
  const encodedRequest = S.encodeSync(PublicClientRequestSchema)(request)
  const response = await page.evaluate(async input => {
    const browserProbeModulePath = '/src/acceptance/browserProbe.ts'
    const browserProbeModule = await import(browserProbeModulePath)
    return browserProbeModule.runBrowserProbe(input)
  }, encodedRequest)
  return S.decodeUnknownSync(PublicClientResponse, {
    onExcessProperty: 'error',
  })(response)
}

const queryProposalState = async (
  database: InstantAdminDatabase<typeof schema>,
  proposalId: string,
) =>
  database.query({
    foldkitAcceptedMessageOccurrences: {
      $: { where: { proposalId } },
    },
    foldkitMessageProposals: {
      $: { where: { proposalId } },
    },
    foldkitMessageProposalResolutions: {
      $: { where: { proposalId } },
    },
  })

const querySubjectState = async (
  database: InstantAdminDatabase<typeof schema>,
  subjectId: string,
) =>
  database.query({
    foldkitAcceptedMessageOccurrences: {
      $: {
        order: { acceptedSequence: 'asc' },
        where: { subjectId },
      },
    },
    foldkitMessageProposals: {
      $: {
        order: { createdAtMs: 'asc' },
        where: { subjectId },
      },
    },
    foldkitMessageProposalResolutions: {
      $: {
        order: { rejectedAtMs: 'asc' },
        where: { subjectId },
      },
    },
    foldkitProgramSessions: {
      $: { where: { subjectId } },
    },
  })

const queryClaimState = async (
  database: InstantAdminDatabase<typeof schema>,
  subjectId: string,
) =>
  database.query({
    instantCounterSessionClaims: {
      $: { where: { subjectId } },
    },
  })

const deleteSubjectData = async (
  database: InstantAdminDatabase<typeof schema>,
  subjectId: string,
): Promise<void> => {
  const records = await database.query({
    foldkitAcceptedMessageOccurrences: { $: { where: { subjectId } } },
    foldkitEffectPlacements: { $: { where: { subjectId } } },
    foldkitEffectRequests: { $: { where: { subjectId } } },
    foldkitMessageProposals: { $: { where: { subjectId } } },
    foldkitMessageProposalResolutions: { $: { where: { subjectId } } },
    foldkitProgramSessions: { $: { where: { subjectId } } },
    foldkitProjectionCheckpoints: { $: { where: { subjectId } } },
    instantCounterSessionClaims: { $: { where: { subjectId } } },
  })
  const transactions = [
    ...Array.map(records.foldkitAcceptedMessageOccurrences, record => {
      const entity = database.tx.foldkitAcceptedMessageOccurrences[record.id]
      if (entity === undefined) {
        return fail('An accepted Message cleanup transaction was unavailable.')
      }
      return entity.delete()
    }),
    ...Array.map(records.foldkitEffectPlacements, record => {
      const entity = database.tx.foldkitEffectPlacements[record.id]
      if (entity === undefined) {
        return fail('An effect placement cleanup transaction was unavailable.')
      }
      return entity.delete()
    }),
    ...Array.map(records.foldkitEffectRequests, record => {
      const entity = database.tx.foldkitEffectRequests[record.id]
      if (entity === undefined) {
        return fail('An effect request cleanup transaction was unavailable.')
      }
      return entity.delete()
    }),
    ...Array.map(records.foldkitMessageProposals, record => {
      const entity = database.tx.foldkitMessageProposals[record.id]
      if (entity === undefined) {
        return fail('A Message proposal cleanup transaction was unavailable.')
      }
      return entity.delete()
    }),
    ...Array.map(records.foldkitMessageProposalResolutions, record => {
      const entity = database.tx.foldkitMessageProposalResolutions[record.id]
      if (entity === undefined) {
        return fail(
          'A Message proposal resolution cleanup transaction was unavailable.',
        )
      }
      return entity.delete()
    }),
    ...Array.map(records.foldkitProgramSessions, record => {
      const entity = database.tx.foldkitProgramSessions[record.id]
      if (entity === undefined) {
        return fail('A Program session cleanup transaction was unavailable.')
      }
      return entity.delete()
    }),
    ...Array.map(records.foldkitProjectionCheckpoints, record => {
      const entity = database.tx.foldkitProjectionCheckpoints[record.id]
      if (entity === undefined) {
        return fail('A projection cleanup transaction was unavailable.')
      }
      return entity.delete()
    }),
    ...Array.map(records.instantCounterSessionClaims, record => {
      const entity = database.tx.instantCounterSessionClaims[record.id]
      if (entity === undefined) {
        return fail('A session claim cleanup transaction was unavailable.')
      }
      return entity.delete()
    }),
  ]
  if (Option.isSome(Array.head(transactions))) {
    await database.transact(transactions)
  }
}

const deleteSyntheticUser = async (
  database: InstantAdminDatabase<typeof schema>,
  email: string,
): Promise<void> => {
  const user = await database.auth.getUser({ email })
  if (user !== null) {
    await deleteSubjectData(database, user.id)
    await database.auth.deleteUser({ id: user.id })
  }
}

const ensureSyntheticUser = async (
  database: InstantAdminDatabase<typeof schema>,
  email: string,
) => {
  await database.auth.createToken({ email })
  const user = await database.auth.getUser({ email })
  if (user === null) {
    return fail('Instant did not prepare one synthetic acceptance subject.')
  }
  return user
}

const assertSequence = (
  accepted: ReadonlyArray<{ acceptedSequence: number }>,
): void => {
  const expected = Array.range(1, accepted.length)
  assert(
    Array.every(
      Array.zip(accepted, expected),
      ([occurrence, sequence]) => occurrence.acceptedSequence === sequence,
    ),
    'Accepted Message occurrence sequence was not contiguous and unique.',
  )
}

const runAcceptance = async (): Promise<LiveAcceptanceEvidence> => {
  const acceptanceProgress = new AcceptanceProgress()
  const appId = requireEnvironment(process.env, 'INSTANT_APP_ID')
  const adminToken = requireEnvironment(process.env, 'INSTANT_APP_ADMIN_TOKEN')
  const exampleDirectory = fileURLToPath(new URL('../..', import.meta.url))
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), 'foldkit-instant-counter-acceptance-'),
  )
  const statePath = join(temporaryDirectory, 'headless-state.json')
  const runIdentity = randomUUID().replaceAll('-', '')
  const primaryEmail = `foldkit-counter-primary-${runIdentity}@example.com`
  const otherEmail = `foldkit-counter-other-${runIdentity}@example.com`
  const forbiddenClaimSubjectId = `forbidden-${runIdentity}`
  const database = initAdmin({ adminToken, appId, schema })
  let browser: Browser | undefined
  let headless: CapturedProcess | undefined
  let vite: CapturedProcess | undefined
  let primaryContext: BrowserContext | undefined
  let otherContext: BrowserContext | undefined
  let isolationContext: BrowserContext | undefined

  const startHeadless = async (
    selectedSubjectIds: ReadonlyArray<string>,
  ): Promise<CapturedProcess> => {
    const processEnvironment = {
      ...makeChildBaseEnvironment(),
      FOLDKIT_INSTANT_COUNTER_HEADLESS_STATE_PATH: statePath,
      FOLDKIT_INSTANT_COUNTER_SUBJECT_ALLOWLIST:
        JSON.stringify(selectedSubjectIds),
      INSTANT_APP_ADMIN_TOKEN: adminToken,
      INSTANT_APP_ID: appId,
    }
    const captured = startCapturedProcess('pnpm', ['headless'], {
      cwd: exampleDirectory,
      environment: processEnvironment,
    })
    try {
      await waitFor(
        acceptanceProgress,
        'the headless admission sequencer process to start',
        () =>
          captured.child.exitCode === null &&
          captured.hasStdout(sequencerReadyMessage),
        readinessTimeoutMs,
      )
      return captured
    } catch (error) {
      await stopProcess(captured)
      throw error
    }
  }

  try {
    acceptanceProgress.advance('synthetic acceptance subject preparation')
    const primaryUser = await ensureSyntheticUser(database, primaryEmail)
    const otherUser = await ensureSyntheticUser(database, otherEmail)
    const selectedSubjectIds = [primaryUser.id, otherUser.id]
    acceptanceProgress.advance('headless admission sequencer startup')
    headless = await startHeadless(selectedSubjectIds)
    acceptanceProgress.advance('browser Client origin startup')
    vite = startCapturedProcess(
      join(exampleDirectory, 'scripts', 'with-public-instant-env'),
      [
        'pnpm',
        'dev',
        '--',
        '--host',
        'localhost',
        '--port',
        '5173',
        '--strictPort',
      ],
      {
        cwd: exampleDirectory,
        environment: {
          ...makeChildBaseEnvironment(),
          VITE_INSTANT_APP_ID: appId,
        },
      },
    )
    await waitFor(
      acceptanceProgress,
      'the localhost browser Client origin',
      async () => {
        if (vite?.child.exitCode !== null) {
          return false
        }
        try {
          const response = await fetch(acceptanceOrigin)
          return response.ok
        } catch {
          return false
        }
      },
      readinessTimeoutMs,
    )

    acceptanceProgress.advance('Chrome launch')
    browser = await chromium.launch({ channel: 'chrome', headless: true })
    primaryContext = await browser.newContext()
    otherContext = await browser.newContext()
    acceptanceProgress.advance('first browser authentication')
    const primaryPage = await authenticatePage(
      acceptanceProgress,
      database,
      primaryContext,
      primaryEmail,
    )
    acceptanceProgress.advance('second browser authentication')
    const otherPage = await authenticatePage(
      acceptanceProgress,
      database,
      otherContext,
      primaryEmail,
    )
    acceptanceProgress.advance('session-claim permission boundary')
    const originalClaimState = await queryClaimState(database, primaryUser.id)
    const maybeOriginalClaim = Array.head(
      originalClaimState.instantCounterSessionClaims,
    )
    if (Option.isNone(maybeOriginalClaim)) {
      return fail('The authenticated session claim was unavailable.')
    }
    assert(
      originalClaimState.instantCounterSessionClaims.length === 1,
      'The authenticated subject had more than one session claim.',
    )
    const originalClaim = maybeOriginalClaim.value
    const refreshedClaimedAtMs = Math.max(
      Date.now(),
      originalClaim.claimedAtMs + 1,
    )
    const claimIsolationResponse = await runBrowserProbe(
      primaryPage,
      CheckClaimIsolationRequest.make({
        claimId: originalClaim.id,
        expectedSubjectId: primaryUser.id,
        forbiddenSubjectId: forbiddenClaimSubjectId,
        refreshedClaimedAtMs,
      }),
    )
    assert(
      claimIsolationResponse._tag === 'CheckedClaimIsolation' &&
        claimIsolationResponse.didAuthenticateExpectedSubject &&
        claimIsolationResponse.didRefreshOwnClaim &&
        claimIsolationResponse.didRejectClaimReassignment,
      'The deployed session-claim permissions did not preserve the owner-only refresh boundary.',
    )
    await waitFor(
      acceptanceProgress,
      'the owner-only session-claim refresh',
      async () => {
        const [primaryClaimState, forbiddenClaimState] = await Promise.all([
          queryClaimState(database, primaryUser.id),
          queryClaimState(database, forbiddenClaimSubjectId),
        ])
        const maybeRefreshedClaim = Array.head(
          primaryClaimState.instantCounterSessionClaims,
        )
        return (
          primaryClaimState.instantCounterSessionClaims.length === 1 &&
          Option.isSome(maybeRefreshedClaim) &&
          maybeRefreshedClaim.value.id === originalClaim.id &&
          maybeRefreshedClaim.value.subjectId === primaryUser.id &&
          maybeRefreshedClaim.value.claimedAtMs === refreshedClaimedAtMs &&
          Array.isReadonlyArrayEmpty(
            forbiddenClaimState.instantCounterSessionClaims,
          )
        )
      },
    )
    acceptanceProgress.advance('bidirectional accepted Message convergence')
    await primaryPage.getByRole('button', { name: 'Increment' }).click()
    await Promise.all([
      waitForPageState(acceptanceProgress, primaryPage, {
        acceptedSequence: 1,
        count: 1,
        displayedFrame: 1,
        pendingProposals: 0,
      }),
      waitForPageState(acceptanceProgress, otherPage, {
        acceptedSequence: 1,
        count: 1,
        displayedFrame: 1,
        pendingProposals: 0,
      }),
    ])

    await otherPage.getByRole('button', { name: 'Decrement' }).click()
    await Promise.all([
      waitForPageState(acceptanceProgress, primaryPage, {
        acceptedSequence: 2,
        count: 0,
        displayedFrame: 2,
      }),
      waitForPageState(acceptanceProgress, otherPage, {
        acceptedSequence: 2,
        count: 0,
        displayedFrame: 2,
      }),
    ])

    acceptanceProgress.advance('Processor disconnect and reconnect recovery')
    await primaryPage
      .getByRole('button', { name: 'Disconnect this Model' })
      .click()
    try {
      await waitFor(
        acceptanceProgress,
        'the first browser Processor to detach',
        () =>
          primaryPage.getByRole('button', { name: 'Reconnect' }).isEnabled(),
      )
    } catch {
      const isDisconnectEnabled = await primaryPage
        .getByRole('button', { name: 'Disconnect this Model' })
        .isEnabled()
      const isReconnectEnabled = await primaryPage
        .getByRole('button', { name: 'Reconnect' })
        .isEnabled()
      const notice =
        (await primaryPage.locator('[role="status"]').textContent()) ??
        'No status notice'
      return fail(
        `The disconnect control remained ${isDisconnectEnabled ? 'enabled' : 'disabled'}, reconnect remained ${isReconnectEnabled ? 'enabled' : 'disabled'}, and the Client reported "${notice}".`,
      )
    }
    await otherPage.getByRole('button', { name: 'Increment' }).click()
    await waitForPageState(acceptanceProgress, otherPage, {
      acceptedSequence: 3,
      count: 1,
      displayedFrame: 3,
    })
    await waitForPageState(acceptanceProgress, primaryPage, {
      acceptedSequence: 2,
      count: 0,
      displayedFrame: 2,
    })
    await primaryPage.getByRole('button', { name: 'Reconnect' }).click()
    await waitForPageState(acceptanceProgress, primaryPage, {
      acceptedSequence: 3,
      count: 1,
      displayedFrame: 3,
    })

    acceptanceProgress.advance('admission sequencer stop and restart recovery')
    const beforeAuthorityStop = await querySubjectState(
      database,
      primaryUser.id,
    )
    assert(
      beforeAuthorityStop.foldkitAcceptedMessageOccurrences.length === 3,
      'The first three valid Messages were not accepted exactly once.',
    )
    await stopProcess(headless)
    headless = undefined
    await primaryPage.getByRole('button', { name: 'Increment' }).click()
    await waitForPageState(acceptanceProgress, primaryPage, {
      acceptedSequence: 3,
      count: 2,
      displayedFrame: 3,
      pendingProposals: 1,
    })
    await waitForPageState(acceptanceProgress, otherPage, {
      acceptedSequence: 3,
      count: 1,
      displayedFrame: 3,
      pendingProposals: 0,
    })
    await waitFor(
      acceptanceProgress,
      'the admission-sequencer-stopped proposal to reach the raw inbox',
      async () => {
        const subjectState = await querySubjectState(database, primaryUser.id)
        return (
          subjectState.foldkitAcceptedMessageOccurrences.length === 3 &&
          subjectState.foldkitMessageProposals.length === 4
        )
      },
    )
    const whileAuthorityStopped = await querySubjectState(
      database,
      primaryUser.id,
    )
    const previousProposalIds = new Set(
      Array.map(
        beforeAuthorityStop.foldkitMessageProposals,
        proposal => proposal.proposalId,
      ),
    )
    const maybePendingProposal = Array.findFirst(
      whileAuthorityStopped.foldkitMessageProposals,
      proposal => !previousProposalIds.has(proposal.proposalId),
    )
    if (Option.isNone(maybePendingProposal)) {
      return fail(
        'The admission-sequencer-stopped proposal could not be identified.',
      )
    }
    const stoppedAuthorityProposalId = maybePendingProposal.value.proposalId
    headless = await startHeadless(selectedSubjectIds)
    await Promise.all([
      waitForPageState(acceptanceProgress, primaryPage, {
        acceptedSequence: 4,
        count: 2,
        displayedFrame: 4,
        pendingProposals: 0,
      }),
      waitForPageState(acceptanceProgress, otherPage, {
        acceptedSequence: 4,
        count: 2,
        displayedFrame: 4,
      }),
    ])
    const restartedProposalState = await queryProposalState(
      database,
      stoppedAuthorityProposalId,
    )
    const sequencerRestartAcceptedExactlyOnce =
      restartedProposalState.foldkitAcceptedMessageOccurrences.length === 1
    assert(
      sequencerRestartAcceptedExactlyOnce,
      'The admission sequencer restart did not accept the pending proposal exactly once.',
    )

    acceptanceProgress.advance('malformed proposal rejection')
    const postRestartAuthorityProcessId = headless.child.pid
    const subjectStateBeforeMalformed = await querySubjectState(
      database,
      primaryUser.id,
    )
    const maybeBaseProposal = Array.last(
      subjectStateBeforeMalformed.foldkitMessageProposals,
    )
    if (Option.isNone(maybeBaseProposal)) {
      return fail('A valid proposal was unavailable for the rejection probe.')
    }
    const baseProposal = decodeProposal(maybeBaseProposal.value)
    const malformedId = randomUUID()
    const malformedProposal = InstantMessageProposalRecord.make({
      ...baseProposal,
      actorSequence: baseProposal.actorSequence + 1_000_000,
      createdAtMs: Date.now(),
      id: malformedId,
      occurrenceId: malformedId,
      payloadJson: '{',
      proposalId: malformedId,
    })
    headless.clearStderr()
    const malformedResponse = await runBrowserProbe(
      primaryPage,
      SubmitProposalRequest.make({
        expectedSubjectId: primaryUser.id,
        proposal: malformedProposal,
      }),
    )
    assert(
      malformedResponse._tag === 'SubmittedProposal' &&
        malformedResponse.didAuthenticateExpectedSubject &&
        malformedResponse.didSubmitProposal,
      'The authenticated public Client could not submit the malformed proposal.',
    )
    await waitFor(
      acceptanceProgress,
      'the malformed proposal in the raw inbox',
      async () => {
        const state = await queryProposalState(database, malformedId)
        return state.foldkitMessageProposals.length === 1
      },
    )
    await waitFor(
      acceptanceProgress,
      'the sanitized admission rejection',
      () => headless?.hasStderr(rejectionMessage) ?? false,
    )
    await waitFor(
      acceptanceProgress,
      'the durable malformed proposal resolution',
      async () => {
        const state = await queryProposalState(database, malformedId)
        return state.foldkitMessageProposalResolutions.length === 1
      },
    )
    const malformedState = await queryProposalState(database, malformedId)
    const malformedProposalReachedInbox =
      malformedState.foldkitMessageProposals.length === 1
    const malformedProposalAccepted =
      malformedState.foldkitAcceptedMessageOccurrences.length !== 0
    const maybeMalformedResolution = Array.head(
      malformedState.foldkitMessageProposalResolutions,
    )
    const malformedProposalResolvedDurably =
      malformedState.foldkitMessageProposalResolutions.length === 1 &&
      Option.isSome(maybeMalformedResolution) &&
      maybeMalformedResolution.value.rejectionReason === 'EnvelopeInvalid'
    assert(
      malformedProposalReachedInbox &&
        !malformedProposalAccepted &&
        malformedProposalResolvedDurably,
      'The malformed proposal crossed the accepted Message boundary.',
    )
    await Promise.all([
      waitForPageState(acceptanceProgress, primaryPage, {
        acceptedSequence: 4,
        count: 2,
        displayedFrame: 4,
        pendingProposals: 0,
      }),
      waitForPageState(acceptanceProgress, otherPage, {
        acceptedSequence: 4,
        count: 2,
        displayedFrame: 4,
        pendingProposals: 0,
      }),
    ])
    await otherPage.getByRole('button', { name: 'Decrement' }).click()
    await Promise.all([
      waitForPageState(acceptanceProgress, primaryPage, {
        acceptedSequence: 5,
        count: 1,
        displayedFrame: 5,
      }),
      waitForPageState(acceptanceProgress, otherPage, {
        acceptedSequence: 5,
        count: 1,
        displayedFrame: 5,
      }),
    ])
    assert(
      headless.child.pid === postRestartAuthorityProcessId &&
        headless.child.exitCode === null,
      'The malformed proposal terminated or replaced the live admission sequencer process.',
    )

    acceptanceProgress.advance('inert replay inspection')
    await primaryPage.getByRole('button', { name: 'Previous' }).click()
    await waitForPageState(acceptanceProgress, primaryPage, {
      acceptedSequence: 5,
      count: 2,
      displayedFrame: 4,
      replayMode: 'Replay',
    })
    await otherPage.getByRole('button', { name: 'Decrement' }).click()
    await Promise.all([
      waitForPageState(acceptanceProgress, primaryPage, {
        acceptedSequence: 6,
        count: 2,
        displayedFrame: 4,
        replayMode: 'Replay',
      }),
      waitForPageState(acceptanceProgress, otherPage, {
        acceptedSequence: 6,
        count: 0,
        displayedFrame: 6,
        replayMode: 'Live',
      }),
    ])
    await primaryPage.getByRole('button', { name: 'Return live' }).click()
    await waitForPageState(acceptanceProgress, primaryPage, {
      acceptedSequence: 6,
      count: 0,
      displayedFrame: 6,
      replayMode: 'Live',
    })

    acceptanceProgress.advance('different-subject isolation')
    isolationContext = await browser.newContext()
    const isolationPage = await authenticatePage(
      acceptanceProgress,
      database,
      isolationContext,
      otherEmail,
    )
    const finalSubjectState = await querySubjectState(database, primaryUser.id)
    const maybeSession = Array.head(finalSubjectState.foldkitProgramSessions)
    if (Option.isNone(maybeSession)) {
      return fail('The authenticated Program session was not materialized.')
    }
    const foreignProposalId = randomUUID()
    const foreignProposal = InstantMessageProposalRecord.make({
      ...baseProposal,
      actorId: otherUser.id,
      createdAtMs: Date.now(),
      id: foreignProposalId,
      occurrenceId: foreignProposalId,
      proposalId: foreignProposalId,
      sessionId: maybeSession.value.sessionId,
      subjectId: primaryUser.id,
    })
    const isolationResponse = await runBrowserProbe(
      isolationPage,
      CheckForeignIsolationRequest.make({
        expectedSubjectId: otherUser.id,
        foreignSessionId: maybeSession.value.sessionId,
        foreignSubjectId: primaryUser.id,
        proposal: foreignProposal,
      }),
    )
    assert(
      isolationResponse._tag === 'CheckedForeignIsolation' &&
        isolationResponse.didAuthenticateExpectedSubject &&
        isolationResponse.foundNoForeignProgramSessions &&
        isolationResponse.foundNoForeignAcceptedOccurrences &&
        isolationResponse.didRejectForeignProposal &&
        isolationResponse.failureStage === 'None',
      isolationResponse._tag === 'CheckedForeignIsolation'
        ? `A different authenticated subject crossed the private Program boundary (probe stage: ${isolationResponse.failureStage}, authenticated: ${isolationResponse.didAuthenticateExpectedSubject.toString()}, sessions hidden: ${isolationResponse.foundNoForeignProgramSessions.toString()}, accepted tape hidden: ${isolationResponse.foundNoForeignAcceptedOccurrences.toString()}, mutation rejected: ${isolationResponse.didRejectForeignProposal.toString()}).`
        : 'The different-subject browser probe returned the wrong result kind.',
    )
    await delay(2_000)
    const foreignMutationState = await queryProposalState(
      database,
      foreignProposalId,
    )
    assert(
      foreignMutationState.foldkitMessageProposals.length === 0 &&
        foreignMutationState.foldkitAcceptedMessageOccurrences.length === 0,
      'A foreign-subject mutation reached the private Program data.',
    )

    acceptanceProgress.advance('final accepted tape verification')
    const accepted = finalSubjectState.foldkitAcceptedMessageOccurrences
    assert(
      accepted.length === 6,
      'The final accepted tape had an unexpected size.',
    )
    assertSequence(accepted)
    const acceptedEventIds = Array.map(
      accepted,
      occurrence => occurrence.eventId,
    )
    const acceptedSequences = Array.map(
      accepted,
      occurrence => occurrence.acceptedSequence,
    )
    return {
      acceptedEventIds,
      acceptedSequences,
      sequencerRestartAcceptedExactlyOnce,
      claimRefreshPreservedOwnership: true,
      claimSubjectCouldBeReassigned: false,
      clientsConverged: true,
      differentSubjectCouldMutate: false,
      differentSubjectCouldRead: false,
      malformedProposalAccepted,
      malformedProposalReachedInbox,
      malformedProposalResolvedDurably,
      physicalDevices: 0,
      replayRemainedInert: true,
      sameSubjectBrowserClients: 2,
      sanitizedRejectionReported: true,
      transportRecoveryConverged: true,
    }
  } catch (error) {
    if (error instanceof LiveAcceptanceError) {
      throw error
    }
    return fail(
      `Live acceptance stopped after a sanitized unexpected error during ${acceptanceProgress.stage}.`,
    )
  } finally {
    const browserContextCleanup = await Promise.allSettled([
      primaryContext?.close() ?? Promise.resolve(),
      otherContext?.close() ?? Promise.resolve(),
      isolationContext?.close() ?? Promise.resolve(),
    ])
    const processCleanup = await Promise.allSettled([
      browser?.close() ?? Promise.resolve(),
      stopProcess(vite),
      stopProcess(headless),
    ])
    const fixtureCleanup = await Promise.allSettled([
      deleteSyntheticUser(database, primaryEmail),
      deleteSyntheticUser(database, otherEmail),
      deleteSubjectData(database, forbiddenClaimSubjectId),
    ])
    const directoryCleanup = await Promise.allSettled([
      rm(temporaryDirectory, { force: true, recursive: true }),
    ])
    const cleanupResults = [
      ...browserContextCleanup,
      ...processCleanup,
      ...fixtureCleanup,
      ...directoryCleanup,
    ]
    if (Array.some(cleanupResults, result => result.status === 'rejected')) {
      fail('Live acceptance cleanup did not remove every synthetic fixture.')
    }
  }
}

void runAcceptance()
  .then(evidence => {
    process.stdout.write(
      `${JSON.stringify(
        {
          ...evidence,
          authentication: 'Instant email magic code',
          testFixturesRemoved: true,
          verifiedOrigin: acceptanceOrigin,
        },
        null,
        2,
      )}\n`,
    )
  })
  .catch(error => {
    const message =
      error instanceof LiveAcceptanceError
        ? error.message
        : 'Live acceptance stopped after a sanitized unexpected error.'
    process.stderr.write(`${message}\n`)
    process.exitCode = 1
  })
