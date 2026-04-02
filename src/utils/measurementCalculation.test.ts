import { describe, it, expect } from 'vitest'
import type { Wall, Door, Window, Room, BuildingModel } from '../types'
import {
  calculateWallLength,
  calculateWallHeight,
  calculateRoomDimensions,
  getWallMeasurements,
  getDoorMeasurements,
  getWindowMeasurements,
  getRoomMeasurements,
  recalculateMeasurements,
  calculateAllMeasurements,
} from './measurementCalculation'

// ---------------------------------------------------------------------------
// Helpers — build known geometry for deterministic tests
// ---------------------------------------------------------------------------

/**
 * Create a wall along the X-axis at a given Z, from xMin to xMax, yMin to yMax.
 * Normal points in +Z direction.
 */
function makeWall(
  id: string,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
  z: number
): Wall {
  return {
    id,
    corners: [
      { x: xMin, y: yMin, z },
      { x: xMax, y: yMin, z },
      { x: xMax, y: yMax, z },
      { x: xMin, y: yMax, z },
    ],
    plane: { normal: { x: 0, y: 0, z: 1 }, distance: -z },
    measurements: { length: xMax - xMin },
  }
}

/**
 * Create a wall along the Z-axis at a given X, from zMin to zMax, yMin to yMax.
 * Normal points in +X direction.
 */
function makeWallAlongZ(
  id: string,
  zMin: number,
  zMax: number,
  yMin: number,
  yMax: number,
  x: number
): Wall {
  return {
    id,
    corners: [
      { x, y: yMin, z: zMin },
      { x, y: yMin, z: zMax },
      { x, y: yMax, z: zMax },
      { x, y: yMax, z: zMin },
    ],
    plane: { normal: { x: 1, y: 0, z: 0 }, distance: -x },
    measurements: { length: zMax - zMin },
  }
}

function makeDoor(id: string, wallId: string, width: number, height: number): Door {
  return {
    id,
    wallId,
    position: { x: 2, y: height / 2, z: 0 },
    width,
    height,
  }
}

function makeWindow(
  id: string,
  wallId: string,
  width: number,
  height: number,
  sillHeight: number
): Window {
  return {
    id,
    wallId,
    position: { x: 5, y: sillHeight + height / 2, z: 0 },
    width,
    height,
    sillHeight,
  }
}

/**
 * Create a room with 4 walls forming a rectangle.
 * The room spans from (0, 0, 0) to (roomWidth, wallHeight, roomDepth).
 */
function makeRectangularRoom(
  id: string,
  name: string,
  roomWidth: number,
  roomDepth: number,
  floorY: number,
  ceilingY: number,
  doors: Door[] = [],
  windows: Window[] = []
): Room {
  const wallHeight = ceilingY - floorY
  return {
    id,
    name,
    walls: [
      makeWall(`${id}-wall-0`, 0, roomWidth, floorY, ceilingY, 0),          // south wall (z=0)
      makeWall(`${id}-wall-1`, 0, roomWidth, floorY, ceilingY, roomDepth),  // north wall (z=roomDepth)
      makeWallAlongZ(`${id}-wall-2`, 0, roomDepth, floorY, ceilingY, 0),    // west wall (x=0)
      makeWallAlongZ(`${id}-wall-3`, 0, roomDepth, floorY, ceilingY, roomWidth), // east wall (x=roomWidth)
    ],
    floor: {
      id: `${id}-floor`,
      boundary: [
        { x: 0, y: floorY, z: 0 },
        { x: roomWidth, y: floorY, z: 0 },
        { x: roomWidth, y: floorY, z: roomDepth },
        { x: 0, y: floorY, z: roomDepth },
      ],
      plane: { normal: { x: 0, y: 1, z: 0 }, distance: -floorY },
      level: 0,
    },
    ceiling: {
      id: `${id}-ceiling`,
      boundary: [
        { x: 0, y: ceilingY, z: 0 },
        { x: roomWidth, y: ceilingY, z: 0 },
        { x: roomWidth, y: ceilingY, z: roomDepth },
        { x: 0, y: ceilingY, z: roomDepth },
      ],
      plane: { normal: { x: 0, y: -1, z: 0 }, distance: ceilingY },
    },
    doors,
    windows,
    measurements: {
      width: Math.min(roomWidth, roomDepth),
      depth: Math.max(roomWidth, roomDepth),
      ceilingHeight: wallHeight,
    },
  }
}

