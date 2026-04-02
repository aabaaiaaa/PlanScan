import { describe, it, expect } from 'vitest'
import type { CapturedPhoto, Point3D } from './types'
import type { PointCloud, TriangulatedPoint } from './utils/triangulation'
import { extractRoomGeometry } from './utils/geometryExtraction'
import { calculateAllMeasurements } from './utils/measurementCalculation'

// ---------------------------------------------------------------------------
// Helpers: synthetic point cloud generation
// ---------------------------------------------------------------------------

const IDENTITY_ROTATION = [1, 0, 0, 0, 1, 0, 0, 0, 1]

/**
 * Generate a grid of 3D points on a planar surface (zero noise).
 *
 * Axis mapping:
 *   fixedAxis='x' → range1 = y extent, range2 = z extent
 *   fixedAxis='y' → range1 = x extent, range2 = z extent
 *   fixedAxis='z' → range1 = x extent, range2 = y extent
 */
function generatePlanePoints(
  fixedAxis: 'x' | 'y' | 'z',
  fixedValue: number,
  range1: [number, number],
  range2: [number, number],
  gridSize: number = 6,
): Point3D[] {
  const points: Point3D[] = []
  const step1 = gridSize > 1 ? (range1[1] - range1[0]) / (gridSize - 1) : 0
  const step2 = gridSize > 1 ? (range2[1] - range2[0]) / (gridSize - 1) : 0

  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      const v1 = range1[0] + i * step1
      const v2 = range2[0] + j * step2

      if (fixedAxis === 'x') {
        points.push({ x: fixedValue, y: v1, z: v2 })
      } else if (fixedAxis === 'y') {
        points.push({ x: v1, y: fixedValue, z: v2 })
      } else {
        points.push({ x: v1, y: v2, z: fixedValue })
      }
    }
  }
  return points
}

/** Wrap bare Point3D positions as TriangulatedPoints for the PointCloud interface */
function toTriangulatedPoints(positions: Point3D[]): TriangulatedPoint[] {
  return positions.map((position) => ({
    position,
    sourcePhotos: [0, 1] as [number, number],
    pixelCoords: [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ] as [{ x: number; y: number }, { x: number; y: number }],
    reprojectionError: 0,
  }))
}

