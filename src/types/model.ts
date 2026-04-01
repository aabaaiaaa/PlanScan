import type { Plane, Point3D } from './geometry'

/** Measurements for a wall segment */
export interface WallMeasurements {
  /** Length of the wall in real-world units */
  length: number
}

/** A wall segment defined by its corner points and plane */
export interface Wall {
  id: string
  /** The four corner points of the wall in 3D space */
  corners: [Point3D, Point3D, Point3D, Point3D]
  /** The plane this wall lies on */
  plane: Plane
  measurements: WallMeasurements
}

/** A floor surface */
export interface Floor {
  id: string
  /** Boundary points of the floor polygon in 3D space */
  boundary: Point3D[]
  /** The plane this floor lies on */
  plane: Plane
  /** Floor level index (0 = ground floor, 1 = first floor, etc.) */
  level: number
}

/** A ceiling surface */
export interface Ceiling {
  id: string
  /** Boundary points of the ceiling polygon in 3D space */
  boundary: Point3D[]
  /** The plane this ceiling lies on */
  plane: Plane
}

/** A door placed on a wall */
export interface Door {
  id: string
  /** The wall this door is placed on */
  wallId: string
  /** Center position of the door in 3D space */
  position: Point3D
  /** Door width in real-world units */
  width: number
  /** Door height in real-world units */
  height: number
}

/** A window placed on a wall */
export interface Window {
  id: string
  /** The wall this window is placed on */
  wallId: string
  /** Center position of the window in 3D space */
  position: Point3D
  /** Window width in real-world units */
  width: number
  /** Window height in real-world units */
  height: number
  /** Distance from the floor to the bottom of the window */
  sillHeight: number
}

/** A room: a bounded space with walls, floor, and ceiling */
export interface Room {
  id: string
  name: string
  walls: Wall[]
  floor: Floor
  ceiling: Ceiling
  doors: Door[]
  windows: Window[]
  /** Room dimensions in real-world units */
  measurements: RoomMeasurements
}

/** Aggregate measurements for a room */
export interface RoomMeasurements {
  /** Room width (shorter horizontal extent) */
  width: number
  /** Room depth (longer horizontal extent) */
  depth: number
  /** Ceiling height */
  ceilingHeight: number
}

/** A staircase connecting two floor levels */
export interface Staircase {
  id: string
  /** Floor level at the bottom of the stairs */
  fromLevel: number
  /** Floor level at the top of the stairs */
  toLevel: number
  /** 3D position of the bottom of the staircase */
  bottomPosition: Point3D
  /** 3D position of the top of the staircase */
  topPosition: Point3D
  /** Estimated width of the staircase */
  width: number
}

/** The complete reconstructed building model */
export interface BuildingModel {
  rooms: Room[]
  staircases: Staircase[]
  /** Whether the model has been calibrated with a scale reference */
  isCalibrated: boolean
  /** The measurement unit used, if calibrated */
  unit?: import('./capture').MeasurementUnit
  /** Number of floor levels in the model */
  floorLevels: number
}
