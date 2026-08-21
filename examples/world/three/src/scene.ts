import * as THREE from 'three'
import type { Model } from 'world-core-example'

import { createCabinet } from './cabinet.js'
import { createChaseCamera, syncChaseCamera } from './camera.js'
import { type ViewMode, createImagePipeline } from './image.js'
import { createYardLights } from './lighting.js'
import { createWalker, syncWalker } from './walker.js'
import { createYard } from './yard.js'

/** Host-owned yard. Core owns attention and vending rules. */
export const createWorldScene = (
  container: HTMLElement,
  viewMode: ViewMode,
) => {
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  container.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x87a8c4)
  scene.fog = new THREE.Fog(0x87a8c4, 18, 42)

  const camera = createChaseCamera(1)
  createYardLights(scene)
  scene.add(createYard())
  scene.add(createCabinet())
  const walker = createWalker()
  scene.add(walker)

  const pipeline = createImagePipeline(renderer, scene, camera, viewMode)

  const resize = () => {
    const width = container.clientWidth
    const height = container.clientHeight
    camera.aspect = width / Math.max(1, height)
    camera.updateProjectionMatrix()
    renderer.setSize(width, height)
    pipeline.setSize(width, height)
  }
  resize()
  window.addEventListener('resize', resize)

  let lastTime = performance.now()
  let latest: Model | undefined
  let frame = 0

  const tick = () => {
    const now = performance.now()
    const deltaSeconds = Math.min(0.05, (now - lastTime) / 1000)
    lastTime = now
    if (latest !== undefined) {
      syncWalker(
        walker,
        latest.at,
        latest.facing,
        deltaSeconds,
        latest._tag === 'Roaming',
      )
      syncChaseCamera(camera, latest.at, latest.facing, deltaSeconds)
    }
    pipeline.render()
    frame = window.requestAnimationFrame(tick)
  }
  tick()

  return {
    syncState: (model: Model) => {
      latest = model
    },
    dispose: () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
      renderer.dispose()
    },
  }
}
