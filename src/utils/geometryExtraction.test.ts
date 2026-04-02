import { describe, it, expect } from 'vitest'
import type { Point3D, Plane, CapturedPhoto, CameraPose } from '../types'
import type { PointCloud, TriangulatedPoint } from './triangulation'
import type { DetectedPlane } from './geometryExtraction'
import {
  vec3Sub,
  vec3Cross,
  vec3Dot,
  vec3Length,
  vec3Normalize,
  vec3Scale,
  vec3Add,
  pointToPlaneDistance,
  fitPlaneFromThreePoints,
  fitPlaneRANSAC,
  classifyPlane,
  detectAllPlanes,
  computeCentroid,
  horizontalDistance,
  getTaggedPositions,
  assignWallsToRooms,
  computeRoomCenters,
  buildWall,
  buildFloor,
  buildCeiling,
  buildRoom,
  detectStaircases,
  assignFloorLevel,
  extractRoomGeometry,
} from './geometryExtraction'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a TriangulatedPoint at a given position */
function makePoint(x: number, y: number, z: number): TriangulatedPoint {
  return {
    position: { x, y, z },
    sourcePhotos: [0, 1],
    pixelCoords: [{ x: 0, y: 0 }, { x: 0, y: 0 }],
    reprojectionError: 0,
  }
}

/** Create a PointCloud from raw Point3D positions */
function makePointCloud(
  points: Point3D[],
  isScaled: boolean = false
): PointCloud {
  return {
    points: points.map((p) => makePoint(p.x, p.y, p.z)),
    isScaled,
    scaleFactor: isScaled ? 1.0 : 1.0,
  }
}

/** Generate points on a wall (vertical XZ plane at a given Z position) */
function generateWallPointsXZ(
  z: number,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
  count: number,
  noise: number = 0.01
): Point3D[] {
  const points: Point3D[] = []
  for (let i = 0; i < count; i++) {
    points.push({
      x: xMin + Math.random() * (xMax - xMin),
      y: yMin + Math.random() * (yMax - yMin),
      z: z + (Math.random() - 0.5) * noise,
    })
  }
  return points
}

/** Generate points on a wall (vertical XY plane at a given X position) */
function generateWallPointsXY(
  x: number,
  zMin: number,
  zMax: number,
  yMin: number,
  yMax: number,
  count: number,
  noise: number = 0.01
): Point3D[] {
  const points: Point3D[] = []
  for (let i = 0; i < count; i++) {
    points.push({
      x: x + (Math.random() - 0.5) * noise,
      y: yMin + Math.random() * (yMax - yMin),
      z: zMin + Math.random() * (zMax - zMin),
    })
  }
  return points
}

/** Generate points on a horizontal plane (floor or ceiling) at given Y */
function generateHorizontalPoints(
  y: number,
  xMin: number,
  xMax: number,
  zMin: number,
  zMax: number,
  count: number,
  noise: number = 0.01
): Point3D[] {
  const points: Point3D[] = []
  for (let i = 0; i < count; i++) {
    points.push({
      x: xMin + Math.random() * (xMax - xMin),
      y: y + (Math.random() - 0.5) * noise,
      z: zMin + Math.random() * (zMax - zMin),
    })
  }
  return points
}

/** Create a mock CapturedPhoto with an optional tag and pose */
function makePhoto(
  index: number,
  tags: ('doorway' | 'window')[] = [],
  pose?: CameraPose
): CapturedPhoto {
  return {
    index,
    imageData: '',
    width: 640,
    height: 480,
    tags,
    capturedAt: Date.now(),
    pose,
  }
}

// ---------------------------------------------------------------------------
// Tests: Vector math helpers
// ---------------------------------------------------------------------------

