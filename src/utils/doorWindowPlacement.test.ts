import { describe, it, expect } from 'vitest'
import type { Point3D, Wall, Room, CapturedPhoto, CameraPose } from '../types'
import {
  projectPointOntoPlane,
  isPointOnWallSurface,
  findNearestWall,
  clampToWallBounds,
  estimateDoorDimensions,
  estimateWindowDimensions,
  placeDoorOnWall,
  placeWindowOnWall,
  findRoomForPosition,
  placeDoorsAndWindows,
} from './doorWindowPlacement'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a simple wall on the XY plane at a given Z position.
 * Wall runs along X from xMin to xMax, and from yMin to yMax.
 * Normal points in the +Z direction.
 */
function makeWallAtZ(
  id: string,
  z: number,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number
): Wall {
  return {
    id,
    corners: [
      { x: xMin, y: yMin, z }, // bottom-left
      { x: xMax, y: yMin, z }, // bottom-right
      { x: xMax, y: yMax, z }, // top-right
      { x: xMin, y: yMax, z }, // top-left
    ],
    plane: { normal: { x: 0, y: 0, z: 1 }, distance: -z },
    measurements: { length: xMax - xMin },
  }
}

/**
 * Create a simple wall on the YZ plane at a given X position.
 * Wall runs along Z from zMin to zMax, and from yMin to yMax.
 * Normal points in the +X direction.
 */
function makeWallAtX(
  id: string,
  x: number,
  zMin: number,
  zMax: number,
  yMin: number,
  yMax: number
): Wall {
  return {
    id,
    corners: [
      { x, y: yMin, z: zMin }, // bottom-left
      { x, y: yMin, z: zMax }, // bottom-right
      { x, y: yMax, z: zMax }, // top-right
      { x, y: yMin, z: zMin }, // top-left — note: for this wall, top-left is actually at (x, yMax, zMin)
    ],
    plane: { normal: { x: 1, y: 0, z: 0 }, distance: -x },
    measurements: { length: zMax - zMin },
  }
}

/** Create a minimal Room with the given walls */
function makeRoom(
  id: string,
  walls: Wall[],
  floorY: number = 0,
  ceilingY: number = 3
): Room {
  return {
    id,
    name: `Room ${id}`,
    walls,
    floor: {
      id: `${id}-floor`,
      boundary: [
        { x: -5, y: floorY, z: -5 },
        { x: 5, y: floorY, z: -5 },
        { x: 5, y: floorY, z: 5 },
        { x: -5, y: floorY, z: 5 },
      ],
      plane: { normal: { x: 0, y: 1, z: 0 }, distance: -floorY },
      level: 0,
    },
    ceiling: {
      id: `${id}-ceiling`,
      boundary: [
        { x: -5, y: ceilingY, z: -5 },
        { x: 5, y: ceilingY, z: -5 },
        { x: 5, y: ceilingY, z: 5 },
        { x: -5, y: ceilingY, z: 5 },
      ],
      plane: { normal: { x: 0, y: -1, z: 0 }, distance: ceilingY },
    },
    doors: [],
    windows: [],
    measurements: { width: 10, depth: 10, ceilingHeight: ceilingY - floorY },
  }
}

/** Create a mock CapturedPhoto with optional tag and pose */
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
// Tests: projectPointOntoPlane
// ---------------------------------------------------------------------------

describe('projectPointOntoPlane', () => {
  it('projects a point onto a wall plane', () => {
    const wall = makeWallAtZ('w1', 5, 0, 10, 0, 3)
    const point: Point3D = { x: 5, y: 1.5, z: 8 }
    const projected = projectPointOntoPlane(point, wall)

    // Should land on the plane at z=5
    expect(projected.z).toBeCloseTo(5, 5)
    // X and Y should remain the same
    expect(projected.x).toBeCloseTo(5, 5)
    expect(projected.y).toBeCloseTo(1.5, 5)
  })

  it('returns the same point if already on the plane', () => {
    const wall = makeWallAtZ('w1', 5, 0, 10, 0, 3)
    const point: Point3D = { x: 3, y: 2, z: 5 }
    const projected = projectPointOntoPlane(point, wall)

    expect(projected.x).toBeCloseTo(3, 5)
    expect(projected.y).toBeCloseTo(2, 5)
    expect(projected.z).toBeCloseTo(5, 5)
  })
})

