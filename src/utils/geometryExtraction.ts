import type {
  Point3D,
  Plane,
  Wall,
  Floor,
  Ceiling,
  Room,
  Staircase,
  BuildingModel,
  CapturedPhoto,
} from '../types'
import type { PointCloud } from './triangulation'
import { placeDoorsAndWindows } from './doorWindowPlacement'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Distance threshold for a point to be considered an inlier of a plane */
const PLANE_DISTANCE_THRESHOLD = 0.15

/** Minimum number of inlier points to accept a detected plane */
const MIN_PLANE_INLIERS = 10

/** Number of RANSAC iterations for plane fitting */
const RANSAC_ITERATIONS = 200

/** Angle threshold (radians) to classify a plane as horizontal vs vertical.
 *  A plane whose normal is within this angle of the Y-axis is horizontal. */
const HORIZONTAL_ANGLE_THRESHOLD = Math.PI / 6 // 30 degrees

/** Minimum number of points remaining to attempt another plane fit */
const MIN_POINTS_FOR_PLANE = 6

// ---------------------------------------------------------------------------
// Vector math helpers
// ---------------------------------------------------------------------------

export function vec3Sub(a: Point3D, b: Point3D): Point3D {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }
}

export function vec3Cross(a: Point3D, b: Point3D): Point3D {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }
}

export function vec3Dot(a: Point3D, b: Point3D): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

export function vec3Length(v: Point3D): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z)
}

export function vec3Normalize(v: Point3D): Point3D {
  const len = vec3Length(v)
  if (len < 1e-12) return { x: 0, y: 0, z: 0 }
  return { x: v.x / len, y: v.y / len, z: v.z / len }
}

export function vec3Scale(v: Point3D, s: number): Point3D {
  return { x: v.x * s, y: v.y * s, z: v.z * s }
}

export function vec3Add(a: Point3D, b: Point3D): Point3D {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }
}

function distance3D(a: Point3D, b: Point3D): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const dz = a.z - b.z
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

// ---------------------------------------------------------------------------
// Plane detection
// ---------------------------------------------------------------------------

export type PlaneType = 'wall' | 'floor' | 'ceiling'

/** A detected plane with its inlier points and classification */
export interface DetectedPlane {
  plane: Plane
  type: PlaneType
  inlierPoints: Point3D[]
}

/**
 * Compute the signed distance from a point to a plane.
 * Plane equation: normal.x*x + normal.y*y + normal.z*z + distance = 0
 */
export function pointToPlaneDistance(point: Point3D, plane: Plane): number {
  return vec3Dot(point, plane.normal) + plane.distance
}

/**
 * Fit a plane through three non-collinear points.
 * Returns null if the points are collinear.
 */
export function fitPlaneFromThreePoints(
  p1: Point3D,
  p2: Point3D,
  p3: Point3D
): Plane | null {
  const v1 = vec3Sub(p2, p1)
  const v2 = vec3Sub(p3, p1)
  const normal = vec3Normalize(vec3Cross(v1, v2))

  if (vec3Length(normal) < 1e-10) {
    return null // collinear
  }

  // Plane equation: n.x * x + n.y * y + n.z * z + d = 0
  // d = -(n . p1)
  const distance = -vec3Dot(normal, p1)
  return { normal, distance }
}

/**
 * Use RANSAC to find the best-fitting plane in a set of 3D points.
 * Returns the plane and its inlier indices, or null if no plane found.
 */