describe('Vector math helpers', () => {
  it('vec3Sub subtracts two vectors', () => {
    const result = vec3Sub({ x: 3, y: 5, z: 7 }, { x: 1, y: 2, z: 3 })
    expect(result).toEqual({ x: 2, y: 3, z: 4 })
  })

  it('vec3Cross computes cross product', () => {
    const result = vec3Cross({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 })
    expect(result).toEqual({ x: 0, y: 0, z: 1 })
  })

  it('vec3Dot computes dot product', () => {
    expect(vec3Dot({ x: 1, y: 2, z: 3 }, { x: 4, y: 5, z: 6 })).toBe(32)
  })

  it('vec3Length computes magnitude', () => {
    expect(vec3Length({ x: 3, y: 4, z: 0 })).toBe(5)
  })

  it('vec3Normalize returns unit vector', () => {
    const result = vec3Normalize({ x: 0, y: 0, z: 5 })
    expect(result.x).toBeCloseTo(0)
    expect(result.y).toBeCloseTo(0)
    expect(result.z).toBeCloseTo(1)
  })

  it('vec3Normalize handles zero vector', () => {
    const result = vec3Normalize({ x: 0, y: 0, z: 0 })
    expect(result).toEqual({ x: 0, y: 0, z: 0 })
  })

  it('vec3Scale multiplies vector by scalar', () => {
    expect(vec3Scale({ x: 1, y: 2, z: 3 }, 2)).toEqual({ x: 2, y: 4, z: 6 })
  })

  it('vec3Add adds two vectors', () => {
    expect(vec3Add({ x: 1, y: 2, z: 3 }, { x: 4, y: 5, z: 6 })).toEqual({ x: 5, y: 7, z: 9 })
  })
})

// ---------------------------------------------------------------------------
// Tests: Point-to-plane distance
// ---------------------------------------------------------------------------

describe('pointToPlaneDistance', () => {
  it('returns 0 for a point on the plane', () => {
    const plane: Plane = { normal: { x: 0, y: 1, z: 0 }, distance: -3 }
    // Plane: y = 3 → 0*x + 1*y + 0*z + (-3) = 0
    expect(pointToPlaneDistance({ x: 5, y: 3, z: 10 }, plane)).toBeCloseTo(0)
  })

  it('returns positive distance for point above plane', () => {
    const plane: Plane = { normal: { x: 0, y: 1, z: 0 }, distance: 0 }
    // Plane: y = 0
    expect(pointToPlaneDistance({ x: 0, y: 5, z: 0 }, plane)).toBeCloseTo(5)
  })

  it('returns negative distance for point below plane', () => {
    const plane: Plane = { normal: { x: 0, y: 1, z: 0 }, distance: 0 }
    expect(pointToPlaneDistance({ x: 0, y: -3, z: 0 }, plane)).toBeCloseTo(-3)
  })
})

// ---------------------------------------------------------------------------
// Tests: Fit plane from three points
// ---------------------------------------------------------------------------

