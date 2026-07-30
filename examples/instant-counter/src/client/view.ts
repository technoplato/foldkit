import { Array, Match as M, Option, Schema as S } from 'effect'
import { Processor } from 'foldkit'

import type { SharedProgramProcessorSnapshot } from '@foldkit/instant'
import type { ConnectionStatus } from '@instantdb/core'

import { effectIdForKind, requiredCapabilityForKind } from '../domain/effect.js'
import {
  EffectRequestKind,
  type EffectRequestKind as EffectRequestKindType,
} from '../domain/message.js'
import type { Model } from '../domain/model.js'
import type { Authentication } from './auth.js'

/** User interactions emitted by the browser renderer. */
export type BrowserViewActions = Readonly<{
  changeEmail: () => void
  connect: () => void
  decrementCounter: () => void
  disconnect: () => void
  incrementCounter: () => void
  inspectReplay: (frame: number) => void
  proposeEffect: (kind: EffectRequestKindType) => void
  resetCounter: () => void
  returnLive: () => void
  sendMagicCode: (email: string) => void
  signInWithGoogle: () => void
  signInWithMagicCode: (email: string, code: string) => void
  signOut: () => void
}>

/** The complete token-redacted browser rendering input. */
export type BrowserViewInput = Readonly<{
  authentication: Authentication
  connectionStatus: ConnectionStatus
  localDescriptor: Processor.Descriptor | null
  maybeNotice: Option.Option<string>
  maybeSentEmail: Option.Option<string>
  presence: ReadonlyArray<Processor.Descriptor>
  snapshot: SharedProgramProcessorSnapshot<Model> | null
}>

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')

const connectionLabel = (status: ConnectionStatus): string =>
  M.value(status).pipe(
    M.withReturnType<string>(),
    M.when('connecting', () => 'Connecting'),
    M.when('opened', () => 'Authenticating'),
    M.when('authenticated', () => 'Live'),
    M.when('closed', () => 'Offline'),
    M.when('errored', () => 'Connection error'),
    M.exhaustive,
  )

const capabilityLabel = (capability: Processor.Capability): string =>
  Array.join(capability.id, ' / ')

const supportsCapability = (
  descriptor: Processor.Descriptor,
  requirement: Processor.CapabilityId,
): boolean => {
  const equivalent = S.toEquivalence(Processor.CapabilityId)
  return Array.some(
    descriptor.capabilities,
    capability =>
      equivalent(capability.id, requirement) && capability.version >= 1,
  )
}

const effectAvailability = (
  kind: EffectRequestKindType,
  isLocalExecutorAvailable: boolean,
  localDescriptor: Processor.Descriptor,
  presence: ReadonlyArray<Processor.Descriptor>,
): Readonly<{ className: string; label: string }> => {
  const requirement = requiredCapabilityForKind(kind)
  const supportsEffect = (descriptor: Processor.Descriptor): boolean =>
    supportsCapability(descriptor, requirement) &&
    Processor.supportsEffectVersion(descriptor, effectIdForKind(kind), 1)
  if (isLocalExecutorAvailable && supportsEffect(localDescriptor)) {
    return { className: 'local', label: 'Runs here' }
  }
  const maybeRemote = Array.findFirst(presence, supportsEffect)
  if (Option.isSome(maybeRemote)) {
    return {
      className: 'remote',
      label: `${maybeRemote.value.processorId} will handle this`,
    }
  }
  return {
    className: 'waiting',
    label: 'Waits for a capable Processor',
  }
}

const effectLabel = (kind: EffectRequestKindType): string =>
  M.value(kind).pipe(
    M.withReturnType<string>(),
    M.when('Vibration', () => 'Vibrate device'),
    M.when('CameraCapture', () => 'Probe camera'),
    M.when('DeviceTimer', () => 'Run device timer'),
    M.when('BackgroundTimer', () => 'Run background timer'),
    M.when('AudioTranscription', () => 'Transcribe audio'),
    M.when('SpeakerDiarization', () => 'Identify speakers'),
    M.when('MusicIdentification', () => 'Identify music'),
    M.when('LyricsResolution', () => 'Resolve lyrics'),
    M.when('AmbientSoundRecognition', () => 'Recognize ambient sound'),
    M.when('AppleSpeechRecognition', () => 'Use Apple speech recognition'),
    M.when('AppleSoundRecognition', () => 'Use Apple sound recognition'),
    M.when('TextTranslation', () => 'Translate transcript'),
    M.when('AcousticAnalysis', () => 'Analyze acoustics'),
    M.exhaustive,
  )

