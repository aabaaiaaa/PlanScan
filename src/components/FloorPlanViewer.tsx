import { useEffect, useRef, useCallback, useState } from 'react'
import type { BuildingModel, Room, Wall, Door, Window as WindowType } from '../types'
import type { Point3D } from '../types'
import {
  calculateWallLength,
  calculateRoomDimensions,
} from '../utils/measurementCalculation'
import { CorrectionPopup } from './CorrectionPopup'
import type { CorrectionAction, CorrectionTarget } from './CorrectionPopup'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COLORS = {
  background: '#f5f5f0',
  wall: '#222222',
  wallFill: '#222222',
  door: '#00aa88',
  doorArc: '#00aa88',
  window: '#4499ff',
  roomLabel: '#333333',
  wallLabel: '#666666',
  dimensionLine: '#999999',
  grid: '#e0e0d8',
}

const WALL_THICKNESS = 6
const LABEL_FONT_SIZE = 12
const ROOM_LABEL_FONT_SIZE = 14
const PADDING = 60 // canvas padding in pixels

// Hit testing thresholds (in CSS pixels)
const DOOR_HIT_RADIUS = 15
const WINDOW_HIT_RADIUS = 15
const WALL_HIT_DISTANCE = 10

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/** Project a 3D point to 2D floor plan (top-down: X -> x, Z -> y) */
function projectToFloorPlan(p: Point3D): { x: number; y: number } {
  return { x: p.x, y: p.z }
}

/** Get the bottom two corners of a wall (the footprint on the floor) */
function getWallFootprint(wall: Wall): [{ x: number; y: number }, { x: number; y: number }] {
  const [bottomLeft, bottomRight] = wall.corners
  return [projectToFloorPlan(bottomLeft), projectToFloorPlan(bottomRight)]
}

/** Get the wall normal direction in 2D (perpendicular to wall direction) */
function getWall2DNormal(wall: Wall): { x: number; y: number } {
  const [a, b] = getWallFootprint(wall)
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len === 0) return { x: 0, y: -1 }
  // Normal is perpendicular: rotate 90 degrees
  return { x: -dy / len, y: dx / len }
}

/** Midpoint of two 2D points */
function midpoint2D(
  a: { x: number; y: number },
  b: { x: number; y: number },
): { x: number; y: number } {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

/** Distance between two 2D points */
function dist2D(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2)
}

/** Angle from point a to point b in radians */
function angle2D(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.atan2(b.y - a.y, b.x - a.x)
}

/** Distance from a point to a line segment in 2D */
function pointToSegmentDistance(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2)
  let t = ((px - ax) * dx + (py - ay) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  const nearX = ax + t * dx
  const nearY = ay + t * dy
  return Math.sqrt((px - nearX) ** 2 + (py - nearY) ** 2)
}

// ---------------------------------------------------------------------------
// Viewport transform: maps world XZ coordinates to canvas pixel coordinates
// ---------------------------------------------------------------------------

interface ViewportTransform {
  scale: number
  offsetX: number
  offsetY: number
}

function computeViewport(
  rooms: Room[],
  canvasWidth: number,
  canvasHeight: number,
): ViewportTransform {
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity

  for (const room of rooms) {
    for (const wall of room.walls) {
      for (const corner of wall.corners) {
        if (corner.x < minX) minX = corner.x
        if (corner.x > maxX) maxX = corner.x
        if (corner.z < minZ) minZ = corner.z
        if (corner.z > maxZ) maxZ = corner.z
      }
    }
    for (const p of room.floor.boundary) {
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
      if (p.z < minZ) minZ = p.z
      if (p.z > maxZ) maxZ = p.z
    }
  }

  // Handle empty / single-point case
  if (!isFinite(minX) || !isFinite(maxX)) {
    return { scale: 1, offsetX: canvasWidth / 2, offsetY: canvasHeight / 2 }
  }

  const worldW = maxX - minX || 1
  const worldH = maxZ - minZ || 1

  const drawW = canvasWidth - PADDING * 2
  const drawH = canvasHeight - PADDING * 2

  const scale = Math.min(drawW / worldW, drawH / worldH)

  // Center the drawing
  const offsetX = PADDING + (drawW - worldW * scale) / 2 - minX * scale
  const offsetY = PADDING + (drawH - worldH * scale) / 2 - minZ * scale

  return { scale, offsetX, offsetY }
}

