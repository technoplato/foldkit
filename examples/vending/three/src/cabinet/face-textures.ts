import * as THREE from 'three'

import type { ThreeCanvasTexture } from '../three-compat.js'

const fillCanvas = (
  width: number,
  height: number,
  paint: (context: CanvasRenderingContext2D) => void,
): ThreeCanvasTexture => {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (context === null) {
    throw new Error('2d context unavailable')
  }
  paint(context)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

/** Crown wordmark for the machine fascia. */
export const createBrandTexture = (): ThreeCanvasTexture =>
  fillCanvas(1024, 256, context => {
    context.fillStyle = '#5a1210'
    context.fillRect(0, 0, 1024, 256)
    context.fillStyle = '#f6d59a'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.font =
      "700 92px 'IBM Plex Sans Condensed', 'Arial Narrow', sans-serif"
    context.fillText('KNOPHY', 512, 108)
    context.font = "600 28px 'IBM Plex Mono', ui-monospace, monospace"
    context.fillStyle = '#e8c48a'
    context.fillText('VENDING  ·  DEVNET', 512, 178)
  })

/** Price plate under the LED bezel. */
export const createPriceTexture = (price: string): ThreeCanvasTexture =>
  fillCanvas(512, 128, context => {
    context.fillStyle = '#1a1612'
    context.fillRect(0, 0, 512, 128)
    context.fillStyle = '#f6d59a'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.font = "700 48px 'IBM Plex Mono', ui-monospace, monospace"
    context.fillText(price, 256, 64)
  })

/** Phosphor LED display. Digits come from FoldKit keypadBuffer. */
export const createLedTexture = (
  digits: string,
  phase: string,
): ThreeCanvasTexture =>
  fillCanvas(1024, 512, context => {
    context.fillStyle = '#020805'
    context.fillRect(0, 0, 1024, 512)
    context.fillStyle = 'rgba(124, 255, 154, 0.06)'
    for (let y = 0; y < 512; y += 6) {
      context.fillRect(0, y, 1024, 1)
    }
    context.fillStyle = '#b8ffc8'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.shadowColor = '#7cff9a'
    context.shadowBlur = 12
    context.font = "700 210px 'IBM Plex Mono', ui-monospace, monospace"
    context.fillText(digits === '' ? '----' : digits, 512, 210)
    context.shadowBlur = 0
    context.fillStyle = '#7cff9a'
    context.font = "600 48px 'IBM Plex Mono', ui-monospace, monospace"
    context.fillText(phase.toUpperCase(), 512, 400)
  })

/** Rubber keypad legend. */
export const createKeyTexture = (label: string): ThreeCanvasTexture =>
  fillCanvas(256, 256, context => {
    context.fillStyle = '#120e0b'
    context.fillRect(0, 0, 256, 256)
    context.fillStyle = '#2a2118'
    context.fillRect(16, 16, 224, 224)
    context.strokeStyle = '#f6d59a'
    context.lineWidth = 8
    context.strokeRect(20, 20, 216, 216)
    context.fillStyle = '#fff4d6'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.font =
      label.length > 1
        ? "700 72px 'IBM Plex Mono', ui-monospace, sans-serif"
        : "700 128px 'IBM Plex Mono', ui-monospace, sans-serif"
    context.fillText(label, 128, 136)
  })

/** Shelf slot caption. */
export const createSlotTexture = (label: string): ThreeCanvasTexture =>
  fillCanvas(128, 64, context => {
    context.fillStyle = '#12100e'
    context.fillRect(0, 0, 128, 64)
    context.fillStyle = '#d7b27a'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.font = "700 28px 'IBM Plex Mono', ui-monospace, monospace"
    context.fillText(label, 64, 32)
  })