const effectButton = (
  kind: EffectRequestKindType,
  isLocalExecutorAvailable: boolean,
  localDescriptor: Processor.Descriptor,
  presence: ReadonlyArray<Processor.Descriptor>,
): string => {
  const availability = effectAvailability(
    kind,
    isLocalExecutorAvailable,
    localDescriptor,
    presence,
  )
  return `
    <button class="effect-button" data-action="effect" data-kind="${kind}">
      <span>${escapeHtml(effectLabel(kind))}</span>
      <small class="${availability.className}">${escapeHtml(availability.label)}</small>
    </button>
  `
}

const effectState = (
  effect: Model['effects'][number],
  localProcessorId: string,
): string =>
  M.value(effect).pipe(
    M.withReturnType<string>(),
    M.tagsExhaustive({
      RequestedEffectState: state =>
        `<strong>${escapeHtml(effectLabel(state.kind))}</strong><span>Accepted. Choosing a Processor…</span>`,
      WaitingEffectState: state =>
        `<strong>${escapeHtml(effectLabel(state.kind))}</strong><span>This Client cannot do that here, and no capable Processor is live yet.</span>`,
      AssignedEffectState: state => {
        const message =
          state.processorId === localProcessorId
            ? 'Assigned here. This request will not be reassigned automatically.'
            : `This Client cannot do that here. ${state.processorId} has the sticky assignment.`
        return `<strong>${escapeHtml(effectLabel(state.kind))}</strong><span>${escapeHtml(message)}</span>`
      },
      SucceededEffectState: state =>
        `<strong>${escapeHtml(effectLabel(state.kind))}</strong><span>${escapeHtml(state.summary)} · ${escapeHtml(state.processorId)}</span>`,
      FailedEffectState: state => {
        const processor = Option.match(state.maybeProcessorId, {
          onNone: () => 'No Processor',
          onSome: processorId => processorId,
        })
        return `<strong>${escapeHtml(effectLabel(state.kind))}</strong><span>${escapeHtml(state.reason)} · ${escapeHtml(processor)}</span>`
      },
    }),
  )

const notice = (maybeNotice: Option.Option<string>): string =>
  Option.match(maybeNotice, {
    onNone: () => '',
    onSome: message =>
      `<p class="notice" role="status">${escapeHtml(message)}</p>`,
  })

const authenticationView = (input: BrowserViewInput): string => {
  if (input.authentication._tag === 'LoadingAuthentication') {
    return `
      <main class="auth-shell">
        <section class="auth-card">
          <p class="eyebrow">Foldkit Program | InstantDB</p>
          <h1>Restoring your session</h1>
          <p class="muted">Instant keeps authentication and the last synchronized Program tape on this device.</p>
        </section>
      </main>
    `
  }
  if (input.authentication._tag === 'FailedAuthentication') {
    return `
      <main class="auth-shell">
        <section class="auth-card">
          <p class="eyebrow">Foldkit Program | InstantDB</p>
          <h1>Authentication unavailable</h1>
          <p class="error">${escapeHtml(input.authentication.reason)}</p>
        </section>
      </main>
    `
  }
  if (input.authentication._tag === 'SignedIn') {
    return ''
  }

  const form = Option.match(input.maybeSentEmail, {
    onNone: () => `
      <form id="email-form" class="auth-form">
        <label for="email">Email</label>
        <input id="email" name="email" type="email" autocomplete="email" required placeholder="you@example.com" />
        <button type="submit" class="primary">Send magic code</button>
      </form>
    `,
    onSome: email => `
      <form id="code-form" class="auth-form">
        <p class="muted">Code sent to <strong>${escapeHtml(email)}</strong></p>
        <label for="code">Magic code</label>
        <input id="code" name="code" inputmode="numeric" autocomplete="one-time-code" required placeholder="123456" />
        <button type="submit" class="primary">Verify code</button>
        <button type="button" class="quiet" data-action="change-email">Use another email</button>
      </form>
    `,
  })

  return `
    <main class="auth-shell">
      <section class="auth-card">
        <p class="eyebrow">Foldkit Program | InstantDB</p>
        <h1>One counter, every Processor</h1>
        <p class="lede">Sign in on two devices. Actions become accepted Messages, then every Foldkit runtime reduces the same ordered tape.</p>
        ${notice(input.maybeNotice)}
        ${form}
        <div class="or"><span>or</span></div>
        <button class="google" data-action="google">Continue with Google</button>
        <p class="privacy">Authentication credentials stay inside Instant. Models, Messages, URLs, presence, and replay never receive a refresh token.</p>
      </section>
    </main>
  `
}

