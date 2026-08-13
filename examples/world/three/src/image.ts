import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'

import type {
  ThreePerspectiveCamera,
  ThreeScene,
  ThreeWebGLRenderer,
} from './three-compat.js'

/** Final image view. `no-post` still reads as a yard. */
export type ViewMode = 'final' | 'no-post'

/** Reads `?view=` from the page URL. */
export const viewModeFromLocation = (location: Location): ViewMode => {
  const params = new URLSearchParams(location.search)
  const view = params.get('view')
  if (view === 'no-post') {
    return 'no-post'
  }
  return 'final'
}

/** Owns tone mapping and optional bloom. */
export const createImagePipeline = (
  renderer: ThreeWebGLRenderer,
  scene: ThreeScene,
  camera: ThreePerspectiveCamera,
  viewMode: ViewMode,
) => {
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.28,
    0.42,
    0.82,
  )
  composer.addPass(bloom)
  composer.addPass(new OutputPass())

  return {
    render: () => {
      if (viewMode === 'no-post') {
        renderer.toneMappingExposure = 1
        renderer.render(scene, camera)
        return
      }
      composer.render()
    },
    setSize: (width: number, height: number) => {
      composer.setSize(width, height)
      bloom.setSize(width, height)
    },
  }
}
