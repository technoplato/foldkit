import { CustomElement } from 'foldkit'
import { DEVTOOLS_HOST_ID } from 'foldkit/devtools-host'

/** @internal */
export const PROGRAM_LOG_CONTROL_ID = 'foldkit-program-log-control'

/** A light-DOM control that opens the nearest Foldkit Program Log overlay. */
export const ProgramLogButton = CustomElement.define({
  tag: 'foldkit-program-log-button',
  properties: {},
  events: {},
})

const openProgramLog = (): void => {
  const host = document.getElementById(DEVTOOLS_HOST_ID)
  const control = host?.shadowRoot?.getElementById(PROGRAM_LOG_CONTROL_ID)
  if (
    control instanceof HTMLButtonElement &&
    control.ariaLabel === 'Open Program Log'
  ) {
    control.click()
  }
}

/** Registers the native element behind `ProgramLogButton` in a browser host. */
export const registerProgramLogButton = (): void => {
  if (customElements.get(ProgramLogButton.tag) !== undefined) {
    return
  }

  customElements.define(
    ProgramLogButton.tag,
    class extends HTMLElement {
      readonly #openedProgramLog = (): void => {
        openProgramLog()
      }

      connectedCallback(): void {
        this.addEventListener('click', this.#openedProgramLog)
      }

      disconnectedCallback(): void {
        this.removeEventListener('click', this.#openedProgramLog)
      }
    },
  )
}
