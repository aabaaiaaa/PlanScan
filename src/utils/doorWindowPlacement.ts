import type { Point3D, Wall, Room, Door, Window, CapturedPhoto } from '../types'
import {
  vec3Sub,
  vec3Dot,
  vec3Add,
  vec3Scale,
  vec3Normalize,
  pointToPlaneDistance,
  computeCentroid,
  horizontalDistance,
  getTaggedPositions,
} from './geometryExtraction'

// ---------------------------------------------------------------------------
// Constants — default dimensions when geometry doesn't constrain them
// ---------------------------------------------------------------------------

/** Default door width (metres / arbitrary units) */
const DEFAULT_DOOR_WIDTH = 0.9
/** Default door height (metres / arbitrary units) */
const DEFAULT_DOOR_HEIGHT = 2.1
/** Default window width */
const DEFAULT_WINDOW_WIDTH = 1.0
/** Default window height */
const DEFAULT_WINDOW_HEIGHT = 1.2
/** Default window sill height (distance from floor to bottom of window) */
const DEFAULT_WINDOW_SILL_HEIGHT = 0.9
/** Fraction of wall length a door/window can occupy at most */
const MAX_OPENING_FRACTION = 0.8

// ---------------------------------------------------------------------------
// Projection helpers
// ---------------------------------------------------------------------------

/**
 * Project a 3D point onto a wall's plane surface.
 * Returns the closest point on the plane to the input point.
 */
export function projectPointOntoPlane(point: Point3D, wall: Wall): Point3D {
  const dist = pointToPlaneDistance(point, wall.plane)
  return vec3Sub(point, vec3Scale(wall.plane.normal, dist))
}

/**
 * Check whether a projected point lies within the wall's bounding rectangle.
 * The wall corners are ordered: bottom-left, bottom-right, top-right, top-left.
 */
export function isPointOnWallSurface(point: Point3D, wall: Wall): boolean {
  const [bl, br, tr, _tl] = wall.corners

  // Wall horizontal direction (bottom-left → bottom-right)
  const wallDir = vec3Normalize(vec3Sub(br, bl))
  // Wall vertical direction (bottom-left → top-left)
  const upDir = vec3Normalize(vec3Sub(tr, br))

  const rel = vec3Sub(point, bl)
  const along = vec3Dot(rel, wallDir)
  const up = vec3Dot(rel, upDir)

  const wallLength = wall.measurements.length
  const wallHeight = vec3Dot(vec3Sub(tr, br), upDir)

  // Allow a small margin beyond the wall edges
  const margin = 0.3
  return (
    along >= -margin &&
    along <= wallLength + margin &&
    up >= -margin &&
    up <= wallHeight + margin
  )
}

/**
 * Find the nearest wall to a 3D position from a list of walls.
 * Returns the wall, the projected point on the wall, and the distance.
 */
export function findNearestWall(
  position: Point3D,
  walls: Wall[]
): { wall: Wall; projectedPoint: Point3D; distance: number } | null {
  if (walls.length === 0) return null

  let bestWall: Wall | null = null
  let bestProjected: Point3D = { x: 0, y: 0, z: 0 }
  let bestDist = Infinity

  for (const wall of walls) {
    const projected = projectPointOntoPlane(position, wall)
    const dist = Math.abs(pointToPlaneDistance(position, wall.plane))

    if (dist < bestDist) {
      bestDist = dist
      bestWall = wall
      bestProjected = projected
    }
  }

  if (!bestWall) return null
  return { wall: bestWall, projectedPoint: bestProjected, distance: bestDist }
}

/**
 * Clamp a projected point so it lies within the wall's rectangle.
 * Ensures the opening center doesn't float outside the wall bounds.
 */