const processorList = (
  localDescriptor: Processor.Descriptor,
  presence: ReadonlyArray<Processor.Descriptor>,
): string => {
  const descriptors = Array.dedupeWith(
    [localDescriptor, ...presence],
    (left, right) => left.processorId === right.processorId,
  )
  return Array.join(
    Array.map(
      descriptors,
      descriptor => `
        <li>
          <div>
            <strong>${escapeHtml(descriptor.processorId)}</strong>
            <span>${descriptor.processorId === localDescriptor.processorId ? 'This Processor' : 'Live peer'}</span>
          </div>
          <p>${escapeHtml(Array.join(Array.map(descriptor.capabilities, capabilityLabel), ' · '))}</p>
        </li>
      `,
    ),
    '',
  )
}

const programView = (input: BrowserViewInput): string => {
  const descriptor = input.localDescriptor
  const snapshot = input.snapshot
  if (descriptor === null || snapshot === null) {
    return `
      <main class="loading-shell">
        <p class="eyebrow">Foldkit Program | InstantDB</p>
        <h1>Starting your Processor</h1>
        <p class="muted">Loading the cached accepted tape and joining the live Processor room.</p>
        ${notice(input.maybeNotice)}
      </main>
    `
  }
  const model = snapshot.displayedModel
  const isLive = snapshot.replayMode._tag === 'Live'
  const currentFrame = isLive
    ? snapshot.acceptedSequence
    : snapshot.replayMode.frame
  const previousFrame = Math.max(0, currentFrame - 1)
  const nextFrame = Math.min(snapshot.acceptedSequence, currentFrame + 1)
  const pending = Array.join(
    Array.map(
      snapshot.pendingProposals,
      pendingProposal =>
        `<li><strong>${escapeHtml(pendingProposal.proposal.eventId)}</strong><span>${pendingProposal.persistence}. It is not accepted yet.</span></li>`,
    ),
    '',
  )
  const effects = Array.join(
    Array.map(
      model.effects,
      effect =>
        `<li class="${effect._tag}">${effectState(effect, descriptor.processorId)}</li>`,
    ),
    '',
  )
  const effectKinds = EffectRequestKind.literals
  const connection = connectionLabel(input.connectionStatus)
  const email =
    input.authentication._tag === 'SignedIn'
      ? Option.getOrElse(input.authentication.maybeEmail, () => 'Signed in')
      : 'Signed in'

  return `
    <main class="program-shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">Foldkit Program | Accepted Messages</p>
          <h1>Instant counter</h1>
        </div>
        <div class="session-actions">
          <span class="connection ${input.connectionStatus}">${escapeHtml(connection)}</span>
          <span class="account">${escapeHtml(email)}</span>
          <button class="quiet" data-action="sign-out">Sign out</button>
        </div>
      </header>

      ${notice(input.maybeNotice)}

      <section class="counter-card">
        <div class="count">${model.counter.count.toString()}</div>
        <div class="counter-actions">
          <button data-action="decrement" aria-label="Decrement">−</button>
          <button data-action="reset">Reset</button>
          <button data-action="increment" aria-label="Increment">+</button>
        </div>
        <p>Frame ${currentFrame.toString()} of ${snapshot.acceptedSequence.toString()} · ${isLive ? 'Live accepted Model' : 'Inert historical Model'}</p>
      </section>

      <section class="replay-bar ${isLive ? '' : 'inspecting'}">
        <div>
          <strong>${isLive ? 'Live mode' : 'Replay inspection'}</strong>
          <span>${isLive ? 'New accepted Messages update the screen.' : 'Historical Commands are inert. Live sync continues behind this view.'}</span>
        </div>
        <div class="replay-actions">
          <button data-action="inspect" data-frame="${previousFrame.toString()}" ${currentFrame === 0 ? 'disabled' : ''}>Previous</button>
          <button data-action="inspect" data-frame="${nextFrame.toString()}" ${currentFrame === snapshot.acceptedSequence ? 'disabled' : ''}>Next</button>
          <button data-action="return-live" ${isLive ? 'disabled' : ''}>Return live</button>
        </div>
      </section>

      <div class="dashboard-grid">
        <section class="panel effects-panel">
          <div class="section-heading">
            <div>
              <p class="eyebrow">Portable effects</p>
              <h2>Ask the best Processor</h2>
            </div>
          </div>
          <div class="effect-grid">
            ${Array.join(
              Array.map(effectKinds, kind =>
                effectButton(
                  kind,
                  snapshot.connection._tag === 'Attached',
                  descriptor,
                  input.presence,
                ),
              ),
              '',
            )}
          </div>
          <p class="explain">An assignment is sticky once a Processor is selected. If that Processor disappears, make a new request instead of assuming failover or exactly-once physical completion.</p>
        </section>

        <section class="panel processors-panel">
          <p class="eyebrow">Instant room</p>
          <h2>Live Processors</h2>
          <ul class="processor-list">${processorList(descriptor, input.presence)}</ul>
          <div class="transport-actions">
            <button data-action="disconnect" ${snapshot.connection._tag === 'Detached' ? 'disabled' : ''}>Disconnect this Model</button>
            <button data-action="connect" ${
              snapshot.connection._tag === 'Attached' &&
              snapshot.connection.transportStatus !== 'closed' &&
              snapshot.connection.transportStatus !== 'errored'
                ? 'disabled'
                : ''
            }>Reconnect</button>
          </div>
          <p class="explain">Disconnecting releases the live subscription and advertises this Processor as unavailable for effects. The cached accepted Model remains visible.</p>
        </section>
      </div>

      <div class="dashboard-grid lower">
        <section class="panel">
          <p class="eyebrow">Local outbox</p>
          <h2>Pending proposals</h2>
          <ul class="status-list">${pending.length === 0 ? '<li><span>Nothing pending.</span></li>' : pending}</ul>
        </section>
        <section class="panel">
          <p class="eyebrow">Accepted lifecycle</p>
          <h2>Effect facts</h2>
          <ul class="status-list">${effects.length === 0 ? '<li><span>No effects requested yet.</span></li>' : effects}</ul>
        </section>
      </div>
    </main>
  `
}

