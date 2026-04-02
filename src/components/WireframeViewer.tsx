import { useEffect, useRef, useCallback, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { BuildingModel, Wall, Door, Window, Room, Staircase } from '../types'
import type { Point3D } from '../types'
import {
  calculateWallLength,
  calculateRoomDimensions,
} from '../utils/measurementCalculation'
import { DetailPanel } from './DetailPanel'
import type { SelectedElement } from './DetailPanel'
import { CorrectionPopup } from './CorrectionPopup'
import type { CorrectionAction, CorrectionTarget } from './CorrectionPopup'
import { formatLength } from '../utils/formatLength'

// ---------------------------------------------------------------------------
// Colour palette
// ---------------------------------------------------------------------------

const COLORS = {
  wall: 0xcccccc,
  floor: 0x888888,
  ceiling: 0x666666,
  door: 0x00ccaa,
  window: 0x4499ff,
  stair: 0xffaa00,
  label: '#ffffff',
  background: 0x1a1a2e,
  highlight: 0xffff00,
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

function toVec3(p: Point3D): THREE.Vector3 {
  return new THREE.Vector3(p.x, p.y, p.z)
}

/** Create line segments forming a closed loop through the given points */
function createEdgeLoop(points: Point3D[], color: number): THREE.LineSegments {
  const positions: number[] = []
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  const material = new THREE.LineBasicMaterial({ color })
  return new THREE.LineSegments(geometry, material)
}

/** Create dashed line segments forming a closed loop */
function createDashedEdgeLoop(
  points: Point3D[],
  color: number,
  dashSize = 0.1,
  gapSize = 0.06,
): THREE.LineSegments {
  const positions: number[] = []
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  const material = new THREE.LineDashedMaterial({
    color,
    dashSize,
    gapSize,
  })
  const line = new THREE.LineSegments(geometry, material)
  line.computeLineDistances()
  return line
}

// ---------------------------------------------------------------------------
// Hit-test mesh helpers (invisible meshes used for raycasting)
// ---------------------------------------------------------------------------

/** Create an invisible mesh from 4 corner points for click detection */
function createHitQuad(corners: Point3D[]): THREE.Mesh {
  const positions = new Float32Array([
    corners[0].x, corners[0].y, corners[0].z,
    corners[1].x, corners[1].y, corners[1].z,
    corners[2].x, corners[2].y, corners[2].z,
    corners[2].x, corners[2].y, corners[2].z,
    corners[3].x, corners[3].y, corners[3].z,
    corners[0].x, corners[0].y, corners[0].z,
  ])
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  const material = new THREE.MeshBasicMaterial({
    visible: false,
    side: THREE.DoubleSide,
  })
  return new THREE.Mesh(geometry, material)
}

// ---------------------------------------------------------------------------
// Building model -> Three.js objects
// ---------------------------------------------------------------------------

function createWallGeometry(wall: Wall): THREE.LineSegments {
  // Wall corners: [bottomLeft, bottomRight, topRight, topLeft]
  return createEdgeLoop(wall.corners, COLORS.wall)
}

function createFloorGeometry(boundary: Point3D[]): THREE.LineSegments {
  return createEdgeLoop(boundary, COLORS.floor)
}

function createCeilingGeometry(boundary: Point3D[]): THREE.LineSegments {
  return createEdgeLoop(boundary, COLORS.ceiling)
}

/**
 * Compute the wall's horizontal direction from its bottom-left and bottom-right corners.
 * Falls back to the X axis if no wall is provided.
 */
function getWallDirection(wall?: Wall): Point3D {
  if (!wall) return { x: 1, y: 0, z: 0 }
  const [bl, br] = wall.corners
  const dx = br.x - bl.x
  const dz = br.z - bl.z
  const len = Math.sqrt(dx * dx + dz * dz)
  if (len < 1e-9) return { x: 1, y: 0, z: 0 }
  return { x: dx / len, y: 0, z: dz / len }
}

/**
 * Compute oriented rectangle corners for a door/window on a wall.
 * The rectangle extends halfW along the wall direction and halfH along Y.
 */
function orientedCorners(p: Point3D, halfW: number, halfH: number, dir: Point3D): Point3D[] {
  return [
    { x: p.x - halfW * dir.x, y: p.y - halfH, z: p.z - halfW * dir.z },
    { x: p.x + halfW * dir.x, y: p.y - halfH, z: p.z + halfW * dir.z },
    { x: p.x + halfW * dir.x, y: p.y + halfH, z: p.z + halfW * dir.z },
    { x: p.x - halfW * dir.x, y: p.y + halfH, z: p.z - halfW * dir.z },
  ]
}

function createDoorGeometry(door: Door, wall?: Wall): THREE.LineSegments {
  const halfW = door.width / 2
  const halfH = door.height / 2
  const dir = getWallDirection(wall)
  const corners = orientedCorners(door.position, halfW, halfH, dir)
  return createDashedEdgeLoop(corners, COLORS.door)
}

function createWindowGeometry(window: Window, wall?: Wall): THREE.LineSegments {
  const halfW = window.width / 2
  const halfH = window.height / 2
  const p = window.position
  const dir = getWallDirection(wall)
  const corners = orientedCorners(p, halfW, halfH, dir)

  // Merge outline + cross into a single LineSegments
  const crossPositions: number[] = [
    // horizontal mid
    p.x - halfW * dir.x, p.y, p.z - halfW * dir.z,
    p.x + halfW * dir.x, p.y, p.z + halfW * dir.z,
    // vertical mid
    p.x, p.y - halfH, p.z,
    p.x, p.y + halfH, p.z,
  ]
  const outline = createDashedEdgeLoop(corners, COLORS.window, 0.08, 0.05)
  const outlinePos = outline.geometry.getAttribute('position')
  const mergedPositions = new Float32Array(outlinePos.count * 3 + crossPositions.length)
  for (let i = 0; i < outlinePos.count * 3; i++) {
    mergedPositions[i] = (outlinePos.array as Float32Array)[i]
  }
  for (let i = 0; i < crossPositions.length; i++) {
    mergedPositions[outlinePos.count * 3 + i] = crossPositions[i]
  }

  // Clean up intermediate geometry
  outline.geometry.dispose()
  ;(outline.material as THREE.Material).dispose()

  const mergedGeom = new THREE.BufferGeometry()
  mergedGeom.setAttribute('position', new THREE.Float32BufferAttribute(mergedPositions, 3))
  const mergedMat = new THREE.LineDashedMaterial({
    color: COLORS.window,
    dashSize: 0.08,
    gapSize: 0.05,
  })
  const merged = new THREE.LineSegments(mergedGeom, mergedMat)
  merged.computeLineDistances()
  return merged
}

function createStaircaseGeometry(staircase: Staircase): THREE.LineSegments {
  const bottom = staircase.bottomPosition
  const top = staircase.topPosition
  const halfW = staircase.width / 2

  // Create a series of stair steps between bottom and top
  const stepCount = Math.max(3, Math.round(Math.abs(top.y - bottom.y) / 0.2))
  const positions: number[] = []

  for (let i = 0; i <= stepCount; i++) {
    const t = i / stepCount
    const y = bottom.y + (top.y - bottom.y) * t
    const x = bottom.x + (top.x - bottom.x) * t
    const z = bottom.z + (top.z - bottom.z) * t

    // Horizontal tread
    positions.push(
      x - halfW, y, z,
      x + halfW, y, z,
    )

    // Vertical riser (connect to next step)
    if (i < stepCount) {
      const tNext = (i + 1) / stepCount
      const yNext = bottom.y + (top.y - bottom.y) * tNext
      const xNext = bottom.x + (top.x - bottom.x) * tNext
      const zNext = bottom.z + (top.z - bottom.z) * tNext

      // Left riser
      positions.push(x - halfW, y, z, xNext - halfW, yNext, zNext)
      // Right riser
      positions.push(x + halfW, y, z, xNext + halfW, yNext, zNext)
    }
  }

  // Side stringers
  positions.push(
    bottom.x - halfW, bottom.y, bottom.z,
    top.x - halfW, top.y, top.z,
  )
  positions.push(
    bottom.x + halfW, bottom.y, bottom.z,
    top.x + halfW, top.y, top.z,
  )

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  const material = new THREE.LineBasicMaterial({ color: COLORS.stair })
  return new THREE.LineSegments(geometry, material)
}

// ---------------------------------------------------------------------------
// Measurement label sprites
// ---------------------------------------------------------------------------

function createTextSprite(text: string, position: THREE.Vector3, scale = 0.4): THREE.Sprite {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  canvas.width = 256
  canvas.height = 64

  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
  ctx.roundRect(2, 2, 252, 60, 8)
  ctx.fill()

  ctx.font = 'bold 28px system-ui, sans-serif'
  ctx.fillStyle = COLORS.label
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 128, 32)

  const texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = THREE.LinearFilter
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false })
  const sprite = new THREE.Sprite(material)
  sprite.position.copy(position)
  sprite.scale.set(scale * (canvas.width / canvas.height), scale, 1)
  return sprite
}

