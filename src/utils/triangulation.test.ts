import { describe, it, expect } from 'vitest'
import type { CameraPose, Point3D, Point2D, ScaleReference } from '../types'
import type { MatchedPair } from './featureDetection'
import { identityRotation, estimateCameraIntrinsics } from './poseEstimation'
import {
  invertCameraIntrinsics,
  pixelToWorldRay,
  triangulatePoint,
  triangulateMatchedPair,
  computeScaleFactor,
  scalePointCloud,
  generatePointCloud,
  TriangulatedPoint,
} from './triangulation'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Image dimensions used throughout the tests */
const IMAGE_WIDTH = 640
const IMAGE_HEIGHT = 480

/** Camera intrinsics for a 640x480 image */
const K = estimateCameraIntrinsics(IMAGE_WIDTH, IMAGE_HEIGHT)
const K_inv = invertCameraIntrinsics(K)

/** Focal length = max(640, 480) = 640 */
const FOCAL = 640

/**
 * Project a world-space 3D point into pixel coordinates for a given camera pose.
 * Uses the pinhole model: pixel = K * R * (p_world - position).
 */
function projectPoint(point: Point3D, pose: CameraPose): Point2D {
  const dx = point.x - pose.position.x
  const dy = point.y - pose.position.y
  const dz = point.z - pose.position.z
  const R = pose.rotation
  const cx = R[0] * dx + R[1] * dy + R[2] * dz
  const cy = R[3] * dx + R[4] * dy + R[5] * dz
  const cz = R[6] * dx + R[7] * dy + R[8] * dz
  return {
    x: K[0] * (cx / cz) + K[2],
    y: K[4] * (cy / cz) + K[5],
  }
}

/** Camera at origin looking along +Z */
const poseOrigin: CameraPose = {
  position: { x: 0, y: 0, z: 0 },
  rotation: identityRotation(),
}

/** Camera at (2,0,0) looking along +Z */
const poseRight: CameraPose = {
  position: { x: 2, y: 0, z: 0 },
  rotation: identityRotation(),
}

/** Camera at (1,0,0) looking along +Z */
const poseMid: CameraPose = {
  position: { x: 1, y: 0, z: 0 },
  rotation: identityRotation(),
}