export function fitPlaneRANSAC(
  points: Point3D[],
  distanceThreshold: number = PLANE_DISTANCE_THRESHOLD,
  iterations: number = RANSAC_ITERATIONS,
  minInliers: number = MIN_PLANE_INLIERS
): { plane: Plane; inlierIndices: number[] } | null {
  if (points.length < 3) return null

  let bestPlane: Plane | null = null
  let bestInliers: number[] = []

  for (let iter = 0; iter < iterations; iter++) {
    // Pick 3 random distinct points
    const i1 = Math.floor(Math.random() * points.length)
    let i2 = Math.floor(Math.random() * points.length)
    let i3 = Math.floor(Math.random() * points.length)
    if (i2 === i1) i2 = (i1 + 1) % points.length
    if (i3 === i1 || i3 === i2) i3 = (i1 + 2) % points.length
    if (i3 >= points.length) i3 = 0

    const plane = fitPlaneFromThreePoints(points[i1], points[i2], points[i3])
    if (!plane) continue

    // Count inliers
    const inliers: number[] = []
    for (let j = 0; j < points.length; j++) {
      if (Math.abs(pointToPlaneDistance(points[j], plane)) <= distanceThreshold) {
        inliers.push(j)
      }
    }

    if (inliers.length > bestInliers.length) {
      bestInliers = inliers
      bestPlane = plane
    }

    // Early exit if we found a plane with most points
    if (bestInliers.length > points.length * 0.8) break
  }

  if (!bestPlane || bestInliers.length < minInliers) return null
  return { plane: bestPlane, inlierIndices: bestInliers }
}

/**
 * Classify a plane as wall, floor, or ceiling based on its normal orientation.
 * Y-axis is up: horizontal planes have normals close to (0, ±1, 0).
 */
export function classifyPlane(plane: Plane): PlaneType {
  const normal = plane.normal
  // Angle between the normal and the Y-axis
  const dotY = Math.abs(normal.y)
  const angleFromY = Math.acos(Math.min(1, dotY))

  if (angleFromY <= HORIZONTAL_ANGLE_THRESHOLD) {
    // Horizontal plane — floor or ceiling?
    // Compute the average Y of the plane. We use distance:
    // For a horizontal plane, normal ≈ (0, ±1, 0), so y ≈ -distance/normal.y
    // But we can't know floor vs ceiling from the plane alone — the caller
    // resolves this based on relative Y position.
    return normal.y > 0 ? 'floor' : 'ceiling'
  }

  return 'wall'
}

/**
 * Detect all significant planes in the point cloud using iterative RANSAC.
 * Repeatedly fits a plane, removes inliers, and continues until no more planes are found.
 */
export function detectAllPlanes(
  points: Point3D[],
  distanceThreshold: number = PLANE_DISTANCE_THRESHOLD,
  maxPlanes: number = 20
): DetectedPlane[] {
  const detected: DetectedPlane[] = []
  let remaining = [...points]

  for (let i = 0; i < maxPlanes && remaining.length >= MIN_POINTS_FOR_PLANE; i++) {
    const result = fitPlaneRANSAC(remaining, distanceThreshold)
    if (!result) break

    const inlierPoints = result.inlierIndices.map((idx) => remaining[idx])
    const type = classifyPlane(result.plane)
    detected.push({ plane: result.plane, type, inlierPoints })

    // Remove inliers from remaining points
    const inlierSet = new Set(result.inlierIndices)
    remaining = remaining.filter((_, idx) => !inlierSet.has(idx))
  }

  return detected
}

// ---------------------------------------------------------------------------
// Room segmentation
// ---------------------------------------------------------------------------

/** Compute the centroid (mean position) of a set of 3D points */
export function computeCentroid(points: Point3D[]): Point3D {
  if (points.length === 0) return { x: 0, y: 0, z: 0 }
  let sx = 0, sy = 0, sz = 0
  for (const p of points) {
    sx += p.x
    sy += p.y
    sz += p.z
  }
  return { x: sx / points.length, y: sy / points.length, z: sz / points.length }
}

/**
 * Compute horizontal (XZ-plane) distance between two points.
 * Ignores the Y component.
 */
export function horizontalDistance(a: Point3D, b: Point3D): number {
  const dx = a.x - b.x
  const dz = a.z - b.z
  return Math.sqrt(dx * dx + dz * dz)
}

/**
 * Get the 3D positions of photos with a specific tag.
 * Only includes photos that have an estimated pose.
 */
export function getTaggedPositions(
  photos: CapturedPhoto[],
  tag: 'doorway' | 'window'
): Point3D[] {
  return photos
    .filter((p) => p.tags.includes(tag) && p.pose)
    .map((p) => p.pose!.position)
}

/**
 * Compute bounding box extents in X and Z for a set of 3D points.
 */