function createWallLabel(wall: Wall, unit?: string): THREE.Sprite {
  const length = calculateWallLength(wall)
  const text = formatLength(length, unit)
  // Position at midpoint of bottom edge, slightly offset outward
  const mid = new THREE.Vector3(
    (wall.corners[0].x + wall.corners[1].x) / 2,
    (wall.corners[0].y + wall.corners[1].y) / 2,
    (wall.corners[0].z + wall.corners[1].z) / 2,
  )
  // Offset slightly above the bottom edge
  mid.y += 0.15
  return createTextSprite(text, mid, 0.3)
}

function createRoomLabel(room: Room, unit?: string): THREE.Sprite {
  const dims = calculateRoomDimensions(room)
  const text = `${room.name}\n${formatLength(dims.width, unit)} x ${formatLength(dims.depth, unit)}`
  // Position at center of room floor
  const floorBounds = room.floor.boundary
  const cx = floorBounds.reduce((s, p) => s + p.x, 0) / floorBounds.length
  const cy = floorBounds.reduce((s, p) => s + p.y, 0) / floorBounds.length
  const cz = floorBounds.reduce((s, p) => s + p.z, 0) / floorBounds.length
  return createTextSprite(text, new THREE.Vector3(cx, cy + 0.5, cz), 0.5)
}