function makeModel(
  rooms: Room[],
  isCalibrated: boolean,
  unit?: 'cm' | 'm' | 'inches' | 'feet'
): BuildingModel {
  return {
    rooms,
    staircases: [],
    isCalibrated,
    unit,
    floorLevels: 1,
  }
}

// ---------------------------------------------------------------------------
// Tests: calculateWallLength
// ---------------------------------------------------------------------------

describe('calculateWallLength', () => {
  it('calculates correct length for a wall along the X-axis', () => {
    const wall = makeWall('w1', 0, 5, 0, 3, 0)
    expect(calculateWallLength(wall)).toBeCloseTo(5, 5)
  })

  it('calculates correct length for a wall along the Z-axis', () => {
    const wall = makeWallAlongZ('w1', 0, 4, 0, 3, 0)
    expect(calculateWallLength(wall)).toBeCloseTo(4, 5)
  })

  it('calculates correct length for a short wall', () => {
    const wall = makeWall('w1', 2, 2.5, 0, 3, 0)
    expect(calculateWallLength(wall)).toBeCloseTo(0.5, 5)
  })

  it('returns 0 for a zero-length wall', () => {
    const wall = makeWall('w1', 3, 3, 0, 3, 0)
    expect(calculateWallLength(wall)).toBeCloseTo(0, 5)
  })
})

// ---------------------------------------------------------------------------
// Tests: calculateWallHeight
// ---------------------------------------------------------------------------

describe('calculateWallHeight', () => {
  it('calculates correct height for a standard wall', () => {
    const wall = makeWall('w1', 0, 5, 0, 2.7, 0)
    expect(calculateWallHeight(wall)).toBeCloseTo(2.7, 5)
  })

  it('calculates correct height for a tall wall', () => {
    const wall = makeWall('w1', 0, 5, 0, 5, 0)
    expect(calculateWallHeight(wall)).toBeCloseTo(5, 5)
  })

  it('handles non-zero floor offset', () => {
    const wall = makeWall('w1', 0, 5, 3, 6, 0)
    expect(calculateWallHeight(wall)).toBeCloseTo(3, 5)
  })
})

// ---------------------------------------------------------------------------
// Tests: calculateRoomDimensions
// ---------------------------------------------------------------------------

describe('calculateRoomDimensions', () => {
  it('calculates correct dimensions for a rectangular room', () => {
    const room = makeRectangularRoom('r1', 'Room 1', 4, 6, 0, 2.8)
    const dims = calculateRoomDimensions(room)

    expect(dims.width).toBeCloseTo(4, 5)
    expect(dims.depth).toBeCloseTo(6, 5)
    expect(dims.ceilingHeight).toBeCloseTo(2.8, 5)
  })

  it('width is always the shorter dimension', () => {
    // Room where X-extent (3) < Z-extent (7)
    const room = makeRectangularRoom('r1', 'Room 1', 3, 7, 0, 3)
    const dims = calculateRoomDimensions(room)

    expect(dims.width).toBeLessThanOrEqual(dims.depth)
    expect(dims.width).toBeCloseTo(3, 5)
    expect(dims.depth).toBeCloseTo(7, 5)
  })

  it('handles a square room', () => {
    const room = makeRectangularRoom('r1', 'Room 1', 5, 5, 0, 3)
    const dims = calculateRoomDimensions(room)

    expect(dims.width).toBeCloseTo(5, 5)
    expect(dims.depth).toBeCloseTo(5, 5)
  })

  it('handles elevated floor', () => {
    const room = makeRectangularRoom('r1', 'Room 1', 4, 6, 3, 6)
    const dims = calculateRoomDimensions(room)

    expect(dims.ceilingHeight).toBeCloseTo(3, 5)
  })

  it('handles room with no walls by falling back to floor boundary', () => {
    const room: Room = {
      id: 'r1',
      name: 'Room 1',
      walls: [],
      floor: {
        id: 'r1-floor',
        boundary: [
          { x: 0, y: 0, z: 0 },
          { x: 4, y: 0, z: 0 },
          { x: 4, y: 0, z: 6 },
          { x: 0, y: 0, z: 6 },
        ],
        plane: { normal: { x: 0, y: 1, z: 0 }, distance: 0 },
        level: 0,
      },
      ceiling: {
        id: 'r1-ceiling',
        boundary: [
          { x: 0, y: 3, z: 0 },
          { x: 4, y: 3, z: 0 },
          { x: 4, y: 3, z: 6 },
          { x: 0, y: 3, z: 6 },
        ],
        plane: { normal: { x: 0, y: -1, z: 0 }, distance: 3 },
      },
      doors: [],
      windows: [],
      measurements: { width: 4, depth: 6, ceilingHeight: 3 },
    }

    const dims = calculateRoomDimensions(room)
    expect(dims.width).toBeCloseTo(4, 5)
    expect(dims.depth).toBeCloseTo(6, 5)
    expect(dims.ceilingHeight).toBeCloseTo(3, 5)
  })
})