export function clampToWallBounds(point: Point3D, wall: Wall): Point3D {
  const [bl, br, tr, _tl] = wall.corners

  const wallDir = vec3Normalize(vec3Sub(br, bl))
  const upDir = vec3Normalize(vec3Sub(tr, br))

  const rel = vec3Sub(point, bl)
  let along = vec3Dot(rel, wallDir)
  let up = vec3Dot(rel, upDir)

  const wallLength = wall.measurements.length
  const wallHeight = vec3Dot(vec3Sub(tr, br), upDir)

  along = Math.max(0, Math.min(along, wallLength))
  up = Math.max(0, Math.min(up, wallHeight))

  return vec3Add(bl, vec3Add(vec3Scale(wallDir, along), vec3Scale(upDir, up)))
}

// ---------------------------------------------------------------------------
// Dimension estimation
// ---------------------------------------------------------------------------

/**
 * Estimate door dimensions based on the wall geometry.
 * The door width is capped at a fraction of the wall length.
 * The door height is capped at the wall height.
 */
export function estimateDoorDimensions(wall: Wall): {
  width: number
  height: number
} {
  const [_bl, br, tr, _tl] = wall.corners
  const upDir = vec3Normalize(vec3Sub(tr, br))
  const wallHeight = vec3Dot(vec3Sub(tr, br), upDir)
  const wallLength = wall.measurements.length

  const width = Math.min(DEFAULT_DOOR_WIDTH, wallLength * MAX_OPENING_FRACTION)
  const height = Math.min(DEFAULT_DOOR_HEIGHT, wallHeight * 0.95)

  return { width, height }
}

/**
 * Estimate window dimensions and sill height based on the wall geometry.
 */
export function estimateWindowDimensions(wall: Wall): {
  width: number
  height: number
  sillHeight: number
} {
  const [_bl, br, tr, _tl] = wall.corners
  const upDir = vec3Normalize(vec3Sub(tr, br))
  const wallHeight = vec3Dot(vec3Sub(tr, br), upDir)
  const wallLength = wall.measurements.length

  const width = Math.min(
    DEFAULT_WINDOW_WIDTH,
    wallLength * MAX_OPENING_FRACTION
  )
  const maxWindowHeight = wallHeight - DEFAULT_WINDOW_SILL_HEIGHT
  const height = Math.min(
    DEFAULT_WINDOW_HEIGHT,
    maxWindowHeight > 0 ? maxWindowHeight * 0.8 : wallHeight * 0.4
  )
  const sillHeight = Math.min(DEFAULT_WINDOW_SILL_HEIGHT, wallHeight * 0.35)

  return { width, height, sillHeight }
}

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

/**
 * Place a door on a wall at the given tag position.
 * The door is centred horizontally at the projected position and
 * sits on the floor (bottom of wall).
 */
export function placeDoorOnWall(
  tagPosition: Point3D,
  wall: Wall,
  doorId: string
): Door {
  const projected = projectPointOntoPlane(tagPosition, wall)
  const clamped = clampToWallBounds(projected, wall)

  const { width, height } = estimateDoorDimensions(wall)

  // Door center is at clamped X/Z but vertically at floor + height/2
  const [bl, br, tr, _tl] = wall.corners
  const upDir = vec3Normalize(vec3Sub(tr, br))
  const floorY = Math.min(bl.y, br.y)

  // Position the door center at the clamped horizontal position,
  // vertically centered at floor + height/2
  const position: Point3D = {
    x: clamped.x,
    y: floorY + height / 2,
    z: clamped.z,
  }

  return {
    id: doorId,
    wallId: wall.id,
    position,
    width,
    height,
  }
}

/**
 * Place a window on a wall at the given tag position.
 * The window is centred at the projected position vertically offset
 * by the sill height.
 */
