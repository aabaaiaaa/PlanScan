import type { Room, Wall, Floor, Ceiling, Door, Window } from '../types'
import type { Point3D } from '../types'
import {
  vec3Sub,
  vec3Cross,
  vec3Normalize,
  vec3Length,
  vec3Dot,
} from './geometryExtraction'
import { calculateWallLength, calculateRoomDimensions } from './measurementCalculation'

// ---------------------------------------------------------------------------
// 2D line helpers (working in XZ plane)
// ---------------------------------------------------------------------------

/**
 * Determine which side of a line a point falls on in the XZ plane.
 * Positive = left side, negative = right side, 0 = on the line.
 */
export function sideOfLine(
  point: { x: number; z: number },
  lineStart: { x: number; z: number },
  lineEnd: { x: number; z: number },
): number {
  return (
    (lineEnd.x - lineStart.x) * (point.z - lineStart.z) -
    (lineEnd.z - lineStart.z) * (point.x - lineStart.x)
  )
}

/**
 * Find the parameter t where segment (p1->p2) intersects line (lineStart->lineEnd) in XZ.
 * Returns null if parallel.
 */
function segmentLineIntersectionXZ(
  p1: { x: number; z: number },
  p2: { x: number; z: number },
  lineStart: { x: number; z: number },
  lineEnd: { x: number; z: number },
): number | null {
  const dx = p2.x - p1.x
  const dz = p2.z - p1.z
  const ldx = lineEnd.x - lineStart.x
  const ldz = lineEnd.z - lineStart.z

  const denom = dx * ldz - dz * ldx
  if (Math.abs(denom) < 1e-10) return null

  return ((lineStart.x - p1.x) * ldz - (lineStart.z - p1.z) * ldx) / denom
}

/** Interpolate between two 3D points at parameter t */
function lerp3D(a: Point3D, b: Point3D, t: number): Point3D {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  }
}

// ---------------------------------------------------------------------------
// Polygon splitting
// ---------------------------------------------------------------------------

/**
 * Split a polygon (array of Point3D) by an infinite line in the XZ plane.
 * Returns [sideA, sideB] where sideA contains vertices on the positive side
 * and sideB contains vertices on the negative side.
 */
export function splitPolygonByLine(
  polygon: Point3D[],
  lineStart: { x: number; z: number },
  lineEnd: { x: number; z: number },
): [Point3D[], Point3D[]] {
  if (polygon.length < 3) return [polygon, []]

  const sideA: Point3D[] = []
  const sideB: Point3D[] = []

  for (let i = 0; i < polygon.length; i++) {
    const current = polygon[i]
    const next = polygon[(i + 1) % polygon.length]

    const sCurr = sideOfLine(current, lineStart, lineEnd)
    const sNext = sideOfLine(next, lineStart, lineEnd)

    if (sCurr >= 0) sideA.push(current)
    if (sCurr <= 0) sideB.push(current)

    // Edge crosses the line — add intersection to both sides
    if ((sCurr > 0 && sNext < 0) || (sCurr < 0 && sNext > 0)) {
      const t = segmentLineIntersectionXZ(current, next, lineStart, lineEnd)
      if (t !== null && t >= 0 && t <= 1) {
        const intersection = lerp3D(current, next, t)
        sideA.push(intersection)
        sideB.push(intersection)
      }
    }
  }

  return [sideA, sideB]
}

// ---------------------------------------------------------------------------
// Convex hull (XZ plane) — used for merging floor/ceiling boundaries
// ---------------------------------------------------------------------------

/** Compute a convex hull of 3D points projected to XZ. Preserves average Y. */
export function computeConvexHullXZ(points: Point3D[]): Point3D[] {
  if (points.length <= 3) return [...points]

  const avgY = points.reduce((s, p) => s + p.y, 0) / points.length

  // Gift-wrapping / Jarvis march in XZ
  type Pt = { x: number; z: number; idx: number }
  const pts: Pt[] = points.map((p, i) => ({ x: p.x, z: p.z, idx: i }))

  // Find leftmost point
  let startIdx = 0
  for (let i = 1; i < pts.length; i++) {
    if (
      pts[i].x < pts[startIdx].x ||
      (pts[i].x === pts[startIdx].x && pts[i].z < pts[startIdx].z)
    ) {
      startIdx = i
    }
  }

  const hull: number[] = []
  let current = startIdx
  do {
    hull.push(current)
    // Initialize next to first index that isn't current
    let next = current === 0 ? 1 : 0
    for (let i = 0; i < pts.length; i++) {
      if (i === current || i === next) continue

      const cross =
        (pts[i].x - pts[current].x) * (pts[next].z - pts[current].z) -
        (pts[i].z - pts[current].z) * (pts[next].x - pts[current].x)
      if (cross > 0) {
        next = i
      } else if (Math.abs(cross) < 1e-10) {
        // Collinear — pick the farther point
        const distI =
          (pts[i].x - pts[current].x) ** 2 + (pts[i].z - pts[current].z) ** 2
        const distNext =
          (pts[next].x - pts[current].x) ** 2 +
          (pts[next].z - pts[current].z) ** 2
        if (distI > distNext) next = i
      }
    }
    current = next
  } while (current !== startIdx && hull.length < pts.length)

  return hull.map((i) => ({
    x: pts[i].x,
    y: avgY,
    z: pts[i].z,
  }))
}