// ---------------------------------------------------------------------------
// Tests: getWallMeasurements
// ---------------------------------------------------------------------------

describe('getWallMeasurements', () => {
  it('returns correct wall measurement', () => {
    const wall = makeWall('w1', 0, 5, 0, 3, 0)
    const result = getWallMeasurements(wall, 'r1')

    expect(result.wallId).toBe('w1')
    expect(result.roomId).toBe('r1')
    expect(result.length).toBeCloseTo(5, 5)
  })
})

// ---------------------------------------------------------------------------
// Tests: getDoorMeasurements
// ---------------------------------------------------------------------------

describe('getDoorMeasurements', () => {
  it('returns correct door measurements', () => {
    const door = makeDoor('d1', 'w1', 0.9, 2.1)
    const result = getDoorMeasurements(door, 'r1')

    expect(result.doorId).toBe('d1')
    expect(result.wallId).toBe('w1')
    expect(result.roomId).toBe('r1')
    expect(result.width).toBeCloseTo(0.9, 5)
    expect(result.height).toBeCloseTo(2.1, 5)
  })
})

// ---------------------------------------------------------------------------
// Tests: getWindowMeasurements
// ---------------------------------------------------------------------------

describe('getWindowMeasurements', () => {
  it('returns correct window measurements', () => {
    const win = makeWindow('win1', 'w1', 1.0, 1.2, 0.9)
    const result = getWindowMeasurements(win, 'r1')

    expect(result.windowId).toBe('win1')
    expect(result.wallId).toBe('w1')
    expect(result.roomId).toBe('r1')
    expect(result.width).toBeCloseTo(1.0, 5)
    expect(result.height).toBeCloseTo(1.2, 5)
    expect(result.sillHeight).toBeCloseTo(0.9, 5)
  })
})

// ---------------------------------------------------------------------------
// Tests: getRoomMeasurements
// ---------------------------------------------------------------------------

describe('getRoomMeasurements', () => {
  it('returns complete measurement result for a room with doors and windows', () => {
    const door = makeDoor('d1', 'r1-wall-0', 0.9, 2.1)
    const win = makeWindow('win1', 'r1-wall-1', 1.0, 1.2, 0.9)
    const room = makeRectangularRoom('r1', 'Living Room', 5, 8, 0, 2.7, [door], [win])
    const result = getRoomMeasurements(room)

    expect(result.roomId).toBe('r1')
    expect(result.roomName).toBe('Living Room')
    expect(result.width).toBeCloseTo(5, 5)
    expect(result.depth).toBeCloseTo(8, 5)
    expect(result.ceilingHeight).toBeCloseTo(2.7, 5)
    expect(result.walls).toHaveLength(4)
    expect(result.doors).toHaveLength(1)
    expect(result.windows).toHaveLength(1)

    // Check wall lengths: 2 walls of length 5, 2 walls of length 8
    const wallLengths = result.walls.map((w) => w.length).sort((a, b) => a - b)
    expect(wallLengths[0]).toBeCloseTo(5, 5)
    expect(wallLengths[1]).toBeCloseTo(5, 5)
    expect(wallLengths[2]).toBeCloseTo(8, 5)
    expect(wallLengths[3]).toBeCloseTo(8, 5)

    // Check door dimensions
    expect(result.doors[0].width).toBeCloseTo(0.9, 5)
    expect(result.doors[0].height).toBeCloseTo(2.1, 5)

    // Check window dimensions
    expect(result.windows[0].width).toBeCloseTo(1.0, 5)
    expect(result.windows[0].height).toBeCloseTo(1.2, 5)
    expect(result.windows[0].sillHeight).toBeCloseTo(0.9, 5)
  })

  it('handles a room with no doors or windows', () => {
    const room = makeRectangularRoom('r1', 'Room 1', 4, 6, 0, 3)
    const result = getRoomMeasurements(room)

    expect(result.doors).toHaveLength(0)
    expect(result.windows).toHaveLength(0)
    expect(result.walls).toHaveLength(4)
  })
})