function computeXZExtent(points: Point3D[]): { minX: number; maxX: number; minZ: number; maxZ: number } {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.z < minZ) minZ = p.z
    if (p.z > maxZ) maxZ = p.z
  }
  return { minX, maxX, minZ, maxZ }
}

/**
 * Assign each wall plane to the nearest room region.
 * Room regions are defined by the spaces between doorway positions.
 *
 * When no doorways exist, all walls belong to a single room.
 * When doorways exist, walls are assigned based on which room region
 * their centroid is closest to.
 */
export function assignWallsToRooms(
  wallPlanes: DetectedPlane[],
  doorwayPositions: Point3D[],
  allPoints: Point3D[]
): Map<number, DetectedPlane[]> {
  const roomMap = new Map<number, DetectedPlane[]>()

  if (doorwayPositions.length === 0) {
    // Single room — all walls belong to room 0
    roomMap.set(0, wallPlanes)
    return roomMap
  }

  // Compute room region centers.
  // We use the doorway positions to partition the space. Each "room" is
  // a cluster of points that is closer to a region center than to the
  // doorway boundary.

  // Cluster wall centroids by nearest doorway boundary.
  // Each wall is assigned to the room region determined by which side
  // of the nearest doorway it falls on.
  // Simple approach: use k-means style clustering where room seeds are
  // the midpoints between consecutive doorway positions plus the two ends.

  const roomCenters: Point3D[] = computeRoomCenters(allPoints, doorwayPositions)

  for (let i = 0; i < roomCenters.length; i++) {
    roomMap.set(i, [])
  }

  for (const wall of wallPlanes) {
    const wallCenter = computeCentroid(wall.inlierPoints)
    let bestRoom = 0
    let bestDist = Infinity

    for (let i = 0; i < roomCenters.length; i++) {
      const d = horizontalDistance(wallCenter, roomCenters[i])
      if (d < bestDist) {
        bestDist = d
        bestRoom = i
      }
    }

    roomMap.get(bestRoom)!.push(wall)
  }

  // Remove empty rooms
  for (const [key, walls] of roomMap) {
    if (walls.length === 0) roomMap.delete(key)
  }

  return roomMap
}

/**
 * Compute room center points by partitioning the point cloud at doorway positions.
 * Uses the doorway positions as dividers along the principal horizontal axis.
 */
export function computeRoomCenters(
  allPoints: Point3D[],
  doorwayPositions: Point3D[]
): Point3D[] {
  if (doorwayPositions.length === 0) {
    return [computeCentroid(allPoints)]
  }

  // Sort doorway positions along the dominant horizontal axis
  const extent = computeXZExtent(allPoints)
  const xRange = extent.maxX - extent.minX
  const zRange = extent.maxZ - extent.minZ
  const useX = xRange >= zRange

  const sortedDoorways = [...doorwayPositions].sort((a, b) =>
    useX ? a.x - b.x : a.z - b.z
  )

  // Create regions between doorways
  const centers: Point3D[] = []

  // Compute the average Y of all points for center Y position
  const avgY = allPoints.reduce((sum, p) => sum + p.y, 0) / allPoints.length

  // Region before first doorway
  const firstDoor = sortedDoorways[0]
  const edgeMin = useX ? extent.minX : extent.minZ
  const firstDoorVal = useX ? firstDoor.x : firstDoor.z
  const midBefore = (edgeMin + firstDoorVal) / 2
  centers.push(
    useX
      ? { x: midBefore, y: avgY, z: (extent.minZ + extent.maxZ) / 2 }
      : { x: (extent.minX + extent.maxX) / 2, y: avgY, z: midBefore }
  )

  // Regions between doorways
  for (let i = 0; i < sortedDoorways.length - 1; i++) {
    const d1 = sortedDoorways[i]
    const d2 = sortedDoorways[i + 1]
    const midVal = useX ? (d1.x + d2.x) / 2 : (d1.z + d2.z) / 2
    centers.push(
      useX
        ? { x: midVal, y: avgY, z: (extent.minZ + extent.maxZ) / 2 }
        : { x: (extent.minX + extent.maxX) / 2, y: avgY, z: midVal }
    )
  }

  // Region after last doorway
  const lastDoor = sortedDoorways[sortedDoorways.length - 1]
  const edgeMax = useX ? extent.maxX : extent.maxZ
  const lastDoorVal = useX ? lastDoor.x : lastDoor.z
  const midAfter = (lastDoorVal + edgeMax) / 2
  centers.push(
    useX
      ? { x: midAfter, y: avgY, z: (extent.minZ + extent.maxZ) / 2 }
      : { x: (extent.minX + extent.maxX) / 2, y: avgY, z: midAfter }
  )

  return centers
}

