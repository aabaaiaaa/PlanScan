import type { Point3D, Point2D, CameraPose, ScaleReference } from '../types'
import type { MatchedPair } from './featureDetection'
import { estimateCameraIntrinsics, transposeMatrix3x3, rotatePoint } from './poseEstimation'
import { calculatePixelToRealWorldRatio } from './scaleCalibration'

/** A triangulated 3D point with metadata */
export interface TriangulatedPoint {
  /** 3D position in world space */
  position: Point3D
  /** Indices of the two photos used for triangulation */
  sourcePhotos: [number, number]
  /** Pixel coordinates in the two source photos */
  pixelCoords: [Point2D, Point2D]
  /** Reprojection error: distance between closest points on the two rays */
  reprojectionError: number
}

/** A sparse 3D point cloud from triangulation */
export interface PointCloud {
  /** Triangulated 3D points */
  points: TriangulatedPoint[]
  /** Whether scale calibration has been applied */
  isScaled: boolean
  /** Scale factor that was applied (1.0 if unscaled) */
  scaleFactor: number
}

/** Maximum reprojection error to accept a triangulated point */
const MAX_REPROJECTION_ERROR = 10.0

/** Minimum denominator threshold for ray intersection (rejects near-parallel rays) */
const MIN_RAY_DENOM = 1e-6

/**
 * Invert a 3x3 upper-triangular camera intrinsics matrix.
 * Assumes K = [[f, 0, cx], [0, f, cy], [0, 0, 1]].
 */
export function invertCameraIntrinsics(K: number[]): number[] {
  const f = K[0]
  const cx = K[2]
  const cy = K[5]
  if (f === 0) return [0, 0, 0, 0, 0, 0, 0, 0, 1]
  return [1 / f, 0, -cx / f, 0, 1 / f, -cy / f, 0, 0, 1]
}

/**
 * Convert a 2D pixel coordinate to a normalized 3D ray direction in world space.
 *
 * Transforms the pixel through K^-1 to camera-frame direction,
 * then rotates to world frame using R^T.
 */
export function pixelToWorldRay(
  pixel: Point2D,
  K_inv: number[],
  rotation: number[]
): Point3D {
  // Pixel → normalized camera coordinates: p = K^-1 * [u, v, 1]
  const camX = K_inv[0] * pixel.x + K_inv[1] * pixel.y + K_inv[2]
  const camY = K_inv[3] * pixel.x + K_inv[4] * pixel.y + K_inv[5]
  const camZ = K_inv[6] * pixel.x + K_inv[7] * pixel.y + K_inv[8]

  // Camera frame → world frame: d = R^T * p_cam
  const R_T = transposeMatrix3x3(rotation)
  const dir = rotatePoint(R_T, { x: camX, y: camY, z: camZ })

  // Normalize to unit vector
  const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z)
  if (len < 1e-15) return { x: 0, y: 0, z: 1 }
  return { x: dir.x / len, y: dir.y / len, z: dir.z / len }
}

/**
 * Triangulate a single 3D point from two pixel observations using ray intersection.
 *
 * Finds the midpoint of the closest approach between two rays (one from each camera).
 * Returns null if rays are nearly parallel or the point is behind either camera.
 */
export function triangulatePoint(
  pixel1: Point2D,
  pixel2: Point2D,
  pose1: CameraPose,
  pose2: CameraPose,
  K_inv: number[]
): { position: Point3D; reprojectionError: number } | null {
  const d1 = pixelToWorldRay(pixel1, K_inv, pose1.rotation)
  const d2 = pixelToWorldRay(pixel2, K_inv, pose2.rotation)

  const o1 = pose1.position
  const o2 = pose2.position

  // Closest approach between rays P1(t1) = o1 + t1*d1, P2(t2) = o2 + t2*d2
  const w = { x: o1.x - o2.x, y: o1.y - o2.y, z: o1.z - o2.z }
  const b = d1.x * d2.x + d1.y * d2.y + d1.z * d2.z
  const d_val = d1.x * w.x + d1.y * w.y + d1.z * w.z
  const e = d2.x * w.x + d2.y * w.y + d2.z * w.z

  // denom = 1 - b^2 (since d1, d2 are unit vectors, a = c = 1)
  const denom = 1 - b * b
  if (Math.abs(denom) < MIN_RAY_DENOM) {
    return null
  }

  const t1 = (b * e - d_val) / denom
  const t2 = (e - b * d_val) / denom

  if (t1 < 0 || t2 < 0) {
    return null
  }

  const p1 = { x: o1.x + t1 * d1.x, y: o1.y + t1 * d1.y, z: o1.z + t1 * d1.z }
  const p2 = { x: o2.x + t2 * d2.x, y: o2.y + t2 * d2.y, z: o2.z + t2 * d2.z }

  const position: Point3D = {
    x: (p1.x + p2.x) / 2,
    y: (p1.y + p2.y) / 2,
    z: (p1.z + p2.z) / 2,
  }

  const dx = p1.x - p2.x
  const dy = p1.y - p2.y
  const dz = p1.z - p2.z
  const reprojectionError = Math.sqrt(dx * dx + dy * dy + dz * dz)

  return { position, reprojectionError }
}

/**
 * Triangulate all matched feature points from a pair of images.
 */