// ---------------------------------------------------------------------------
// Tests: recalculateMeasurements
// ---------------------------------------------------------------------------

describe('recalculateMeasurements', () => {
  it('updates wall measurements from geometry', () => {
    const room = makeRectangularRoom('r1', 'Room 1', 5, 8, 0, 3)
    // Corrupt the stored measurements
    room.walls[0].measurements.length = 999
    room.measurements.width = 999

    const model = makeModel([room], true, 'm')
    const updated = recalculateMeasurements(model)

    // Wall length should be recalculated from corners (5m wall)
    expect(updated.rooms[0].walls[0].measurements.length).toBeCloseTo(5, 5)
    // Room dimensions should be recalculated
    expect(updated.rooms[0].measurements.width).toBeCloseTo(5, 5)
    expect(updated.rooms[0].measurements.depth).toBeCloseTo(8, 5)
    expect(updated.rooms[0].measurements.ceilingHeight).toBeCloseTo(3, 5)
  })

  it('preserves other model properties', () => {
    const room = makeRectangularRoom('r1', 'Room 1', 4, 6, 0, 3)
    const model = makeModel([room], true, 'cm')
    model.floorLevels = 2

    const updated = recalculateMeasurements(model)

    expect(updated.isCalibrated).toBe(true)
    expect(updated.unit).toBe('cm')
    expect(updated.floorLevels).toBe(2)
    expect(updated.rooms[0].id).toBe('r1')
    expect(updated.rooms[0].name).toBe('Room 1')
  })

  it('does not mutate the original model', () => {
    const room = makeRectangularRoom('r1', 'Room 1', 5, 8, 0, 3)
    room.walls[0].measurements.length = 999
    const model = makeModel([room], true, 'm')

    recalculateMeasurements(model)

    // Original should still have the corrupted value
    expect(model.rooms[0].walls[0].measurements.length).toBe(999)
  })
})

// ---------------------------------------------------------------------------
// Tests: calculateAllMeasurements
// ---------------------------------------------------------------------------

