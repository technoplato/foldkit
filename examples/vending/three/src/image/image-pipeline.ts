import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'

import {
  type ViewMode,
  adaptSpeedDown,
  adaptSpeedUp,
  bloomRadius,
  bloomStrength,
  bloomThreshold,
  exposureMax,
  exposureMiddleGray,
  exposureMin,
  initialExposure,
  maximumPixelRatio,
  meterHeight,
  meterPeriodFrames,
  meterWidth,
  pixelBudget,
} from '../cabinet/design-contract.js'
import type {
  ThreeMaterial,
  ThreeMesh,
  ThreeObject3D,
  ThreePerspectiveCamera,
  ThreeScene,
  ThreeWebGLRenderer,
} from '../three-compat.js'

const bloomComposite = {
  uniforms: {
    tDiffuse: { value: null },
    tBloom: { value: null },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform sampler2D tBloom;
    varying vec2 vUv;
    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      vec4 bloom = texture2D(tBloom, vUv);
      gl_FragColor = vec4(base.rgb + bloom.rgb, base.a);
    }
  `,
}

const luminanceEncode = {
  uniforms: {
    tDiffuse: { value: null },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec3 color = texture2D(tDiffuse, vUv).rgb;
      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      float encoded = luma / (luma + 1.0);
      gl_FragColor = vec4(encoded, encoded, encoded, 1.0);
    }
  `,
}

export type ImagePipeline = Readonly<{
  setSize: (width: number, height: number) => void
  pixelRatio: (width: number, height: number) => number
  render: (deltaSeconds: number) => void
  exposure: () => number
  dispose: () => void
}>

const blackMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 })

