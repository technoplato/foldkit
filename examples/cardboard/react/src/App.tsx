import {
  type AccessibilityProfile,
  accessibilityProfileLabel,
  accessibleDescription,
  cardboardAuthorship,
  cardboardDesktopCommand,
  cardboardScreen,
  conversationLedger,
  conversationScale,
  currentConversationScaleLevel,
  extraPortableRoute,
  initialAccessibilityProfile,
  inputMethodGlyph,
  inputMethodLabel,
  inputMethods,
  nextAccessibilityProfile,
  previousAccessibilityProfile,
  sequencePortableRoute,
} from 'cardboard-core-example'
import {
  type CardboardInitialRoute,
  CardboardProvider,
  type ReplayPresentationClient,
  replayPresentationClients,
  useCardboardActions,
  useCardboardModel,
  useCardboardReplay,
} from 'cardboard-react-bindings-example'
import { Match as M, Option } from 'effect'
import {
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useState,
} from 'react'

/** Runs Cardboard through the shared React and React Native bindings. */
export const App = ({
  initialRoute,
}: Readonly<{ initialRoute: CardboardInitialRoute }>) => (
  <CardboardProvider initialRoute={initialRoute} fallback={<Starting />}>
    <CardboardScreen />
  </CardboardProvider>
)

const Starting = () => <main className="cardboard-shell">Opening /0…</main>

const portableRouteForModel = (
  model: ReturnType<typeof useCardboardModel>,
): string => {
  if (model.page._tag === 'SequencePage') {
    return sequencePortableRoute(model.page.value)
  } else if (model.page._tag === 'ConversationLedgerPage') {
    return extraPortableRoute
  } else {
    return '/0'
  }
}

const presentationForModel = (
  model: ReturnType<typeof useCardboardModel>,
): Readonly<{
  isRgbInverted: boolean
  profile: AccessibilityProfile
}> => {
  if (
    model.zero._tag === 'ConfiguringAtZero' ||
    model.zero._tag === 'ChoosingInputMethod' ||
    model.zero._tag === 'RejectedInputMethodChoice' ||
    model.zero._tag === 'CompletedAtZero'
  ) {
    return {
      isRgbInverted: model.zero.isRgbInverted,
      profile: model.zero.profile,
    }
  } else {
    return { isRgbInverted: false, profile: initialAccessibilityProfile }
  }
}

