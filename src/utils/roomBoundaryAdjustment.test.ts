import { describe, it, expect } from 'vitest'
import {
  splitRoom,
  mergeRooms,
  sideOfLine,
  splitPolygonByLine,
  computeConvexHullXZ,
} from './roomBoundaryAdjustment'
import type { Room, Wall, Floor, Ceiling } from '../types'
import type { Point3D } from '../types'

// ---------------------------------------------------------------------------
// Test data factories
// ---------------------------------------------------------------------------

function makePoint(x: number, y: number, z: number): Point3D {
  return { x, y, z }
}

function makeWall(
  id: string,
  bl: Point3D,
  br: Point3D,
  tr: Point3D,
  tl: Point3D,
): Wall {
  return {
    id,
    corners: [bl, br, tr, tl],
    plane: { normal: { x: 0, y: 0, z: 1 }, distance: 0 },
    measurements: { length: 0 },
  }
}

/** Create a simple rectangular room: 4m x 6m at origin, floor at y=0, ceiling at y=2.5 */
function makeRoom(
  id = 'room-1',
  name = 'Lounge',
): Room {
  // Floor boundary: rectangle at y=0 in XZ plane
  const floorBoundary: Point3D[] = [
    makePoint(0, 0, 0),
    makePoint(4, 0, 0),
    makePoint(4, 0, 6),
    makePoint(0, 0, 6),
  ]
  const ceilingBoundary: Point3D[] = [
    makePoint(0, 2.5, 0),
    makePoint(4, 2.5, 0),
    makePoint(4, 2.5, 6),
    makePoint(0, 2.5, 6),
  ]

  const walls: Wall[] = [
    // South wall (z=0)
    makeWall(
      `${id}-wall-s`,
      makePoint(0, 0, 0), makePoint(4, 0, 0),
      makePoint(4, 2.5, 0), makePoint(0, 2.5, 0),
    ),
    // East wall (x=4)
    makeWall(
      `${id}-wall-e`,
      makePoint(4, 0, 0), makePoint(4, 0, 6),
      makePoint(4, 2.5, 6), makePoint(4, 2.5, 0),
    ),
    // North wall (z=6)
    makeWall(
      `${id}-wall-n`,
      makePoint(4, 0, 6), makePoint(0, 0, 6),
      makePoint(0, 2.5, 6), makePoint(4, 2.5, 6),
    ),
    // West wall (x=0)
    makeWall(
      `${id}-wall-w`,
      makePoint(0, 0, 6), makePoint(0, 0, 0),
      makePoint(0, 2.5, 0), makePoint(0, 2.5, 6),
    ),
  ]

  const floor: Floor = {
    id: `${id}-floor`,
    boundary: floorBoundary,
    plane: { normal: { x: 0, y: 1, z: 0 }, distance: 0 },
    level: 0,
  }

  const ceiling: Ceiling = {
    id: `${id}-ceiling`,
    boundary: ceilingBoundary,
    plane: { normal: { x: 0, y: -1, z: 0 }, distance: 2.5 },
  }

  return {
    id,
    name,
    walls,
    floor,
    ceiling,
    doors: [],
    windows: [],
    measurements: { width: 4, depth: 6, ceilingHeight: 2.5 },
  }
}

// ---------------------------------------------------------------------------
// sideOfLine tests
// ---------------------------------------------------------------------------