// ---------------------------------------------------------------------------
// Wall overlap detection
// ---------------------------------------------------------------------------

/** Check if two walls overlap (their bottom-edge midpoints are within a threshold) */
function wallsOverlap(a: Wall, b: Wall, threshold = 0.15): boolean {
  const midA = {
    x: (a.corners[0].x + a.corners[1].x) / 2,
    y: (a.corners[0].y + a.corners[1].y) / 2,
    z: (a.corners[0].z + a.corners[1].z) / 2,
  }
  const midB = {
    x: (b.corners[0].x + b.corners[1].x) / 2,
    y: (b.corners[0].y + b.corners[1].y) / 2,
    z: (b.corners[0].z + b.corners[1].z) / 2,
  }
  const dx = midA.x - midB.x
  const dy = midA.y - midB.y
  const dz = midA.z - midB.z
  return Math.sqrt(dx * dx + dy * dy + dz * dz) < threshold
}

/** Remove overlapping wall pairs from a list, keeping the longer wall of each pair */
function removeOverlappingWalls(walls: Wall[]): Wall[] {
  const removed = new Set<number>()
  for (let i = 0; i < walls.length; i++) {
    if (removed.has(i)) continue
    for (let j = i + 1; j < walls.length; j++) {
      if (removed.has(j)) continue
      if (wallsOverlap(walls[i], walls[j])) {
        // Keep the longer wall, remove the shorter one
        if (walls[i].measurements.length >= walls[j].measurements.length) {
          removed.add(j)
        } else {
          removed.add(i)
        }
      }
    }
  }
  return walls.filter((_, i) => !removed.has(i))
}

// ---------------------------------------------------------------------------
// Split room
// ---------------------------------------------------------------------------

/**
 * Split a room into two rooms along a dividing line defined by two 3D points.
 * The line extends infinitely in the XZ plane. The Y values of splitStart/splitEnd
 * are ignored — the wall is created at the room's floor/ceiling heights.
 *
 * Returns [roomA, roomB] where roomA is on the positive side of the line
 * and roomB is on the negative side.
 *
 * Returns null if the split line does not produce two valid rooms
 * (i.e. one side would have fewer than 3 boundary points).
 */
export function splitRoom(
  room: Room,
  splitStart: Point3D,
  splitEnd: Point3D,
): [Room, Room] | null {
  const lineStart = { x: splitStart.x, z: splitStart.z }
  const lineEnd = { x: splitEnd.x, z: splitEnd.z }

  // Split floor and ceiling boundaries
  const [floorA, floorB] = splitPolygonByLine(
    room.floor.boundary,
    lineStart,
    lineEnd,
  )
  const [ceilingA, ceilingB] = splitPolygonByLine(
    room.ceiling.boundary,
    lineStart,
    lineEnd,
  )

  // Validate: both sides need at least 3 boundary points
  if (floorA.length < 3 || floorB.length < 3) return null

  // Compute floor/ceiling Y heights
  const floorY =
    room.floor.boundary.length > 0
      ? room.floor.boundary.reduce((s, p) => s + p.y, 0) /
        room.floor.boundary.length
      : 0
  const ceilingY =
    room.ceiling.boundary.length > 0
      ? room.ceiling.boundary.reduce((s, p) => s + p.y, 0) /
        room.ceiling.boundary.length
      : floorY + 2.5

  // Create the dividing walls (one per new room, facing opposite directions)
  const ts = Date.now()
  const splitWallA = createSplitWall(
    splitStart,
    splitEnd,
    floorY,
    ceilingY,
    `wall-split-${ts}-a`,
  )
  const splitWallB = createSplitWall(
    splitEnd,
    splitStart,
    floorY,
    ceilingY,
    `wall-split-${ts}-b`,
  )

  // Classify existing walls by which side their center falls on
  const wallsA: Wall[] = [splitWallA]
  const wallsB: Wall[] = [splitWallB]
  for (const wall of room.walls) {
    const cx = wall.corners.reduce((s, c) => s + c.x, 0) / 4
    const cz = wall.corners.reduce((s, c) => s + c.z, 0) / 4
    if (sideOfLine({ x: cx, z: cz }, lineStart, lineEnd) >= 0) {
      wallsA.push(wall)
    } else {
      wallsB.push(wall)
    }
  }

  // Classify doors and windows
  const doorsA: Door[] = []
  const doorsB: Door[] = []
  for (const door of room.doors) {
    if (
      sideOfLine(
        { x: door.position.x, z: door.position.z },
        lineStart,
        lineEnd,
      ) >= 0
    ) {
      doorsA.push(door)
    } else {
      doorsB.push(door)
    }
  }

  const windowsA: Window[] = []
  const windowsB: Window[] = []
  for (const win of room.windows) {
    if (
      sideOfLine(
        { x: win.position.x, z: win.position.z },
        lineStart,
        lineEnd,
      ) >= 0
    ) {
      windowsA.push(win)
    } else {
      windowsB.push(win)
    }
  }

  const idA = `${room.id}-a`
  const idB = `${room.id}-b`

  const roomA: Room = {
    id: idA,
    name: `${room.name} A`,
    walls: wallsA,
    floor: { ...room.floor, id: `${room.floor.id}-a`, boundary: floorA },
    ceiling: { ...room.ceiling, id: `${room.ceiling.id}-a`, boundary: ceilingA },
    doors: doorsA,
    windows: windowsA,
    measurements: { width: 0, depth: 0, ceilingHeight: 0 },
  }

  const roomB: Room = {
    id: idB,
    name: `${room.name} B`,
    walls: wallsB,
    floor: { ...room.floor, id: `${room.floor.id}-b`, boundary: floorB },
    ceiling: { ...room.ceiling, id: `${room.ceiling.id}-b`, boundary: ceilingB },
    doors: doorsB,
    windows: windowsB,
    measurements: { width: 0, depth: 0, ceilingHeight: 0 },
  }

  // Recalculate measurements
  recalcRoom(roomA)
  recalcRoom(roomB)

  return [roomA, roomB]
}