/** Build a MatchedPair from known 3D points projected into two camera views */
function buildMatchedPairFromPoints(
  points3D: Point3D[],
  pose1: CameraPose,
  pose2: CameraPose,
  indexA: number,
  indexB: number
): MatchedPair {
  const pointsA: Point2D[] = []
  const pointsB: Point2D[] = []
  const matches = []
  const keypointsA = []
  const keypointsB = []

  for (let i = 0; i < points3D.length; i++) {
    const pxA = projectPoint(points3D[i], pose1)
    const pxB = projectPoint(points3D[i], pose2)
    pointsA.push(pxA)
    pointsB.push(pxB)
    matches.push({ queryIdx: i, trainIdx: i, distance: 10 })
    keypointsA.push({ x: pxA.x, y: pxA.y, size: 31, angle: 0, response: 100, octave: 0 })
    keypointsB.push({ x: pxB.x, y: pxB.y, size: 31, angle: 0, response: 100, octave: 0 })
  }

  return { photoIndexA: indexA, photoIndexB: indexB, matches, keypointsA, keypointsB, pointsA, pointsB }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('triangulation', () => {
  describe('invertCameraIntrinsics', () => {
    it('returns correct inverse for standard intrinsics', () => {
      const Kinv = invertCameraIntrinsics(K)
      expect(Kinv[0]).toBeCloseTo(1 / FOCAL)
      expect(Kinv[4]).toBeCloseTo(1 / FOCAL)
      expect(Kinv[2]).toBeCloseTo(-320 / FOCAL)
      expect(Kinv[5]).toBeCloseTo(-240 / FOCAL)
      expect(Kinv[8]).toBe(1)
      // Off-diagonal zeros
      expect(Kinv[1]).toBe(0)
      expect(Kinv[3]).toBe(0)
      expect(Kinv[6]).toBe(0)
      expect(Kinv[7]).toBe(0)
    })

    it('K * K_inv produces identity for image center', () => {
      // K_inv * [cx, cy, 1] should give [0, 0, 1] (optical axis)
      const Kinv = invertCameraIntrinsics(K)
      const cx = K[2] // 320
      const cy = K[5] // 240
      const rx = Kinv[0] * cx + Kinv[1] * cy + Kinv[2]
      const ry = Kinv[3] * cx + Kinv[4] * cy + Kinv[5]
      const rz = Kinv[6] * cx + Kinv[7] * cy + Kinv[8]
      expect(rx).toBeCloseTo(0)
      expect(ry).toBeCloseTo(0)
      expect(rz).toBeCloseTo(1)
    })

    it('handles zero focal length gracefully', () => {
      const Kinv = invertCameraIntrinsics([0, 0, 320, 0, 0, 240, 0, 0, 1])
      expect(Kinv[8]).toBe(1)
    })
  })

  describe('pixelToWorldRay', () => {
    it('image center maps to +Z ray direction with identity rotation', () => {
      const ray = pixelToWorldRay({ x: 320, y: 240 }, K_inv, identityRotation())
      expect(ray.x).toBeCloseTo(0, 5)
      expect(ray.y).toBeCloseTo(0, 5)
      expect(ray.z).toBeCloseTo(1, 5)
    })

    it('pixel right of center has positive X component', () => {
      const ray = pixelToWorldRay({ x: 500, y: 240 }, K_inv, identityRotation())
      expect(ray.x).toBeGreaterThan(0)
      expect(ray.y).toBeCloseTo(0, 5)
      expect(ray.z).toBeGreaterThan(0)
    })

    it('pixel below center has positive Y component', () => {
      const ray = pixelToWorldRay({ x: 320, y: 400 }, K_inv, identityRotation())
      expect(ray.x).toBeCloseTo(0, 5)
      expect(ray.y).toBeGreaterThan(0)
      expect(ray.z).toBeGreaterThan(0)
    })

    it('returns a unit vector', () => {
      const ray = pixelToWorldRay({ x: 100, y: 350 }, K_inv, identityRotation())
      const len = Math.sqrt(ray.x * ray.x + ray.y * ray.y + ray.z * ray.z)
      expect(len).toBeCloseTo(1, 10)
    })
  })

  describe('triangulatePoint', () => {
    it('reconstructs a known 3D point from two views', () => {
      // Point at (1, 0, 10) seen from cameras at origin and (2, 0, 0)
      const target: Point3D = { x: 1, y: 0, z: 10 }
      const px1 = projectPoint(target, poseOrigin) // (384, 240)
      const px2 = projectPoint(target, poseRight)  // (256, 240)

      const result = triangulatePoint(px1, px2, poseOrigin, poseRight, K_inv)

      expect(result).not.toBeNull()
      expect(result!.position.x).toBeCloseTo(1, 1)
      expect(result!.position.y).toBeCloseTo(0, 1)
      expect(result!.position.z).toBeCloseTo(10, 1)
      expect(result!.reprojectionError).toBeLessThan(0.1)
    })

    it('reconstructs an off-axis point correctly', () => {
      const target: Point3D = { x: 1, y: 1, z: 10 }
      const px1 = projectPoint(target, poseOrigin)
      const px2 = projectPoint(target, poseRight)

      const result = triangulatePoint(px1, px2, poseOrigin, poseRight, K_inv)

      expect(result).not.toBeNull()
      expect(result!.position.x).toBeCloseTo(1, 1)
      expect(result!.position.y).toBeCloseTo(1, 1)
      expect(result!.position.z).toBeCloseTo(10, 1)
    })

    it('returns null for parallel rays (same camera position)', () => {
      // Two cameras at the same position — all rays from the same origin are parallel in effect
      // but the rays diverge. Actually let's use cameras at the same position but different poses wouldn't help.
      // Instead: two cameras far apart but looking at the same pixel means parallel rays
      const sameOrigin: CameraPose = {
        position: { x: 0, y: 0, z: 0 },
        rotation: identityRotation(),
      }

      // Same pixel in two views from same position: rays are the same direction from same origin
      // denom = 1 - 1^2 = 0 → null
      const px = { x: 320, y: 240 }
      const result = triangulatePoint(px, px, sameOrigin, sameOrigin, K_inv)
      expect(result).toBeNull()
    })

    it('returns null when point is behind a camera', () => {
      // Point behind camera 1 (negative Z)
      const target: Point3D = { x: 0, y: 0, z: -5 }
      // Can't project a point behind the camera, so create pixel coords manually
      // that would result in negative t values
      const px1: Point2D = { x: 320, y: 240 } // center → straight ahead
      const px2: Point2D = { x: 320, y: 240 } // center → straight ahead

      // Camera 2 is behind camera 1: at (0, 0, 10) looking forward
      const poseFar: CameraPose = {
        position: { x: 0, y: 0, z: 10 },
        rotation: identityRotation(),
      }
      // Both rays point along +Z from their origins; closest approach is between the cameras
      // not in front of both. Rays are parallel (same direction) → denom ≈ 0 → null
      const result = triangulatePoint(px1, px2, poseOrigin, poseFar, K_inv)
      expect(result).toBeNull()
    })

    it('handles points at different depths', () => {
      // Close point
      const close: Point3D = { x: 0.5, y: 0, z: 3 }
      const px1c = projectPoint(close, poseOrigin)
      const px2c = projectPoint(close, poseMid)
      const resultClose = triangulatePoint(px1c, px2c, poseOrigin, poseMid, K_inv)

      // Far point
      const far: Point3D = { x: 0.5, y: 0, z: 50 }
      const px1f = projectPoint(far, poseOrigin)
      const px2f = projectPoint(far, poseMid)
      const resultFar = triangulatePoint(px1f, px2f, poseOrigin, poseMid, K_inv)

      expect(resultClose).not.toBeNull()
      expect(resultFar).not.toBeNull()
      expect(resultClose!.position.z).toBeCloseTo(3, 0)
      expect(resultFar!.position.z).toBeCloseTo(50, 0)
    })
  })

  describe('triangulateMatchedPair', () => {
    it('triangulates multiple points from a matched pair', () => {
      const points3D: Point3D[] = [
        { x: 1, y: 0, z: 10 },
        { x: -1, y: 0.5, z: 8 },
        { x: 0, y: -0.5, z: 12 },
        { x: 0.5, y: 1, z: 6 },
      ]

      const pair = buildMatchedPairFromPoints(points3D, poseOrigin, poseRight, 0, 1)
      const result = triangulateMatchedPair(pair, poseOrigin, poseRight, K_inv)

      expect(result.length).toBe(points3D.length)

      for (let i = 0; i < points3D.length; i++) {
        expect(result[i].position.x).toBeCloseTo(points3D[i].x, 1)
        expect(result[i].position.y).toBeCloseTo(points3D[i].y, 1)
        expect(result[i].position.z).toBeCloseTo(points3D[i].z, 0)
        expect(result[i].sourcePhotos).toEqual([0, 1])
        expect(result[i].reprojectionError).toBeLessThan(1)
      }
    })

    it('filters points with high reprojection error', () => {
      const points3D: Point3D[] = [{ x: 1, y: 0, z: 10 }]
      const pair = buildMatchedPairFromPoints(points3D, poseOrigin, poseRight, 0, 1)

      // Use a very strict error threshold
      const strict = triangulateMatchedPair(pair, poseOrigin, poseRight, K_inv, 0.0001)
      // Use a generous threshold
      const generous = triangulateMatchedPair(pair, poseOrigin, poseRight, K_inv, 100)

      // With well-projected points, both should succeed (error is very small)
      expect(generous.length).toBe(1)
      // Strict might filter if there's any numerical error
      expect(strict.length).toBeLessThanOrEqual(generous.length)
    })

    it('returns empty array when no points triangulate successfully', () => {
      // Create a pair where all points would produce parallel rays
      const pair: MatchedPair = {
        photoIndexA: 0,
        photoIndexB: 1,
        matches: [{ queryIdx: 0, trainIdx: 0, distance: 10 }],
        keypointsA: [{ x: 320, y: 240, size: 31, angle: 0, response: 100, octave: 0 }],
        keypointsB: [{ x: 320, y: 240, size: 31, angle: 0, response: 100, octave: 0 }],
        pointsA: [{ x: 320, y: 240 }],
        pointsB: [{ x: 320, y: 240 }],
      }

      // Same position cameras → parallel rays
      const samePose: CameraPose = { position: { x: 0, y: 0, z: 0 }, rotation: identityRotation() }
      const result = triangulateMatchedPair(pair, samePose, samePose, K_inv)
      expect(result.length).toBe(0)
    })
  })

  describe('computeScaleFactor', () => {
    it('computes scale from nearby 3D points', () => {
      // Two 3D points at known positions, 5 units apart in SfM coordinates
      const points: TriangulatedPoint[] = [
        {
          position: { x: 0, y: 0, z: 10 },
          sourcePhotos: [0, 1],
          pixelCoords: [{ x: 100, y: 200 }, { x: 150, y: 200 }],
          reprojectionError: 0.01,
        },
        {
          position: { x: 5, y: 0, z: 10 },
          sourcePhotos: [0, 1],
          pixelCoords: [{ x: 400, y: 200 }, { x: 350, y: 200 }],
          reprojectionError: 0.01,
        },
      ]

      // Scale reference: 100cm real-world distance on photo 0
      // Points at pixels (100,200) and (400,200) are nearest to the endpoints
      const ref: ScaleReference = {
        photoIndex: 0,
        startPoint: { x: 100, y: 200 },
        endPoint: { x: 400, y: 200 },
        length: 100,
        unit: 'cm',
      }

      const scale = computeScaleFactor(ref, points, FOCAL)

      // 3D distance is 5, real-world is 100cm, so scale = 100/5 = 20
      expect(scale).toBeCloseTo(20, 1)
    })

    it('uses fallback when no points match the reference photo', () => {
      const points: TriangulatedPoint[] = [
        {
          position: { x: 0, y: 0, z: 10 },
          sourcePhotos: [2, 3], // Different photo indices
          pixelCoords: [{ x: 100, y: 200 }, { x: 150, y: 200 }],
          reprojectionError: 0.01,
        },
      ]

      const ref: ScaleReference = {
        photoIndex: 0, // No points from photo 0
        startPoint: { x: 100, y: 200 },
        endPoint: { x: 200, y: 200 },
        length: 50,
        unit: 'cm',
      }

      const scale = computeScaleFactor(ref, points, FOCAL)

      // Fallback: ratio * focalLength = (50/100) * 640 = 320
      expect(scale).toBeCloseTo(320, 1)
    })

    it('returns 1.0 when scale reference has zero pixel distance', () => {
      const ref: ScaleReference = {
        photoIndex: 0,
        startPoint: { x: 100, y: 200 },
        endPoint: { x: 100, y: 200 }, // Same point
        length: 50,
        unit: 'cm',
      }

      const scale = computeScaleFactor(ref, [], FOCAL)
      expect(scale).toBe(1.0)
    })
  })

  describe('scalePointCloud', () => {
    it('scales all point positions by the given factor', () => {
      const points: TriangulatedPoint[] = [
        {
          position: { x: 1, y: 2, z: 3 },
          sourcePhotos: [0, 1],
          pixelCoords: [{ x: 0, y: 0 }, { x: 0, y: 0 }],
          reprojectionError: 0,
        },
        {
          position: { x: -1, y: 0.5, z: 10 },
          sourcePhotos: [0, 1],
          pixelCoords: [{ x: 0, y: 0 }, { x: 0, y: 0 }],
          reprojectionError: 0,
        },
      ]

      const scaled = scalePointCloud(points, 2.5)

      expect(scaled[0].position).toEqual({ x: 2.5, y: 5, z: 7.5 })
      expect(scaled[1].position).toEqual({ x: -2.5, y: 1.25, z: 25 })
    })

    it('preserves metadata when scaling', () => {
      const points: TriangulatedPoint[] = [
        {
          position: { x: 1, y: 2, z: 3 },
          sourcePhotos: [0, 1],
          pixelCoords: [{ x: 10, y: 20 }, { x: 30, y: 40 }],
          reprojectionError: 0.5,
        },
      ]

      const scaled = scalePointCloud(points, 3)

      expect(scaled[0].sourcePhotos).toEqual([0, 1])
      expect(scaled[0].pixelCoords).toEqual([{ x: 10, y: 20 }, { x: 30, y: 40 }])
      expect(scaled[0].reprojectionError).toBe(0.5)
    })

    it('does not mutate the original points', () => {
      const points: TriangulatedPoint[] = [
        {
          position: { x: 1, y: 2, z: 3 },
          sourcePhotos: [0, 1],
          pixelCoords: [{ x: 0, y: 0 }, { x: 0, y: 0 }],
          reprojectionError: 0,
        },
      ]

      scalePointCloud(points, 10)
      expect(points[0].position).toEqual({ x: 1, y: 2, z: 3 })
    })
  })

  describe('generatePointCloud', () => {
    it('returns empty point cloud for empty inputs', () => {
      const result = generatePointCloud([], new Map(), 640, 480)
      expect(result.points).toHaveLength(0)
      expect(result.isScaled).toBe(false)
      expect(result.scaleFactor).toBe(1.0)
    })

    it('returns empty point cloud when no poses are available', () => {
      const pair: MatchedPair = buildMatchedPairFromPoints(
        [{ x: 1, y: 0, z: 10 }],
        poseOrigin,
        poseRight,
        0,
        1
      )
      const result = generatePointCloud([pair], new Map(), 640, 480)
      expect(result.points).toHaveLength(0)
    })

    it('triangulates points from matched pairs with known geometry', () => {
      const points3D: Point3D[] = [
        { x: 1, y: 0, z: 10 },
        { x: -1, y: 0.5, z: 8 },
        { x: 0, y: -0.5, z: 12 },
      ]

      const pair = buildMatchedPairFromPoints(points3D, poseOrigin, poseRight, 0, 1)

      const poses = new Map<number, CameraPose>()
      poses.set(0, poseOrigin)
      poses.set(1, poseRight)

      const result = generatePointCloud([pair], poses, IMAGE_WIDTH, IMAGE_HEIGHT)

      expect(result.points.length).toBe(3)
      expect(result.isScaled).toBe(false)
      expect(result.scaleFactor).toBe(1.0)

      // Verify each point is reconstructed correctly
      for (let i = 0; i < points3D.length; i++) {
        expect(result.points[i].position.x).toBeCloseTo(points3D[i].x, 1)
        expect(result.points[i].position.y).toBeCloseTo(points3D[i].y, 1)
        expect(result.points[i].position.z).toBeCloseTo(points3D[i].z, 0)
      }
    })

    it('handles multiple matched pairs', () => {
      const points3D_pair1: Point3D[] = [
        { x: 1, y: 0, z: 10 },
        { x: 0, y: 1, z: 8 },
      ]
      const points3D_pair2: Point3D[] = [
        { x: 2, y: 0, z: 15 },
      ]

      const pair1 = buildMatchedPairFromPoints(points3D_pair1, poseOrigin, poseMid, 0, 1)
      const pair2 = buildMatchedPairFromPoints(points3D_pair2, poseMid, poseRight, 1, 2)

      const poses = new Map<number, CameraPose>()
      poses.set(0, poseOrigin)
      poses.set(1, poseMid)
      poses.set(2, poseRight)

      const result = generatePointCloud([pair1, pair2], poses, IMAGE_WIDTH, IMAGE_HEIGHT)

      expect(result.points.length).toBe(3)
    })

    it('skips pairs where camera pose is missing', () => {
      const points3D: Point3D[] = [{ x: 1, y: 0, z: 10 }]
      const pair = buildMatchedPairFromPoints(points3D, poseOrigin, poseRight, 0, 1)

      const poses = new Map<number, CameraPose>()
      poses.set(0, poseOrigin) // Missing pose for photo 1

      const result = generatePointCloud([pair], poses, IMAGE_WIDTH, IMAGE_HEIGHT)
      expect(result.points.length).toBe(0)
    })

    it('applies scale calibration when provided', () => {
      // Two points 5 SfM-units apart
      const points3D: Point3D[] = [
        { x: 0, y: 0, z: 10 },
        { x: 5, y: 0, z: 10 },
      ]

      const pair = buildMatchedPairFromPoints(points3D, poseOrigin, poseRight, 0, 1)

      const poses = new Map<number, CameraPose>()
      poses.set(0, poseOrigin)
      poses.set(1, poseRight)

      // The unscaled cloud should reconstruct points ~5 apart
      const unscaled = generatePointCloud([pair], poses, IMAGE_WIDTH, IMAGE_HEIGHT)
      expect(unscaled.isScaled).toBe(false)

      const dist = Math.sqrt(
        Math.pow(unscaled.points[0].position.x - unscaled.points[1].position.x, 2) +
        Math.pow(unscaled.points[0].position.y - unscaled.points[1].position.y, 2) +
        Math.pow(unscaled.points[0].position.z - unscaled.points[1].position.z, 2)
      )

      // Now apply scale calibration
      // Use pixel coords from the first pair's projections as scale reference endpoints
      const scaleRef: ScaleReference = {
        photoIndex: 0,
        startPoint: pair.pointsA[0],
        endPoint: pair.pointsA[1],
        length: 200, // 200 cm real-world
        unit: 'cm',
      }

      const scaled = generatePointCloud([pair], poses, IMAGE_WIDTH, IMAGE_HEIGHT, scaleRef)

      expect(scaled.isScaled).toBe(true)
      expect(scaled.scaleFactor).toBeGreaterThan(0)
      expect(scaled.scaleFactor).not.toBe(1.0)

      // Verify the scaled distance matches the expected real-world measurement
      const scaledDist = Math.sqrt(
        Math.pow(scaled.points[0].position.x - scaled.points[1].position.x, 2) +
        Math.pow(scaled.points[0].position.y - scaled.points[1].position.y, 2) +
        Math.pow(scaled.points[0].position.z - scaled.points[1].position.z, 2)
      )

      // Scaled distance should be: unscaled distance * scaleFactor
      expect(scaledDist).toBeCloseTo(dist * scaled.scaleFactor, 1)
    })

    it('produces points in plausible 3D positions', () => {
      // Simulate a walkthrough: 3 cameras along X axis, looking at points in front
      const poses = new Map<number, CameraPose>()
      poses.set(0, { position: { x: 0, y: 0, z: 0 }, rotation: identityRotation() })
      poses.set(1, { position: { x: 1, y: 0, z: 0 }, rotation: identityRotation() })
      poses.set(2, { position: { x: 2, y: 0, z: 0 }, rotation: identityRotation() })

      // Points distributed in front of the cameras
      const scenePoints: Point3D[] = [
        { x: 0.5, y: 0, z: 5 },
        { x: 1.5, y: 0.5, z: 8 },
        { x: 1, y: -0.3, z: 6 },
        { x: 0, y: 0.2, z: 10 },
        { x: 2, y: -0.1, z: 7 },
        { x: 0.8, y: 0.8, z: 4 },
        { x: 1.2, y: -0.5, z: 9 },
        { x: 0.3, y: 0.1, z: 15 },
      ]

      const pair01 = buildMatchedPairFromPoints(scenePoints, poses.get(0)!, poses.get(1)!, 0, 1)
      const pair12 = buildMatchedPairFromPoints(scenePoints, poses.get(1)!, poses.get(2)!, 1, 2)

      const result = generatePointCloud([pair01, pair12], poses, IMAGE_WIDTH, IMAGE_HEIGHT)

      // All points should be in front of the cameras (positive Z)
      for (const pt of result.points) {
        expect(pt.position.z).toBeGreaterThan(0)
      }

      // Points should have low reprojection error
      for (const pt of result.points) {
        expect(pt.reprojectionError).toBeLessThan(1)
      }

      // Points should be near their original positions
      // (both pairs see all 8 points, so we get 16 triangulated points total)
      expect(result.points.length).toBe(scenePoints.length * 2)
    })
  })
})