export function placeWindowOnWall(
  tagPosition: Point3D,
  wall: Wall,
  windowId: string
): Window {
  const projected = projectPointOntoPlane(tagPosition, wall)
  const clamped = clampToWallBounds(projected, wall)

  const { width, height, sillHeight } = estimateWindowDimensions(wall)

  const [bl, br, tr, _tl] = wall.corners
  const upDir = vec3Normalize(vec3Sub(tr, br))
  const floorY = Math.min(bl.y, br.y)

  // Window center is at sillHeight + height/2 above the floor
  const position: Point3D = {
    x: clamped.x,
    y: floorY + sillHeight + height / 2,
    z: clamped.z,
  }

  return {
    id: windowId,
    wallId: wall.id,
    position,
    width,
    height,
    sillHeight,
  }
}

/**
 * Find which room a 3D position belongs to, based on horizontal distance
 * to room centroids computed from wall geometry.
 */
export function findRoomForPosition(
  position: Point3D,
  rooms: Room[]
): Room | null {
  if (rooms.length === 0) return null

  let bestRoom: Room | null = null
  let bestDist = Infinity

  for (const room of rooms) {
    // Compute room center from wall corners
    const wallPoints = room.walls.flatMap((w) => [...w.corners])
    if (wallPoints.length === 0) continue
    const center = computeCentroid(wallPoints)
    const d = horizontalDistance(position, center)
    if (d < bestDist) {
      bestDist = d
      bestRoom = room
    }
  }

  return bestRoom
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Place doors and windows onto the reconstructed rooms based on tagged photos.
 *
 * For each photo tagged as 'doorway' or 'window':
 * 1. Use the camera pose to get the 3D position
 * 2. Find the nearest room
 * 3. Find the nearest wall in that room
 * 4. Project the position onto the wall surface
 * 5. Create a Door or Window object with estimated dimensions
 *
 * Returns a new array of rooms with doors and windows populated.
 */
export function placeDoorsAndWindows(
  rooms: Room[],
  photos: CapturedPhoto[]
): Room[] {
  if (rooms.length === 0) return rooms

  // Collect all walls across all rooms for fallback matching
  const allWalls = rooms.flatMap((r) => r.walls)
  if (allWalls.length === 0) return rooms

  // Clone rooms so we don't mutate the input
  const updatedRooms = rooms.map((r) => ({
    ...r,
    doors: [...r.doors],
    windows: [...r.windows],
  }))

  // Build a map from wall ID to room index for quick lookup
  const wallToRoomIndex = new Map<string, number>()
  for (let i = 0; i < updatedRooms.length; i++) {
    for (const wall of updatedRooms[i].walls) {
      wallToRoomIndex.set(wall.id, i)
    }
  }

  let doorCounter = 0
  let windowCounter = 0

  // Process doorway-tagged photos
  const doorwayPhotos = photos.filter(
    (p) => p.tags.includes('doorway') && p.pose
  )
  for (const photo of doorwayPhotos) {
    const position = photo.pose!.position
    const room = findRoomForPosition(position, updatedRooms)
    if (!room) continue

    const nearest = findNearestWall(position, room.walls)
    if (!nearest) continue

    const doorId = `door-${doorCounter++}`
    const door = placeDoorOnWall(position, nearest.wall, doorId)

    const roomIdx = wallToRoomIndex.get(nearest.wall.id)
    if (roomIdx !== undefined) {
      updatedRooms[roomIdx].doors.push(door)
    }
  }

  // Process window-tagged photos
  const windowPhotos = photos.filter(
    (p) => p.tags.includes('window') && p.pose
  )
  for (const photo of windowPhotos) {
    const position = photo.pose!.position
    const room = findRoomForPosition(position, updatedRooms)
    if (!room) continue

    const nearest = findNearestWall(position, room.walls)
    if (!nearest) continue

    const windowId = `window-${windowCounter++}`
    const win = placeWindowOnWall(position, nearest.wall, windowId)

    const roomIdx = wallToRoomIndex.get(nearest.wall.id)
    if (roomIdx !== undefined) {
      updatedRooms[roomIdx].windows.push(win)
    }
  }

  return updatedRooms
}