// ---------------------------------------------------------------------------
// Merge rooms
// ---------------------------------------------------------------------------

/**
 * Merge two rooms into a single room.
 * Removes walls that are shared (overlapping) between the two rooms.
 * Combines floor/ceiling boundaries using a convex hull.
 * Combines all doors and windows.
 */
export function mergeRooms(roomA: Room, roomB: Room): Room {
  // Combine walls, removing overlapping pairs
  const allWalls = [...roomA.walls, ...roomB.walls]
  const mergedWalls = removeOverlappingWalls(allWalls)

  // Merge floor boundaries using convex hull
  const allFloorPts = [...roomA.floor.boundary, ...roomB.floor.boundary]
  const mergedFloorBoundary =
    allFloorPts.length >= 3 ? computeConvexHullXZ(allFloorPts) : allFloorPts

  // Merge ceiling boundaries using convex hull
  const allCeilingPts = [
    ...roomA.ceiling.boundary,
    ...roomB.ceiling.boundary,
  ]
  const mergedCeilingBoundary =
    allCeilingPts.length >= 3
      ? computeConvexHullXZ(allCeilingPts)
      : allCeilingPts

  const mergedFloor: Floor = {
    ...roomA.floor,
    id: `${roomA.floor.id}-merged`,
    boundary: mergedFloorBoundary,
  }

  const mergedCeiling: Ceiling = {
    ...roomA.ceiling,
    id: `${roomA.ceiling.id}-merged`,
    boundary: mergedCeilingBoundary,
  }

  // Strip suffix from name if it looks like a split product
  const baseName = roomA.name.replace(/ [AB]$/, '')
  const nameB = roomB.name.replace(/ [AB]$/, '')
  const name = baseName === nameB ? baseName : `${roomA.name} + ${roomB.name}`

  const mergedRoom: Room = {
    id: `${roomA.id}-${roomB.id}-merged`,
    name,
    walls: mergedWalls,
    floor: mergedFloor,
    ceiling: mergedCeiling,
    doors: [...roomA.doors, ...roomB.doors],
    windows: [...roomA.windows, ...roomB.windows],
    measurements: { width: 0, depth: 0, ceilingHeight: 0 },
  }

  recalcRoom(mergedRoom)
  return mergedRoom
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function createSplitWall(
  start: Point3D,
  end: Point3D,
  floorY: number,
  ceilingY: number,
  wallId: string,
): Wall {
  const bottomLeft: Point3D = { x: start.x, y: floorY, z: start.z }
  const bottomRight: Point3D = { x: end.x, y: floorY, z: end.z }
  const topRight: Point3D = { x: end.x, y: ceilingY, z: end.z }
  const topLeft: Point3D = { x: start.x, y: ceilingY, z: start.z }

  const dir = vec3Sub(bottomRight, bottomLeft)
  const up: Point3D = { x: 0, y: 1, z: 0 }
  const normal = vec3Normalize(vec3Cross(dir, up))

  return {
    id: wallId,
    corners: [bottomLeft, bottomRight, topRight, topLeft],
    plane: { normal, distance: vec3Dot(normal, bottomLeft) },
    measurements: { length: vec3Length(dir) },
  }
}

/** Recalculate wall lengths and room dimensions in-place */
function recalcRoom(room: Room): void {
  for (const wall of room.walls) {
    wall.measurements = { length: calculateWallLength(wall) }
  }
  const dims = calculateRoomDimensions(room)
  room.measurements = {
    width: dims.width,
    depth: dims.depth,
    ceilingHeight: dims.ceilingHeight,
  }
}
