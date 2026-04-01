import type { CameraPose, Point2D } from './geometry'

/** Tags a user can apply to a photo during capture */
export type PhotoTag = 'doorway' | 'window'

/** Supported measurement units for scale calibration */
export type MeasurementUnit = 'cm' | 'm' | 'inches' | 'feet'

/** A single photo captured during a scan session */
export interface CapturedPhoto {
  /** Sequential index (0-based) */
  index: number
  /** Image data as a data URL or blob URL */
  imageData: string
  /** Width of the captured image in pixels */
  width: number
  /** Height of the captured image in pixels */
  height: number
  /** Tags applied by the user (doorway/window markers) */
  tags: PhotoTag[]
  /** Timestamp when the photo was captured */
  capturedAt: number
  /** Estimated camera pose, set during reconstruction */
  pose?: CameraPose
}

/** Scale reference: a known real-world length drawn on a photo */
export interface ScaleReference {
  /** Index of the photo containing the scale reference */
  photoIndex: number
  /** Start point of the drawn line (pixel coordinates) */
  startPoint: Point2D
  /** End point of the drawn line (pixel coordinates) */
  endPoint: Point2D
  /** Real-world length of the drawn line */
  length: number
  /** Unit of the real-world measurement */
  unit: MeasurementUnit
}

/** A scan session: the collection of photos and calibration data */
export interface ScanSession {
  /** Unique session identifier */
  id: string
  /** All captured photos in order */
  photos: CapturedPhoto[]
  /** Scale calibration reference, if set */
  scaleReference?: ScaleReference
  /** Timestamp when the session was started */
  startedAt: number
  /** Timestamp when the session was ended, if complete */
  endedAt?: number
}
