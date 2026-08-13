/** Deterministic visual seed. Matches the clip SKU code. */
export const machineSeed = 1428

/** Cabinet width in metres. */
export const machineWidth = 1
/** Cabinet height in metres. */
export const machineHeight = 1.83
/** Cabinet depth in metres. */
export const machineDepth = 0.8
/** Painted-steel wall thickness in metres. */
export const wallThickness = 0.05
/** Crown fascia height in metres. */
export const crownHeight = 0.19
/** Kick-plate height in metres. */
export const kickHeight = 0.07

/** World X of the glass opening left edge. */
export const glassLeft = -0.43
/** World X of the glass opening right edge. */
export const glassRight = 0.12
/** World Y of the glass opening bottom edge. */
export const glassBottom = 0.38
/** World Y of the glass opening top edge. */
export const glassTop = 1.55
/** Glass pane thickness in metres. */
export const glassThickness = 0.008
/** Glass pane front Z. */
export const glassZ = 0.392

/** Delivery-door left X. */
export const doorLeft = -0.26
/** Delivery-door right X. */
export const doorRight = 0.1
/** Delivery-door bottom Y. */
export const doorBottom = 0.075
/** Delivery-door top Y. */
export const doorTop = 0.32
/** Delivery-door thickness in metres. */
export const doorThickness = 0.03
/** Open door rotation in radians. */
export const doorOpenRadians = 1.12

/** Control-column left X. */
export const columnLeft = 0.16
/** LED bezel bottom Y. */
export const ledBottom = 1.34
/** LED bezel top Y. */
export const ledTop = 1.52
/** Keypad bezel bottom Y. */
export const keypadBottom = 0.78
/** Keypad bezel top Y. */
export const keypadTop = 1.26
/** QR bezel bottom Y. */
export const qrBottom = 0.4
/** QR bezel top Y. */
export const qrTop = 0.68

/** Interior shelf heights in metres. */
export const shelfHeights: ReadonlyArray<number> = [0.52, 0.8, 1.08, 1.36]
/** Shelf that holds the clip. */
export const clipShelfIndex = 2

/** Authored camera vertical field of view in degrees. */
export const cameraFov = 32
/** Camera near plane in metres. */
export const cameraNear = 0.08
/** Camera far plane in metres. */
export const cameraFar = 24
/** Authored camera back offset as a multiple of cabinet height. */
export const cameraBackScale = 2.12
/** Authored camera height as a multiple of cabinet height. */
export const cameraHeightScale = 0.54
/** Authored camera side offset as a multiple of cabinet height. */
export const cameraSideScale = 0.26
/** Look-target height as a multiple of cabinet height. */
export const lookHeightScale = 0.52
/** Look-target side offset in metres, toward the keypad. */
export const lookSide = 0.1
/** Maximum orbit yaw in radians. */
export const orbitYawMax = 0.42
/** Maximum orbit pitch in radians. */
export const orbitPitchMax = 0.16

/** Desktop pixel budget for the hero frame. */
export const pixelBudget = 1_650_000
/** Maximum device pixel ratio. */
export const maximumPixelRatio = 1.5

/** Selective bloom strength. */
export const bloomStrength = 0.48
/** Selective bloom radius. */
export const bloomRadius = 0.42
/** Selective bloom luminance threshold. */
export const bloomThreshold = 0.82

/** Directional shadow map edge length. */
export const shadowMapSize = 2048
/** Directional shadow depth bias. */
export const shadowBias = -0.00018
/** Directional shadow normal bias in metres. */
export const shadowNormalBias = 0.018

/** ACES exposure floor. */
export const exposureMin = 0.55
/** ACES exposure ceiling. */
export const exposureMax = 1.25
/** Middle-gray target for the meter. */
export const exposureMiddleGray = 0.18
/** Initial renderer exposure. */
export const initialExposure = 0.82
/** Luminance meter width. */
export const meterWidth = 64
/** Luminance meter height. */
export const meterHeight = 36
/** Frames between meter readbacks. */
export const meterPeriodFrames = 12
/** Adaptation speed toward brighter scenes. */
export const adaptSpeedUp = 3.2
/** Adaptation speed toward darker scenes. */
export const adaptSpeedDown = 1.1

/** Door spring stiffness. */
export const doorStiffness = 22
/** Door spring damping. */
export const doorDamping = 6.8
/** Keypad press spring stiffness. */
export const keyStiffness = 48
/** Keypad press spring damping. */
export const keyDamping = 9
/** Maximum integration step in seconds. */
export const maximumDeltaSeconds = 1 / 20
/** Clip fall duration in seconds. */
export const clipFallSeconds = 0.55

/** Paint albedo tile size in metres. */
export const paintTileMetres = 0.22

/** Half-width of the cabinet. */
export const halfWidth = machineWidth / 2
/** Half-depth of the cabinet. */
export const halfDepth = machineDepth / 2
/** Front face Z of the painted shell. */
export const frontZ = halfDepth
/** Back face Z of the painted shell. */
export const backZ = -halfDepth
/** Visual center Y used by the camera. */
export const visualCenterY = machineHeight * lookHeightScale

/** Authored camera back offset in metres. */
export const cameraBack = machineHeight * cameraBackScale
/** Authored camera height in metres. */
export const cameraHeight = machineHeight * cameraHeightScale
/** Authored camera side offset in metres. */
export const cameraSide = machineHeight * cameraSideScale
/** Look-target height in metres. */
export const lookHeight = machineHeight * lookHeightScale

/** Glass opening width. */
export const glassWidth = glassRight - glassLeft
/** Glass opening height. */
export const glassHeight = glassTop - glassBottom
/** Door opening width. */
export const doorWidth = doorRight - doorLeft
/** Door opening height. */
export const doorHeight = doorTop - doorBottom

export type ViewMode = 'final' | 'no-post' | 'topology' | 'bloom' | 'materials'

/** Reads the image-pipeline view from the page URL. */
export const viewModeFromLocation = (search: string): ViewMode => {
  const params = new URLSearchParams(search)
  const view = params.get('view')
  if (
    view === 'no-post' ||
    view === 'topology' ||
    view === 'bloom' ||
    view === 'materials'
  ) {
    return view
  }
  return 'final'
}

/** Maps a vend phase tag to LED emissive intensity. */
export const ledIntensityForPhase = (vendPhase: string): number => {
  if (vendPhase === 'AwaitingPayment') {
    return 3.4
  }
  if (vendPhase === 'Dispensed') {
    return 4.2
  }
  if (vendPhase === 'WrongCode' || vendPhase === 'TimedOut') {
    return 1.6
  }
  if (vendPhase === 'Vending' || vendPhase === 'Received') {
    return 3.8
  }
  return 2.2
}

/** Status jewel color for a vend phase. */
export const jewelColorForPhase = (vendPhase: string): number => {
  if (vendPhase === 'AwaitingPayment' || vendPhase === 'Dispensed') {
    return 0x7cff9a
  }
  if (vendPhase === 'WrongCode' || vendPhase === 'TimedOut') {
    return 0xff5a4a
  }
  if (vendPhase === 'Vending' || vendPhase === 'Received') {
    return 0xffe08a
  }
  return 0xf0b060
}