// ---------------------------------------------------------------------------
// Wall geometry construction
// ---------------------------------------------------------------------------

/**
 * Build a Wall object from a detected vertical plane.
 * Computes the bounding rectangle of the inlier points projected onto the plane.
 */
export function buildWall(detectedPlane: DetectedPlane, wallId: string): Wall {
  const pts = detectedPlane.inlierPoints
  const normal = detectedPlane.plane.normal

  // Find the horizontal direction of the wall (perpendicular to normal, in XZ plane)
  // wallDir is the horizontal direction along the wall face
  const wallDir = vec3Normalize({ x: -normal.z, y: 0, z: normal.x })

  // Project all inlier points onto the wall direction to find horizontal extent
  let minAlongWall = Infinity, maxAlongWall = -Infinity
  let minY = Infinity, maxY = -Infinity
  const origin = computeCentroid(pts)

  for (const p of pts) {
    const rel = vec3Sub(p, origin)
    const along = vec3Dot(rel, wallDir)
    if (along < minAlongWall) minAlongWall = along
    if (along > maxAlongWall) maxAlongWall = along
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }

  // The four corners of the wall rectangle
  const baseLeft = vec3Add(origin, vec3Scale(wallDir, minAlongWall))
  const baseRight = vec3Add(origin, vec3Scale(wallDir, maxAlongWall))

  const corners: [Point3D, Point3D, Point3D, Point3D] = [
    { ...baseLeft, y: minY },   // bottom-left
    { ...baseRight, y: minY },  // bottom-right
    { ...baseRight, y: maxY },  // top-right
    { ...baseLeft, y: maxY },   // top-left
  ]

  const length = maxAlongWall - minAlongWall

  return {
    id: wallId,
    corners,
    plane: detectedPlane.plane,
    measurements: { length },
  }
}

// ---------------------------------------------------------------------------
// Floor/Ceiling geometry construction
// ---------------------------------------------------------------------------

/**
 * Build a Floor object from a detected horizontal plane.
 */
export function buildFloor(
  detectedPlane: DetectedPlane,
  floorId: string,
  level: number
): Floor {
  const pts = detectedPlane.inlierPoints
  const extent = computeXZExtent(pts)
  const avgY = pts.reduce((sum, p) => sum + p.y, 0) / pts.length

  const boundary: Point3D[] = [
    { x: extent.minX, y: avgY, z: extent.minZ },
    { x: extent.maxX, y: avgY, z: extent.minZ },
    { x: extent.maxX, y: avgY, z: extent.maxZ },
    { x: extent.minX, y: avgY, z: extent.maxZ },
  ]

  return {
    id: floorId,
    boundary,
    plane: detectedPlane.plane,
    level,
  }
}

/**
 * Build a Ceiling object from a detected horizontal plane.
 */
export function buildCeiling(
  detectedPlane: DetectedPlane,
  ceilingId: string
): Ceiling {
  const pts = detectedPlane.inlierPoints
  const extent = computeXZExtent(pts)
  const avgY = pts.reduce((sum, p) => sum + p.y, 0) / pts.length

  const boundary: Point3D[] = [
    { x: extent.minX, y: avgY, z: extent.minZ },
    { x: extent.maxX, y: avgY, z: extent.minZ },
    { x: extent.maxX, y: avgY, z: extent.maxZ },
    { x: extent.minX, y: avgY, z: extent.maxZ },
  ]

  return {
    id: ceilingId,
    boundary,
    plane: detectedPlane.plane,
  }
}

