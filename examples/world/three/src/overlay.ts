import { Match as M } from 'effect'
import { howToVend } from 'vending-core-example'
import { type Model, overlayOf } from 'world-core-example'

const howToHtml = (
  copy: ReturnType<typeof howToVend>,
  extraHint?: string,
): string => {
  const steps = copy.steps
    .map(step => {
      const className =
        step.step < copy.currentStep
          ? 'is-done'
          : step.step === copy.currentStep
            ? 'is-now'
            : ''
      return `<li class="${className}">${step.step}. ${step.label}</li>`
    })
    .join('')
  const hint = extraHint === undefined ? copy.hint : extraHint
  return `<p class="hud-kicker">${copy.title}</p><ol class="hud-steps">${steps}</ol><p class="hud-now">${copy.now}</p><p class="hud-hint">${hint}</p>`
}

/** Paints the Pokemon HTML overlay from World attention. */
export const paintOverlay = (model: Model): void => {
  const root = document.getElementById('overlay')
  const speaker = document.getElementById('overlay-speaker')
  const body = document.getElementById('overlay-body')
  const hint = document.getElementById('overlay-hint')
  if (root === null || speaker === null || body === null || hint === null) {
    return
  }
  const overlay = overlayOf(model)
  M.value(overlay).pipe(
    M.tagsExhaustive({
      Hidden: () => {
        root.classList.remove('open')
      },
      SignOverlay: value => {
        root.classList.add('open')
        speaker.textContent = value.speaker
        body.textContent = value.overlay
        hint.textContent = 'A / Esc dismiss'
      },
      VendingOverlay: () => {
        root.classList.remove('open')
      },
    }),
  )
}

/** Paints the corner HUD. */
export const paintHud = (model: Model, viewMode: string): void => {
  const hud = document.getElementById('hud')
  if (hud === null) {
    return
  }
  const viewNote =
    viewMode === 'final' ? '' : `<p class="hud-hint">view ${viewMode}</p>`
  if (model._tag === 'Operating') {
    const copy = howToVend({
      vendPhase: model.vending.vendPhase._tag,
      digits: model.vending.keypadBuffer,
      clipPlayback: model.vending.clipPlayback._tag,
      input: 'type',
    })
    hud.innerHTML = `${howToHtml(copy, 'Type the code. Esc leaves the machine.')}${viewNote}`
    return
  }
  hud.innerHTML = `<p class="hud-kicker">Knophy town</p><p class="hud-now">Walk to the red vending machine</p><p class="hud-hint">WASD move · Q / ← west · A uses a sign or the machine${viewNote === '' ? '' : ` · ${viewMode}`}</p>`
}
