/** 3D point in world space */
export interface Point3D {
  x: number
  y: number
  z: number
}

/** 2D point (pixel coordinates or floor plan coordinates) */
export interface Point2D {
  x: number
  y: number
}

/** A plane defined by a normal vector and distance from origin */
export interface Plane {
  normal: Point3D
  distance: number
}

/** Camera pose: position and orientation in world space */
export interface CameraPose {
  position: Point3D
  /** Rotation as a 3x3 matrix stored in row-major order (9 elements) */
  rotation: number[]
}