function createDoorLabel(door: Door, unit?: string): THREE.Sprite {
  const text = `Door ${formatLength(door.width, unit)}x${formatLength(door.height, unit)}`
  const pos = toVec3(door.position)
  pos.y += door.height / 2 + 0.15
  return createTextSprite(text, pos, 0.25)
}

function createWindowLabel(win: Window, unit?: string): THREE.Sprite {
  const text = `Win ${formatLength(win.width, unit)}x${formatLength(win.height, unit)}`
  const pos = toVec3(win.position)
  pos.y += win.height / 2 + 0.15
  return createTextSprite(text, pos, 0.25)
}

// ---------------------------------------------------------------------------
// Scene builder
// ---------------------------------------------------------------------------

interface SceneData {
  group: THREE.Group
  hitMeshes: THREE.Mesh[]
}

function buildScene(model: BuildingModel): SceneData {
  const root = new THREE.Group()
  const hitMeshes: THREE.Mesh[] = []
  const unit = model.isCalibrated ? model.unit : undefined

  // Build wall lookup so doors/windows can find their parent wall for orientation
  const wallMap = new Map<string, Wall>()
  for (const room of model.rooms) {
    for (const wall of room.walls) {
      wallMap.set(wall.id, wall)
    }
  }

  for (const room of model.rooms) {
    // Walls
    for (const wall of room.walls) {
      const wireframe = createWallGeometry(wall)
      root.add(wireframe)
      root.add(createWallLabel(wall, unit))

      // Hit-test mesh for the wall
      const hitMesh = createHitQuad(wall.corners)
      hitMesh.userData = {
        elementType: 'wall',
        wall,
        roomId: room.id,
        roomName: room.name,
        wireframe,
        originalColor: COLORS.wall,
      }
      root.add(hitMesh)
      hitMeshes.push(hitMesh)
    }

    // Floor and ceiling
    if (room.floor.boundary.length > 0) {
      root.add(createFloorGeometry(room.floor.boundary))

      // Hit-test mesh for the room (click floor to select room)
      if (room.floor.boundary.length >= 3) {
        const floorHit = createHitQuad(
          room.floor.boundary.length >= 4
            ? room.floor.boundary.slice(0, 4)
            : [...room.floor.boundary, room.floor.boundary[0]],
        )
        floorHit.userData = {
          elementType: 'room',
          room,
          wireframe: null,
          originalColor: COLORS.floor,
        }
        root.add(floorHit)
        hitMeshes.push(floorHit)
      }
    }
    if (room.ceiling.boundary.length > 0) {
      root.add(createCeilingGeometry(room.ceiling.boundary))
    }

    // Doors
    for (const door of room.doors) {
      const doorWall = wallMap.get(door.wallId)
      const wireframe = createDoorGeometry(door, doorWall)
      root.add(wireframe)
      root.add(createDoorLabel(door, unit))

      const halfW = door.width / 2
      const halfH = door.height / 2
      const dir = getWallDirection(doorWall)
      const doorCorners = orientedCorners(door.position, halfW, halfH, dir)
      const hitMesh = createHitQuad(doorCorners)
      hitMesh.userData = {
        elementType: 'door',
        door,
        roomId: room.id,
        roomName: room.name,
        wireframe,
        originalColor: COLORS.door,
      }
      root.add(hitMesh)
      hitMeshes.push(hitMesh)
    }

    // Windows
    for (const win of room.windows) {
      const winWall = wallMap.get(win.wallId)
      const wireframe = createWindowGeometry(win, winWall)
      root.add(wireframe)
      root.add(createWindowLabel(win, unit))

      const halfW = win.width / 2
      const halfH = win.height / 2
      const dir = getWallDirection(winWall)
      const winCorners = orientedCorners(win.position, halfW, halfH, dir)
      const hitMesh = createHitQuad(winCorners)
      hitMesh.userData = {
        elementType: 'window',
        window: win,
        roomId: room.id,
        roomName: room.name,
        wireframe,
        originalColor: COLORS.window,
      }
      root.add(hitMesh)
      hitMeshes.push(hitMesh)
    }

    // Room label
    root.add(createRoomLabel(room, unit))
  }

  // Staircases
  for (const staircase of model.staircases) {
    root.add(createStaircaseGeometry(staircase))
    const mid = new THREE.Vector3(
      (staircase.bottomPosition.x + staircase.topPosition.x) / 2,
      (staircase.bottomPosition.y + staircase.topPosition.y) / 2,
      (staircase.bottomPosition.z + staircase.topPosition.z) / 2,
    )
    root.add(createTextSprite('Stairs', mid, 0.35))
  }

  return { group: root, hitMeshes }
}