/** Renders the browser shell and wires every interaction to host callbacks. */
export const renderBrowserView = (
  root: HTMLElement,
  input: BrowserViewInput,
  actions: BrowserViewActions,
): void => {
  root.innerHTML =
    input.authentication._tag === 'SignedIn'
      ? programView(input)
      : authenticationView(input)

  root.querySelector('#email-form')?.addEventListener('submit', event => {
    event.preventDefault()
    const form = event.currentTarget
    if (!(form instanceof HTMLFormElement)) {
      return
    }
    const email = new FormData(form).get('email')
    if (typeof email === 'string') {
      actions.sendMagicCode(email)
    }
  })

  root.querySelector('#code-form')?.addEventListener('submit', event => {
    event.preventDefault()
    const form = event.currentTarget
    if (!(form instanceof HTMLFormElement)) {
      return
    }
    const code = new FormData(form).get('code')
    if (typeof code === 'string' && Option.isSome(input.maybeSentEmail)) {
      actions.signInWithMagicCode(input.maybeSentEmail.value, code)
    }
  })

  root.querySelectorAll('[data-action]').forEach(element => {
    element.addEventListener('click', () => {
      if (!(element instanceof HTMLElement)) {
        return
      }
      const action = element.dataset['action']
      if (action === 'google') {
        actions.signInWithGoogle()
      } else if (action === 'change-email') {
        actions.changeEmail()
      } else if (action === 'sign-out') {
        actions.signOut()
      } else if (action === 'increment') {
        actions.incrementCounter()
      } else if (action === 'decrement') {
        actions.decrementCounter()
      } else if (action === 'reset') {
        actions.resetCounter()
      } else if (action === 'return-live') {
        actions.returnLive()
      } else if (action === 'disconnect') {
        actions.disconnect()
      } else if (action === 'connect') {
        actions.connect()
      } else if (action === 'inspect') {
        const frame = Number(element.dataset['frame'])
        if (Number.isInteger(frame)) {
          actions.inspectReplay(frame)
        }
      } else if (action === 'effect') {
        const kind = S.decodeUnknownOption(EffectRequestKind)(
          element.dataset['kind'],
        )
        if (Option.isSome(kind)) {
          actions.proposeEffect(kind.value)
        }
      }
    })
  })
}