/** Transform world XZ to canvas pixel */
function toCanvas(
  p: { x: number; y: number },
  vt: ViewportTransform,
): { x: number; y: number } {
  return {
    x: p.x * vt.scale + vt.offsetX,
    y: p.y * vt.scale + vt.offsetY,
  }
}

/** Transform canvas pixel to world XZ (inverse of toCanvas) */
function fromCanvas(
  p: { x: number; y: number },
  vt: ViewportTransform,
): { x: number; y: number } {
  return {
    x: (p.x - vt.offsetX) / vt.scale,
    y: (p.y - vt.offsetY) / vt.scale,
  }
}

// ---------------------------------------------------------------------------
// 2D Hit testing
// ---------------------------------------------------------------------------

type HitResult =
  | { type: 'door'; door: Door; roomId: string }
  | { type: 'window'; window: WindowType; roomId: string }
  | { type: 'wall'; wall: Wall; roomId: string; worldPosition: Point3D }
  | { type: 'room'; room: Room }

/** Point-in-polygon test using ray casting (2D) */
function pointInPolygon2D(
  px: number,
  py: number,
  polygon: { x: number; y: number }[],
): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y
    const xj = polygon[j].x, yj = polygon[j].y
    if (
      yi > py !== yj > py &&
      px < ((xj - xi) * (py - yi)) / (yj - yi) + xi
    ) {
      inside = !inside
    }
  }
  return inside
}

/**
 * Perform hit testing on the 2D floor plan canvas.
 * Priority: doors > windows > walls > rooms (drawn top to bottom).
 */