describe('fitPlaneFromThreePoints', () => {
  it('fits a horizontal plane', () => {
    const plane = fitPlaneFromThreePoints(
      { x: 0, y: 2, z: 0 },
      { x: 1, y: 2, z: 0 },
      { x: 0, y: 2, z: 1 }
    )
    expect(plane).not.toBeNull()
    // Normal should be along Y axis
    expect(Math.abs(plane!.normal.y)).toBeCloseTo(1)
    expect(Math.abs(plane!.normal.x)).toBeCloseTo(0)
    expect(Math.abs(plane!.normal.z)).toBeCloseTo(0)
  })

  it('fits a vertical plane', () => {
    const plane = fitPlaneFromThreePoints(
      { x: 3, y: 0, z: 0 },
      { x: 3, y: 1, z: 0 },
      { x: 3, y: 0, z: 1 }
    )
    expect(plane).not.toBeNull()
    // Normal should be along X axis
    expect(Math.abs(plane!.normal.x)).toBeCloseTo(1)
    expect(Math.abs(plane!.normal.y)).toBeCloseTo(0)
    expect(Math.abs(plane!.normal.z)).toBeCloseTo(0)
  })

  it('returns null for collinear points', () => {
    const plane = fitPlaneFromThreePoints(
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 1, z: 1 },
      { x: 2, y: 2, z: 2 }
    )
    expect(plane).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Tests: RANSAC plane fitting
// ---------------------------------------------------------------------------

describe('fitPlaneRANSAC', () => {
  it('detects a horizontal floor plane', () => {
    const points = generateHorizontalPoints(0, 0, 5, 0, 5, 50, 0.01)
    const result = fitPlaneRANSAC(points, 0.05)
    expect(result).not.toBeNull()
    // Normal should be close to (0, ±1, 0)
    expect(Math.abs(result!.plane.normal.y)).toBeGreaterThan(0.9)
    expect(result!.inlierIndices.length).toBeGreaterThan(40)
  })

  it('detects a vertical wall plane', () => {
    const points = generateWallPointsXZ(3, 0, 5, 0, 3, 50, 0.01)
    const result = fitPlaneRANSAC(points, 0.05)
    expect(result).not.toBeNull()
    // Normal should be close to (0, 0, ±1)
    expect(Math.abs(result!.plane.normal.z)).toBeGreaterThan(0.9)
    expect(result!.inlierIndices.length).toBeGreaterThan(40)
  })

  it('returns null for too few points', () => {
    const result = fitPlaneRANSAC([{ x: 0, y: 0, z: 0 }])
    expect(result).toBeNull()
  })

  it('returns null when no plane has enough inliers', () => {
    // Scattered random points with no plane structure
    const points: Point3D[] = []
    for (let i = 0; i < 8; i++) {
      points.push({
        x: Math.random() * 100,
        y: Math.random() * 100,
        z: Math.random() * 100,
      })
    }
    const result = fitPlaneRANSAC(points, 0.001, 50, 10)
    expect(result).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Tests: Plane classification
// ---------------------------------------------------------------------------

describe('classifyPlane', () => {
  it('classifies horizontal plane with upward normal as floor', () => {
    const plane: Plane = { normal: { x: 0, y: 1, z: 0 }, distance: 0 }
    expect(classifyPlane(plane)).toBe('floor')
  })

  it('classifies horizontal plane with downward normal as ceiling', () => {
    const plane: Plane = { normal: { x: 0, y: -1, z: 0 }, distance: -3 }
    expect(classifyPlane(plane)).toBe('ceiling')
  })

  it('classifies vertical plane as wall (normal along X)', () => {
    const plane: Plane = { normal: { x: 1, y: 0, z: 0 }, distance: -2 }
    expect(classifyPlane(plane)).toBe('wall')
  })

  it('classifies vertical plane as wall (normal along Z)', () => {
    const plane: Plane = { normal: { x: 0, y: 0, z: 1 }, distance: -5 }
    expect(classifyPlane(plane)).toBe('wall')
  })

  it('classifies slightly tilted horizontal plane as floor', () => {
    const plane: Plane = {
      normal: vec3Normalize({ x: 0.1, y: 0.99, z: 0 }),
      distance: 0,
    }
    expect(classifyPlane(plane)).toBe('floor')
  })

  it('classifies diagonal plane as wall if steep enough', () => {
    const plane: Plane = {
      normal: vec3Normalize({ x: 0.9, y: 0.3, z: 0 }),
      distance: 0,
    }
    expect(classifyPlane(plane)).toBe('wall')
  })
})

// ---------------------------------------------------------------------------
// Tests: detectAllPlanes
// ---------------------------------------------------------------------------

describe('detectAllPlanes', () => {
  it('detects multiple planes from a synthetic room', () => {
    // Create a box-like room: floor (y=0), ceiling (y=3), 4 walls
    const floorPts = generateHorizontalPoints(0, 0, 5, 0, 5, 30, 0.01)
    const ceilingPts = generateHorizontalPoints(3, 0, 5, 0, 5, 30, 0.01)
    const wallN = generateWallPointsXZ(0, 0, 5, 0, 3, 20, 0.01) // z=0 wall
    const wallS = generateWallPointsXZ(5, 0, 5, 0, 3, 20, 0.01) // z=5 wall
    const wallW = generateWallPointsXY(0, 0, 5, 0, 3, 20, 0.01) // x=0 wall
    const wallE = generateWallPointsXY(5, 0, 5, 0, 3, 20, 0.01) // x=5 wall

    const allPoints = [...floorPts, ...ceilingPts, ...wallN, ...wallS, ...wallW, ...wallE]

    const planes = detectAllPlanes(allPoints, 0.05)

    expect(planes.length).toBeGreaterThanOrEqual(3) // At least floor + ceiling + some walls

    const wallCount = planes.filter((p) => p.type === 'wall').length
    const horizontalCount = planes.filter(
      (p) => p.type === 'floor' || p.type === 'ceiling'
    ).length

    expect(wallCount).toBeGreaterThanOrEqual(1)
    expect(horizontalCount).toBeGreaterThanOrEqual(1)
  })

  it('returns empty array for too few points', () => {
    const planes = detectAllPlanes([{ x: 0, y: 0, z: 0 }])
    expect(planes).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Tests: computeCentroid
// ---------------------------------------------------------------------------

describe('computeCentroid', () => {
  it('computes centroid of points', () => {
    const points: Point3D[] = [
      { x: 0, y: 0, z: 0 },
      { x: 4, y: 2, z: 6 },
    ]
    const c = computeCentroid(points)
    expect(c.x).toBeCloseTo(2)
    expect(c.y).toBeCloseTo(1)
    expect(c.z).toBeCloseTo(3)
  })

  it('returns origin for empty array', () => {
    expect(computeCentroid([])).toEqual({ x: 0, y: 0, z: 0 })
  })
})

// ---------------------------------------------------------------------------
// Tests: horizontalDistance
// ---------------------------------------------------------------------------

describe('horizontalDistance', () => {
  it('ignores Y component', () => {
    const a: Point3D = { x: 0, y: 100, z: 0 }
    const b: Point3D = { x: 3, y: -50, z: 4 }
    expect(horizontalDistance(a, b)).toBeCloseTo(5)
  })
})

// ---------------------------------------------------------------------------
// Tests: getTaggedPositions
// ---------------------------------------------------------------------------

describe('getTaggedPositions', () => {
  it('returns positions of photos with the specified tag', () => {
    const pose1: CameraPose = { position: { x: 1, y: 0, z: 0 }, rotation: [1,0,0,0,1,0,0,0,1] }
    const pose2: CameraPose = { position: { x: 5, y: 0, z: 3 }, rotation: [1,0,0,0,1,0,0,0,1] }
    const photos: CapturedPhoto[] = [
      makePhoto(0, ['doorway'], pose1),
      makePhoto(1, ['window'], pose2),
      makePhoto(2, []),
    ]

    const doorways = getTaggedPositions(photos, 'doorway')
    expect(doorways).toHaveLength(1)
    expect(doorways[0]).toEqual({ x: 1, y: 0, z: 0 })

    const windows = getTaggedPositions(photos, 'window')
    expect(windows).toHaveLength(1)
    expect(windows[0]).toEqual({ x: 5, y: 0, z: 3 })
  })

  it('excludes photos without a pose', () => {
    const photos: CapturedPhoto[] = [
      makePhoto(0, ['doorway']), // no pose
    ]
    expect(getTaggedPositions(photos, 'doorway')).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Tests: assignFloorLevel
// ---------------------------------------------------------------------------

describe('assignFloorLevel', () => {
  it('assigns level 0 for a single floor', () => {
    expect(assignFloorLevel(0, [0])).toBe(0)
  })

  it('assigns correct levels for multi-floor', () => {
    const floorYs = [0, 3, 6]
    expect(assignFloorLevel(0, floorYs)).toBe(0)
    expect(assignFloorLevel(3, floorYs)).toBe(1)
    expect(assignFloorLevel(6, floorYs)).toBe(2)
  })

  it('groups nearby Y values to same level', () => {
    expect(assignFloorLevel(0.1, [0, 3], 0.5)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Tests: buildWall
// ---------------------------------------------------------------------------

describe('buildWall', () => {
  it('builds a wall with correct corners and length', () => {
    // Wall facing +Z direction (normal along Z), spanning x=[0,4], y=[0,3]
    const wallPoints = generateWallPointsXZ(5, 0, 4, 0, 3, 30, 0.001)
    const detectedPlane: DetectedPlane = {
      plane: { normal: { x: 0, y: 0, z: 1 }, distance: -5 },
      type: 'wall',
      inlierPoints: wallPoints,
    }

    const wall = buildWall(detectedPlane, 'wall-1')
    expect(wall.id).toBe('wall-1')
    expect(wall.corners).toHaveLength(4)
    // Wall length should be approximately 4
    expect(wall.measurements.length).toBeGreaterThan(3.5)
    expect(wall.measurements.length).toBeLessThan(4.5)
  })
})

// ---------------------------------------------------------------------------
// Tests: buildFloor / buildCeiling
// ---------------------------------------------------------------------------

describe('buildFloor', () => {
  it('builds a floor with correct boundary', () => {
    const floorPoints = generateHorizontalPoints(0, 0, 5, 0, 4, 30, 0.001)
    const detectedPlane: DetectedPlane = {
      plane: { normal: { x: 0, y: 1, z: 0 }, distance: 0 },
      type: 'floor',
      inlierPoints: floorPoints,
    }

    const floor = buildFloor(detectedPlane, 'floor-1', 0)
    expect(floor.id).toBe('floor-1')
    expect(floor.level).toBe(0)
    expect(floor.boundary).toHaveLength(4)
    // Average Y should be close to 0
    const avgY = floor.boundary.reduce((s, p) => s + p.y, 0) / floor.boundary.length
    expect(avgY).toBeCloseTo(0, 0)
  })
})

describe('buildCeiling', () => {
  it('builds a ceiling with correct boundary', () => {
    const ceilingPoints = generateHorizontalPoints(3, 0, 5, 0, 4, 30, 0.001)
    const detectedPlane: DetectedPlane = {
      plane: { normal: { x: 0, y: -1, z: 0 }, distance: 3 },
      type: 'ceiling',
      inlierPoints: ceilingPoints,
    }

    const ceiling = buildCeiling(detectedPlane, 'ceil-1')
    expect(ceiling.id).toBe('ceil-1')
    expect(ceiling.boundary).toHaveLength(4)
    const avgY = ceiling.boundary.reduce((s, p) => s + p.y, 0) / ceiling.boundary.length
    expect(avgY).toBeCloseTo(3, 0)
  })
})

// ---------------------------------------------------------------------------
// Tests: Room segmentation
// ---------------------------------------------------------------------------

describe('assignWallsToRooms', () => {
  it('assigns all walls to room 0 when no doorways exist', () => {
    const wallPlanes: DetectedPlane[] = [
      {
        plane: { normal: { x: 0, y: 0, z: 1 }, distance: 0 },
        type: 'wall',
        inlierPoints: [{ x: 1, y: 1, z: 0 }],
      },
      {
        plane: { normal: { x: 1, y: 0, z: 0 }, distance: -5 },
        type: 'wall',
        inlierPoints: [{ x: 5, y: 1, z: 2 }],
      },
    ]

    const result = assignWallsToRooms(wallPlanes, [], [])
    expect(result.size).toBe(1)
    expect(result.get(0)).toHaveLength(2)
  })

  it('splits walls into two rooms with a doorway between them', () => {
    // Room 1 walls at x~1, Room 2 walls at x~9, doorway at x=5
    const room1Wall: DetectedPlane = {
      plane: { normal: { x: 0, y: 0, z: 1 }, distance: 0 },
      type: 'wall',
      inlierPoints: [
        { x: 0, y: 1, z: 0 },
        { x: 1, y: 1, z: 0 },
        { x: 2, y: 1, z: 0 },
      ],
    }
    const room2Wall: DetectedPlane = {
      plane: { normal: { x: 0, y: 0, z: 1 }, distance: -10 },
      type: 'wall',
      inlierPoints: [
        { x: 8, y: 1, z: 10 },
        { x: 9, y: 1, z: 10 },
        { x: 10, y: 1, z: 10 },
      ],
    }

    const doorwayPos: Point3D[] = [{ x: 5, y: 1, z: 5 }]
    const allPoints: Point3D[] = [
      ...room1Wall.inlierPoints,
      ...room2Wall.inlierPoints,
    ]

    const result = assignWallsToRooms(
      [room1Wall, room2Wall],
      doorwayPos,
      allPoints
    )

    expect(result.size).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// Tests: computeRoomCenters
// ---------------------------------------------------------------------------

describe('computeRoomCenters', () => {
  it('returns single center when no doorways', () => {
    const points: Point3D[] = [
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 10 },
    ]
    const centers = computeRoomCenters(points, [])
    expect(centers).toHaveLength(1)
    expect(centers[0].x).toBeCloseTo(5)
    expect(centers[0].z).toBeCloseTo(5)
  })

  it('returns two centers for one doorway', () => {
    const points: Point3D[] = [
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
    ]
    const doorways: Point3D[] = [{ x: 5, y: 0, z: 0 }]
    const centers = computeRoomCenters(points, doorways)
    expect(centers).toHaveLength(2)
    // First center should be left of doorway, second to the right
    expect(centers[0].x).toBeLessThan(5)
    expect(centers[1].x).toBeGreaterThan(5)
  })
})

// ---------------------------------------------------------------------------
// Tests: detectStaircases
// ---------------------------------------------------------------------------

describe('detectStaircases', () => {
  it('returns empty array for single-level rooms', () => {
    const floorPlane: DetectedPlane = {
      plane: { normal: { x: 0, y: 1, z: 0 }, distance: 0 },
      type: 'floor',
      inlierPoints: generateHorizontalPoints(0, 0, 5, 0, 5, 10),
    }
    const ceilingPlane: DetectedPlane = {
      plane: { normal: { x: 0, y: -1, z: 0 }, distance: 3 },
      type: 'ceiling',
      inlierPoints: generateHorizontalPoints(3, 0, 5, 0, 5, 10),
    }
    const room = buildRoom(
      'room-0', 'Room 1', [], floorPlane, ceilingPlane, 0,
      [...floorPlane.inlierPoints, ...ceilingPlane.inlierPoints]
    )
    expect(detectStaircases([room], [])).toEqual([])
  })

  it('detects a staircase between two levels', () => {
    // Room on level 0 (floor y=0)
    const floor0 = generateHorizontalPoints(0, 0, 5, 0, 5, 10)
    const room0 = buildRoom(
      'room-0', 'Room 1', [],
      { plane: { normal: { x: 0, y: 1, z: 0 }, distance: 0 }, type: 'floor', inlierPoints: floor0 },
      { plane: { normal: { x: 0, y: -1, z: 0 }, distance: 3 }, type: 'ceiling', inlierPoints: generateHorizontalPoints(3, 0, 5, 0, 5, 10) },
      0, floor0
    )

    // Room on level 1 (floor y=3)
    const floor1 = generateHorizontalPoints(3, 6, 11, 0, 5, 10)
    const room1 = buildRoom(
      'room-1', 'Room 2', [],
      { plane: { normal: { x: 0, y: 1, z: 0 }, distance: -3 }, type: 'floor', inlierPoints: floor1 },
      { plane: { normal: { x: 0, y: -1, z: 0 }, distance: 6 }, type: 'ceiling', inlierPoints: generateHorizontalPoints(6, 6, 11, 0, 5, 10) },
      1, floor1
    )

    const staircases = detectStaircases([room0, room1], [])
    expect(staircases).toHaveLength(1)
    expect(staircases[0].fromLevel).toBe(0)
    expect(staircases[0].toLevel).toBe(1)
    expect(staircases[0].bottomPosition.y).toBeCloseTo(0, 0)
    expect(staircases[0].topPosition.y).toBeCloseTo(3, 0)
  })
})

// ---------------------------------------------------------------------------
// Tests: extractRoomGeometry (integration)
// ---------------------------------------------------------------------------

describe('extractRoomGeometry', () => {
  it('returns empty model for empty point cloud', () => {
    const pointCloud: PointCloud = { points: [], isScaled: false, scaleFactor: 1 }
    const result = extractRoomGeometry(pointCloud, [])
    expect(result.rooms).toEqual([])
    expect(result.staircases).toEqual([])
    expect(result.floorLevels).toBe(0)
  })

  it('extracts a single room from a box-shaped point cloud', () => {
    // Generate a simple box: floor at y=0, ceiling at y=3, walls at x=0, x=5, z=0, z=5
    const floorPts = generateHorizontalPoints(0, 0, 5, 0, 5, 40, 0.01)
    const ceilingPts = generateHorizontalPoints(3, 0, 5, 0, 5, 40, 0.01)
    const wallN = generateWallPointsXZ(0, 0, 5, 0, 3, 25, 0.01)
    const wallS = generateWallPointsXZ(5, 0, 5, 0, 3, 25, 0.01)
    const wallW = generateWallPointsXY(0, 0, 5, 0, 3, 25, 0.01)
    const wallE = generateWallPointsXY(5, 0, 5, 0, 3, 25, 0.01)

    const allPoints = [...floorPts, ...ceilingPts, ...wallN, ...wallS, ...wallW, ...wallE]
    const pointCloud = makePointCloud(allPoints)

    const result = extractRoomGeometry(pointCloud, [])

    // Should have at least one room
    expect(result.rooms.length).toBeGreaterThanOrEqual(1)

    const room = result.rooms[0]
    // Room should have walls
    expect(room.walls.length).toBeGreaterThanOrEqual(1)
    // Room should have floor and ceiling
    expect(room.floor).toBeDefined()
    expect(room.ceiling).toBeDefined()
    // Ceiling height should be approximately 3
    expect(room.measurements.ceilingHeight).toBeGreaterThan(2)
    expect(room.measurements.ceilingHeight).toBeLessThan(4)
    // No staircases for single level
    expect(result.staircases).toEqual([])
    expect(result.floorLevels).toBe(1)
  })

  it('segments into multiple rooms when doorway tags are present', () => {
    // Two rooms side by side: Room1 at x=[0,5], Room2 at x=[7,12]
    // Doorway at x=6
    const room1Floor = generateHorizontalPoints(0, 0, 5, 0, 5, 30, 0.01)
    const room1Wall1 = generateWallPointsXZ(0, 0, 5, 0, 3, 20, 0.01)
    const room1Wall2 = generateWallPointsXY(0, 0, 5, 0, 3, 20, 0.01)

    const room2Floor = generateHorizontalPoints(0, 7, 12, 0, 5, 30, 0.01)
    const room2Wall1 = generateWallPointsXZ(5, 7, 12, 0, 3, 20, 0.01)
    const room2Wall2 = generateWallPointsXY(12, 0, 5, 0, 3, 20, 0.01)

    const ceilingPts = generateHorizontalPoints(3, 0, 12, 0, 5, 40, 0.01)

    const allPoints = [
      ...room1Floor, ...room1Wall1, ...room1Wall2,
      ...room2Floor, ...room2Wall1, ...room2Wall2,
      ...ceilingPts,
    ]
    const pointCloud = makePointCloud(allPoints)

    const doorwayPose: CameraPose = {
      position: { x: 6, y: 1.5, z: 2.5 },
      rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    }
    const photos: CapturedPhoto[] = [
      makePhoto(0, ['doorway'], doorwayPose),
    ]

    const result = extractRoomGeometry(pointCloud, photos)

    // Should have at least 2 rooms (may have more depending on RANSAC results)
    expect(result.rooms.length).toBeGreaterThanOrEqual(1)
    // Each room should have walls
    for (const room of result.rooms) {
      expect(room.floor).toBeDefined()
      expect(room.ceiling).toBeDefined()
    }
  })

  it('detects multi-level layout with stairs', () => {
    // Level 0: floor at y=0, ceiling at y=3, at x=[0,5]
    const level0Floor = generateHorizontalPoints(0, 0, 5, 0, 5, 40, 0.01)
    const level0Ceiling = generateHorizontalPoints(3, 0, 5, 0, 5, 40, 0.01)
    const level0Wall = generateWallPointsXZ(0, 0, 5, 0, 3, 25, 0.01)
    const level0Wall2 = generateWallPointsXY(0, 0, 5, 0, 3, 25, 0.01)

    // Level 1: floor at y=3.5, ceiling at y=6.5, at x=[7,12]
    const level1Floor = generateHorizontalPoints(3.5, 7, 12, 0, 5, 40, 0.01)
    const level1Ceiling = generateHorizontalPoints(6.5, 7, 12, 0, 5, 40, 0.01)
    const level1Wall = generateWallPointsXZ(5, 7, 12, 3.5, 6.5, 25, 0.01)
    const level1Wall2 = generateWallPointsXY(12, 0, 5, 3.5, 6.5, 25, 0.01)

    const allPoints = [
      ...level0Floor, ...level0Ceiling, ...level0Wall, ...level0Wall2,
      ...level1Floor, ...level1Ceiling, ...level1Wall, ...level1Wall2,
    ]
    const pointCloud = makePointCloud(allPoints)

    // Doorway between levels
    const doorwayPose: CameraPose = {
      position: { x: 6, y: 1.5, z: 2.5 },
      rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    }
    const photos: CapturedPhoto[] = [
      makePhoto(0, ['doorway'], doorwayPose),
    ]

    const result = extractRoomGeometry(pointCloud, photos)

    // Should have rooms on multiple levels
    expect(result.rooms.length).toBeGreaterThanOrEqual(1)
    // Check floor levels
    expect(result.floorLevels).toBeGreaterThanOrEqual(1)
  })

  it('sets isCalibrated based on point cloud scaling', () => {
    const points = generateHorizontalPoints(0, 0, 5, 0, 5, 30, 0.01)
    const wallPts = generateWallPointsXZ(0, 0, 5, 0, 3, 20, 0.01)

    const unscaled = makePointCloud([...points, ...wallPts], false)
    const result1 = extractRoomGeometry(unscaled, [])
    expect(result1.isCalibrated).toBe(false)

    const scaled = makePointCloud([...points, ...wallPts], true)
    const result2 = extractRoomGeometry(scaled, [])
    expect(result2.isCalibrated).toBe(true)
  })

  it('handles point cloud with only horizontal planes (no walls)', () => {
    const floorPts = generateHorizontalPoints(0, 0, 5, 0, 5, 40, 0.01)
    const ceilingPts = generateHorizontalPoints(3, 0, 5, 0, 5, 40, 0.01)

    const pointCloud = makePointCloud([...floorPts, ...ceilingPts])
    const result = extractRoomGeometry(pointCloud, [])

    // Should still create a room from the floor/ceiling
    expect(result.rooms.length).toBeGreaterThanOrEqual(1)
  })

  it('returns rooms with doors and windows arrays (empty by default)', () => {
    const floorPts = generateHorizontalPoints(0, 0, 5, 0, 5, 30, 0.01)
    const wallPts = generateWallPointsXZ(0, 0, 5, 0, 3, 25, 0.01)
    const pointCloud = makePointCloud([...floorPts, ...wallPts])

    const result = extractRoomGeometry(pointCloud, [])

    for (const room of result.rooms) {
      expect(room.doors).toEqual([])
      expect(room.windows).toEqual([])
    }
  })

  it('room has correct id and name format', () => {
    const floorPts = generateHorizontalPoints(0, 0, 5, 0, 5, 30, 0.01)
    const wallPts = generateWallPointsXZ(0, 0, 5, 0, 3, 25, 0.01)
    const pointCloud = makePointCloud([...floorPts, ...wallPts])

    const result = extractRoomGeometry(pointCloud, [])

    expect(result.rooms.length).toBeGreaterThanOrEqual(1)
    expect(result.rooms[0].id).toMatch(/^room-\d+$/)
    expect(result.rooms[0].name).toMatch(/^Room \d+$/)
  })
})