/** HDR scene, selective LED bloom, ACES output, measured exposure. */
export const createImagePipeline = (
  renderer: ThreeWebGLRenderer,
  scene: ThreeScene,
  camera: ThreePerspectiveCamera,
  bloomMeshes: ReadonlyArray<ThreeMesh>,
  viewMode: ViewMode,
): ImagePipeline => {
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = initialExposure

  const size = new THREE.Vector2()
  renderer.getSize(size)
  const bloomComposer = new EffectComposer(renderer)
  bloomComposer.renderToScreen = false
  const bloomRender = new RenderPass(scene, camera)
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(size.x, size.y),
    bloomStrength,
    bloomRadius,
    bloomThreshold,
  )
  bloomComposer.addPass(bloomRender)
  bloomComposer.addPass(bloomPass)

  const finalComposer = new EffectComposer(renderer)
  const scenePass = new RenderPass(scene, camera)
  const composite = new ShaderPass(bloomComposite)
  composite.uniforms['tBloom'].value = bloomComposer.readBuffer.texture
  const output = new OutputPass()
  finalComposer.addPass(scenePass)
  finalComposer.addPass(composite)
  finalComposer.addPass(output)

  const meterTarget = new THREE.WebGLRenderTarget(meterWidth, meterHeight, {
    type: THREE.UnsignedByteType,
    minFilter: THREE.LINEAR_FILTER,
    magFilter: THREE.LINEAR_FILTER,
    depthBuffer: false,
  })
  const meterScene = new THREE.Scene()
  const meterCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const meterMaterial = new THREE.ShaderMaterial(luminanceEncode)
  const meterQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), meterMaterial)
  meterScene.add(meterQuad)
  const meterPixels = new Uint8Array(meterWidth * meterHeight * 4)
  let framesSinceMeter = 0
  let meterPending = false
  let currentExposure = initialExposure
  let targetExposure = initialExposure

  const bloomSet = new Set(bloomMeshes)
  const restorations: Array<{
    mesh: ThreeMesh
    material: ThreeMaterial | Array<ThreeMaterial>
  }> = []

  const darkenNonBloom = (): void => {
    restorations.length = 0
    scene.traverse((object: ThreeObject3D) => {
      if (!(object instanceof THREE.Mesh)) {
        return
      }
      if (bloomSet.has(object) || object.userData['bloom'] === true) {
        return
      }
      restorations.push({ mesh: object, material: object.material })
      object.material = blackMaterial
    })
  }

  const restoreMaterials = (): void => {
    for (const item of restorations) {
      item.mesh.material = item.material
    }
    restorations.length = 0
  }

  const sampleMeter = (deltaSeconds: number): void => {
    framesSinceMeter += 1
    if (meterPending || framesSinceMeter < meterPeriodFrames) {
      const speed =
        targetExposure > currentExposure ? adaptSpeedUp : adaptSpeedDown
      const amount = 1 - Math.exp(-Math.max(deltaSeconds, 0) * speed)
      currentExposure += (targetExposure - currentExposure) * amount
      renderer.toneMappingExposure = currentExposure
      return
    }
    framesSinceMeter = 0
    meterPending = true
    meterMaterial.uniforms['tDiffuse'].value = finalComposer.readBuffer.texture
    renderer.setRenderTarget(meterTarget)
    renderer.render(meterScene, meterCamera)
    renderer.setRenderTarget(null)
    renderer.readRenderTargetPixels(
      meterTarget,
      0,
      0,
      meterWidth,
      meterHeight,
      meterPixels,
    )
    let weighted = 0
    let weightSum = 0
    for (let index = 0; index < meterPixels.length; index += 4) {
      const encoded = (meterPixels.at(index) ?? 0) / 255
      const luma = encoded / Math.max(0.0001, 1 - encoded)
      const weight = luma > 0.002 ? 1 : 0.15
      weighted += Math.log(Math.max(luma, 0.0001)) * weight
      weightSum += weight
    }
    const average = Math.exp(weighted / Math.max(weightSum, 0.0001))
    targetExposure = THREE.MathUtils.clamp(
      exposureMiddleGray / average,
      exposureMin,
      exposureMax,
    )
    meterPending = false
    const speed =
      targetExposure > currentExposure ? adaptSpeedUp : adaptSpeedDown
    const amount = 1 - Math.exp(-Math.max(deltaSeconds, 0) * speed)
    currentExposure += (targetExposure - currentExposure) * amount
    renderer.toneMappingExposure = currentExposure
  }

  return {
    pixelRatio: (width, height) => {
      const cssPixels = Math.max(1, width * height)
      const budgetRatio = Math.sqrt(pixelBudget / cssPixels)
      return Math.min(
        Math.max(window.devicePixelRatio, 1),
        maximumPixelRatio,
        budgetRatio,
      )
    },
    setSize: (width, height) => {
      const ratio = Math.min(
        Math.max(window.devicePixelRatio, 1),
        maximumPixelRatio,
        Math.sqrt(pixelBudget / Math.max(1, width * height)),
      )
      renderer.setPixelRatio(ratio)
      renderer.setSize(width, height, false)
      bloomComposer.setSize(width, height)
      finalComposer.setSize(width, height)
      bloomPass.resolution.set(width * ratio, height * ratio)
    },
    render: deltaSeconds => {
      if (viewMode === 'no-post') {
        renderer.render(scene, camera)
        return
      }
      if (viewMode === 'bloom') {
        try {
          darkenNonBloom()
          bloomComposer.render()
        } finally {
          restoreMaterials()
        }
        renderer.setRenderTarget(null)
        return
      }
      try {
        darkenNonBloom()
        bloomComposer.render()
      } finally {
        restoreMaterials()
      }
      composite.uniforms['tBloom'].value = bloomComposer.readBuffer.texture
      finalComposer.render()
      sampleMeter(deltaSeconds)
    },
    exposure: () => currentExposure,
    dispose: () => {
      bloomComposer.dispose()
      finalComposer.dispose()
      meterTarget.dispose()
      meterMaterial.dispose()
      meterQuad.geometry.dispose()
      blackMaterial.dispose()
    },
  }
}
