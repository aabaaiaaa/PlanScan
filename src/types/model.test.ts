import { describe, it, expect } from 'vitest'
import type {
  Point3D,
  Point2D,
  Plane,
  CameraPose,
  CapturedPhoto,
  ScaleReference,
  ScanSession,
  Wall,
  Floor,
  Ceiling,
  Door,
  Window,
  Room,
  RoomMeasurements,
  Staircase,
  BuildingModel,
} from './index'

// Helper to create geometry fixtures
function point3d(x: number, y: number, z: number): Point3D {
  return { x, y, z }
}

function point2d(x: number, y: number): Point2D {
  return { x, y }
}

describe('Geometry types', () => {
  it('creates a Point3D', () => {
    const p: Point3D = point3d(1, 2, 3)
    expect(p).toEqual({ x: 1, y: 2, z: 3 })
  })

  it('creates a Point2D', () => {
    const p: Point2D = point2d(10, 20)
    expect(p).toEqual({ x: 10, y: 20 })
  })

  it('creates a Plane', () => {
    const plane: Plane = { normal: point3d(0, 1, 0), distance: 5 }
    expect(plane.normal).toEqual({ x: 0, y: 1, z: 0 })
    expect(plane.distance).toBe(5)
  })

  it('creates a CameraPose', () => {
    const pose: CameraPose = {
      position: point3d(0, 0, 0),
      rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    }
    expect(pose.position).toEqual({ x: 0, y: 0, z: 0 })
    expect(pose.rotation).toHaveLength(9)
  })
})

describe('Capture types', () => {
  it('creates a CapturedPhoto with no tags', () => {
    const photo: CapturedPhoto = {
      index: 0,
      imageData: 'data:image/png;base64,abc',
      width: 640,
      height: 480,
      tags: [],
      capturedAt: 1000,
    }
    expect(photo.index).toBe(0)
    expect(photo.tags).toEqual([])
    expect(photo.pose).toBeUndefined()
  })

  it('creates a CapturedPhoto with tags and pose', () => {
    const photo: CapturedPhoto = {
      index: 3,
      imageData: 'data:image/png;base64,xyz',
      width: 320,
      height: 240,
      tags: ['doorway', 'window'],
      capturedAt: 2000,
      pose: {
        position: point3d(1, 0, 2),
        rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      },
    }
    expect(photo.tags).toContain('doorway')
    expect(photo.tags).toContain('window')
    expect(photo.pose).toBeDefined()
  })

  it('creates a ScaleReference', () => {
    const ref: ScaleReference = {
      photoIndex: 5,
      startPoint: point2d(100, 200),
      endPoint: point2d(300, 200),
      length: 50,
      unit: 'cm',
    }
    expect(ref.photoIndex).toBe(5)
    expect(ref.length).toBe(50)
    expect(ref.unit).toBe('cm')
  })

  it('creates a ScanSession', () => {
    const session: ScanSession = {
      id: 'session-1',
      photos: [],
      startedAt: Date.now(),
    }
    expect(session.id).toBe('session-1')
    expect(session.photos).toEqual([])
    expect(session.scaleReference).toBeUndefined()
    expect(session.endedAt).toBeUndefined()
  })

  it('creates a ScanSession with photos and scale reference', () => {
    const session: ScanSession = {
      id: 'session-2',
      photos: [
        {
          index: 0,
          imageData: 'data:image/png;base64,a',
          width: 640,
          height: 480,
          tags: [],
          capturedAt: 1000,
        },
        {
          index: 1,
          imageData: 'data:image/png;base64,b',
          width: 640,
          height: 480,
          tags: ['doorway'],
          capturedAt: 1500,
        },
      ],
      scaleReference: {
        photoIndex: 0,
        startPoint: point2d(10, 10),
        endPoint: point2d(110, 10),
        length: 1,
        unit: 'm',
      },
      startedAt: 1000,
      endedAt: 2000,
    }
    expect(session.photos).toHaveLength(2)
    expect(session.scaleReference).toBeDefined()
    expect(session.endedAt).toBe(2000)
  })
})

