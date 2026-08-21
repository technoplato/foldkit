import * as THREE from 'three'
import type { ClipLine } from 'vending-core-example'

import type { ThreeCanvasTexture } from '../three-compat.js'
import {
  islandHeight,
  islandWidth,
  screenTextureHeight,
  screenTextureWidth,
} from './iphone-contract.js'

const wrapText = (
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): ReadonlyArray<string> => {
  const words = text.split(' ')
  const lines: Array<string> = []
  let current = ''
  for (const word of words) {
    const next = current === '' ? word : `${current} ${word}`
    if (context.measureText(next).width <= maxWidth || current === '') {
      current = next
      continue
    }
    lines.push(current)
    current = word
  }
  if (current !== '') {
    lines.push(current)
  }
  return lines
}

const bubblePath = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  tail: 'left' | 'right',
): void => {
  const right = x + width
  const bottom = y + height
  context.beginPath()
  context.moveTo(x + radius, y)
  context.lineTo(right - radius, y)
  context.quadraticCurveTo(right, y, right, y + radius)
  context.lineTo(right, bottom - radius)
  context.quadraticCurveTo(right, bottom, right - radius, bottom)
  if (tail === 'right') {
    context.lineTo(right - 10, bottom)
    context.lineTo(right + 8, bottom + 6)
    context.lineTo(right - 22, bottom)
  }
  context.lineTo(x + radius, bottom)
  context.quadraticCurveTo(x, bottom, x, bottom - radius)
  if (tail === 'left') {
    context.lineTo(x + 22, bottom)
    context.lineTo(x - 8, bottom + 6)
    context.lineTo(x + 10, bottom)
  }
  context.lineTo(x, y + radius)
  context.quadraticCurveTo(x, y, x + radius, y)
  context.closePath()
}

export type MessagesScreen = Readonly<{
  texture: ThreeCanvasTexture
  paint: (lines: ReadonlyArray<ClipLine>, locked: boolean) => void
  dispose: () => void
}>

/** Paints iOS Messages from FoldKit clip state. This is not a video. */
export const createMessagesScreen = (): MessagesScreen => {
  const canvas = document.createElement('canvas')
  canvas.width = screenTextureWidth
  canvas.height = screenTextureHeight
  const context = canvas.getContext('2d')
  if (context === null) {
    throw new Error('2d context unavailable')
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  texture.generateMipmaps = false
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter

  const paint = (lines: ReadonlyArray<ClipLine>, locked: boolean): void => {
    const width = screenTextureWidth
    const height = screenTextureHeight
    context.fillStyle = '#000000'
    context.fillRect(0, 0, width, height)
    if (locked) {
      context.fillStyle = '#0b0d12'
      context.fillRect(0, 0, width, height)
      const islandX = (width - 168) / 2
      context.fillStyle = '#050505'
      context.beginPath()
      context.roundRect(islandX, 28, 168, 38, 19)
      context.fill()
      context.fillStyle = '#f5f5f7'
      context.textAlign = 'center'
      context.font = '600 22px -apple-system, BlinkMacSystemFont, sans-serif'
      context.fillText('9:41', width / 2, 118)
      context.font = '700 44px -apple-system, BlinkMacSystemFont, sans-serif'
      context.fillText('iPhone 17 Pro', width / 2, 620)
      context.font = '500 22px -apple-system, BlinkMacSystemFont, sans-serif'
      context.fillStyle = '#a1a1aa'
      context.fillText('the clip  ·  $14.28', width / 2, 668)
      context.fillStyle = '#3d3d42'
      context.beginPath()
      context.roundRect(width / 2 - 70, height - 86, 140, 8, 4)
      context.fill()
      texture.needsUpdate = true
      return
    }

    context.fillStyle = '#f2f2f7'
    context.fillRect(0, 0, width, height)
    context.fillStyle = 'rgba(255,255,255,0.94)'
    context.fillRect(0, 0, width, 148)
    context.fillStyle = '#050505'
    context.beginPath()
    context.roundRect((width - 168) / 2, 22, 168, 36, 18)
    context.fill()
    context.fillStyle = '#007aff'
    context.font = '600 28px -apple-system, BlinkMacSystemFont, sans-serif'
    context.textAlign = 'left'
    context.fillText('‹ Vending', 28, 108)
    context.fillStyle = '#1c1c1e'
    context.textAlign = 'center'
    context.font = '700 30px -apple-system, BlinkMacSystemFont, sans-serif'
    context.fillText('TJ', width / 2, 96)
    context.font = '500 16px -apple-system, BlinkMacSystemFont, sans-serif'
    context.fillStyle = '#8e8e93'
    context.fillText('iMessage', width / 2, 122)

    context.font = '500 22px -apple-system, BlinkMacSystemFont, sans-serif'
    const maxBubble = width * 0.72
    let y = 176
    for (const row of lines) {
      const mine = row.speaker === 'Michael'
      const wrapped = wrapText(context, row.text, maxBubble - 36)
      const textHeight = wrapped.length * 28
      const bubbleWidth = Math.min(
        maxBubble,
        Math.max(...wrapped.map(line => context.measureText(line).width), 48) +
          36,
      )
      const bubbleHeight = textHeight + 28
      const x = mine ? width - 24 - bubbleWidth : 24
      context.fillStyle = mine ? '#0b84fe' : '#e9e9eb'
      bubblePath(
        context,
        x,
        y,
        bubbleWidth,
        bubbleHeight,
        18,
        mine ? 'right' : 'left',
      )
      context.fill()
      context.fillStyle = mine ? '#ffffff' : '#1c1c1e'
      context.textAlign = 'left'
      wrapped.forEach((line, index) => {
        context.fillText(line, x + 18, y + 32 + index * 28)
      })
      y += bubbleHeight + 18
    }

    context.fillStyle = '#ffffff'
    context.fillRect(0, height - 108, width, 108)
    context.fillStyle = '#e5e5ea'
    context.beginPath()
    context.roundRect(24, height - 84, width - 108, 52, 26)
    context.fill()
    context.fillStyle = '#8e8e93'
    context.textAlign = 'left'
    context.font = '500 20px -apple-system, BlinkMacSystemFont, sans-serif'
    context.fillText('iMessage', 44, height - 50)
    context.fillStyle = '#0b84fe'
    context.beginPath()
    context.arc(width - 42, height - 58, 18, 0, Math.PI * 2)
    context.fill()
    context.fillStyle = '#3d3d42'
    context.beginPath()
    context.roundRect(width / 2 - 70, height - 22, 140, 8, 4)
    context.fill()
    texture.needsUpdate = true
  }

  paint([], true)

  return {
    texture,
    paint,
    dispose: () => {
      texture.dispose()
    },
  }
}

export { islandHeight, islandWidth }