/** Create a mock CapturedPhoto with a pre-set camera pose and optional tags */
function makePhoto(
  index: number,
  position: Point3D,
  tags: ('doorway' | 'window')[] = [],
): CapturedPhoto {
  return {
    index,
    imageData: 'data:image/png;base64,AAAA',
    width: 320,
    height: 240,
    tags,
    capturedAt: Date.now(),
    pose: { position, rotation: IDENTITY_ROTATION },
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * Two-room layout:
 *
 *   Room 1 (left):  x=[0..4], z=[0..3], y=[0..2.5]  →  4 m × 3 m, 2.5 m ceiling
 *   Room 2 (right): x=[4..7], z=[0..3], y=[0..2.5]  →  3 m × 3 m, 2.5 m ceiling
 *
 * Planes: left wall (x=0), right wall (x=7), back wall (z=0),
 *         front wall (z=3), dividing wall (x=4), floor (y=0), ceiling (y=2.5)
 *
 * Tags: one doorway photo at x=4, one window photo near the left wall.
 */
function buildTwoRoomFixture() {
  const allPoints: Point3D[] = [
    ...generatePlanePoints('x', 0, [0, 2.5], [0, 3]),   // left wall
    ...generatePlanePoints('x', 7, [0, 2.5], [0, 3]),   // right wall
    ...generatePlanePoints('z', 0, [0, 7], [0, 2.5]),   // back wall
    ...generatePlanePoints('z', 3, [0, 7], [0, 2.5]),   // front wall
    ...generatePlanePoints('x', 4, [0, 2.5], [0, 3]),   // dividing wall
    ...generatePlanePoints('y', 0, [0, 7], [0, 3]),     // floor
    ...generatePlanePoints('y', 2.5, [0, 7], [0, 3]),   // ceiling
  ]

  const pointCloud: PointCloud = {
    points: toTriangulatedPoints(allPoints),
    isScaled: true,
    scaleFactor: 1.0,
  }

  const photos: CapturedPhoto[] = [
    makePhoto(0, { x: 2, y: 1.25, z: 1.5 }),                // Room 1
    makePhoto(1, { x: 1, y: 1.25, z: 1.5 }),                // Room 1
    makePhoto(2, { x: 4, y: 1.25, z: 1.5 }, ['doorway']),   // doorway between rooms
    makePhoto(3, { x: 5.5, y: 1.25, z: 1.5 }),              // Room 2
    makePhoto(4, { x: 0.3, y: 1.25, z: 1.5 }, ['window']),  // window in Room 1
  ]

  return { pointCloud, photos }
}

/**
 * Single room: x=[0..5], z=[0..4], y=[0..2.5]  →  5 m × 4 m, 2.5 m ceiling
 * No doorway or window tags.
 */
function buildSingleRoomFixture() {
  const allPoints: Point3D[] = [
    ...generatePlanePoints('x', 0, [0, 2.5], [0, 4]),   // left wall
    ...generatePlanePoints('x', 5, [0, 2.5], [0, 4]),   // right wall
    ...generatePlanePoints('z', 0, [0, 5], [0, 2.5]),   // back wall
    ...generatePlanePoints('z', 4, [0, 5], [0, 2.5]),   // front wall
    ...generatePlanePoints('y', 0, [0, 5], [0, 4]),     // floor
    ...generatePlanePoints('y', 2.5, [0, 5], [0, 4]),   // ceiling
  ]

  const pointCloud: PointCloud = {
    points: toTriangulatedPoints(allPoints),
    isScaled: true,
    scaleFactor: 1.0,
  }

  const photos: CapturedPhoto[] = [
    makePhoto(0, { x: 2.5, y: 1.25, z: 2 }),
    makePhoto(1, { x: 1, y: 1.25, z: 2 }),
  ]

  return { pointCloud, photos }
}

// ---------------------------------------------------------------------------
// Integration tests
// ---------------------------------------------------------------------------

describe('End-to-end integration: reconstruction pipeline with fixture data', () => {
  describe('two-room layout with doorway and window', () => {
    it('produces rooms with walls, doors, and windows from a scan session', () => {
      const { pointCloud, photos } = buildTwoRoomFixture()
      const model = extractRoomGeometry(pointCloud, photos)

      // At least one room was reconstructed
      expect(model.rooms.length).toBeGreaterThanOrEqual(1)
      expect(model.isCalibrated).toBe(true)
      expect(model.floorLevels).toBeGreaterThanOrEqual(1)

      // Walls were detected across rooms
      const totalWalls = model.rooms.reduce((sum, r) => sum + r.walls.length, 0)
      expect(totalWalls).toBeGreaterThanOrEqual(2)

      // Door placed from the doorway-tagged photo
      const totalDoors = model.rooms.reduce((sum, r) => sum + r.doors.length, 0)
      expect(totalDoors).toBeGreaterThanOrEqual(1)

      // Window placed from the window-tagged photo
      const totalWindows = model.rooms.reduce((sum, r) => sum + r.windows.length, 0)
      expect(totalWindows).toBeGreaterThanOrEqual(1)
    })

    it('rooms have approximately correct geometry and measurements', () => {
      const { pointCloud, photos } = buildTwoRoomFixture()
      const model = extractRoomGeometry(pointCloud, photos)

      for (const room of model.rooms) {
        // Dimensions are positive and in a plausible range
        expect(room.measurements.width).toBeGreaterThan(0.5)
        expect(room.measurements.depth).toBeGreaterThan(0.5)

        // Ceiling height ≈ 2.5 m (generous tolerance: 1–4 m)
        expect(room.measurements.ceilingHeight).toBeGreaterThan(1.0)
        expect(room.measurements.ceilingHeight).toBeLessThan(4.0)

        // Each wall has a positive length
        for (const wall of room.walls) {
          expect(wall.measurements.length).toBeGreaterThan(0)
        }

        // Floor and ceiling boundaries exist
        expect(room.floor.boundary.length).toBeGreaterThanOrEqual(3)
        expect(room.ceiling.boundary.length).toBeGreaterThanOrEqual(3)
      }
    })

    it('doors and windows have valid dimensions on walls', () => {
      const { pointCloud, photos } = buildTwoRoomFixture()
      const model = extractRoomGeometry(pointCloud, photos)

      for (const room of model.rooms) {
        for (const door of room.doors) {
          expect(door.width).toBeGreaterThan(0)
          expect(door.height).toBeGreaterThan(0)
          expect(door.height).toBeLessThan(3.5)
          expect(door.wallId).toBeTruthy()
        }
        for (const win of room.windows) {
          expect(win.width).toBeGreaterThan(0)
          expect(win.height).toBeGreaterThan(0)
          expect(win.sillHeight).toBeGreaterThanOrEqual(0)
          expect(win.wallId).toBeTruthy()
        }
      }
    })

    it('measurement engine produces complete results from the model', () => {
      const { pointCloud, photos } = buildTwoRoomFixture()
      const model = extractRoomGeometry(pointCloud, photos)
      const measurements = calculateAllMeasurements(model)

      expect(measurements.isCalibrated).toBe(true)
      expect(measurements.rooms.length).toBeGreaterThanOrEqual(1)

      for (const room of measurements.rooms) {
        expect(room.width).toBeGreaterThan(0)
        expect(room.depth).toBeGreaterThan(0)
        expect(room.ceilingHeight).toBeGreaterThan(0)

        for (const wall of room.walls) {
          expect(wall.length).toBeGreaterThan(0)
        }
        for (const door of room.doors) {
          expect(door.width).toBeGreaterThan(0)
          expect(door.height).toBeGreaterThan(0)
        }
        for (const win of room.windows) {
          expect(win.width).toBeGreaterThan(0)
          expect(win.height).toBeGreaterThan(0)
        }
      }

      // Total area should be positive and roughly in range of the 7 m × 3 m layout
      const totalArea = measurements.rooms.reduce(
        (sum, r) => sum + r.width * r.depth,
        0,
      )
      expect(totalArea).toBeGreaterThan(5)
    })
  })

  describe('single room without tags', () => {
    it('produces exactly one room with no doors or windows', () => {
      const { pointCloud, photos } = buildSingleRoomFixture()
      const model = extractRoomGeometry(pointCloud, photos)

      expect(model.rooms.length).toBe(1)
      expect(model.rooms[0].doors.length).toBe(0)
      expect(model.rooms[0].windows.length).toBe(0)
    })

    it('room dimensions approximate the 5 m × 4 m layout', () => {
      const { pointCloud, photos } = buildSingleRoomFixture()
      const model = extractRoomGeometry(pointCloud, photos)

      const room = model.rooms[0]
      // width = shorter dimension ≈ 4, depth = longer ≈ 5 (generous tolerance)
      expect(room.measurements.width).toBeGreaterThan(2)
      expect(room.measurements.width).toBeLessThan(6)
      expect(room.measurements.depth).toBeGreaterThan(2)
      expect(room.measurements.depth).toBeLessThan(7)
      expect(room.measurements.ceilingHeight).toBeGreaterThan(1.5)
      expect(room.measurements.ceilingHeight).toBeLessThan(3.5)
    })
  })

  describe('uncalibrated model', () => {
    it('measurements report arbitrary units with a warning', () => {
      const allPoints: Point3D[] = [
        ...generatePlanePoints('x', 0, [0, 2.5], [0, 3]),
        ...generatePlanePoints('x', 4, [0, 2.5], [0, 3]),
        ...generatePlanePoints('z', 0, [0, 4], [0, 2.5]),
        ...generatePlanePoints('z', 3, [0, 4], [0, 2.5]),
        ...generatePlanePoints('y', 0, [0, 4], [0, 3]),
        ...generatePlanePoints('y', 2.5, [0, 4], [0, 3]),
      ]

      const pointCloud: PointCloud = {
        points: toTriangulatedPoints(allPoints),
        isScaled: false,
        scaleFactor: 1.0,
      }

      const photos: CapturedPhoto[] = [
        makePhoto(0, { x: 2, y: 1.25, z: 1.5 }),
        makePhoto(1, { x: 1, y: 1.25, z: 1.5 }),
      ]

      const model = extractRoomGeometry(pointCloud, photos)
      const measurements = calculateAllMeasurements(model)

      expect(measurements.isCalibrated).toBe(false)
      expect(measurements.unit).toBe('arbitrary')
      expect(measurements.warnings.some((w) => w.includes('arbitrary'))).toBe(true)
    })
  })
})