/** Compute a bounding box around the model to position the camera */
function computeModelBounds(model: BuildingModel): THREE.Box3 {
  const box = new THREE.Box3()

  for (const room of model.rooms) {
    for (const wall of room.walls) {
      for (const corner of wall.corners) {
        box.expandByPoint(toVec3(corner))
      }
    }
    for (const p of room.floor.boundary) {
      box.expandByPoint(toVec3(p))
    }
    for (const p of room.ceiling.boundary) {
      box.expandByPoint(toVec3(p))
    }
  }

  for (const staircase of model.staircases) {
    box.expandByPoint(toVec3(staircase.bottomPosition))
    box.expandByPoint(toVec3(staircase.topPosition))
  }

  // If empty, provide a default
  if (box.isEmpty()) {
    box.expandByPoint(new THREE.Vector3(-1, -1, -1))
    box.expandByPoint(new THREE.Vector3(1, 1, 1))
  }

  return box
}

// ---------------------------------------------------------------------------
// Highlighting helpers
// ---------------------------------------------------------------------------

function setWireframeColor(wireframe: THREE.LineSegments, color: number) {
  const mat = wireframe.material
  if (Array.isArray(mat)) {
    mat.forEach((m) => {
      if ('color' in m) (m as THREE.LineBasicMaterial).color.setHex(color)
    })
  } else if ('color' in mat) {
    (mat as THREE.LineBasicMaterial).color.setHex(color)
  }
}