// ---------------------------------------------------------------------------
// Stair detection
// ---------------------------------------------------------------------------

/**
 * Detect staircases by comparing floor levels across rooms.
 * If two rooms have floors at significantly different Y positions,
 * a staircase connects them.
 */
export function detectStaircases(
  rooms: Room[],
  doorwayPositions: Point3D[]
): Staircase[] {
  const staircases: Staircase[] = []

  if (rooms.length < 2) return staircases

  // Group rooms by floor level
  const levelGroups = new Map<number, Room[]>()
  for (const room of rooms) {
    const level = room.floor.level
    if (!levelGroups.has(level)) levelGroups.set(level, [])
    levelGroups.get(level)!.push(room)
  }

  const levels = [...levelGroups.keys()].sort((a, b) => a - b)
  if (levels.length < 2) return staircases

  // Create a staircase between adjacent levels
  for (let i = 0; i < levels.length - 1; i++) {
    const lowerRooms = levelGroups.get(levels[i])!
    const upperRooms = levelGroups.get(levels[i + 1])!

    // Find the closest pair of rooms across levels
    let bestLower: Room | null = null
    let bestUpper: Room | null = null
    let bestDist = Infinity

    for (const lr of lowerRooms) {
      for (const ur of upperRooms) {
        const lCenter = computeCentroid(lr.floor.boundary)
        const uCenter = computeCentroid(ur.floor.boundary)
        const d = horizontalDistance(lCenter, uCenter)
        if (d < bestDist) {
          bestDist = d
          bestLower = lr
          bestUpper = ur
        }
      }
    }

    if (bestLower && bestUpper) {
      const bottomCenter = computeCentroid(bestLower.floor.boundary)
      const topCenter = computeCentroid(bestUpper.floor.boundary)

      // If doorway positions exist between levels, use the nearest one
      let stairPosition = {
        x: (bottomCenter.x + topCenter.x) / 2,
        y: bottomCenter.y,
        z: (bottomCenter.z + topCenter.z) / 2,
      }

      if (doorwayPositions.length > 0) {
        let bestDoorDist = Infinity
        for (const dp of doorwayPositions) {
          const d = distance3D(dp, stairPosition)
          if (d < bestDoorDist) {
            bestDoorDist = d
            stairPosition = dp
          }
        }
      }

      staircases.push({
        id: `staircase-${i}`,
        fromLevel: levels[i],
        toLevel: levels[i + 1],
        bottomPosition: { ...stairPosition, y: bottomCenter.y },
        topPosition: { ...stairPosition, y: topCenter.y },
        width: 1.0, // Default estimate
      })
    }
  }

  return staircases
}

// ---------------------------------------------------------------------------
// Room construction
// ---------------------------------------------------------------------------

/**
 * Determine the floor level for a horizontal plane based on its Y position.
 * Groups nearby Y values into the same level. Returns integer level index (0-based).
 */
export function assignFloorLevel(
  y: number,
  floorYValues: number[],
  threshold: number = 0.5
): number {
  // Sort existing floor Y values
  const sorted = [...floorYValues].sort((a, b) => a - b)

  // Find if this Y is close to an existing level
  for (let i = 0; i < sorted.length; i++) {
    if (Math.abs(y - sorted[i]) <= threshold) {
      return i
    }
  }

  // New level — count how many existing levels are below this Y
  let level = 0
  for (const fy of sorted) {
    if (y > fy + threshold) level++
  }
  return level
}

/**
 * Build a Room object from a set of walls and floor/ceiling planes.
 */
