import { Match as M } from 'effect'
import { type Model, overlayOf } from 'world-core-example'

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
      VendingOverlay: value => {
        root.classList.add('open')
        speaker.textContent = 'MACHINE'
        body.textContent = `listed ${value.listPriceDisplay}  ·  ${value.keypadBuffer === '' ? '____' : value.keypadBuffer}  ·  ${value.vendPhase}`
        hint.textContent = 'Dial 1428. Enter. Esc leaves.'
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
  const viewNote = viewMode === 'final' ? '' : ` · view ${viewMode}`
  hud.textContent = `knophy town · ${model._tag.toLowerCase()} · ${model.facing._tag}${viewNote}`
}