// ---------------------------------------------------------------------------
// React component
// ---------------------------------------------------------------------------

export interface WireframeViewerProps {
  model: BuildingModel
  /** Callback when a correction action is taken (add/remove door or window).
   *  When provided, an "Edit" toggle button appears in the viewer. */
  onCorrection?: (action: CorrectionAction) => void
  width?: number | string
  height?: number | string
}

export function WireframeViewer({
  model,
  onCorrection,
  width = '100%',
  height = 600,
}: WireframeViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasContainerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const modelGroupRef = useRef<THREE.Group | null>(null)
  const hitMeshesRef = useRef<THREE.Mesh[]>([])
  const frameIdRef = useRef<number>(0)
  const raycasterRef = useRef(new THREE.Raycaster())
  const highlightedRef = useRef<{ wireframe: THREE.LineSegments; originalColor: number } | null>(null)

  const [selection, setSelection] = useState<SelectedElement | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [popup, setPopup] = useState<{ x: number; y: number; target: CorrectionTarget } | null>(null)

  // Split/merge interaction state
  const [splitState, setSplitState] = useState<{
    roomId: string
    startPoint?: Point3D
  } | null>(null)
  const [mergeState, setMergeState] = useState<{
    roomId: string
  } | null>(null)

  // Preview line for split drawing
  const splitLineRef = useRef<THREE.Line | null>(null)

  // Use refs so the click handler always sees the latest values without
  // needing to be recreated (which would tear down and reinit the scene).
  const editModeRef = useRef(editMode)
  const onCorrectionRef = useRef(onCorrection)
  const splitStateRef = useRef(splitState)
  const mergeStateRef = useRef(mergeState)
  const modelRef = useRef(model)
  const animateRef = useRef<() => void>(() => {})

  useEffect(() => {
    editModeRef.current = editMode
    onCorrectionRef.current = onCorrection
    splitStateRef.current = splitState
    mergeStateRef.current = mergeState
    modelRef.current = model
    animateRef.current = () => {
      frameIdRef.current = requestAnimationFrame(() => animateRef.current())
      controlsRef.current?.update()
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current)
      }
    }
  })

  const animate = useCallback(() => {
    animateRef.current()
  }, [])

  const clearSplitPreview = useCallback(() => {
    const scene = sceneRef.current
    if (scene && splitLineRef.current) {
      scene.remove(splitLineRef.current)
      splitLineRef.current.geometry.dispose()
      ;(splitLineRef.current.material as THREE.Material).dispose()
      splitLineRef.current = null
    }
  }, [])

  // Click handler for raycasting
  const handleClick = useCallback((event: MouseEvent) => {
    const container = canvasContainerRef.current
    const camera = cameraRef.current
    if (!container || !camera) return

    const rect = container.getBoundingClientRect()
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    )

    const raycaster = raycasterRef.current
    raycaster.setFromCamera(mouse, camera)

    const intersects = raycaster.intersectObjects(hitMeshesRef.current, false)

    // Restore previous highlight
    if (highlightedRef.current) {
      setWireframeColor(highlightedRef.current.wireframe, highlightedRef.current.originalColor)
      highlightedRef.current = null
    }

    // --- Split mode: place split line points ---
    if (splitStateRef.current && editModeRef.current) {
      const ss = splitStateRef.current
      const room = modelRef.current.rooms.find((r) => r.id === ss.roomId)
      if (!room) {
        setSplitState(null)
        return
      }
      const floorY =
        room.floor.boundary.length > 0
          ? room.floor.boundary.reduce((s, p) => s + p.y, 0) /
            room.floor.boundary.length
          : 0

      // Cast ray to floor plane
      const origin = raycaster.ray.origin
      const dir = raycaster.ray.direction
      if (Math.abs(dir.y) < 1e-6) return
      const t = (floorY - origin.y) / dir.y
      if (t < 0) return
      const point: Point3D = {
        x: origin.x + dir.x * t,
        y: floorY,
        z: origin.z + dir.z * t,
      }

      if (!ss.startPoint) {
        // First click — set start
        setSplitState({ ...ss, startPoint: point })
      } else {
        // Second click — dispatch split and exit split mode
        onCorrectionRef.current?.({
          type: 'splitRoom',
          roomId: ss.roomId,
          splitStart: ss.startPoint,
          splitEnd: point,
        })
        setSplitState(null)
        clearSplitPreview()
      }
      return
    }

    // --- Merge mode: click second room ---
    if (mergeStateRef.current && editModeRef.current) {
      const ms = mergeStateRef.current
      // Find room hit
      const roomHit = intersects.find(
        (i) => i.object.userData.elementType === 'room',
      )
      if (roomHit) {
        const targetRoom = roomHit.object.userData.room as Room
        if (targetRoom.id !== ms.roomId) {
          onCorrectionRef.current?.({
            type: 'mergeRooms',
            roomIdA: ms.roomId,
            roomIdB: targetRoom.id,
          })
        }
      }
      setMergeState(null)
      return
    }

    if (intersects.length === 0) {
      setSelection(null)
      setPopup(null)
      return
    }

    const hit = intersects[0]
    const data = hit.object.userData

    // --- Edit mode: show correction popup ---
    if (editModeRef.current && onCorrectionRef.current) {
      const screenX = event.clientX - rect.left
      const screenY = event.clientY - rect.top

      if (data.elementType === 'wall') {
        const hitPoint = hit.point
        setPopup({
          x: Math.min(screenX, rect.width - 160),
          y: Math.min(screenY, rect.height - 150),
          target: {
            type: 'wall',
            roomId: data.roomId,
            wall: data.wall,
            clickPosition: { x: hitPoint.x, y: hitPoint.y, z: hitPoint.z },
          },
        })
      } else if (data.elementType === 'door') {
        setPopup({
          x: Math.min(screenX, rect.width - 160),
          y: Math.min(screenY, rect.height - 100),
          target: {
            type: 'door',
            roomId: data.roomId,
            doorId: data.door.id,
          },
        })
      } else if (data.elementType === 'window') {
        setPopup({
          x: Math.min(screenX, rect.width - 160),
          y: Math.min(screenY, rect.height - 100),
          target: {
            type: 'window',
            roomId: data.roomId,
            windowId: data.window.id,
          },
        })
      } else if (data.elementType === 'room') {
        const room = data.room as Room
        setPopup({
          x: Math.min(screenX, rect.width - 160),
          y: Math.min(screenY, rect.height - 150),
          target: {
            type: 'room',
            roomId: room.id,
            roomName: room.name,
          },
        })
      } else {
        setPopup(null)
      }
      setSelection(null)
      return
    }

    // --- Normal mode: selection + highlight ---
    setPopup(null)

    // Highlight the wireframe
    if (data.wireframe) {
      setWireframeColor(data.wireframe, COLORS.highlight)
      highlightedRef.current = {
        wireframe: data.wireframe,
        originalColor: data.originalColor,
      }
    }

    // Build selection
    switch (data.elementType) {
      case 'wall':
        setSelection({
          type: 'wall',
          wall: data.wall,
          roomId: data.roomId,
          roomName: data.roomName,
        })
        break
      case 'room':
        setSelection({
          type: 'room',
          room: data.room,
        })
        break
      case 'door':
        setSelection({
          type: 'door',
          door: data.door,
          roomId: data.roomId,
          roomName: data.roomName,
        })
        break
      case 'window':
        setSelection({
          type: 'window',
          window: data.window,
          roomId: data.roomId,
          roomName: data.roomName,
        })
        break
    }
  }, [clearSplitPreview])

  // Initialize Three.js scene once
  useEffect(() => {
    const container = canvasContainerRef.current
    if (!container) return

    // Scene
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(COLORS.background)
    sceneRef.current = scene

    // Camera
    const camera = new THREE.PerspectiveCamera(
      60,
      container.clientWidth / container.clientHeight,
      0.01,
      1000,
    )
    camera.position.set(5, 5, 5)
    cameraRef.current = camera

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.setPixelRatio(window.devicePixelRatio)
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // Orbit controls
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.1
    controlsRef.current = controls

    // Ambient light (helps sprites be visible)
    scene.add(new THREE.AmbientLight(0xffffff, 1))

    // Click handler for raycasting
    renderer.domElement.addEventListener('click', handleClick)

    // Mousemove handler for split line preview
    const handleMouseMove = (event: MouseEvent) => {
      const ss = splitStateRef.current
      if (!ss?.startPoint) return
      const room = modelRef.current.rooms.find((r) => r.id === ss.roomId)
      if (!room) return
      const floorY =
        room.floor.boundary.length > 0
          ? room.floor.boundary.reduce((s, p) => s + p.y, 0) /
            room.floor.boundary.length
          : 0

      const r = container.getBoundingClientRect()
      const mx = new THREE.Vector2(
        ((event.clientX - r.left) / r.width) * 2 - 1,
        -((event.clientY - r.top) / r.height) * 2 + 1,
      )
      const rc = raycasterRef.current
      rc.setFromCamera(mx, camera)
      const o = rc.ray.origin
      const d = rc.ray.direction
      if (Math.abs(d.y) < 1e-6) return
      const t = (floorY - o.y) / d.y
      if (t < 0) return
      const endPt: Point3D = {
        x: o.x + d.x * t,
        y: floorY,
        z: o.z + d.z * t,
      }

      // Update preview line in scene — reuse existing line object when possible
      if (splitLineRef.current) {
        const positions = new Float32Array([
          ss.startPoint.x, ss.startPoint.y, ss.startPoint.z,
          endPt.x, endPt.y, endPt.z,
        ])
        splitLineRef.current.geometry.setAttribute(
          'position',
          new THREE.Float32BufferAttribute(positions, 3),
        )
        splitLineRef.current.computeLineDistances()
      } else {
        const geom = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(ss.startPoint.x, ss.startPoint.y, ss.startPoint.z),
          new THREE.Vector3(endPt.x, endPt.y, endPt.z),
        ])
        const mat = new THREE.LineDashedMaterial({
          color: 0xff4444,
          dashSize: 0.15,
          gapSize: 0.1,
        })
        const line = new THREE.Line(geom, mat)
        line.computeLineDistances()
        scene.add(line)
        splitLineRef.current = line
      }
    }
    renderer.domElement.addEventListener('mousemove', handleMouseMove)

    // Start render loop
    animate()

    // Resize handler
    const onResize = () => {
      if (!container) return
      const w = container.clientWidth
      const h = container.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    window.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('resize', onResize)
      renderer.domElement.removeEventListener('click', handleClick)
      renderer.domElement.removeEventListener('mousemove', handleMouseMove)
      cancelAnimationFrame(frameIdRef.current)
      controls.dispose()
      renderer.dispose()
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement)
      }
    }
  }, [animate, handleClick])

  // Update scene when model changes
  useEffect(() => {
    const scene = sceneRef.current
    const camera = cameraRef.current
    const controls = controlsRef.current
    if (!scene || !camera || !controls) return

    // Clear selection and popup when model changes
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting UI state when model prop changes
    setSelection(null)
    setPopup(null)
    highlightedRef.current = null

    // Remove previous model group
    if (modelGroupRef.current) {
      scene.remove(modelGroupRef.current)
      // Dispose all geometries and materials
      modelGroupRef.current.traverse((obj) => {
        if (obj instanceof THREE.LineSegments || obj instanceof THREE.Line) {
          obj.geometry.dispose()
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose())
          } else {
            obj.material.dispose()
          }
        }
        if (obj instanceof THREE.Sprite) {
          obj.material.map?.dispose()
          obj.material.dispose()
        }
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose()
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose())
          } else {
            obj.material.dispose()
          }
        }
      })
      modelGroupRef.current = null
    }

    // Build new scene objects
    const { group, hitMeshes } = buildScene(model)
    scene.add(group)
    modelGroupRef.current = group
    hitMeshesRef.current = hitMeshes

    // Fit camera to model
    const bounds = computeModelBounds(model)
    const center = new THREE.Vector3()
    bounds.getCenter(center)
    const size = new THREE.Vector3()
    bounds.getSize(size)
    const maxDim = Math.max(size.x, size.y, size.z)
    const distance = maxDim * 1.8

    controls.target.copy(center)
    camera.position.set(
      center.x + distance * 0.6,
      center.y + distance * 0.5,
      center.z + distance * 0.6,
    )
    camera.lookAt(center)
    controls.update()
  }, [model])

  const handleClosePanel = useCallback(() => {
    if (highlightedRef.current) {
      setWireframeColor(highlightedRef.current.wireframe, highlightedRef.current.originalColor)
      highlightedRef.current = null
    }
    setSelection(null)
  }, [])

  const handleToggleEditMode = useCallback(() => {
    setEditMode((prev) => {
      const next = !prev
      if (next) {
        // Entering edit mode: clear selection and detail panel
        setSelection(null)
        if (highlightedRef.current) {
          setWireframeColor(highlightedRef.current.wireframe, highlightedRef.current.originalColor)
          highlightedRef.current = null
        }
      } else {
        // Leaving edit mode: clear popup and split/merge state
        setPopup(null)
        setSplitState(null)
        setMergeState(null)
        clearSplitPreview()
      }
      return next
    })
  }, [clearSplitPreview])

  const handleCorrectionAction = useCallback(
    (action: CorrectionAction) => {
      onCorrection?.(action)
    },
    [onCorrection],
  )

  const handleStartSplit = useCallback((roomId: string) => {
    setSplitState({ roomId })
    setMergeState(null)
    setPopup(null)
  }, [])

  const handleStartMerge = useCallback((roomId: string) => {
    setMergeState({ roomId })
    setSplitState(null)
    clearSplitPreview()
    setPopup(null)
  }, [clearSplitPreview])

  const unit = model.isCalibrated ? model.unit : undefined

  return (
    <div
      ref={containerRef}
      data-testid="wireframe-viewer"
      style={{
        width,
        height,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        ref={canvasContainerRef}
        data-testid="wireframe-canvas-container"
        style={{
          width: '100%',
          height: '100%',
        }}
      />

      {/* Edit mode toggle — only shown when onCorrection is provided */}
      {onCorrection && (
        <button
          data-testid="edit-mode-toggle"
          onClick={handleToggleEditMode}
          style={{
            position: 'absolute',
            top: 12,
            left: 12,
            padding: '6px 14px',
            fontSize: 13,
            fontFamily: 'system-ui, sans-serif',
            fontWeight: 600,
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            background: editMode ? '#ff6b6b' : 'rgba(255,255,255,0.15)',
            color: '#fff',
            boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
            zIndex: 10,
          }}
        >
          {editMode ? 'Exit Edit' : 'Edit'}
        </button>
      )}

      {/* Correction popup (edit mode) */}
      {popup && onCorrection && (
        <CorrectionPopup
          x={popup.x}
          y={popup.y}
          target={popup.target}
          onAction={handleCorrectionAction}
          onStartSplit={handleStartSplit}
          onStartMerge={handleStartMerge}
          onClose={() => setPopup(null)}
        />
      )}

      {/* Split / merge mode indicators */}
      {splitState && (
        <div
          data-testid="split-mode-indicator"
          style={{
            position: 'absolute',
            bottom: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(255, 68, 68, 0.9)',
            color: '#fff',
            padding: '6px 16px',
            borderRadius: 6,
            fontSize: 13,
            fontFamily: 'system-ui, sans-serif',
            zIndex: 10,
            pointerEvents: 'none',
          }}
        >
          {splitState.startPoint
            ? 'Click to set split end point'
            : 'Click to set split start point'}
        </div>
      )}
      {mergeState && (
        <div
          data-testid="merge-mode-indicator"
          style={{
            position: 'absolute',
            bottom: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(0, 170, 136, 0.9)',
            color: '#fff',
            padding: '6px 16px',
            borderRadius: 6,
            fontSize: 13,
            fontFamily: 'system-ui, sans-serif',
            zIndex: 10,
            pointerEvents: 'none',
          }}
        >
          Click another room to merge
        </div>
      )}

      {/* Detail panel (normal mode) */}
      {!editMode && (
        <DetailPanel selection={selection} unit={unit} onClose={handleClosePanel} />
      )}
    </div>
  )
}