function hitTest2D(
  cssX: number,
  cssY: number,
  rooms: Room[],
  vt: ViewportTransform,
): HitResult | null {
  // 1. Check doors first (they're rendered on top)
  for (const room of rooms) {
    for (const door of room.doors) {
      const pos = projectToFloorPlan(door.position)
      const cp = toCanvas(pos, vt)
      if (dist2D({ x: cssX, y: cssY }, cp) < DOOR_HIT_RADIUS) {
        return { type: 'door', door, roomId: room.id }
      }
    }
  }

  // 2. Check windows
  for (const room of rooms) {
    for (const win of room.windows) {
      const pos = projectToFloorPlan(win.position)
      const cp = toCanvas(pos, vt)
      if (dist2D({ x: cssX, y: cssY }, cp) < WINDOW_HIT_RADIUS) {
        return { type: 'window', window: win, roomId: room.id }
      }
    }
  }

  // 3. Check walls
  let bestWall: Wall | null = null
  let bestRoomId = ''
  let bestDist = Infinity

  for (const room of rooms) {
    for (const wall of room.walls) {
      const [a, b] = getWallFootprint(wall)
      const ca = toCanvas(a, vt)
      const cb = toCanvas(b, vt)
      const d = pointToSegmentDistance(cssX, cssY, ca.x, ca.y, cb.x, cb.y)
      if (d < WALL_HIT_DISTANCE && d < bestDist) {
        bestDist = d
        bestWall = wall
        bestRoomId = room.id
      }
    }
  }

  if (bestWall) {
    // Convert click position back to world coordinates
    const worldXZ = fromCanvas({ x: cssX, y: cssY }, vt)
    const floorY = Math.min(bestWall.corners[0].y, bestWall.corners[1].y)
    const worldPosition: Point3D = { x: worldXZ.x, y: floorY, z: worldXZ.y }
    return { type: 'wall', wall: bestWall, roomId: bestRoomId, worldPosition }
  }

  // 4. Check if click is inside a room floor boundary
  for (const room of rooms) {
    if (room.floor.boundary.length < 3) continue
    const canvasPoly = room.floor.boundary.map((p) =>
      toCanvas(projectToFloorPlan(p), vt),
    )
    if (pointInPolygon2D(cssX, cssY, canvasPoly)) {
      return { type: 'room', room }
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// Drawing functions
// ---------------------------------------------------------------------------

function drawWall(
  ctx: CanvasRenderingContext2D,
  wall: Wall,
  vt: ViewportTransform,
) {
  const [a, b] = getWallFootprint(wall)
  const ca = toCanvas(a, vt)
  const cb = toCanvas(b, vt)

  ctx.save()
  ctx.strokeStyle = COLORS.wall
  ctx.lineWidth = WALL_THICKNESS
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(ca.x, ca.y)
  ctx.lineTo(cb.x, cb.y)
  ctx.stroke()
  ctx.restore()
}

function drawWallLabel(
  ctx: CanvasRenderingContext2D,
  wall: Wall,
  vt: ViewportTransform,
  unit?: string,
) {
  const length = calculateWallLength(wall)
  const text = formatLength(length, unit)

  const [a, b] = getWallFootprint(wall)
  const ca = toCanvas(a, vt)
  const cb = toCanvas(b, vt)

  // Skip labelling very short walls
  if (dist2D(ca, cb) < 40) return

  const mid = midpoint2D(ca, cb)
  const normal = getWall2DNormal(wall)

  // Offset the label away from the wall
  const labelOffset = 14
  const lx = mid.x + normal.x * labelOffset
  const ly = mid.y + normal.y * labelOffset

  // Compute rotation to align text with wall
  let rotation = angle2D(ca, cb)
  // Keep text upright (avoid upside-down labels)
  if (rotation > Math.PI / 2 || rotation < -Math.PI / 2) {
    rotation += Math.PI
  }

  ctx.save()
  ctx.translate(lx, ly)
  ctx.rotate(rotation)
  ctx.font = `${LABEL_FONT_SIZE}px system-ui, sans-serif`
  ctx.fillStyle = COLORS.wallLabel
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 0, 0)
  ctx.restore()
}

function drawDoor(
  ctx: CanvasRenderingContext2D,
  door: Door,
  wall: Wall | undefined,
  vt: ViewportTransform,
) {
  const pos = projectToFloorPlan(door.position)
  const cp = toCanvas(pos, vt)
  const doorWidthPx = door.width * vt.scale

  // Determine wall direction for door orientation
  let wallAngle = 0
  if (wall) {
    const [a, b] = getWallFootprint(wall)
    const ca = toCanvas(a, vt)
    const cb = toCanvas(b, vt)
    wallAngle = angle2D(ca, cb)
  }

  ctx.save()
  ctx.translate(cp.x, cp.y)
  ctx.rotate(wallAngle)

  // Draw gap in the wall (clear a section)
  ctx.strokeStyle = COLORS.background
  ctx.lineWidth = WALL_THICKNESS + 2
  ctx.beginPath()
  ctx.moveTo(-doorWidthPx / 2, 0)
  ctx.lineTo(doorWidthPx / 2, 0)
  ctx.stroke()

  // Draw door arc (quarter circle swing)
  ctx.strokeStyle = COLORS.door
  ctx.lineWidth = 1.5
  ctx.setLineDash([3, 3])
  ctx.beginPath()
  ctx.arc(-doorWidthPx / 2, 0, doorWidthPx, 0, -Math.PI / 2, true)
  ctx.stroke()
  ctx.setLineDash([])

  // Draw the door leaf (straight line from hinge to arc end)
  ctx.strokeStyle = COLORS.door
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(-doorWidthPx / 2, 0)
  ctx.lineTo(-doorWidthPx / 2, -doorWidthPx)
  ctx.stroke()

  ctx.restore()
}

function drawWindow(
  ctx: CanvasRenderingContext2D,
  win: WindowType,
  wall: Wall | undefined,
  vt: ViewportTransform,
) {
  const pos = projectToFloorPlan(win.position)
  const cp = toCanvas(pos, vt)
  const winWidthPx = win.width * vt.scale

  // Determine wall direction for window orientation
  let wallAngle = 0
  if (wall) {
    const [a, b] = getWallFootprint(wall)
    const ca = toCanvas(a, vt)
    const cb = toCanvas(b, vt)
    wallAngle = angle2D(ca, cb)
  }

  ctx.save()
  ctx.translate(cp.x, cp.y)
  ctx.rotate(wallAngle)

  // Draw gap in the wall
  ctx.strokeStyle = COLORS.background
  ctx.lineWidth = WALL_THICKNESS + 2
  ctx.beginPath()
  ctx.moveTo(-winWidthPx / 2, 0)
  ctx.lineTo(winWidthPx / 2, 0)
  ctx.stroke()

  // Draw window symbol: three parallel lines
  const offset = 3
  ctx.strokeStyle = COLORS.window
  ctx.lineWidth = 1.5

  // Outer line 1
  ctx.beginPath()
  ctx.moveTo(-winWidthPx / 2, -offset)
  ctx.lineTo(winWidthPx / 2, -offset)
  ctx.stroke()

  // Center line (thicker)
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(-winWidthPx / 2, 0)
  ctx.lineTo(winWidthPx / 2, 0)
  ctx.stroke()

  // Outer line 2
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(-winWidthPx / 2, offset)
  ctx.lineTo(winWidthPx / 2, offset)
  ctx.stroke()

  ctx.restore()
}

function drawRoomLabel(
  ctx: CanvasRenderingContext2D,
  room: Room,
  vt: ViewportTransform,
  unit?: string,
) {
  // Find the center of the room floor
  const boundary = room.floor.boundary
  if (boundary.length === 0) return

  const cx = boundary.reduce((s, p) => s + p.x, 0) / boundary.length
  const cz = boundary.reduce((s, p) => s + p.z, 0) / boundary.length
  const center = toCanvas({ x: cx, y: cz }, vt)

  const dims = calculateRoomDimensions(room)
  const dimText = `${formatLength(dims.width, unit)} x ${formatLength(dims.depth, unit)}`

  // Room name
  ctx.save()
  ctx.font = `bold ${ROOM_LABEL_FONT_SIZE}px system-ui, sans-serif`
  ctx.fillStyle = COLORS.roomLabel
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(room.name, center.x, center.y - 10)

  // Dimensions
  ctx.font = `${LABEL_FONT_SIZE}px system-ui, sans-serif`
  ctx.fillStyle = COLORS.wallLabel
  ctx.fillText(dimText, center.x, center.y + 8)
  ctx.restore()
}

// ---------------------------------------------------------------------------
// Full floor rendering
// ---------------------------------------------------------------------------

function renderFloorPlan(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  rooms: Room[],
  unit?: string,
) {
  // Clear canvas
  ctx.fillStyle = COLORS.background
  ctx.fillRect(0, 0, canvasWidth, canvasHeight)

  if (rooms.length === 0) {
    ctx.font = '14px system-ui, sans-serif'
    ctx.fillStyle = '#999'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('No rooms on this floor', canvasWidth / 2, canvasHeight / 2)
    return
  }

  const vt = computeViewport(rooms, canvasWidth, canvasHeight)

  // Build wall lookup by ID for doors/windows
  const wallMap = new Map<string, Wall>()
  for (const room of rooms) {
    for (const wall of room.walls) {
      wallMap.set(wall.id, wall)
    }
  }

  // 1. Draw walls first (base layer)
  for (const room of rooms) {
    for (const wall of room.walls) {
      drawWall(ctx, wall, vt)
    }
  }

  // 2. Draw doors (over walls — they create gaps)
  for (const room of rooms) {
    for (const door of room.doors) {
      drawDoor(ctx, door, wallMap.get(door.wallId), vt)
    }
  }

  // 3. Draw windows (over walls — they create gaps)
  for (const room of rooms) {
    for (const win of room.windows) {
      drawWindow(ctx, win, wallMap.get(win.wallId), vt)
    }
  }

  // 4. Draw wall length labels
  for (const room of rooms) {
    for (const wall of room.walls) {
      drawWallLabel(ctx, wall, vt, unit)
    }
  }

  // 5. Draw room labels with dimensions
  for (const room of rooms) {
    drawRoomLabel(ctx, room, vt, unit)
  }
}

// ---------------------------------------------------------------------------
// Format helper
// ---------------------------------------------------------------------------

function formatLength(value: number, unit?: string): string {
  const rounded = Math.round(value * 100) / 100
  return unit ? `${rounded} ${unit}` : `${rounded}`
}

// ---------------------------------------------------------------------------
// React component
// ---------------------------------------------------------------------------

export interface FloorPlanViewerProps {
  model: BuildingModel
  /** The initial floor level to display (0-based). Defaults to 0. */
  floorLevel?: number
  /** Called when the user selects a different floor via the switcher. */
  onFloorChange?: (level: number) => void
  /** Callback when a correction action is taken (add/remove door or window).
   *  When provided, an "Edit" toggle button appears in the viewer. */
  onCorrection?: (action: CorrectionAction) => void
  width?: number | string
  height?: number | string
}

/** Labels for floor levels */
function getFloorLabel(level: number): string {
  if (level === 0) return 'Ground'
  return `Floor ${level}`
}

export function FloorPlanViewer({
  model,
  floorLevel = 0,
  onFloorChange,
  onCorrection,
  width = '100%',
  height = 500,
}: FloorPlanViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [selectedFloor, setSelectedFloor] = useState(floorLevel)
  const [editMode, setEditMode] = useState(false)
  const [popup, setPopup] = useState<{ x: number; y: number; target: CorrectionTarget } | null>(null)

  // Split/merge interaction state
  const [splitState, setSplitState] = useState<{
    roomId: string
    startPoint?: { x: number; y: number } // canvas coordinates
    startWorld?: Point3D // world coordinates
  } | null>(null)
  const [mergeState, setMergeState] = useState<{
    roomId: string
  } | null>(null)
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null)

  // Store current rooms and viewport for click handler
  const viewportRef = useRef<ViewportTransform>({ scale: 1, offsetX: 0, offsetY: 0 })
  const roomsForFloorRef = useRef<Room[]>([])

  // Sync internal state if the prop changes externally
  useEffect(() => {
    setSelectedFloor(floorLevel)
  }, [floorLevel])

  const handleFloorSelect = (level: number) => {
    setSelectedFloor(level)
    onFloorChange?.(level)
  }

  const showFloorSwitcher = model.floorLevels > 1

  // Filter rooms for the selected floor level
  const getRoomsForFloor = useCallback(
    (level: number): Room[] => {
      return model.rooms.filter((room) => room.floor.level === level)
    },
    [model],
  )

  const unit = model.isCalibrated ? model.unit : undefined

  // Canvas click handler for edit mode
  const handleCanvasClick = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      if (!editMode || !onCorrection) return

      const canvas = canvasRef.current
      if (!canvas) return

      const rect = canvas.getBoundingClientRect()
      const cssX = event.clientX - rect.left
      const cssY = event.clientY - rect.top
      const vt = viewportRef.current
      const rooms = roomsForFloorRef.current

      // --- Split mode: place split line points ---
      if (splitState) {
        const worldXZ = fromCanvas({ x: cssX, y: cssY }, vt)
        const room = rooms.find((r) => r.id === splitState.roomId)
        const floorY =
          room && room.floor.boundary.length > 0
            ? room.floor.boundary.reduce((s, p) => s + p.y, 0) /
              room.floor.boundary.length
            : 0

        if (!splitState.startPoint) {
          // First click — set start
          setSplitState({
            ...splitState,
            startPoint: { x: cssX, y: cssY },
            startWorld: { x: worldXZ.x, y: floorY, z: worldXZ.y },
          })
        } else if (splitState.startWorld) {
          // Second click — dispatch split
          onCorrection({
            type: 'splitRoom',
            roomId: splitState.roomId,
            splitStart: splitState.startWorld,
            splitEnd: { x: worldXZ.x, y: floorY, z: worldXZ.y },
          })
          setSplitState(null)
        }
        return
      }

      // --- Merge mode: click second room ---
      if (mergeState) {
        const hitResult = hitTest2D(cssX, cssY, rooms, vt)
        if (hitResult?.type === 'room' && hitResult.room.id !== mergeState.roomId) {
          onCorrection({
            type: 'mergeRooms',
            roomIdA: mergeState.roomId,
            roomIdB: hitResult.room.id,
          })
        }
        setMergeState(null)
        return
      }

      const hitResult = hitTest2D(cssX, cssY, rooms, vt)

      if (!hitResult) {
        setPopup(null)
        return
      }

      // Position the popup at the click location, clamped to container bounds
      const container = containerRef.current
      const containerRect = container?.getBoundingClientRect()
      const maxX = containerRect ? containerRect.width - 160 : cssX
      const maxY = containerRect ? containerRect.height - 150 : cssY
      const popupX = Math.min(cssX, maxX)
      const popupY = Math.min(cssY, maxY)

      if (hitResult.type === 'wall') {
        setPopup({
          x: popupX,
          y: popupY,
          target: {
            type: 'wall',
            roomId: hitResult.roomId,
            wall: hitResult.wall,
            clickPosition: hitResult.worldPosition,
          },
        })
      } else if (hitResult.type === 'door') {
        setPopup({
          x: popupX,
          y: popupY,
          target: {
            type: 'door',
            roomId: hitResult.roomId,
            doorId: hitResult.door.id,
          },
        })
      } else if (hitResult.type === 'window') {
        setPopup({
          x: popupX,
          y: popupY,
          target: {
            type: 'window',
            roomId: hitResult.roomId,
            windowId: hitResult.window.id,
          },
        })
      } else if (hitResult.type === 'room') {
        setPopup({
          x: popupX,
          y: popupY,
          target: {
            type: 'room',
            roomId: hitResult.room.id,
            roomName: hitResult.room.name,
          },
        })
      }
    },
    [editMode, onCorrection, splitState, mergeState],
  )

  // Render the floor plan whenever model or floor level changes
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Size the canvas to the container
    const rect = container.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const w = rect.width || 800
    const h = rect.height || 500

    canvas.width = w * dpr
    canvas.height = h * dpr
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const rooms = getRoomsForFloor(selectedFloor)
    roomsForFloorRef.current = rooms

    // Store the viewport transform for hit testing
    if (rooms.length > 0) {
      viewportRef.current = computeViewport(rooms, w, h)
    }

    renderFloorPlan(ctx, w, h, rooms, unit)

    // Clear popup when floor or model changes
    setPopup(null)
  }, [model, selectedFloor, getRoomsForFloor, unit])

  // Re-render on resize
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const onResize = () => {
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const rect = container.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      const w = rect.width || 800
      const h = rect.height || 500

      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const rooms = getRoomsForFloor(selectedFloor)
      roomsForFloorRef.current = rooms

      if (rooms.length > 0) {
        viewportRef.current = computeViewport(rooms, w, h)
      }

      renderFloorPlan(ctx, w, h, rooms, unit)
    }

    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [model, selectedFloor, getRoomsForFloor, unit])

  // Mousemove handler for split line preview
  const handleCanvasMouseMove = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      if (!splitState?.startPoint) return
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      setMousePos({ x: event.clientX - rect.left, y: event.clientY - rect.top })
    },
    [splitState],
  )

  // Draw split preview line as an overlay (no full redraw)
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const overlay = overlayCanvasRef.current
    if (!overlay) return

    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const w = rect.width || 800
    const h = rect.height || 500

    overlay.width = w * dpr
    overlay.height = h * dpr
    overlay.style.width = `${w}px`
    overlay.style.height = `${h}px`

    const ctx = overlay.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    if (!splitState?.startPoint || !mousePos) return

    // Draw the preview line
    ctx.save()
    ctx.strokeStyle = '#ff4444'
    ctx.lineWidth = 2
    ctx.setLineDash([6, 4])
    ctx.beginPath()
    ctx.moveTo(splitState.startPoint.x, splitState.startPoint.y)
    ctx.lineTo(mousePos.x, mousePos.y)
    ctx.stroke()
    ctx.setLineDash([])

    // Draw start point marker
    ctx.fillStyle = '#ff4444'
    ctx.beginPath()
    ctx.arc(splitState.startPoint.x, splitState.startPoint.y, 4, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }, [splitState, mousePos])

  const handleToggleEditMode = useCallback(() => {
    setEditMode((prev) => {
      if (!prev) {
        // Entering edit mode
      } else {
        // Leaving edit mode: clear popup and split/merge state
        setPopup(null)
        setSplitState(null)
        setMergeState(null)
        setMousePos(null)
      }
      return !prev
    })
  }, [])

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
    setMousePos(null)
    setPopup(null)
  }, [])

  return (
    <div
      ref={containerRef}
      data-testid="floor-plan-viewer"
      style={{
        width,
        height,
        position: 'relative',
        overflow: 'hidden',
        background: COLORS.background,
      }}
    >
      <canvas
        ref={canvasRef}
        data-testid="floor-plan-canvas"
        onClick={handleCanvasClick}
        onMouseMove={handleCanvasMouseMove}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          cursor: splitState || mergeState ? 'crosshair' : editMode ? 'crosshair' : 'default',
        }}
      />
      {/* Lightweight overlay canvas for split preview line (avoids full floor plan redraw) */}
      <canvas
        ref={overlayCanvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      />

      {/* Edit mode toggle — only shown when onCorrection is provided */}
      {onCorrection && (
        <button
          data-testid="edit-mode-toggle-2d"
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
            background: editMode ? '#ff6b6b' : 'rgba(0,0,0,0.15)',
            color: editMode ? '#fff' : '#333',
            boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
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
          data-testid="split-mode-indicator-2d"
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
          data-testid="merge-mode-indicator-2d"
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

      {showFloorSwitcher && (
        <div
          data-testid="floor-switcher"
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            display: 'flex',
            gap: 4,
            background: 'rgba(255,255,255,0.9)',
            borderRadius: 6,
            padding: 4,
            boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
          }}
        >
          {Array.from({ length: model.floorLevels }, (_, i) => (
            <button
              key={i}
              data-testid={`floor-button-${i}`}
              onClick={() => handleFloorSelect(i)}
              style={{
                padding: '4px 10px',
                fontSize: 12,
                fontFamily: 'system-ui, sans-serif',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                background: selectedFloor === i ? '#333' : 'transparent',
                color: selectedFloor === i ? '#fff' : '#333',
                fontWeight: selectedFloor === i ? 600 : 400,
              }}
            >
              {getFloorLabel(i)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