describe('sideOfLine', () => {
  it('returns positive for points on the left side', () => {
    // Line from (0,0) to (1,0) in XZ
    const result = sideOfLine(
      { x: 0.5, z: 1 },
      { x: 0, z: 0 },
      { x: 1, z: 0 },
    )
    expect(result).toBeGreaterThan(0)
  })

  it('returns negative for points on the right side', () => {
    const result = sideOfLine(
      { x: 0.5, z: -1 },
      { x: 0, z: 0 },
      { x: 1, z: 0 },
    )
    expect(result).toBeLessThan(0)
  })

  it('returns zero for points on the line', () => {
    const result = sideOfLine(
      { x: 0.5, z: 0 },
      { x: 0, z: 0 },
      { x: 1, z: 0 },
    )
    expect(result).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// splitPolygonByLine tests
// ---------------------------------------------------------------------------

describe('splitPolygonByLine', () => {
  it('splits a rectangle into two halves with a horizontal line', () => {
    // Rectangle: (0,0) -> (4,0) -> (4,6) -> (0,6) in XZ
    const polygon: Point3D[] = [
      makePoint(0, 0, 0),
      makePoint(4, 0, 0),
      makePoint(4, 0, 6),
      makePoint(0, 0, 6),
    ]

    // Split with horizontal line at z=3 (from x=0 to x=4)
    const [sideA, sideB] = splitPolygonByLine(
      polygon,
      { x: 0, z: 3 },
      { x: 4, z: 3 },
    )

    // Both sides should have 4 points (rectangle halves)
    expect(sideA.length).toBeGreaterThanOrEqual(3)
    expect(sideB.length).toBeGreaterThanOrEqual(3)

    // All sideA points should have z >= 3, all sideB should have z <= 3
    for (const p of sideA) {
      expect(p.z).toBeGreaterThanOrEqual(3 - 0.01)
    }
    for (const p of sideB) {
      expect(p.z).toBeLessThanOrEqual(3 + 0.01)
    }
  })

  it('returns the original polygon and empty array if line does not cross', () => {
    const polygon: Point3D[] = [
      makePoint(0, 0, 0),
      makePoint(4, 0, 0),
      makePoint(4, 0, 6),
      makePoint(0, 0, 6),
    ]

    // Line entirely below the polygon
    const [sideA, sideB] = splitPolygonByLine(
      polygon,
      { x: 0, z: -1 },
      { x: 4, z: -1 },
    )

    // One side should have all points, other should have none (or just on-line points)
    expect(sideA.length + sideB.length).toBeGreaterThanOrEqual(4)
  })
})

// ---------------------------------------------------------------------------
// computeConvexHullXZ tests
// ---------------------------------------------------------------------------

describe('computeConvexHullXZ', () => {
  it('returns input unchanged for 3 or fewer points', () => {
    const points = [makePoint(0, 0, 0), makePoint(1, 0, 0), makePoint(0, 0, 1)]
    const hull = computeConvexHullXZ(points)
    expect(hull).toHaveLength(3)
  })

  it('computes correct hull for a square with interior points', () => {
    const points = [
      makePoint(0, 0, 0),
      makePoint(4, 0, 0),
      makePoint(4, 0, 4),
      makePoint(0, 0, 4),
      makePoint(2, 0, 2), // interior point
    ]
    const hull = computeConvexHullXZ(points)
    // Hull should have 4 points (the square corners)
    expect(hull).toHaveLength(4)
  })
})

// ---------------------------------------------------------------------------
// splitRoom tests
// ---------------------------------------------------------------------------

describe('splitRoom', () => {
  it('splits a rectangular room into two halves', () => {
    const room = makeRoom()

    // Split along z=3 (horizontal line through the middle)
    const result = splitRoom(
      room,
      makePoint(0, 0, 3),
      makePoint(4, 0, 3),
    )

    expect(result).not.toBeNull()
    const [roomA, roomB] = result!

    // Both rooms should exist
    expect(roomA.id).toContain('room-1')
    expect(roomB.id).toContain('room-1')
    expect(roomA.name).toBe('Lounge A')
    expect(roomB.name).toBe('Lounge B')

    // Each room should have walls
    expect(roomA.walls.length).toBeGreaterThan(0)
    expect(roomB.walls.length).toBeGreaterThan(0)

    // Each room should have a split wall
    const splitWallsA = roomA.walls.filter((w) => w.id.includes('wall-split'))
    const splitWallsB = roomB.walls.filter((w) => w.id.includes('wall-split'))
    expect(splitWallsA).toHaveLength(1)
    expect(splitWallsB).toHaveLength(1)

    // Each room should have valid floor boundaries
    expect(roomA.floor.boundary.length).toBeGreaterThanOrEqual(3)
    expect(roomB.floor.boundary.length).toBeGreaterThanOrEqual(3)

    // Measurements should be recalculated
    expect(roomA.measurements.width).toBeGreaterThan(0)
    expect(roomA.measurements.depth).toBeGreaterThan(0)
    expect(roomB.measurements.width).toBeGreaterThan(0)
    expect(roomB.measurements.depth).toBeGreaterThan(0)
  })

  it('returns null when split line does not intersect room boundary', () => {
    const room = makeRoom()

    // Split line is entirely outside the room
    const result = splitRoom(
      room,
      makePoint(10, 0, 0),
      makePoint(10, 0, 6),
    )

    expect(result).toBeNull()
  })

  it('assigns doors and windows to the correct side', () => {
    const room = makeRoom()
    room.doors = [
      {
        id: 'door-1',
        wallId: 'room-1-wall-s',
        position: makePoint(2, 1, 0),
        width: 0.9,
        height: 2.1,
      },
    ]
    room.windows = [
      {
        id: 'win-1',
        wallId: 'room-1-wall-n',
        position: makePoint(2, 1.5, 6),
        width: 1.2,
        height: 1.0,
        sillHeight: 0.9,
      },
    ]

    // Split along z=3
    const result = splitRoom(room, makePoint(0, 0, 3), makePoint(4, 0, 3))
    expect(result).not.toBeNull()
    const [roomA, roomB] = result!

    // Door at z=0 should be on one side, window at z=6 on the other
    const allDoors = [...roomA.doors, ...roomB.doors]
    const allWindows = [...roomA.windows, ...roomB.windows]
    expect(allDoors).toHaveLength(1)
    expect(allWindows).toHaveLength(1)

    // They should not both be in the same room
    const roomWithDoor = roomA.doors.length > 0 ? roomA : roomB
    const roomWithWindow = roomA.windows.length > 0 ? roomA : roomB
    expect(roomWithDoor.id).not.toBe(roomWithWindow.id)
  })

  it('preserves ceiling height', () => {
    const room = makeRoom()
    const result = splitRoom(room, makePoint(0, 0, 3), makePoint(4, 0, 3))
    expect(result).not.toBeNull()
    const [roomA, roomB] = result!

    expect(roomA.measurements.ceilingHeight).toBeCloseTo(2.5, 1)
    expect(roomB.measurements.ceilingHeight).toBeCloseTo(2.5, 1)
  })
})

// ---------------------------------------------------------------------------
// mergeRooms tests
// ---------------------------------------------------------------------------

describe('mergeRooms', () => {
  it('merges two rooms back into one', () => {
    const room = makeRoom()
    const result = splitRoom(room, makePoint(0, 0, 3), makePoint(4, 0, 3))
    expect(result).not.toBeNull()
    const [roomA, roomB] = result!

    const merged = mergeRooms(roomA, roomB)

    // Merged room should exist
    expect(merged.name).toBe('Lounge')

    // Merged room should have fewer walls (split walls removed)
    // Original had 4 walls, split adds 2, so each half has ~3 walls
    // After merge, overlapping split walls should be reduced (one kept per overlapping pair)
    const splitWalls = merged.walls.filter((w) => w.id.includes('wall-split'))
    expect(splitWalls.length).toBeLessThanOrEqual(1)

    // Should have valid floor boundary
    expect(merged.floor.boundary.length).toBeGreaterThanOrEqual(3)

    // Measurements should be recalculated
    expect(merged.measurements.width).toBeGreaterThan(0)
    expect(merged.measurements.depth).toBeGreaterThan(0)
    expect(merged.measurements.ceilingHeight).toBeGreaterThan(0)
  })

  it('combines doors and windows from both rooms', () => {
    const room = makeRoom()
    room.doors = [
      {
        id: 'door-1',
        wallId: 'room-1-wall-s',
        position: makePoint(2, 1, 0),
        width: 0.9,
        height: 2.1,
      },
    ]
    room.windows = [
      {
        id: 'win-1',
        wallId: 'room-1-wall-n',
        position: makePoint(2, 1.5, 6),
        width: 1.2,
        height: 1.0,
        sillHeight: 0.9,
      },
    ]

    const result = splitRoom(room, makePoint(0, 0, 3), makePoint(4, 0, 3))
    expect(result).not.toBeNull()
    const [roomA, roomB] = result!

    const merged = mergeRooms(roomA, roomB)

    expect(merged.doors).toHaveLength(1)
    expect(merged.windows).toHaveLength(1)
  })

  it('uses base name when merging rooms with A/B suffixes', () => {
    const roomA: Room = {
      ...makeRoom('r1-a', 'Kitchen A'),
      floor: {
        id: 'f-a',
        boundary: [makePoint(0, 0, 0), makePoint(2, 0, 0), makePoint(2, 0, 3), makePoint(0, 0, 3)],
        plane: { normal: { x: 0, y: 1, z: 0 }, distance: 0 },
        level: 0,
      },
      ceiling: {
        id: 'c-a',
        boundary: [makePoint(0, 2.5, 0), makePoint(2, 2.5, 0), makePoint(2, 2.5, 3), makePoint(0, 2.5, 3)],
        plane: { normal: { x: 0, y: -1, z: 0 }, distance: 2.5 },
      },
    }
    const roomB: Room = {
      ...makeRoom('r1-b', 'Kitchen B'),
      floor: {
        id: 'f-b',
        boundary: [makePoint(2, 0, 0), makePoint(4, 0, 0), makePoint(4, 0, 3), makePoint(2, 0, 3)],
        plane: { normal: { x: 0, y: 1, z: 0 }, distance: 0 },
        level: 0,
      },
      ceiling: {
        id: 'c-b',
        boundary: [makePoint(2, 2.5, 0), makePoint(4, 2.5, 0), makePoint(4, 2.5, 3), makePoint(2, 2.5, 3)],
        plane: { normal: { x: 0, y: -1, z: 0 }, distance: 2.5 },
      },
    }

    const merged = mergeRooms(roomA, roomB)
    expect(merged.name).toBe('Kitchen')
  })
})
