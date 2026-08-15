import * as THREE from 'three'

export type CounterRowView = Readonly<{
  id: string
  count: number
}>

export type CountersSceneState = Readonly<{
  rows: ReadonlyArray<CounterRowView>
}>

export type CountersSceneCallbacks = Readonly<{
  onIncrement: (counterId: string) => void
  onDecrement: (counterId: string) => void
  onAdd: () => void
}>

type RowMeshes = Readonly<{
  id: string
  column: any
  plus: any
  minus: any
}>

const columnGeometry = new THREE.BoxGeometry(1, 1, 1)
columnGeometry.translate(0, 0.5, 0)

const buttonGeometry = new THREE.BoxGeometry(0.42, 0.22, 0.22)

const countColor = (count: number): any => {
  const t = Math.min(1, Math.max(0, count / 12))
  return new THREE.Color().setHSL(0.58 - t * 0.5, 0.72, 0.48 + t * 0.12)
}

const targetHeight = (count: number): number => 0.45 + Math.max(0, count) * 0.22

const damp = (value: number, target: number, amount: number): number =>
  value + (target - value) * amount

/** Host-owned Three.js view. Core owns counts; this only renders and picks. */
export const createCountersScene = (
  container: HTMLElement,
  callbacks: CountersSceneCallbacks,
) => {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  container.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 40)
  camera.position.set(0, 3.4, 9.2)

  scene.add(new THREE.HemisphereLight(0xf4f1ea, 0x243044, 1.2))
  const key = new THREE.DirectionalLight(0xffffff, 1.6)
  key.position.set(4.2, 7.4, 6.2)
  key.castShadow = true
  scene.add(key)
  const rim = new THREE.DirectionalLight(0x9ecbff, 0.4)
  rim.position.set(-5.2, 1.4, -3.4)
  scene.add(rim)

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(7.4, 64),
    new THREE.MeshStandardMaterial({
      color: 0x1a2233,
      roughness: 0.96,
      metalness: 0.04,
    }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)

  const addPad = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.55, 0.18, 24),
    new THREE.MeshStandardMaterial({ color: 0xd7a13a, roughness: 0.4 }),
  )
  addPad.position.set(0, 0.12, 3.4)
  addPad.userData = { kind: 'add' }
  addPad.castShadow = true
  scene.add(addPad)

  const rowGroup = new THREE.Group()
  scene.add(rowGroup)

  const rows = new Map<string, RowMeshes>()
  const clickable: any[] = [addPad]
  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  let latestState: CountersSceneState = { rows: [] }
  let frameHandle = 0

  const ensureRow = (id: string): RowMeshes => {
    const existing = rows.get(id)
    if (existing !== undefined) {
      return existing
    }
    const column = new THREE.Mesh(
      columnGeometry,
      new THREE.MeshStandardMaterial({
        color: countColor(0),
        roughness: 0.42,
        metalness: 0.12,
      }),
    )
    column.castShadow = true
    column.receiveShadow = true
    const plus = new THREE.Mesh(
      buttonGeometry,
      new THREE.MeshStandardMaterial({ color: 0xe8f6d8, roughness: 0.35 }),
    )
    plus.userData = { kind: 'increment', id }
    const minus = new THREE.Mesh(
      buttonGeometry,
      new THREE.MeshStandardMaterial({ color: 0xf3c6c2, roughness: 0.35 }),
    )
    minus.userData = { kind: 'decrement', id }
    const meshes: RowMeshes = { id, column, plus, minus }
    rows.set(id, meshes)
    rowGroup.add(column, plus, minus)
    clickable.push(plus, minus)
    return meshes
  }

  const layout = (state: CountersSceneState) => {
    const count = Math.max(1, state.rows.length)
    const span = Math.min(6.4, count * 1.5)
    state.rows.forEach((row, index) => {
      const meshes = ensureRow(row.id)
      const x = -span / 2 + (span * (index + 0.5)) / count
      meshes.column.position.x = x
      meshes.plus.position.set(x + 0.28, 0.28, 0.72)
      meshes.minus.position.set(x - 0.28, 0.28, 0.72)
    })
    const live = new Set(state.rows.map(row => row.id))
    for (const [id, meshes] of rows) {
      if (!live.has(id)) {
        rowGroup.remove(meshes.column, meshes.plus, meshes.minus)
        rows.delete(id)
      }
    }
  }

  const resize = () => {
    const width = container.clientWidth || 1
    const height = container.clientHeight || 1
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  }

  const pick = (event: PointerEvent) => {
    const rect = container.getBoundingClientRect()
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    raycaster.setFromCamera(pointer, camera)
    const hits = raycaster.intersectObjects(clickable, false)
    return hits[0]?.object.userData ?? null
  }

  const onPointerUp = (event: PointerEvent) => {
    const hit = pick(event)
    if (hit?.kind === 'increment' && typeof hit.id === 'string') {
      callbacks.onIncrement(hit.id)
    }
    if (hit?.kind === 'decrement' && typeof hit.id === 'string') {
      callbacks.onDecrement(hit.id)
    }
    if (hit?.kind === 'add') {
      callbacks.onAdd()
    }
  }

  const animate = () => {
    const state = latestState
    layout(state)
    state.rows.forEach(row => {
      const meshes = rows.get(row.id)
      if (meshes === undefined) {
        return
      }
      const height = targetHeight(row.count)
      meshes.column.scale.y = damp(meshes.column.scale.y, height, 0.16)
      const material = meshes.column.material
      if (material instanceof THREE.MeshStandardMaterial) {
        material.color.lerp(countColor(row.count), 0.16)
      }
    })
    camera.lookAt(0, 1.1, 0)
    const canvas = renderer.domElement
    const rect = canvas.getBoundingClientRect()
    const plusPoint = new THREE.Vector3()
    for (const [id, meshes] of rows) {
      meshes.plus.getWorldPosition(plusPoint)
      plusPoint.project(camera)
      const clientX = rect.left + ((plusPoint.x + 1) / 2) * rect.width
      const clientY = rect.top + ((1 - plusPoint.y) / 2) * rect.height
      if (id === 'counter-1') {
        canvas.dataset.incrementCounter1X = clientX.toFixed(1)
        canvas.dataset.incrementCounter1Y = clientY.toFixed(1)
      }
    }
    renderer.render(scene, camera)
    frameHandle = requestAnimationFrame(animate)
  }

  const resizeObserver = new ResizeObserver(() => resize())
  resizeObserver.observe(container)
  resize()
  container.addEventListener('pointerup', onPointerUp)
  frameHandle = requestAnimationFrame(animate)

  return {
    syncState(state: CountersSceneState) {
      latestState = state
    },
    dispose() {
      cancelAnimationFrame(frameHandle)
      resizeObserver.disconnect()
      container.removeEventListener('pointerup', onPointerUp)
      columnGeometry.dispose()
      buttonGeometry.dispose()
      renderer.dispose()
    },
  }
}
