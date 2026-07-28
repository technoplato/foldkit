import { CustomElement } from 'foldkit'
import { DEVTOOLS_HOST_ID } from 'foldkit/devtools-host'

/** @internal */
export const PROGRAM_LOG_CONTROL_ID = 'foldkit-program-log-control'
/** @internal */
export const PROGRAM_LOG_INTERACTION_BLOCKER_ID =
  'foldkit-program-log-interaction-blocker'

/** A light-DOM control that toggles the mounted Foldkit Program Log overlay. */
export const ProgramLogButton = CustomElement.define({
  tag: 'foldkit-program-log-button',
  properties: {},
  events: {},
})

const toggleProgramLog = (): void => {
  const host = document.getElementById(DEVTOOLS_HOST_ID)
  const control = host?.shadowRoot?.getElementById(PROGRAM_LOG_CONTROL_ID)
  if (control instanceof HTMLButtonElement) {
    control.click()
  }
}

const isBlockedProgramLogClick = (
  event: MouseEvent,
  programLogButton: HTMLElement,
): boolean => {
  const eventPath = event.composedPath()
  const isFromInteractionBlocker = eventPath.some(
    target =>
      target instanceof HTMLElement &&
      target.id === PROGRAM_LOG_INTERACTION_BLOCKER_ID,
  )
  const control = programLogButton.querySelector('button')
  const controlRect = (control ?? programLogButton).getBoundingClientRect()
  const isInsideControl =
    event.clientX >= controlRect.left &&
    event.clientX <= controlRect.right &&
    event.clientY >= controlRect.top &&
    event.clientY <= controlRect.bottom
  return isFromInteractionBlocker && isInsideControl
}

/** Registers the native element behind `ProgramLogButton` in a browser host. */
export const registerProgramLogButton = (): void => {
  if (customElements.get(ProgramLogButton.tag) !== undefined) {
    return
  }

  customElements.define(
    ProgramLogButton.tag,
    class extends HTMLElement {
      readonly #toggleProgramLog = (): void => {
        toggleProgramLog()
      }

      readonly #rerouteBlockedProgramLogClick = (event: MouseEvent): void => {
        if (isBlockedProgramLogClick(event, this)) {
          event.preventDefault()
          toggleProgramLog()
        }
      }

      connectedCallback(): void {
        this.addEventListener('click', this.#toggleProgramLog)
        document.addEventListener(
          'click',
          this.#rerouteBlockedProgramLogClick,
          true,
        )
      }

      disconnectedCallback(): void {
        this.removeEventListener('click', this.#toggleProgramLog)
        document.removeEventListener(
          'click',
          this.#rerouteBlockedProgramLogClick,
          true,
        )
      }
    },
  )
}