export function buildRoom(
  roomId: string,
  roomName: string,
  walls: Wall[],
  floorPlane: DetectedPlane | null,
  ceilingPlane: DetectedPlane | null,
  floorLevel: number,
  allRoomPoints: Point3D[]
): Room {
  // Compute room extent from all available points
  const extent = computeXZExtent(allRoomPoints)
  const width = extent.maxX - extent.minX
  const depth = extent.maxZ - extent.minZ

  // Get floor and ceiling Y values
  let floorY = 0
  let ceilingY = 2.5 // Default ceiling height

  if (floorPlane) {
    floorY = floorPlane.inlierPoints.reduce((s, p) => s + p.y, 0) / floorPlane.inlierPoints.length
  }
  if (ceilingPlane) {
    ceilingY = ceilingPlane.inlierPoints.reduce((s, p) => s + p.y, 0) / ceilingPlane.inlierPoints.length
  }

  const ceilingHeight = Math.abs(ceilingY - floorY)

  // Build floor and ceiling objects
  const floor = floorPlane
    ? buildFloor(floorPlane, `${roomId}-floor`, floorLevel)
    : {
        id: `${roomId}-floor`,
        boundary: [
          { x: extent.minX, y: floorY, z: extent.minZ },
          { x: extent.maxX, y: floorY, z: extent.minZ },
          { x: extent.maxX, y: floorY, z: extent.maxZ },
          { x: extent.minX, y: floorY, z: extent.maxZ },
        ],
        plane: { normal: { x: 0, y: 1, z: 0 }, distance: -floorY },
        level: floorLevel,
      }

  const ceiling = ceilingPlane
    ? buildCeiling(ceilingPlane, `${roomId}-ceiling`)
    : {
        id: `${roomId}-ceiling`,
        boundary: [
          { x: extent.minX, y: ceilingY, z: extent.minZ },
          { x: extent.maxX, y: ceilingY, z: extent.minZ },
          { x: extent.maxX, y: ceilingY, z: extent.maxZ },
          { x: extent.minX, y: ceilingY, z: extent.maxZ },
        ],
        plane: { normal: { x: 0, y: -1, z: 0 }, distance: ceilingY },
      }

  return {
    id: roomId,
    name: roomName,
    walls,
    floor,
    ceiling,
    doors: [],
    windows: [],
    measurements: {
      width: Math.min(width, depth),
      depth: Math.max(width, depth),
      ceilingHeight,
    },
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Extract room geometry from a point cloud and tagged photos.
 *
 * Pipeline:
 * 1. Detect planes in the point cloud via iterative RANSAC
 * 2. Classify planes as walls, floors, or ceilings
 * 3. Segment walls into rooms using doorway tag positions
 * 4. Build Room objects with walls, floor, and ceiling
 * 5. Detect staircases from floor-level differences
 */
export function extractRoomGeometry(
  pointCloud: PointCloud,
  photos: CapturedPhoto[]
): BuildingModel {
  const points = pointCloud.points.map((p) => p.position)

  if (points.length === 0) {
    return {
      rooms: [],
      staircases: [],
      isCalibrated: pointCloud.isScaled,
      floorLevels: 0,
    }
  }

  // Step 1: Detect all planes
  const detectedPlanes = detectAllPlanes(points)

  // Step 2: Separate by type
  const wallPlanes = detectedPlanes.filter((p) => p.type === 'wall')
  const horizontalPlanes = detectedPlanes.filter(
    (p) => p.type === 'floor' || p.type === 'ceiling'
  )

  // Step 3: Resolve floor vs ceiling from horizontal planes
  // The lowest horizontal planes are floors, highest are ceilings
  const floorPlanes: DetectedPlane[] = []
  const ceilingPlanes: DetectedPlane[] = []

  if (horizontalPlanes.length > 0) {
    // Sort by average Y
    const withAvgY = horizontalPlanes.map((hp) => ({
      plane: hp,
      avgY: hp.inlierPoints.reduce((s, p) => s + p.y, 0) / hp.inlierPoints.length,
    }))
    withAvgY.sort((a, b) => a.avgY - b.avgY)

    // Simple heuristic: if there are pairs, alternate floor/ceiling.
    // If just one, classify by normal direction.
    if (withAvgY.length === 1) {
      if (withAvgY[0].plane.plane.normal.y > 0) {
        floorPlanes.push(withAvgY[0].plane)
      } else {
        ceilingPlanes.push(withAvgY[0].plane)
      }
    } else {
      // Lower half are floors, upper half are ceilings
      const mid = Math.ceil(withAvgY.length / 2)
      for (let i = 0; i < withAvgY.length; i++) {
        if (i < mid) {
          floorPlanes.push({ ...withAvgY[i].plane, type: 'floor' })
        } else {
          ceilingPlanes.push({ ...withAvgY[i].plane, type: 'ceiling' })
        }
      }
    }
  }

  // Step 4: Get doorway positions for room segmentation
  const doorwayPositions = getTaggedPositions(photos, 'doorway')

  // Step 5: Assign walls to rooms
  const wallRoomAssignment = assignWallsToRooms(wallPlanes, doorwayPositions, points)

  // Step 6: Determine floor levels
  const floorYValues = floorPlanes.map(
    (fp) => fp.inlierPoints.reduce((s, p) => s + p.y, 0) / fp.inlierPoints.length
  )

  // Step 7: Build rooms
  const rooms: Room[] = []
  const roomEntries = [...wallRoomAssignment.entries()]

  for (let i = 0; i < roomEntries.length; i++) {
    const [, roomWallPlanes] = roomEntries[i]
    const roomId = `room-${i}`
    const roomName = `Room ${i + 1}`

    // Build Wall objects
    const walls: Wall[] = roomWallPlanes.map((wp, wi) =>
      buildWall(wp, `${roomId}-wall-${wi}`)
    )

    // Collect all points in this room's walls
    const roomPoints = roomWallPlanes.flatMap((wp) => wp.inlierPoints)

    // Find the floor and ceiling planes that best overlap this room's horizontal extent
    const roomExtent = computeXZExtent(roomPoints)
    const roomCenterXZ: Point3D = {
      x: (roomExtent.minX + roomExtent.maxX) / 2,
      y: 0,
      z: (roomExtent.minZ + roomExtent.maxZ) / 2,
    }

    // Pick the nearest floor plane
    let bestFloor: DetectedPlane | null = null
    let bestFloorDist = Infinity
    for (const fp of floorPlanes) {
      const fpCenter = computeCentroid(fp.inlierPoints)
      const d = horizontalDistance(fpCenter, roomCenterXZ)
      if (d < bestFloorDist) {
        bestFloorDist = d
        bestFloor = fp
      }
    }

    // Pick the nearest ceiling plane
    let bestCeiling: DetectedPlane | null = null
    let bestCeilingDist = Infinity
    for (const cp of ceilingPlanes) {
      const cpCenter = computeCentroid(cp.inlierPoints)
      const d = horizontalDistance(cpCenter, roomCenterXZ)
      if (d < bestCeilingDist) {
        bestCeilingDist = d
        bestCeiling = cp
      }
    }

    // Determine floor level
    let floorLevel = 0
    if (bestFloor) {
      const floorAvgY =
        bestFloor.inlierPoints.reduce((s, p) => s + p.y, 0) /
        bestFloor.inlierPoints.length
      floorLevel = assignFloorLevel(floorAvgY, floorYValues)
    }

    const room = buildRoom(
      roomId,
      roomName,
      walls,
      bestFloor,
      bestCeiling,
      floorLevel,
      roomPoints
    )
    rooms.push(room)
  }

  // Handle case with no walls but floor/ceiling detected: create a room anyway
  if (rooms.length === 0 && (floorPlanes.length > 0 || ceilingPlanes.length > 0)) {
    const bestFloor = floorPlanes[0] || null
    const bestCeiling = ceilingPlanes[0] || null
    const allHorizPoints = [...floorPlanes, ...ceilingPlanes].flatMap((p) => p.inlierPoints)
    const room = buildRoom('room-0', 'Room 1', [], bestFloor, bestCeiling, 0, allHorizPoints)
    rooms.push(room)
  }

  // Step 8: Place doors and windows from tagged photos
  const roomsWithOpenings = placeDoorsAndWindows(rooms, photos)

  // Step 9: Detect staircases
  const staircases = detectStaircases(roomsWithOpenings, doorwayPositions)

  // Compute total floor levels
  const levelSet = new Set(roomsWithOpenings.map((r) => r.floor.level))
  const floorLevels = Math.max(1, levelSet.size)

  return {
    rooms: roomsWithOpenings,
    staircases,
    isCalibrated: pointCloud.isScaled,
    floorLevels,
  }
}
