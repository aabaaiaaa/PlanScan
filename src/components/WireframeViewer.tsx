import { useEffect, useRef, useCallback } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { BuildingModel, Wall, Door, Window, Room, Staircase } from '../types'
import type { Point3D } from '../types'
import {
  calculateWallLength,
  calculateRoomDimensions,
} from '../utils/measurementCalculation'

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

function createDoorGeometry(door: Door): THREE.LineSegments {
  // Render door as a dashed rectangle centered at door.position
  const halfW = door.width / 2
  const halfH = door.height / 2
  const p = door.position
  const corners: Point3D[] = [
    { x: p.x - halfW, y: p.y - halfH, z: p.z },
    { x: p.x + halfW, y: p.y - halfH, z: p.z },
    { x: p.x + halfW, y: p.y + halfH, z: p.z },
    { x: p.x - halfW, y: p.y + halfH, z: p.z },
  ]
  return createDashedEdgeLoop(corners, COLORS.door)
}

function createWindowGeometry(window: Window): THREE.LineSegments {
  const halfW = window.width / 2
  const halfH = window.height / 2
  const p = window.position
  const corners: Point3D[] = [
    { x: p.x - halfW, y: p.y - halfH, z: p.z },
    { x: p.x + halfW, y: p.y - halfH, z: p.z },
    { x: p.x + halfW, y: p.y + halfH, z: p.z },
    { x: p.x - halfW, y: p.y + halfH, z: p.z },
  ]
  // Merge outline + cross into a single LineSegments
  const crossPositions: number[] = [
    p.x - halfW, p.y, p.z, p.x + halfW, p.y, p.z, // horizontal mid
    p.x, p.y - halfH, p.z, p.x, p.y + halfH, p.z, // vertical mid
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

function formatLength(value: number, unit?: string): string {
  const rounded = Math.round(value * 100) / 100
  return unit ? `${rounded} ${unit}` : `${rounded}`
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

function buildScene(model: BuildingModel): THREE.Group {
  const root = new THREE.Group()
  const unit = model.isCalibrated ? model.unit : undefined

  for (const room of model.rooms) {
    // Walls
    for (const wall of room.walls) {
      root.add(createWallGeometry(wall))
      root.add(createWallLabel(wall, unit))
    }

    // Floor and ceiling
    if (room.floor.boundary.length > 0) {
      root.add(createFloorGeometry(room.floor.boundary))
    }
    if (room.ceiling.boundary.length > 0) {
      root.add(createCeilingGeometry(room.ceiling.boundary))
    }

    // Doors
    for (const door of room.doors) {
      root.add(createDoorGeometry(door))
      root.add(createDoorLabel(door, unit))
    }

    // Windows
    for (const win of room.windows) {
      root.add(createWindowGeometry(win))
      root.add(createWindowLabel(win, unit))
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

  return root
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
// React component
// ---------------------------------------------------------------------------

export interface WireframeViewerProps {
  model: BuildingModel
  width?: number | string
  height?: number | string
}

export function WireframeViewer({
  model,
  width = '100%',
  height = 600,
}: WireframeViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const modelGroupRef = useRef<THREE.Group | null>(null)
  const frameIdRef = useRef<number>(0)

  const animate = useCallback(() => {
    frameIdRef.current = requestAnimationFrame(animate)
    controlsRef.current?.update()
    if (rendererRef.current && sceneRef.current && cameraRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current)
    }
  }, [])

  // Initialize Three.js scene once
  useEffect(() => {
    const container = containerRef.current
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
      cancelAnimationFrame(frameIdRef.current)
      controls.dispose()
      renderer.dispose()
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement)
      }
    }
  }, [animate])

  // Update scene when model changes
  useEffect(() => {
    const scene = sceneRef.current
    const camera = cameraRef.current
    const controls = controlsRef.current
    if (!scene || !camera || !controls) return

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
      })
      modelGroupRef.current = null
    }

    // Build new scene objects
    const group = buildScene(model)
    scene.add(group)
    modelGroupRef.current = group

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
    />
  )
}