// ---------------------------------------------------------------------------
// Tests: isPointOnWallSurface
// ---------------------------------------------------------------------------

describe('isPointOnWallSurface', () => {
  it('returns true for a point within wall bounds', () => {
    const wall = makeWallAtZ('w1', 5, 0, 10, 0, 3)
    const point: Point3D = { x: 5, y: 1.5, z: 5 }
    expect(isPointOnWallSurface(point, wall)).toBe(true)
  })

  it('returns false for a point far outside wall bounds', () => {
    const wall = makeWallAtZ('w1', 5, 0, 10, 0, 3)
    const point: Point3D = { x: 20, y: 1.5, z: 5 }
    expect(isPointOnWallSurface(point, wall)).toBe(false)
  })

  it('returns true for a point near the edge (within margin)', () => {
    const wall = makeWallAtZ('w1', 5, 0, 10, 0, 3)
    // Slightly outside the left edge, within 0.3 margin
    const point: Point3D = { x: -0.2, y: 1.5, z: 5 }
    expect(isPointOnWallSurface(point, wall)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Tests: findNearestWall
// ---------------------------------------------------------------------------

describe('findNearestWall', () => {
  it('returns null for empty wall list', () => {
    expect(findNearestWall({ x: 0, y: 0, z: 0 }, [])).toBeNull()
  })

  it('finds the closest wall to a point', () => {
    const wall1 = makeWallAtZ('w1', 2, 0, 10, 0, 3)
    const wall2 = makeWallAtZ('w2', 8, 0, 10, 0, 3)

    // Point at z=3 is closer to wall1 at z=2
    const result = findNearestWall({ x: 5, y: 1, z: 3 }, [wall1, wall2])
    expect(result).not.toBeNull()
    expect(result!.wall.id).toBe('w1')
    expect(result!.distance).toBeCloseTo(1, 5)
  })

  it('projected point lies on the plane', () => {
    const wall = makeWallAtZ('w1', 5, 0, 10, 0, 3)
    const result = findNearestWall({ x: 5, y: 1, z: 7 }, [wall])
    expect(result).not.toBeNull()
    expect(result!.projectedPoint.z).toBeCloseTo(5, 5)
  })
})

// ---------------------------------------------------------------------------
// Tests: clampToWallBounds
// ---------------------------------------------------------------------------

describe('clampToWallBounds', () => {
  it('does not change a point already within bounds', () => {
    const wall = makeWallAtZ('w1', 5, 0, 10, 0, 3)
    const clamped = clampToWallBounds({ x: 5, y: 1.5, z: 5 }, wall)
    expect(clamped.x).toBeCloseTo(5, 5)
    expect(clamped.y).toBeCloseTo(1.5, 5)
  })

  it('clamps a point that exceeds horizontal bounds', () => {
    const wall = makeWallAtZ('w1', 5, 0, 10, 0, 3)
    const clamped = clampToWallBounds({ x: 15, y: 1.5, z: 5 }, wall)
    // Should be clamped to x=10 (right edge)
    expect(clamped.x).toBeCloseTo(10, 5)
  })

  it('clamps a point that exceeds vertical bounds', () => {
    const wall = makeWallAtZ('w1', 5, 0, 10, 0, 3)
    const clamped = clampToWallBounds({ x: 5, y: 5, z: 5 }, wall)
    // Should be clamped to y=3 (top edge)
    expect(clamped.y).toBeCloseTo(3, 5)
  })
})

// ---------------------------------------------------------------------------
// Tests: estimateDoorDimensions
// ---------------------------------------------------------------------------

describe('estimateDoorDimensions', () => {
  it('returns default dimensions for a large wall', () => {
    const wall = makeWallAtZ('w1', 5, 0, 10, 0, 3)
    const dims = estimateDoorDimensions(wall)
    expect(dims.width).toBeCloseTo(0.9, 1)
    expect(dims.height).toBeCloseTo(2.1, 1)
  })

  it('caps door width for a narrow wall', () => {
    const wall = makeWallAtZ('w1', 5, 0, 0.5, 0, 3)
    const dims = estimateDoorDimensions(wall)
    // 0.5 * 0.8 = 0.4
    expect(dims.width).toBeCloseTo(0.4, 1)
  })

  it('caps door height for a short wall', () => {
    const wall = makeWallAtZ('w1', 5, 0, 10, 0, 1.5)
    const dims = estimateDoorDimensions(wall)
    // 1.5 * 0.95 = 1.425
    expect(dims.height).toBeCloseTo(1.425, 2)
  })
})

// ---------------------------------------------------------------------------
// Tests: estimateWindowDimensions
// ---------------------------------------------------------------------------

describe('estimateWindowDimensions', () => {
  it('returns default dimensions for a large wall', () => {
    const wall = makeWallAtZ('w1', 5, 0, 10, 0, 3)
    const dims = estimateWindowDimensions(wall)
    expect(dims.width).toBeCloseTo(1.0, 1)
    expect(dims.height).toBeCloseTo(1.2, 1)
    expect(dims.sillHeight).toBeCloseTo(0.9, 1)
  })

  it('caps window width for a narrow wall', () => {
    const wall = makeWallAtZ('w1', 5, 0, 0.5, 0, 3)
    const dims = estimateWindowDimensions(wall)
    expect(dims.width).toBeCloseTo(0.4, 1)
  })
})

// ---------------------------------------------------------------------------
// Tests: placeDoorOnWall
// ---------------------------------------------------------------------------

describe('placeDoorOnWall', () => {
  it('places a door on the wall surface', () => {
    const wall = makeWallAtZ('w1', 5, 0, 10, 0, 3)
    const tagPos: Point3D = { x: 5, y: 1, z: 7 }
    const door = placeDoorOnWall(tagPos, wall, 'door-0')

    expect(door.id).toBe('door-0')
    expect(door.wallId).toBe('w1')
    // Door position should be on the wall plane (z=5)
    expect(door.position.z).toBeCloseTo(5, 5)
    // Door center X should match the projected X
    expect(door.position.x).toBeCloseTo(5, 5)
    // Door should sit on the floor: y = floorY + height/2
    expect(door.position.y).toBeCloseTo(0 + door.height / 2, 2)
    expect(door.width).toBeGreaterThan(0)
    expect(door.height).toBeGreaterThan(0)
  })

  it('door position is on the wall plane', () => {
    const wall = makeWallAtZ('w1', 3, 0, 8, 0, 2.5)
    const tagPos: Point3D = { x: 4, y: 0.5, z: 1 }
    const door = placeDoorOnWall(tagPos, wall, 'door-1')

    // The z coordinate should be on the wall plane z=3
    expect(door.position.z).toBeCloseTo(3, 5)
  })
})

// ---------------------------------------------------------------------------
// Tests: placeWindowOnWall
// ---------------------------------------------------------------------------

describe('placeWindowOnWall', () => {
  it('places a window on the wall surface', () => {
    const wall = makeWallAtZ('w1', 5, 0, 10, 0, 3)
    const tagPos: Point3D = { x: 7, y: 1.5, z: 6 }
    const win = placeWindowOnWall(tagPos, wall, 'win-0')

    expect(win.id).toBe('win-0')
    expect(win.wallId).toBe('w1')
    // Window position should be on the wall plane
    expect(win.position.z).toBeCloseTo(5, 5)
    expect(win.position.x).toBeCloseTo(7, 5)
    // Window should be above sill height
    expect(win.position.y).toBeGreaterThan(win.sillHeight)
    expect(win.width).toBeGreaterThan(0)
    expect(win.height).toBeGreaterThan(0)
    expect(win.sillHeight).toBeGreaterThan(0)
  })

  it('window position is on the wall plane', () => {
    const wall = makeWallAtZ('w1', 2, 0, 6, 0, 3)
    const tagPos: Point3D = { x: 3, y: 1.5, z: 5 }
    const win = placeWindowOnWall(tagPos, wall, 'win-1')

    expect(win.position.z).toBeCloseTo(2, 5)
  })
})

// ---------------------------------------------------------------------------
// Tests: findRoomForPosition
// ---------------------------------------------------------------------------

describe('findRoomForPosition', () => {
  it('returns null for empty room list', () => {
    expect(findRoomForPosition({ x: 0, y: 0, z: 0 }, [])).toBeNull()
  })

  it('returns the nearest room to a position', () => {
    const wall1 = makeWallAtZ('w1', 0, -5, 5, 0, 3)
    const wall2 = makeWallAtZ('w2', 20, 15, 25, 0, 3)
    const room1 = makeRoom('r1', [wall1])
    const room2 = makeRoom('r2', [wall2])

    // Position near room 1
    const result = findRoomForPosition({ x: 0, y: 1, z: 1 }, [room1, room2])
    expect(result).not.toBeNull()
    expect(result!.id).toBe('r1')

    // Position near room 2
    const result2 = findRoomForPosition({ x: 20, y: 1, z: 21 }, [room1, room2])
    expect(result2).not.toBeNull()
    expect(result2!.id).toBe('r2')
  })
})

// ---------------------------------------------------------------------------
// Tests: placeDoorsAndWindows (integration)
// ---------------------------------------------------------------------------

describe('placeDoorsAndWindows', () => {
  it('returns unchanged rooms when no tagged photos exist', () => {
    const wall = makeWallAtZ('w1', 5, 0, 10, 0, 3)
    const room = makeRoom('r1', [wall])
    const photos = [makePhoto(0)]

    const result = placeDoorsAndWindows([room], photos)
    expect(result[0].doors).toHaveLength(0)
    expect(result[0].windows).toHaveLength(0)
  })

  it('returns unchanged rooms when tagged photos have no pose', () => {
    const wall = makeWallAtZ('w1', 5, 0, 10, 0, 3)
    const room = makeRoom('r1', [wall])
    const photos = [makePhoto(0, ['doorway']), makePhoto(1, ['window'])]

    const result = placeDoorsAndWindows([room], photos)
    expect(result[0].doors).toHaveLength(0)
    expect(result[0].windows).toHaveLength(0)
  })

  it('places a door from a tagged photo with pose', () => {
    const wall = makeWallAtZ('w1', 5, 0, 10, 0, 3)
    const room = makeRoom('r1', [wall])
    const pose: CameraPose = {
      position: { x: 5, y: 1, z: 6 },
      rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    }
    const photos = [makePhoto(0, ['doorway'], pose)]

    const result = placeDoorsAndWindows([room], photos)
    expect(result[0].doors).toHaveLength(1)
    expect(result[0].doors[0].wallId).toBe('w1')
    // Door position should be on the wall surface (z=5)
    expect(result[0].doors[0].position.z).toBeCloseTo(5, 5)
  })

  it('places a window from a tagged photo with pose', () => {
    const wall = makeWallAtZ('w1', 5, 0, 10, 0, 3)
    const room = makeRoom('r1', [wall])
    const pose: CameraPose = {
      position: { x: 7, y: 1.5, z: 4 },
      rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    }
    const photos = [makePhoto(0, ['window'], pose)]

    const result = placeDoorsAndWindows([room], photos)
    expect(result[0].windows).toHaveLength(1)
    expect(result[0].windows[0].wallId).toBe('w1')
    // Window position should be on the wall surface (z=5)
    expect(result[0].windows[0].position.z).toBeCloseTo(5, 5)
  })

  it('places multiple doors and windows across rooms', () => {
    // Room 1: centered around x=0, z=0
    const wall1a = makeWallAtZ('w1a', -5, -5, 5, 0, 3)
    const wall1b = makeWallAtZ('w1b', 5, -5, 5, 0, 3)
    const room1 = makeRoom('r1', [wall1a, wall1b])

    // Room 2: centered around x=20, z=0
    const wall2a = makeWallAtZ('w2a', -5, 15, 25, 0, 3)
    const wall2b = makeWallAtZ('w2b', 5, 15, 25, 0, 3)
    const room2 = makeRoom('r2', [wall2a, wall2b])

    const photos = [
      // Door near room 1
      makePhoto(0, ['doorway'], {
        position: { x: 0, y: 1, z: -4 },
        rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      }),
      // Window near room 2
      makePhoto(1, ['window'], {
        position: { x: 20, y: 1.5, z: 4 },
        rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      }),
    ]

    const result = placeDoorsAndWindows([room1, room2], photos)
    expect(result[0].doors).toHaveLength(1)
    expect(result[0].windows).toHaveLength(0)
    expect(result[1].doors).toHaveLength(0)
    expect(result[1].windows).toHaveLength(1)
  })

  it('does not mutate the original rooms', () => {
    const wall = makeWallAtZ('w1', 5, 0, 10, 0, 3)
    const room = makeRoom('r1', [wall])
    const photos = [
      makePhoto(0, ['doorway'], {
        position: { x: 5, y: 1, z: 6 },
        rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      }),
    ]

    const result = placeDoorsAndWindows([room], photos)
    expect(room.doors).toHaveLength(0)
    expect(result[0].doors).toHaveLength(1)
  })

  it('returns rooms unchanged when rooms have no walls', () => {
    const room = makeRoom('r1', [])
    const photos = [
      makePhoto(0, ['doorway'], {
        position: { x: 5, y: 1, z: 6 },
        rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      }),
    ]

    const result = placeDoorsAndWindows([room], photos)
    expect(result[0].doors).toHaveLength(0)
  })

  it('door positions are on wall surfaces', () => {
    const wall = makeWallAtZ('w1', 5, 0, 10, 0, 3)
    const room = makeRoom('r1', [wall])
    const photos = [
      makePhoto(0, ['doorway'], {
        position: { x: 3, y: 0.5, z: 8 },
        rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      }),
      makePhoto(1, ['doorway'], {
        position: { x: 7, y: 1, z: 2 },
        rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      }),
    ]

    const result = placeDoorsAndWindows([room], photos)
    expect(result[0].doors).toHaveLength(2)

    for (const door of result[0].doors) {
      // All doors should be on the wall plane at z=5
      expect(door.position.z).toBeCloseTo(5, 5)
      // Doors should be within wall horizontal bounds (0 to 10)
      expect(door.position.x).toBeGreaterThanOrEqual(0)
      expect(door.position.x).toBeLessThanOrEqual(10)
      // Door bottom should be at floor level (y = height/2)
      expect(door.position.y).toBeCloseTo(door.height / 2, 2)
    }
  })

  it('window positions are on wall surfaces', () => {
    const wall = makeWallAtZ('w1', 5, 0, 10, 0, 3)
    const room = makeRoom('r1', [wall])
    const photos = [
      makePhoto(0, ['window'], {
        position: { x: 4, y: 1.5, z: 7 },
        rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      }),
    ]

    const result = placeDoorsAndWindows([room], photos)
    expect(result[0].windows).toHaveLength(1)

    const win = result[0].windows[0]
    // Window should be on the wall plane at z=5
    expect(win.position.z).toBeCloseTo(5, 5)
    // Window should be within wall horizontal bounds
    expect(win.position.x).toBeGreaterThanOrEqual(0)
    expect(win.position.x).toBeLessThanOrEqual(10)
    // Window should be above sill height
    expect(win.position.y).toBeGreaterThanOrEqual(win.sillHeight)
  })
})
