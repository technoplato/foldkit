/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WALLET_DATA_SOURCE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module 'three'

declare module 'three/addons/postprocessing/EffectComposer.js'
declare module 'three/addons/postprocessing/OutputPass.js'
declare module 'three/addons/postprocessing/RenderPass.js'
declare module 'three/addons/postprocessing/ShaderPass.js'
declare module 'three/addons/postprocessing/UnrealBloomPass.js'
declare module 'three/addons/environments/RoomEnvironment.js'
declare module 'three/addons/geometries/RoundedBoxGeometry.js'