describe('Building model types', () => {
  const wallPlane: Plane = { normal: point3d(0, 0, 1), distance: 0 }
  const floorPlane: Plane = { normal: point3d(0, 1, 0), distance: 0 }
  const ceilingPlane: Plane = { normal: point3d(0, -1, 0), distance: 2.5 }

  it('creates a Wall', () => {
    const wall: Wall = {
      id: 'wall-1',
      corners: [
        point3d(0, 0, 0),
        point3d(4, 0, 0),
        point3d(4, 2.5, 0),
        point3d(0, 2.5, 0),
      ],
      plane: wallPlane,
      measurements: { length: 4 },
    }
    expect(wall.corners).toHaveLength(4)
    expect(wall.measurements.length).toBe(4)
  })

  it('creates a Floor', () => {
    const floor: Floor = {
      id: 'floor-1',
      boundary: [
        point3d(0, 0, 0),
        point3d(4, 0, 0),
        point3d(4, 0, 3),
        point3d(0, 0, 3),
      ],
      plane: floorPlane,
      level: 0,
    }
    expect(floor.boundary).toHaveLength(4)
    expect(floor.level).toBe(0)
  })

  it('creates a Ceiling', () => {
    const ceiling: Ceiling = {
      id: 'ceiling-1',
      boundary: [
        point3d(0, 2.5, 0),
        point3d(4, 2.5, 0),
        point3d(4, 2.5, 3),
        point3d(0, 2.5, 3),
      ],
      plane: ceilingPlane,
    }
    expect(ceiling.boundary).toHaveLength(4)
  })

  it('creates a Door', () => {
    const door: Door = {
      id: 'door-1',
      wallId: 'wall-1',
      position: point3d(2, 1, 0),
      width: 0.9,
      height: 2.1,
    }
    expect(door.wallId).toBe('wall-1')
    expect(door.width).toBe(0.9)
    expect(door.height).toBe(2.1)
  })

  it('creates a Window', () => {
    const win: Window = {
      id: 'window-1',
      wallId: 'wall-1',
      position: point3d(3, 1.5, 0),
      width: 1.2,
      height: 1.0,
      sillHeight: 0.9,
    }
    expect(win.wallId).toBe('wall-1')
    expect(win.sillHeight).toBe(0.9)
  })

  it('creates a Room with measurements', () => {
    const measurements: RoomMeasurements = {
      width: 3,
      depth: 4,
      ceilingHeight: 2.5,
    }
    const room: Room = {
      id: 'room-1',
      name: 'Living Room',
      walls: [
        {
          id: 'w1',
          corners: [
            point3d(0, 0, 0),
            point3d(4, 0, 0),
            point3d(4, 2.5, 0),
            point3d(0, 2.5, 0),
          ],
          plane: wallPlane,
          measurements: { length: 4 },
        },
      ],
      floor: {
        id: 'f1',
        boundary: [point3d(0, 0, 0), point3d(4, 0, 0), point3d(4, 0, 3), point3d(0, 0, 3)],
        plane: floorPlane,
        level: 0,
      },
      ceiling: {
        id: 'c1',
        boundary: [
          point3d(0, 2.5, 0),
          point3d(4, 2.5, 0),
          point3d(4, 2.5, 3),
          point3d(0, 2.5, 3),
        ],
        plane: ceilingPlane,
      },
      doors: [
        {
          id: 'd1',
          wallId: 'w1',
          position: point3d(2, 1, 0),
          width: 0.9,
          height: 2.1,
        },
      ],
      windows: [],
      measurements,
    }
    expect(room.name).toBe('Living Room')
    expect(room.walls).toHaveLength(1)
    expect(room.doors).toHaveLength(1)
    expect(room.windows).toHaveLength(0)
    expect(room.measurements.ceilingHeight).toBe(2.5)
  })

  it('creates a Staircase', () => {
    const staircase: Staircase = {
      id: 'stairs-1',
      fromLevel: 0,
      toLevel: 1,
      bottomPosition: point3d(2, 0, 1),
      topPosition: point3d(2, 2.8, 4),
      width: 0.9,
    }
    expect(staircase.fromLevel).toBe(0)
    expect(staircase.toLevel).toBe(1)
    expect(staircase.width).toBe(0.9)
  })

  it('creates a BuildingModel', () => {
    const model: BuildingModel = {
      rooms: [
        {
          id: 'room-1',
          name: 'Kitchen',
          walls: [],
          floor: {
            id: 'f1',
            boundary: [],
            plane: floorPlane,
            level: 0,
          },
          ceiling: {
            id: 'c1',
            boundary: [],
            plane: ceilingPlane,
          },
          doors: [],
          windows: [],
          measurements: { width: 3, depth: 4, ceilingHeight: 2.5 },
        },
      ],
      staircases: [],
      isCalibrated: true,
      unit: 'm',
      floorLevels: 1,
    }
    expect(model.rooms).toHaveLength(1)
    expect(model.isCalibrated).toBe(true)
    expect(model.unit).toBe('m')
    expect(model.floorLevels).toBe(1)
  })

  it('creates an uncalibrated BuildingModel', () => {
    const model: BuildingModel = {
      rooms: [],
      staircases: [],
      isCalibrated: false,
      floorLevels: 0,
    }
    expect(model.isCalibrated).toBe(false)
    expect(model.unit).toBeUndefined()
  })
})
