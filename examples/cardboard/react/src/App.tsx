import {
  type AccessibilityProfile,
  accessibilityProfileLabel,
  accessibleDescription,
  cardboardAuthorship,
  cardboardDesktopCommand,
  initialAccessibilityProfile,
  inputMethodGlyph,
  inputMethodLabel,
  inputMethods,
  nextAccessibilityProfile,
  previousAccessibilityProfile,
} from 'cardboard-core-example'
import {
  type CardboardInitialRoute,
  CardboardProvider,
  useCardboardActions,
  useCardboardModel,
  useCardboardReplay,
} from 'cardboard-react-bindings-example'
import type { KeyboardEvent, PointerEvent } from 'react'

/** Runs Cardboard through the shared React and React Native bindings. */
export const App = ({
  initialRoute,
}: Readonly<{ initialRoute: CardboardInitialRoute }>) => (
  <CardboardProvider initialRoute={initialRoute} fallback={<Starting />}>
    <CardboardScreen />
  </CardboardProvider>
)

const Starting = () => <main className="cardboard-shell">Opening /0…</main>

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
