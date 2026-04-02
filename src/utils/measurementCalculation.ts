import type {
  Wall,
  Door,
  Window,
  Room,
  BuildingModel,
  MeasurementUnit,
} from '../types'
import type { Point3D } from '../types'
import { vec3Sub, vec3Length } from './geometryExtraction'

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

/** Measurement result for a single wall segment */
export interface WallMeasurementResult {
  wallId: string
  roomId: string
  length: number
}

/** Measurement result for a door */
export interface DoorMeasurementResult {
  doorId: string
  wallId: string
  roomId: string
  width: number
  height: number
}

/** Measurement result for a window */
export interface WindowMeasurementResult {
  windowId: string
  wallId: string
  roomId: string
  width: number
  height: number
  sillHeight: number
}

/** Measurement result for a room */
export interface RoomMeasurementResult {
  roomId: string
  roomName: string
  width: number
  depth: number
  ceilingHeight: number
  walls: WallMeasurementResult[]
  doors: DoorMeasurementResult[]
  windows: WindowMeasurementResult[]
}

/** Complete measurement report for the entire building */
export interface BuildingMeasurements {
  rooms: RoomMeasurementResult[]
  isCalibrated: boolean
  unit: MeasurementUnit | 'arbitrary'
  warnings: string[]
}

// ---------------------------------------------------------------------------
// Geometry-based calculation helpers
// ---------------------------------------------------------------------------

/**
 * Calculate wall length from its corner points.
 * Uses the distance between bottom-left and bottom-right corners.
 */
export function calculateWallLength(wall: Wall): number {
  const [bottomLeft, bottomRight] = wall.corners
  return vec3Length(vec3Sub(bottomRight, bottomLeft))
}

/**
 * Calculate wall height from its corner points.
 * Uses the distance between bottom-right and top-right corners.
 */
export function calculateWallHeight(wall: Wall): number {
  const [, bottomRight, topRight] = wall.corners
  return vec3Length(vec3Sub(topRight, bottomRight))
}

/**
 * Calculate room dimensions from wall geometry.
 * Computes the bounding box of all wall corner points in the XZ plane
 * and ceiling height from floor/ceiling Y positions.
 */
export function calculateRoomDimensions(room: Room): {
  width: number
  depth: number
  ceilingHeight: number
} {
  const allCorners = room.walls.flatMap((w) => [...w.corners])

  if (allCorners.length === 0) {
    // Fall back to floor/ceiling boundary if no walls
    const floorBoundary = room.floor.boundary
    const ceilingBoundary = room.ceiling.boundary

    if (floorBoundary.length === 0) {
      return { width: 0, depth: 0, ceilingHeight: 0 }
    }

    const { width, depth } = computeXZExtents(floorBoundary)
    const floorY = averageY(floorBoundary)
    const ceilingY = averageY(ceilingBoundary.length > 0 ? ceilingBoundary : floorBoundary)
    return { width, depth, ceilingHeight: Math.abs(ceilingY - floorY) }
  }

  const { width, depth } = computeXZExtents(allCorners)

  // Ceiling height from floor and ceiling planes
  const floorY = averageY(room.floor.boundary)
  const ceilingY = averageY(room.ceiling.boundary)
  const ceilingHeight = Math.abs(ceilingY - floorY)

  return { width, depth, ceilingHeight }
}

/**
 * Compute width and depth from XZ extents of a set of points.
 * Width is the shorter dimension, depth is the longer.
 */
function computeXZExtents(points: Point3D[]): { width: number; depth: number } {
  let minX = Infinity, maxX = -Infinity
  let minZ = Infinity, maxZ = -Infinity

  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.z < minZ) minZ = p.z
    if (p.z > maxZ) maxZ = p.z
  }

  const extentX = maxX - minX
  const extentZ = maxZ - minZ

  return {
    width: Math.min(extentX, extentZ),
    depth: Math.max(extentX, extentZ),
  }
}

/** Compute the average Y value of a set of points */
function averageY(points: Point3D[]): number {
  if (points.length === 0) return 0
  return points.reduce((sum, p) => sum + p.y, 0) / points.length
}

// ---------------------------------------------------------------------------
// Measurement extraction
// ---------------------------------------------------------------------------

/**
 * Extract measurements for a single wall.
 */
export function getWallMeasurements(wall: Wall, roomId: string): WallMeasurementResult {
  return {
    wallId: wall.id,
    roomId,
    length: calculateWallLength(wall),
  }
}

/**
 * Extract measurements for a single door.
 */
export function getDoorMeasurements(door: Door, roomId: string): DoorMeasurementResult {
  return {
    doorId: door.id,
    wallId: door.wallId,
    roomId,
    width: door.width,
    height: door.height,
  }
}

/**
 * Extract measurements for a single window.
 */
export function getWindowMeasurements(window: Window, roomId: string): WindowMeasurementResult {
  return {
    windowId: window.id,
    wallId: window.wallId,
    roomId,
    width: window.width,
    height: window.height,
    sillHeight: window.sillHeight,
  }
}

/**
 * Extract all measurements for a single room.
 */
export function getRoomMeasurements(room: Room): RoomMeasurementResult {
  const dims = calculateRoomDimensions(room)

  return {
    roomId: room.id,
    roomName: room.name,
    width: dims.width,
    depth: dims.depth,
    ceilingHeight: dims.ceilingHeight,
    walls: room.walls.map((w) => getWallMeasurements(w, room.id)),
    doors: room.doors.map((d) => getDoorMeasurements(d, room.id)),
    windows: room.windows.map((w) => getWindowMeasurements(w, room.id)),
  }
}

// ---------------------------------------------------------------------------
// Recalculation — updates the model's stored measurements from geometry
// ---------------------------------------------------------------------------

/**
 * Recalculate all measurements on a BuildingModel from the current geometry.
 * Returns a new model with updated measurements on every room, wall, door, and window.
 * This is used after manual corrections to keep measurements consistent.
 */
export function recalculateMeasurements(model: BuildingModel): BuildingModel {
  const updatedRooms = model.rooms.map((room) => {
    const updatedWalls = room.walls.map((wall) => ({
      ...wall,
      measurements: { length: calculateWallLength(wall) },
    }))

    const dims = calculateRoomDimensions({ ...room, walls: updatedWalls })

    return {
      ...room,
      walls: updatedWalls,
      measurements: {
        width: dims.width,
        depth: dims.depth,
        ceilingHeight: dims.ceilingHeight,
      },
    }
  })

  return { ...model, rooms: updatedRooms }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Calculate all measurements from a BuildingModel.
 *
 * Returns a comprehensive measurement report including every wall length,
 * room dimension, door size, and window size. If the model is not calibrated
 * (no scale reference was provided), measurements are in arbitrary units and
 * a warning is included.
 */
export function calculateAllMeasurements(model: BuildingModel): BuildingMeasurements {
  const warnings: string[] = []

  if (!model.isCalibrated) {
    warnings.push(
      'No scale reference provided. All measurements are in arbitrary units and may not reflect real-world dimensions.'
    )
  }

  if (model.rooms.length === 0) {
    warnings.push('No rooms detected in the model.')
  }

  const rooms = model.rooms.map((room) => {
    const result = getRoomMeasurements(room)

    if (room.walls.length === 0) {
      warnings.push(`${room.name} has no detected walls.`)
    }

    return result
  })

  return {
    rooms,
    isCalibrated: model.isCalibrated,
    unit: model.isCalibrated && model.unit ? model.unit : 'arbitrary',
    warnings,
  }
}