describe('calculateAllMeasurements', () => {
  it('returns complete measurements for a calibrated model', () => {
    const door = makeDoor('d1', 'r1-wall-0', 0.9, 2.1)
    const win = makeWindow('win1', 'r1-wall-1', 1.0, 1.2, 0.9)
    const room = makeRectangularRoom('r1', 'Room 1', 5, 8, 0, 2.7, [door], [win])
    const model = makeModel([room], true, 'm')

    const result = calculateAllMeasurements(model)

    expect(result.isCalibrated).toBe(true)
    expect(result.unit).toBe('m')
    expect(result.warnings).toHaveLength(0)
    expect(result.rooms).toHaveLength(1)
    expect(result.rooms[0].width).toBeCloseTo(5, 5)
    expect(result.rooms[0].depth).toBeCloseTo(8, 5)
    expect(result.rooms[0].ceilingHeight).toBeCloseTo(2.7, 5)
    expect(result.rooms[0].walls).toHaveLength(4)
    expect(result.rooms[0].doors).toHaveLength(1)
    expect(result.rooms[0].windows).toHaveLength(1)
  })

  it('returns arbitrary unit and warning for uncalibrated model', () => {
    const room = makeRectangularRoom('r1', 'Room 1', 5, 8, 0, 3)
    const model = makeModel([room], false)

    const result = calculateAllMeasurements(model)

    expect(result.isCalibrated).toBe(false)
    expect(result.unit).toBe('arbitrary')
    expect(result.warnings.length).toBeGreaterThanOrEqual(1)
    expect(result.warnings.some((w) => w.includes('No scale reference'))).toBe(true)
    // Measurements still present, just in arbitrary units
    expect(result.rooms[0].width).toBeCloseTo(5, 5)
  })

  it('warns about empty model', () => {
    const model = makeModel([], true, 'm')
    const result = calculateAllMeasurements(model)

    expect(result.warnings.some((w) => w.includes('No rooms detected'))).toBe(true)
    expect(result.rooms).toHaveLength(0)
  })

  it('warns about rooms with no walls', () => {
    const room: Room = {
      id: 'r1',
      name: 'Room 1',
      walls: [],
      floor: {
        id: 'r1-floor',
        boundary: [
          { x: 0, y: 0, z: 0 },
          { x: 4, y: 0, z: 0 },
          { x: 4, y: 0, z: 6 },
          { x: 0, y: 0, z: 6 },
        ],
        plane: { normal: { x: 0, y: 1, z: 0 }, distance: 0 },
        level: 0,
      },
      ceiling: {
        id: 'r1-ceiling',
        boundary: [
          { x: 0, y: 3, z: 0 },
          { x: 4, y: 3, z: 0 },
          { x: 4, y: 3, z: 6 },
          { x: 0, y: 3, z: 6 },
        ],
        plane: { normal: { x: 0, y: -1, z: 0 }, distance: 3 },
      },
      doors: [],
      windows: [],
      measurements: { width: 4, depth: 6, ceilingHeight: 3 },
    }
    const model = makeModel([room], true, 'm')
    const result = calculateAllMeasurements(model)

    expect(result.warnings.some((w) => w.includes('no detected walls'))).toBe(true)
  })

  it('handles multiple rooms with doors and windows', () => {
    const door1 = makeDoor('d1', 'r1-wall-0', 0.9, 2.1)
    const win1 = makeWindow('win1', 'r1-wall-1', 1.0, 1.2, 0.9)
    const room1 = makeRectangularRoom('r1', 'Kitchen', 3, 4, 0, 2.5, [door1], [win1])

    const door2 = makeDoor('d2', 'r2-wall-0', 0.8, 2.0)
    const room2 = makeRectangularRoom('r2', 'Bedroom', 4, 5, 0, 2.5, [door2], [])

    const model = makeModel([room1, room2], true, 'cm')
    const result = calculateAllMeasurements(model)

    expect(result.rooms).toHaveLength(2)
    expect(result.unit).toBe('cm')

    // Room 1
    expect(result.rooms[0].roomName).toBe('Kitchen')
    expect(result.rooms[0].width).toBeCloseTo(3, 5)
    expect(result.rooms[0].depth).toBeCloseTo(4, 5)
    expect(result.rooms[0].doors).toHaveLength(1)
    expect(result.rooms[0].windows).toHaveLength(1)

    // Room 2
    expect(result.rooms[1].roomName).toBe('Bedroom')
    expect(result.rooms[1].width).toBeCloseTo(4, 5)
    expect(result.rooms[1].depth).toBeCloseTo(5, 5)
    expect(result.rooms[1].doors).toHaveLength(1)
    expect(result.rooms[1].windows).toHaveLength(0)
  })

  it('handles calibrated model with different units', () => {
    const room = makeRectangularRoom('r1', 'Room 1', 10, 12, 0, 8)
    for (const unit of ['cm', 'm', 'inches', 'feet'] as const) {
      const model = makeModel([room], true, unit)
      const result = calculateAllMeasurements(model)
      expect(result.unit).toBe(unit)
      expect(result.isCalibrated).toBe(true)
    }
  })

  it('returns arbitrary unit when calibrated but no unit set', () => {
    const room = makeRectangularRoom('r1', 'Room 1', 5, 8, 0, 3)
    const model = makeModel([room], true) // isCalibrated=true but no unit

    const result = calculateAllMeasurements(model)

    expect(result.unit).toBe('arbitrary')
  })
})