const CardboardScreen = () => {
  const model = useCardboardModel()
  const actions = useCardboardActions()
  const replay = useCardboardReplay()
  const presentation = presentationForModel(model)
  const isConfigurationVisible = model.zero._tag === 'ConfiguringAtZero'
  const isRiddleVisible =
    model.zero._tag === 'ChoosingInputMethod' ||
    model.zero._tag === 'RejectedInputMethodChoice'
  const progress =
    model.zero._tag === 'OpeningZero' ? model.zero.progressPermille / 10 : 0

  useEffect(() => {
    let isCurrent = true
    if (replay.mode === 'Live') {
      const nextPath = portableRouteForModel(model)
      if (globalThis.location.pathname !== nextPath) {
        globalThis.history.pushState({}, '', nextPath)
      }
    } else {
      void replay.replayPath().then(nextPath => {
        if (isCurrent && globalThis.location.pathname !== nextPath) {
          globalThis.history.replaceState({}, '', nextPath)
        }
      })
    }
    return () => {
      isCurrent = false
    }
  }, [model.page, replay.frame, replay.mode])

  if (replay.mode === 'Inspecting') {
    return (
      <ProgramLogScreen
        model={model}
        onOpenExtra={actions.openedExtra}
        replay={replay}
      />
    )
  }

  if (model.page._tag === 'SequencePage') {
    const screen = cardboardScreen(model)
    return (
      <main className="cardboard-sequence">
        <button
          aria-label={screen.content.accessibilityLabel}
          className="cardboard-sequence-button"
          onClick={() =>
            actions.performedCardboardAction(screen.content.action)
          }
          type="button"
        >
          {screen.content.text}
        </button>
        <nav aria-label="Cardboard commands" className="cardboard-commands">
          <button onClick={() => replay.inspect()} type="button">
            [L] Log
          </button>
          {screen.commands.map(command => (
            <button
              key={command.key}
              onClick={() => actions.performedCardboardAction(command.action)}
              type="button"
            >
              [{command.key}] {command.text}
            </button>
          ))}
        </nav>
      </main>
    )
  }

  if (model.page._tag === 'ConversationLedgerPage') {
    return (
      <ConversationLedgerScreen
        onReturn={actions.returnedToCardboardSequence}
      />
    )
  }

  const handledKeyboardInput = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key === ' ') {
      event.preventDefault()
      actions.pressedSpace()
    } else if (event.key === 'g') {
      actions.pressedLowercaseG()
    } else if (event.key === 'G' || event.key === ';') {
      actions.completedZeroGame()
    } else if (event.key === 'h' || event.key === 'ArrowLeft') {
      actions.selectedAccessibilityProfile(
        previousAccessibilityProfile(presentation.profile),
      )
    } else if (event.key === 'l' || event.key === 'ArrowRight') {
      actions.selectedAccessibilityProfile(
        nextAccessibilityProfile(presentation.profile),
      )
    }
  }

  const pressedControl = (event: PointerEvent<HTMLButtonElement>): void => {
    event.currentTarget.setPointerCapture(event.pointerId)
    actions.pressedZeroButton()
  }

  return (
    <main
      className={`cardboard-shell profile-${presentation.profile} ${presentation.isRgbInverted ? 'rgb-inverted' : ''}`}
      onKeyDown={handledKeyboardInput}
    >
      <section className="cardboard-stage" aria-labelledby="cardboard-title">
        <header className="cardboard-header">
          <div>
            <p className="eyebrow">Project Cardboard</p>
            <h1 id="cardboard-title">Rule Zero</h1>
          </div>
          <code>/0</code>
        </header>

        <button
          aria-describedby="cardboard-readout"
          aria-label="Rule Zero black button. Hold to open."
          className={`zero-button state-${model.zero._tag}`}
          onKeyDown={event => {
            if (event.key === 'Enter') {
              event.preventDefault()
              event.stopPropagation()
              actions.pressedZeroButton()
            }
          }}
          onKeyUp={event => {
            if (event.key === 'Enter') {
              event.preventDefault()
              event.stopPropagation()
              actions.releasedZeroButton()
            }
          }}
          onPointerCancel={actions.releasedZeroButton}
          onPointerDown={pressedControl}
          onPointerUp={actions.releasedZeroButton}
          type="button"
        >
          <span className="zero-button-label">0</span>
          <span
            className="zero-button-progress"
            style={{ width: `${progress}%` }}
          />
        </button>

        <p aria-live="polite" className="readout" id="cardboard-readout">
          {accessibleDescription(model)}
        </p>

        <button
          className="ledger-link"
          onClick={actions.openedExtra}
          type="button"
        >
          Open /0/extra
        </button>

        {isConfigurationVisible ? (
          <section
            className="configuration"
            aria-label="Accessibility presentation"
          >
            <p className="eyebrow">Presentation, not diagnosis</p>
            <h2>{accessibilityProfileLabel(presentation.profile)}</h2>
            <div className="configuration-actions">
              <button
                onClick={() =>
                  actions.selectedAccessibilityProfile(
                    previousAccessibilityProfile(presentation.profile),
                  )
                }
                type="button"
              >
                Previous
              </button>
              <button onClick={actions.toggledRgbInversion} type="button">
                RGB negative {presentation.isRgbInverted ? 'on' : 'off'}
              </button>
              <button
                onClick={() =>
                  actions.selectedAccessibilityProfile(
                    nextAccessibilityProfile(presentation.profile),
                  )
                }
                type="button"
              >
                Next
              </button>
              <button onClick={actions.completedZeroGame} type="button">
                Continue
              </button>
            </div>
          </section>
        ) : null}

        {isRiddleVisible ? (
          <section className="riddle" aria-labelledby="input-riddle">
            <p className="eyebrow">Dungeon one</p>
            <h2 id="input-riddle">
              If you are looking at yourself, where are you looking?
            </h2>
            <div className="input-methods">
              {inputMethods.map(inputMethod => (
                <button
                  aria-label={inputMethodLabel(inputMethod)}
                  className={`input-method input-${inputMethod}`}
                  key={inputMethod}
                  onClick={() => actions.selectedInputMethod(inputMethod)}
                  type="button"
                >
                  <span aria-hidden="true">
                    {inputMethodGlyph(inputMethod)}
                  </span>
                  <strong>{inputMethodLabel(inputMethod)}</strong>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <section className="replay" aria-label="Replay controls">
          <span>{replay.mode}</span>
          <input
            aria-label="Replay frame"
            max={replay.finalFrame}
            min={0}
            onChange={event => replay.seek(Number(event.currentTarget.value))}
            type="range"
            value={replay.frame}
          />
          <span>
            {replay.frame} / {replay.finalFrame}
          </span>
        </section>

        <details className="authorship">
          <summary>Original author and desktop command</summary>
          <p>{cardboardAuthorship.statement}</p>
          <code>{cardboardAuthorship.acronym}</code>
          <code>acronym sha256:{cardboardAuthorship.acronymSha256}</code>
          <code>statement sha256:{cardboardAuthorship.statementSha256}</code>
          <p>Play the same Program on your desktop:</p>
          <code>{cardboardDesktopCommand}</code>
        </details>

        <footer>
          Hold the control, press Space three times, use h/l, gg, G, or
          semicolon.
        </footer>
      </section>
    </main>
  )
}

const ConversationLedgerScreen = ({
  onReturn,
}: Readonly<{ onReturn: () => void }>) => (
  <main className="cardboard-shell profile-AmberPaper">
    <article className="cardboard-stage ledger-page">
      <header className="cardboard-header">
        <div>
          <p className="eyebrow">Project Cardboard</p>
          <h1>When /0 is four</h1>
        </div>
        <code>/0/extra</code>
      </header>

      <p className="ledger-declaration">
        Four means Ship. Stop expanding the theory. Publish the smallest
        verified artifact, record what happened, and continue from evidence.
      </p>

      <button className="ledger-link" onClick={onReturn} type="button">
        Return to /0
      </button>

      <section aria-labelledby="conversation-scale" className="ledger-section">
        <p className="eyebrow">Current level {currentConversationScaleLevel}</p>
        <h2 id="conversation-scale">Conversation scale</h2>
        <ol className="scale-list">
          {conversationScale.map(level => (
            <li
              className={
                level.level === currentConversationScaleLevel
                  ? 'scale-level current-scale-level'
                  : 'scale-level'
              }
              key={level.level}
            >
              <strong>
                {level.level} · {level.label}
              </strong>
              <span>{level.description}</span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="decision-log" className="ledger-section">
        <p className="eyebrow">Append only</p>
        <h2 id="decision-log">Public decision log</h2>
        <ol className="decision-log">
          {conversationLedger.map(entry => (
            <li key={entry.sequence}>
              <p>
                {entry.sequence.toString().padStart(2, '0')} ·{' '}
                {entry.recordedOn}
              </p>
              <h3>{entry.title}</h3>
              <span>{entry.statement}</span>
            </li>
          ))}
        </ol>
      </section>

      <details className="authorship">
        <summary>Original author and desktop command</summary>
        <p>{cardboardAuthorship.statement}</p>
        <code>{cardboardAuthorship.acronym}</code>
        <code>statement sha256:{cardboardAuthorship.statementSha256}</code>
        <p>Play the same Program on your desktop:</p>
        <code>{cardboardDesktopCommand}</code>
      </details>
    </article>
  </main>
)

const modelSummary = (model: ReturnType<typeof useCardboardModel>): string => {
  if (model.page._tag === 'SequencePage') {
    return model.page.value.toString()
  } else if (model.page._tag === 'ConversationLedgerPage') {
    return 'Extra'
  } else {
    return accessibleDescription(model)
  }
}

const ReplayClientPreview = ({
  client,
  summary,
}: Readonly<{
  client: ReplayPresentationClient
  summary: string
}>) =>
  M.value(client).pipe(
    M.tagsExhaustive({
      WebReplayClient: ({ title }) => (
        <div aria-hidden="true" className="program-log-client-preview web">
          <span className="program-log-window-dots">● ● ●</span>
          <strong>{summary}</strong>
          <small>{title}</small>
        </div>
      ),
      MobileReplayClient: ({ title }) => (
        <div aria-hidden="true" className="program-log-client-preview mobile">
          <span className="program-log-phone-speaker" />
          <strong>{summary}</strong>
          <small>{title}</small>
        </div>
      ),
      TerminalReplayClient: () => (
        <div aria-hidden="true" className="program-log-client-preview terminal">
          <span>$ foldkit-cardboard</span>
          <strong>{summary}</strong>
          <small>[U] Undo [R] Redo [D] Done</small>
        </div>
      ),
      UnavailableReplayClient: () => (
        <div
          aria-hidden="true"
          className="program-log-client-preview unavailable"
        >
          <strong>{summary}</strong>
          <small>DevTools journal</small>
        </div>
      ),
    }),
  )

const ReplayClientCard = ({
  client,
  copiedClientId,
  onCopy,
  summary,
}: Readonly<{
  client: ReplayPresentationClient
  copiedClientId: Option.Option<string>
  onCopy: (clientId: string, carrier: string) => void
  summary: string
}>) => {
  const isCopied =
    Option.isSome(copiedClientId) && copiedClientId.value === client.clientId
  return M.value(client).pipe(
    M.tagsExhaustive({
      WebReplayClient: webClient => (
        <article className="program-log-client-card">
          <ReplayClientPreview client={webClient} summary={summary} />
          <div className="program-log-client-copy">
            <p className="eyebrow">Web Client</p>
            <h3>{webClient.title}</h3>
            <p>{webClient.description}</p>
            <code>{webClient.url}</code>
          </div>
          <div className="program-log-client-actions">
            <a href={webClient.url} rel="noreferrer" target="_blank">
              Open new window
            </a>
            <button
              onClick={() => onCopy(webClient.clientId, webClient.url)}
              type="button"
            >
              {isCopied ? 'Copied' : 'Copy URL'}
            </button>
          </div>
        </article>
      ),
      MobileReplayClient: mobileClient => (
        <article className="program-log-client-card">
          <ReplayClientPreview client={mobileClient} summary={summary} />
          <div className="program-log-client-copy">
            <p className="eyebrow">Mobile Client</p>
            <h3>{mobileClient.title}</h3>
            <p>{mobileClient.description}</p>
            <code>{mobileClient.deepLink}</code>
          </div>
          <div className="program-log-client-actions">
            <a href={mobileClient.deepLink}>Open mobile app</a>
            <button
              onClick={() =>
                onCopy(mobileClient.clientId, mobileClient.deepLink)
              }
              type="button"
            >
              {isCopied ? 'Copied' : 'Copy deep link'}
            </button>
          </div>
        </article>
      ),
      TerminalReplayClient: terminalClient => (
        <article className="program-log-client-card">
          <ReplayClientPreview client={terminalClient} summary={summary} />
          <div className="program-log-client-copy">
            <p className="eyebrow">Terminal Client</p>
            <h3>{terminalClient.title}</h3>
            <p>{terminalClient.description}</p>
            <code>{terminalClient.command}</code>
          </div>
          <div className="program-log-client-actions">
            <button
              className="primary"
              onClick={() =>
                onCopy(terminalClient.clientId, terminalClient.command)
              }
              type="button"
            >
              {isCopied ? 'Command copied' : 'Copy command'}
            </button>
          </div>
        </article>
      ),
      UnavailableReplayClient: unavailableClient => (
        <article className="program-log-client-card unavailable">
          <ReplayClientPreview client={unavailableClient} summary={summary} />
          <div className="program-log-client-copy">
            <p className="eyebrow">Framework seam</p>
            <h3>{unavailableClient.title}</h3>
            <p>{unavailableClient.description}</p>
            <p>{unavailableClient.reason}</p>
          </div>
        </article>
      ),
    }),
  )
}

const ReplayClientMatrix = ({
  portableReplayPath,
  summary,
}: Readonly<{ portableReplayPath: string; summary: string }>) => {
  const [copiedClientId, setCopiedClientId] = useState<Option.Option<string>>(
    Option.none(),
  )
  const copyCarrier = (clientId: string, carrier: string): void => {
    void globalThis.navigator.clipboard.writeText(carrier).then(() => {
      setCopiedClientId(Option.some(clientId))
    })
  }
  return (
    <section
      aria-labelledby="program-log-client-title"
      className="program-log-client-matrix"
    >
      <div className="program-log-heading">
        <p className="eyebrow">One frame, many presentations</p>
        <h2 id="program-log-client-title">Open this state</h2>
        <p>
          Every Client interprets the same portable replay path. Only its
          carrier changes.
        </p>
      </div>
      <div className="program-log-client-grid">
        {replayPresentationClients(portableReplayPath).map(client => (
          <ReplayClientCard
            client={client}
            copiedClientId={copiedClientId}
            key={client.clientId}
            onCopy={copyCarrier}
            summary={summary}
          />
        ))}
      </div>
    </section>
  )
}

const ProgramLogScreen = ({
  model,
  onOpenExtra,
  replay,
}: Readonly<{
  model: ReturnType<typeof useCardboardModel>
  onOpenExtra: () => void
  replay: ReturnType<typeof useCardboardReplay>
}>) => {
  const [maybeReplayPath, setMaybeReplayPath] = useState<Option.Option<string>>(
    Option.none(),
  )
  useEffect(() => {
    let isCurrent = true
    void replay.replayPath().then(portableReplayPath => {
      if (isCurrent) {
        setMaybeReplayPath(Option.some(portableReplayPath))
      }
    })
    return () => {
      isCurrent = false
    }
  }, [replay.frame, replay.finalFrame])
  const summary = modelSummary(model)
  return (
    <main
      className="program-log-shell"
      onContextMenu={event => event.preventDefault()}
    >
      <header className="program-log-pinned">
        <div>
          <p className="eyebrow">Current Program state</p>
          <h1>{modelSummary(model)}</h1>
          <p className="program-log-frame">
            Frame {replay.frame} of {replay.finalFrame}
          </p>
        </div>
        <div className="program-log-controls">
          <button
            disabled={replay.frame === 0}
            onClick={replay.stepBackward}
            type="button"
          >
            Undo
          </button>
          <button
            disabled={replay.frame === replay.finalFrame}
            onClick={replay.stepForward}
            type="button"
          >
            Redo
          </button>
          <button
            className="program-log-done"
            disabled={!replay.isBranchable}
            onClick={replay.resume}
            type="button"
          >
            Done
          </button>
        </div>
        <input
          aria-label="Selected replay frame"
          max={replay.finalFrame}
          min={0}
          onChange={event => replay.seek(Number(event.currentTarget.value))}
          type="range"
          value={replay.frame}
        />
        {Option.isSome(replay.maybeError) ? (
          <p className="program-log-error" role="alert">
            {replay.maybeError.value}
          </p>
        ) : null}
      </header>

      <section className="program-log-list" aria-labelledby="program-log-title">
        <div className="program-log-heading">
          <p className="eyebrow">Replayable evidence</p>
          <h2 id="program-log-title">Actions and events</h2>
        </div>
        <button
          className="program-log-row"
          onClick={() => replay.seek(0)}
          type="button"
        >
          <span>0</span>
          <strong>Initial Model</strong>
          <small>Program start</small>
        </button>
        {replay.transitions.map((transition, index) => {
          const frame = index + 1
          const commandNames = transition.commands
            .map(command => command.name)
            .join(', ')
          return (
            <button
              className={
                frame > replay.frame
                  ? 'program-log-row future'
                  : 'program-log-row'
              }
              key={transition.sequence}
              onClick={() => replay.seek(frame)}
              type="button"
            >
              <span>{frame}</span>
              <strong>{transition.message._tag}</strong>
              <small>
                {transition.source._tag}
                {commandNames === '' ? '' : ` · Commands: ${commandNames}`}
                {transition.isOperationSettled ? ' · Settled' : ' · Waiting'}
              </small>
            </button>
          )
        })}
        {replay.runtimeEvents.map((event, index) => (
          <button
            className={
              event.afterFrame > replay.frame
                ? 'program-log-row runtime-event future'
                : 'program-log-row runtime-event'
            }
            key={`${event.afterFrame.toString()}-${event.name}-${index.toString()}`}
            onClick={() => replay.seek(event.afterFrame)}
            type="button"
          >
            <span>{event.afterFrame}</span>
            <strong>{event.name}</strong>
            <small>Runtime event</small>
          </button>
        ))}
      </section>

      {Option.isSome(maybeReplayPath) ? (
        <ReplayClientMatrix
          portableReplayPath={maybeReplayPath.value}
          summary={summary}
        />
      ) : null}

      <footer className="program-log-extra">
        <button
          disabled={!replay.isBranchable}
          onClick={onOpenExtra}
          type="button"
        >
          [E] Extra
        </button>
      </footer>
    </main>
  )
}