export function triangulateMatchedPair(
  matchedPair: MatchedPair,
  pose1: CameraPose,
  pose2: CameraPose,
  K_inv: number[],
  maxError: number = MAX_REPROJECTION_ERROR
): TriangulatedPoint[] {
  const points: TriangulatedPoint[] = []

  for (let i = 0; i < matchedPair.pointsA.length; i++) {
    const result = triangulatePoint(
      matchedPair.pointsA[i],
      matchedPair.pointsB[i],
      pose1,
      pose2,
      K_inv
    )

    if (result && result.reprojectionError <= maxError) {
      points.push({
        position: result.position,
        sourcePhotos: [matchedPair.photoIndexA, matchedPair.photoIndexB],
        pixelCoords: [matchedPair.pointsA[i], matchedPair.pointsB[i]],
        reprojectionError: result.reprojectionError,
      })
    }
  }

  return points
}

/**
 * Compute a scale factor to convert the point cloud from SfM units to real-world units.
 *
 * Attempts to find triangulated 3D points near the scale reference line endpoints
 * and calibrate using their 3D distance. Falls back to an approximation using the
 * pixel-to-real-world ratio and focal length.
 */
export function computeScaleFactor(
  scaleReference: ScaleReference,
  points: TriangulatedPoint[],
  focalLength: number
): number {
  const refPoints = points.filter(
    (p) =>
      p.sourcePhotos[0] === scaleReference.photoIndex ||
      p.sourcePhotos[1] === scaleReference.photoIndex
  )

  if (refPoints.length >= 2) {
    const getPixelForPhoto = (p: TriangulatedPoint, photoIdx: number): Point2D =>
      p.sourcePhotos[0] === photoIdx ? p.pixelCoords[0] : p.pixelCoords[1]

    const dist2D = (a: Point2D, b_pt: Point2D): number => {
      const dx = a.x - b_pt.x
      const dy = a.y - b_pt.y
      return Math.sqrt(dx * dx + dy * dy)
    }

    let nearestStart: TriangulatedPoint | null = null
    let nearestStartDist = Infinity
    let nearestEnd: TriangulatedPoint | null = null
    let nearestEndDist = Infinity

    for (const p of refPoints) {
      const px = getPixelForPhoto(p, scaleReference.photoIndex)
      const ds = dist2D(px, scaleReference.startPoint)
      const de = dist2D(px, scaleReference.endPoint)

      if (ds < nearestStartDist) {
        nearestStartDist = ds
        nearestStart = p
      }
      if (de < nearestEndDist) {
        nearestEndDist = de
        nearestEnd = p
      }
    }

    if (nearestStart && nearestEnd && nearestStart !== nearestEnd) {
      const dx = nearestStart.position.x - nearestEnd.position.x
      const dy = nearestStart.position.y - nearestEnd.position.y
      const dz = nearestStart.position.z - nearestEnd.position.z
      const dist3D = Math.sqrt(dx * dx + dy * dy + dz * dz)

      if (dist3D > 1e-10) {
        return scaleReference.length / dist3D
      }
    }
  }

  // Fallback approximation using pixel-to-real-world ratio and focal length
  const ratio = calculatePixelToRealWorldRatio(scaleReference)
  if (ratio <= 0) return 1.0
  return ratio * focalLength
}

/**
 * Apply a uniform scale factor to all points in the cloud.
 */
export function scalePointCloud(
  points: TriangulatedPoint[],
  scaleFactor: number
): TriangulatedPoint[] {
  return points.map((p) => ({
    ...p,
    position: {
      x: p.position.x * scaleFactor,
      y: p.position.y * scaleFactor,
      z: p.position.z * scaleFactor,
    },
  }))
}

/**
 * Generate a sparse 3D point cloud from matched feature pairs and camera poses.
 *
 * Triangulates all matched 2D points using estimated camera poses. If a scale
 * reference is provided, converts coordinates to real-world units.
 */
export function generatePointCloud(
  matchedPairs: MatchedPair[],
  poses: Map<number, CameraPose>,
  imageWidth: number,
  imageHeight: number,
  scaleReference?: ScaleReference
): PointCloud {
  if (matchedPairs.length === 0 || poses.size === 0) {
    return { points: [], isScaled: false, scaleFactor: 1.0 }
  }

  const K = estimateCameraIntrinsics(imageWidth, imageHeight)
  const K_inv = invertCameraIntrinsics(K)

  let allPoints: TriangulatedPoint[] = []

  for (const pair of matchedPairs) {
    const pose1 = poses.get(pair.photoIndexA)
    const pose2 = poses.get(pair.photoIndexB)
    if (!pose1 || !pose2) continue

    const triangulated = triangulateMatchedPair(pair, pose1, pose2, K_inv)
    allPoints.push(...triangulated)
  }

  let scaleFactor = 1.0
  let isScaled = false

  if (scaleReference) {
    const focalLength = Math.max(imageWidth, imageHeight)
    scaleFactor = computeScaleFactor(scaleReference, allPoints, focalLength)

    if (scaleFactor > 0 && scaleFactor !== 1.0) {
      allPoints = scalePointCloud(allPoints, scaleFactor)
      isScaled = true
    }
  }

  return { points: allPoints, isScaled, scaleFactor }
}
